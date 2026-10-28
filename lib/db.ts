import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
let singleton: DatabaseSync | undefined;
export class StorageConfigurationError extends Error {
  readonly diagnosticCode: string;
  constructor(diagnosticCode: string) {
    super('Persistent data storage is not available');
    this.diagnosticCode = diagnosticCode;
  }
}
export function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
function key() {
  const raw = process.env.DATA_ENCRYPTION_KEY ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(raw))
    throw new StorageConfigurationError('DATA_ENCRYPTION_KEY_INVALID');
  return Buffer.from(raw, 'hex');
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('base64')].join(
    '.',
  );
}
export function decrypt<T>(value: string): T {
  const [iv, tag, data] = value.split('.');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return JSON.parse(
    Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString('utf8'),
  );
}
export function db() {
  if (singleton) return singleton;
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV)
    throw new StorageConfigurationError('VERCEL_LOCAL_SQLITE_UNSUPPORTED');
  key();
  const path = resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH ?? './data/mbco.sqlite',
  );
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role='ADMIN'),must_change INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES admins(id),created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS visitors(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS visitor_drafts(visitor_hash TEXT PRIMARY KEY,data TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS videos(id TEXT PRIMARY KEY,title TEXT NOT NULL,youtube_id TEXT NOT NULL,sort_order INTEGER NOT NULL,visible INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS video_clicks(visitor_hash TEXT NOT NULL,video_id TEXT NOT NULL REFERENCES videos(id),youtube_id TEXT NOT NULL,clicked_at TEXT NOT NULL,PRIMARY KEY(visitor_hash,video_id,youtube_id));
CREATE TABLE IF NOT EXISTS view_events(id TEXT PRIMARY KEY,visitor_hash TEXT NOT NULL,video_id TEXT NOT NULL REFERENCES videos(id),title TEXT NOT NULL,opened_at TEXT NOT NULL,youtube_id TEXT,completed_at TEXT);
CREATE TABLE IF NOT EXISTS registrations(id TEXT PRIMARY KEY,receipt TEXT UNIQUE NOT NULL,request_key TEXT UNIQUE NOT NULL,visitor_hash TEXT NOT NULL,payload_hash TEXT NOT NULL,created_at TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS registration_dates ON registrations(created_at,start_date,end_date);
CREATE INDEX IF NOT EXISTS registration_visitor ON registrations(visitor_hash);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT,details TEXT NOT NULL);
`);
  const viewColumns = d.prepare('PRAGMA table_info(view_events)').all() as { name: string }[];
  if (!viewColumns.some((column) => column.name === 'youtube_id'))
    d.exec('ALTER TABLE view_events ADD COLUMN youtube_id TEXT');
  if (!viewColumns.some((column) => column.name === 'completed_at'))
    d.exec('ALTER TABLE view_events ADD COLUMN completed_at TEXT');
  d.exec('PRAGMA user_version=3');
  if (!d.prepare('SELECT id FROM admins LIMIT 1').get()) {
    const initial = process.env.INITIAL_ADMIN_PASSWORD;
    if (!initial) throw new StorageConfigurationError('INITIAL_ADMIN_PASSWORD_MISSING');
    d.prepare('INSERT INTO admins VALUES(?,?,?,?)').run('admin', passwordHash(initial), 'ADMIN', 1);
  }
  singleton = d;
  return d;
}
export function transaction<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    d.exec('COMMIT');
    return value;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
export function audit(actor: string, action: string, target: string | null, details: unknown = {}) {
  db()
    .prepare('INSERT INTO audit(at,actor,action,target,details) VALUES(?,?,?,?,?)')
    .run(new Date().toISOString(), actor, action, target, encrypt(details));
}
