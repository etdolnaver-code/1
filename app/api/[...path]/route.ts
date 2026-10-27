import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { get, mutate } from '@/lib/service';
import { HttpError, json } from '@/lib/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    return req.method === 'GET' ? await get(req, path) : await mutate(req, path);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return json(
        { error: e.issues[0]?.message ?? '입력값을 확인하세요.', fields: e.flatten() },
        400,
      );
    console.error('API failure', e instanceof Error ? e.name : 'UnknownError');
    return json({ error: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, 500);
  }
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
