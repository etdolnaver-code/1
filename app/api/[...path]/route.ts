import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { get, mutate } from '@/lib/service';
import { formIssueMessage } from '@/lib/domain';
import { HttpError, json } from '@/lib/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  let route = 'unknown';
  try {
    const { path } = await context.params;
    route = [
      'bootstrap',
      'draft',
      'video-progress',
      'video-clicks',
      'video-events',
      'videos',
      'registrations',
      'admin',
    ].includes(path[0])
      ? path[0]
      : 'other';
    return req.method === 'GET' ? await get(req, path) : await mutate(req, path);
  } catch (e) {
    const reference = randomUUID();
    const status = e instanceof HttpError ? e.status : e instanceof ZodError ? 400 : 500;
    const systemCode =
      e instanceof Error &&
      'code' in e &&
      typeof e.code === 'string' &&
      /^(SQLITE_[A-Z_]+|ERR_SQLITE_[A-Z_]+|EACCES|EROFS|ENOENT|EPERM)$/.test(e.code)
        ? e.code
        : null;
    const reason =
      e instanceof HttpError
        ? (e.diagnosticCode ?? `HTTP_${e.status}`)
        : e instanceof ZodError
          ? 'INPUT_VALIDATION'
          : e instanceof Error && e.message === 'DATA_ENCRYPTION_KEY must contain 32 bytes of hex'
            ? 'DATA_ENCRYPTION_KEY_INVALID'
            : e instanceof Error &&
                e.message === 'INITIAL_ADMIN_PASSWORD is required to initialize database'
              ? 'INITIAL_ADMIN_PASSWORD_MISSING'
              : (systemCode ?? 'UNEXPECTED');
    console.error(
      JSON.stringify({
        event: 'api_failure',
        reference,
        route,
        method: req.method,
        status,
        reason,
      }),
    );
    if (e instanceof HttpError) return json({ error: e.message, reference }, e.status);
    if (e instanceof ZodError)
      return json(
        {
          error: e.issues[0] ? formIssueMessage(e.issues[0]) : '입력값을 확인해 주세요.',
          fields: e.flatten(),
          reference,
        },
        400,
      );
    return json(
      {
        error: `서버가 요청을 처리하지 못했습니다. 관리자에게 문의해 주세요. (오류 번호: ${reference})`,
      },
      500,
    );
  }
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
