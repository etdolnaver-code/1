import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { db, StorageConfigurationError } from '../lib/db.ts';

test('Vercel 함수에서는 로컬 SQLite 초기화를 시작하지 않는다', () => {
  const previousVercel = process.env.VERCEL;
  const previousVercelEnvironment = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL = '1';
    delete process.env.VERCEL_ENV;
    assert.throws(
      () => db(),
      (error: unknown) =>
        error instanceof StorageConfigurationError &&
        error.diagnosticCode === 'VERCEL_LOCAL_SQLITE_UNSUPPORTED',
    );
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnvironment;
  }
});

test(
  '프로덕션 서버가 Vercel 로컬 DB 사용을 503과 진단 코드로 안내한다',
  { timeout: 30000 },
  async (t) => {
    const port = 3108;
    const base = `http://127.0.0.1:${port}`;
    let logs = '';
    const child = spawn(
      process.execPath,
      [
        'node_modules/next/dist/bin/next',
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' },
        windowsHide: true,
      },
    );
    child.stdout.on('data', (chunk) => (logs += chunk));
    child.stderr.on('data', (chunk) => (logs += chunk));
    t.after(() => child.kill());
    let response: Response | undefined;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        response = await fetch(`${base}/api/bootstrap`);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    assert.ok(response, `프로덕션 서버 시작 실패: ${logs}`);
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.match(result.error, /데이터 저장소를 사용할 수 없어/);
    assert.match(result.reference, /^[\da-f-]{36}$/);
    assert.match(logs, /VERCEL_LOCAL_SQLITE_UNSUPPORTED/);
    assert.match(logs, new RegExp(result.reference));
  },
);
