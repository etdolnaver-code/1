import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { db, hash, audit } from './db';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public diagnosticCode?: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string, diagnosticCode?: string): never {
  throw new HttpError(status, message, diagnosticCode);
}
export function origin(req: NextRequest) {
  const allowed = process.env.APP_ORIGIN;
  if (!allowed)
    fail(503, '서버 주소 설정이 필요합니다. 관리자에게 문의해 주세요.', 'APP_ORIGIN_MISSING');
  let expected: string;
  try {
    expected = new URL(allowed).origin;
  } catch {
    fail(503, '서버 주소 설정을 확인해야 합니다. 관리자에게 문의해 주세요.', 'APP_ORIGIN_INVALID');
  }
  if (req.headers.get('origin') !== expected)
    fail(
      403,
      '현재 사이트 주소에서 요청을 처리할 수 없습니다. 관리자에게 문의해 주세요.',
      'ORIGIN_MISMATCH',
    );
}
export async function body(req: NextRequest) {
  origin(req);
  if (!req.headers.get('content-type')?.includes('application/json'))
    fail(415, 'JSON 요청이 필요합니다.');
  if (Number(req.headers.get('content-length') ?? 0) > 250000) fail(413, '요청이 너무 큽니다.');
  const reader = req.body?.getReader();
  if (!reader) fail(400, '입력값이 없습니다.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 250000) {
      await reader.cancel();
      fail(413, '요청이 너무 큽니다.');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(400, '요청 형식이 올바르지 않습니다.');
  }
}
export function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  db()
    .prepare(
      'INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END',
    )
    .run(key, now + windowMs, now, now);
  const row = db().prepare('SELECT count FROM rate_limits WHERE key=?').get(key) as {
    count: number;
  };
  if (row.count > max) fail(429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
}
export function clientKey(req: NextRequest) {
  return hash(
    process.env.TRUST_PROXY === 'true'
      ? (req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown')
      : 'shared-local',
  );
}
export const secureCookie = () => process.env.COOKIE_SECURE === 'true';
export async function setCookie(name: string, value: string, maxAge: number) {
  (await cookies()).set(name, value, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'strict',
    path: '/',
    maxAge,
  });
}
export async function visitor(create = false) {
  const jar = await cookies();
  const raw = jar.get('mbco_visitor')?.value;
  const token = raw && hash(raw);
  if (
    token &&
    db()
      .prepare('SELECT token_hash FROM visitors WHERE token_hash=? AND expires_at>?')
      .get(token, Date.now())
  )
    return token;
  if (!create) fail(401, '등록 세션이 만료되었습니다. 페이지를 새로고침해 주세요.');
  return rotateVisitor();
}
export async function rotateVisitor() {
  const next = randomBytes(32).toString('hex');
  db()
    .prepare('INSERT INTO visitors VALUES(?,?)')
    .run(hash(next), Date.now() + 2 * 60 * 60 * 1000);
  await setCookie('mbco_visitor', next, 7200);
  return hash(next);
}
export async function admin(allowChange = false) {
  const raw = (await cookies()).get('mbco_admin')?.value;
  if (!raw) fail(401, '관리자 로그인이 필요합니다.');
  const token = hash(raw);
  const row = db()
    .prepare(
      'SELECT a.id,a.role,a.must_change,s.expires_at,s.last_seen FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=?',
    )
    .get(token) as
    | { id: string; role: string; must_change: number; expires_at: number; last_seen: number }
    | undefined;
  if (!row || row.expires_at < Date.now() || row.last_seen < Date.now() - 30 * 60 * 1000) {
    db().prepare('DELETE FROM sessions WHERE token_hash=?').run(token);
    fail(401, '로그인이 만료되었습니다. 다시 로그인하세요.');
  }
  if (row.role !== 'ADMIN') fail(403, '권한이 없습니다.');
  if (row.must_change && process.env.NODE_ENV === 'production' && !allowChange)
    fail(428, '운영 환경에서는 먼저 초기 비밀번호를 변경해야 합니다.');
  db().prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?').run(Date.now(), token);
  return row;
}
export async function createSession(id: string) {
  const value = randomBytes(32).toString('hex');
  const now = Date.now();
  db()
    .prepare('INSERT INTO sessions VALUES(?,?,?,?,?)')
    .run(hash(value), id, now, now, now + 8 * 3600000);
  await setCookie('mbco_admin', value, 8 * 3600);
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
export async function logout() {
  const raw = (await cookies()).get('mbco_admin')?.value;
  if (raw) db().prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(raw));
  await setCookie('mbco_admin', '', 0);
  audit('admin', 'LOGOUT', null);
}
