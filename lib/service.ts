import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import {
  db,
  decrypt,
  encrypt,
  transaction,
  audit,
  hash,
  passwordMatches,
  passwordHash,
} from './db';
import {
  Registration,
  Video,
  videoSchema,
  youtubeId,
  registrationSchema,
  refinedBasic,
  draftSchema,
  passwordSchema,
  todayKST,
  POLICY_VERSION,
  privacyText,
  safetyRules,
  allSafetyRulesChecked,
  educationPledgeSatisfied,
  educationPledgeText,
} from './domain';
import {
  admin,
  body,
  clientKey,
  createSession,
  fail,
  json,
  limit,
  logout,
  visitor,
  rotateVisitor,
} from './security';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
export function videos(all = false): Video[] {
  return (
    db()
      .prepare(
        'SELECT * FROM videos WHERE deleted=0' +
          (all ? '' : ' AND visible=1') +
          ' ORDER BY sort_order,id',
      )
      .all() as {
      id: string;
      title: string;
      youtube_id: string;
      sort_order: number;
      visible: number;
    }[]
  ).map((v) => ({
    id: v.id,
    title: v.title,
    youtubeId: v.youtube_id,
    url: 'https://www.youtube.com/watch?v=' + v.youtube_id,
    sortOrder: v.sort_order,
    visible: !!v.visible,
  }));
}
function completedVideoIds(owner: string): string[] {
  return (
    db()
      .prepare(
        `SELECT DISTINCT v.id FROM videos v JOIN view_events e
    ON e.video_id=v.id AND e.youtube_id=v.youtube_id
    WHERE e.visitor_hash=? AND e.completed_at IS NOT NULL AND v.visible=1 AND v.deleted=0`,
      )
      .all(owner) as { id: string }[]
  ).map((row) => row.id);
}
function clickedVideoIds(owner: string): string[] {
  return (
    db()
      .prepare(
        `SELECT v.id FROM videos v WHERE v.visible=1 AND v.deleted=0 AND (
      EXISTS (SELECT 1 FROM video_clicks c WHERE c.visitor_hash=? AND c.video_id=v.id AND c.youtube_id=v.youtube_id)
      OR EXISTS (SELECT 1 FROM view_events e WHERE e.visitor_hash=? AND e.video_id=v.id AND e.youtube_id=v.youtube_id)
    )`,
      )
      .all(owner, owner) as { id: string }[]
  ).map((row) => row.id);
}
function requireAllVideosClicked(owner: string) {
  const clicked = new Set(clickedVideoIds(owner));
  if (videos().some((video) => !clicked.has(video.id)))
    fail(400, '안전교육 영상을 모두 클릭해 주세요.');
}
export function registrations() {
  return (
    db().prepare('SELECT data FROM registrations ORDER BY created_at DESC').all() as {
      data: string;
    }[]
  ).map((r) => decrypt<Registration>(r.data));
}
export function registration(id: string) {
  const row = db().prepare('SELECT data FROM registrations WHERE id=?').get(id) as
    { data: string } | undefined;
  if (!row) fail(404, '등록정보가 없습니다.');
  return decrypt<Registration>(row.data);
}
function filtered(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const from = p.get('from') || '',
    to = p.get('to') || '',
    company = (p.get('company') || '').toLowerCase(),
    q = (p.get('q') || '').toLowerCase();
  if (
    (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
    (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) ||
    (from && to && from > to)
  )
    fail(400, '조회 기간을 확인하세요.');
  return registrations().filter((r) => {
    const day = new Date(Date.parse(r.createdAt) + 9 * 3600000).toISOString().slice(0, 10);
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!company || r.basic.company.toLowerCase().includes(company)) &&
      (!q || [r.basic.name, r.basic.phone, r.receipt].some((s) => s.toLowerCase().includes(q)))
    );
  });
}
function summary(rows: Registration[]) {
  const today = todayKST();
  const purposes: Record<string, number> = {};
  const months: Record<string, number> = {};
  const [year, month] = today.split('-').map(Number);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    months[d.toISOString().slice(0, 7)] = 0;
  }
  for (const r of rows) {
    purposes[r.basic.purpose] = (purposes[r.basic.purpose] || 0) + 1;
    const m = new Date(Date.parse(r.createdAt) + 9 * 3600000).toISOString().slice(0, 7);
    if (m in months) months[m]++;
  }
  return {
    total: rows.length,
    today: rows.filter(
      (r) => new Date(Date.parse(r.createdAt) + 9 * 3600000).toISOString().slice(0, 10) === today,
    ).length,
    active: rows.filter((r) => r.basic.startDate <= today && r.basic.endDate >= today).length,
    verified: rows.filter((r) => r.educationVerified).length,
    attested: rows.filter((r) => r.educationAttested && !r.educationVerified).length,
    incomplete: rows.filter((r) => !r.educationAttested && !r.educationVerified).length,
    purposes,
    months,
  };
}
function listItem(r: Registration) {
  return {
    id: r.id,
    receipt: r.receipt,
    createdAt: r.createdAt,
    basic: r.basic,
    educationAttested: r.educationAttested,
    educationVerified: r.educationVerified,
    version: r.version,
  };
}
export async function get(req: NextRequest, path: string[]) {
  const route = path.join('/');
  if (route === 'bootstrap') {
    limit('bootstrap:' + clientKey(req), 200, 3600000);
    const owner = await visitor(true);
    if (db().prepare('SELECT 1 FROM registrations WHERE visitor_hash=? LIMIT 1').get(owner))
      await rotateVisitor();
    return json({
      videos: videos(),
      today: todayKST(),
      policyVersion: POLICY_VERSION,
      requestId: randomUUID(),
    });
  }
  if (route === 'videos') return json({ videos: videos() });
  if (route === 'video-progress') {
    const owner = await visitor();
    return json({
      videos: videos(),
      clickedVideoIds: clickedVideoIds(owner),
      completedVideoIds: completedVideoIds(owner),
    });
  }
  if (route === 'draft') {
    const owner = await visitor();
    const row = db()
      .prepare('SELECT data FROM visitor_drafts WHERE visitor_hash=? AND expires_at>?')
      .get(owner, Date.now()) as { data: string } | undefined;
    if (!row) return json({ draft: null });
    const draft = draftSchema.parse(decrypt(row.data));
    if (
      draft.step > 1 &&
      (!allSafetyRulesChecked(draft.safetyChecks) ||
        !educationPledgeSatisfied(draft.basic.educationCompleted, draft.educationPledged) ||
        videos().some((video) => !clickedVideoIds(owner).includes(video.id)))
    )
      draft.step = 1;
    return json({ draft });
  }
  if (route === 'admin/session') {
    const a = await admin(true);
    return json({
      role: a.role,
      mustChange: !!a.must_change,
      enforced: process.env.NODE_ENV === 'production',
    });
  }
  const a = await admin();
  if (route === 'admin/dashboard') {
    const rows = filtered(req);
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || 1) || 1);
    const size = 20;
    return json({
      summary: summary(rows),
      rows: rows.slice((page - 1) * size, page * size).map(listItem),
      total: rows.length,
      page,
      pages: Math.max(1, Math.ceil(rows.length / size)),
    });
  }
  if (path[0] === 'admin' && path[1] === 'registrations' && path.length === 3) {
    const r = registration(path[2]);
    audit(a.id, 'VIEW_REGISTRATION', r.id);
    return json({ registration: r });
  }
  if (route === 'admin/videos') return json({ videos: videos(true) });
  if (route === 'admin/audit') {
    const rows = db().prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 150').all() as {
      details: string;
    }[];
    return json({ rows: rows.map((r) => ({ ...r, details: decrypt(r.details) })) });
  }
  if (route === 'admin/export') {
    const rows = filtered(req);
    if (rows.length > 10000) fail(400, '10,000건 이하로 기간을 좁혀 주세요.');
    audit(a.id, 'EXPORT', null, {
      count: rows.length,
      format: req.nextUrl.searchParams.get('format') || 'csv',
    });
    const headings = [
      '접수번호',
      '등록일',
      '회사명',
      '성명',
      '연락처',
      '작업시작일',
      '작업종료일',
      '발주팀',
      '담당자',
      '방문목적',
      '교육상태',
      '교육일/예정일',
      '이수증 제출 담당자',
    ];
    const values = rows.map((r) => [
      r.receipt,
      r.createdAt,
      r.basic.company,
      r.basic.name,
      r.basic.phone,
      r.basic.startDate,
      r.basic.endDate,
      r.basic.team,
      r.basic.contact,
      r.basic.purpose === '기타' ? r.basic.otherPurpose : r.basic.purpose,
      r.educationVerified ? '관리자 확인' : r.educationAttested ? '본인 이수 확인' : '미이수',
      r.basic.educationDate,
      r.basic.educationCertificateContact || '',
    ]);
    const safe = (v: string) => (/^[\s]*[=+@-]/.test(v) ? "'" + v : v);
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="mbco-registrations-' + todayKST() + '.csv"',
      'Content-Type': 'text/csv; charset=utf-8',
    };
    if (req.nextUrl.searchParams.get('format') === 'xlsx') {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('출입등록');
      sheet.addRow(headings);
      for (const row of values) sheet.addRow(row.map(safe));
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF122A4C' } };
      sheet.columns.forEach((c) => (c.width = 22));
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headings.length } };
      const bytes = await workbook.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          ...headers,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': headers['Content-Disposition'].replace('.csv', '.xlsx'),
        },
      });
    }
    const csv =
      '\uFEFF' +
      [headings, ...values]
        .map((row) => row.map((v) => '"' + safe(v).replaceAll('"', '""') + '"').join(','))
        .join('\r\n');
    return new NextResponse(csv, { headers });
  }
  fail(404, '요청한 기능이 없습니다.');
}
export async function mutate(req: NextRequest, path: string[]) {
  const route = path.join('/');
  const input = await body(req);
  if (route === 'draft') {
    const owner = await visitor();
    if (req.method === 'DELETE') {
      db().prepare('DELETE FROM visitor_drafts WHERE visitor_hash=?').run(owner);
      await rotateVisitor();
      return json({ cleared: true });
    }
    if (req.method === 'PUT') {
      limit('draft:' + owner, 300, 3600000);
      const draft = draftSchema.parse(input);
      if (draft.step > 1) {
        requireAllVideosClicked(owner);
        if (!allSafetyRulesChecked(draft.safetyChecks) || !draft.pledge)
          fail(400, '안전수칙 7개 항목을 모두 확인해 주세요.');
        if (!educationPledgeSatisfied(draft.basic.educationCompleted, draft.educationPledged))
          fail(400, '안전교육 1시간 이수 서약에 체크해 주세요.');
      }
      db()
        .prepare(
          'INSERT INTO visitor_drafts(visitor_hash,data,expires_at) VALUES(?,?,?) ON CONFLICT(visitor_hash) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at',
        )
        .run(owner, encrypt(draft), Date.now() + 30 * 60 * 1000);
      return json({ saved: true });
    }
  }
  if (route === 'admin/login' && req.method === 'POST') {
    limit('login:' + clientKey(req), 10, 15 * 60 * 1000);
    limit('login:global', 100, 15 * 60 * 1000);
    const { password } = z.object({ password: z.string().regex(/^\d{4,16}$/) }).parse(input);
    const row = db().prepare('SELECT * FROM admins WHERE id=?').get('admin') as {
      password: string;
      must_change: number;
    };
    if (!passwordMatches(password, row.password)) {
      audit('anonymous', 'LOGIN_FAILED', null);
      fail(401, '비밀번호가 올바르지 않습니다.');
    }
    await createSession('admin');
    audit('admin', 'LOGIN', null);
    return json({ mustChange: !!row.must_change });
  }
  if (route === 'registrations' && req.method === 'POST') {
    const owner = await visitor();
    limit('submit:' + owner, 15, 60 * 60 * 1000);
    limit('submit:global', 500, 60 * 60 * 1000);
    const v = registrationSchema.parse(input);
    requireAllVideosClicked(owner);
    const payloadHash = createHmac('sha256', process.env.DATA_ENCRYPTION_KEY!)
      .update(JSON.stringify(v))
      .digest('hex');
    const result = transaction(() => {
      const old = db()
        .prepare('SELECT receipt,payload_hash,visitor_hash FROM registrations WHERE request_key=?')
        .get(v.requestId) as
        { receipt: string; payload_hash: string; visitor_hash: string } | undefined;
      if (old) {
        if (old.visitor_hash !== owner || old.payload_hash !== payloadHash)
          fail(409, '이미 사용된 제출 요청입니다.');
        return { receipt: old.receipt, duplicate: true };
      }
      const now = new Date().toISOString();
      const id = randomUUID();
      const receipt =
        'MBCO-' +
        todayKST().replaceAll('-', '') +
        '-' +
        randomBytes(5).toString('hex').toUpperCase();
      const viewEvents = (
        db()
          .prepare(
            'SELECT video_id,title,opened_at,completed_at FROM view_events WHERE visitor_hash=? ORDER BY opened_at',
          )
          .all(owner) as {
          video_id: string;
          title: string;
          opened_at: string;
          completed_at: string | null;
        }[]
      ).map((e) => ({
        videoId: e.video_id,
        title: e.title,
        openedAt: e.opened_at,
        completedAt: e.completed_at,
      }));
      const r: Registration = {
        id,
        receipt,
        createdAt: now,
        pledgeDate: todayKST(),
        basic: v.basic,
        originalBasic: v.basic,
        signature: v.signature,
        consent: true,
        pledge: true,
        safetyChecks: v.safetyChecks,
        clickedVideoIds: clickedVideoIds(owner),
        educationPledged: v.educationPledged,
        educationPledgeText,
        policyVersion: POLICY_VERSION,
        policyText: privacyText,
        pledgeText: safetyRules,
        educationAttested: v.educationAttested,
        educationVerified: false,
        verificationNote: '',
        verifiedAt: null,
        viewEvents,
        version: 1,
      };
      db()
        .prepare('INSERT INTO registrations VALUES(?,?,?,?,?,?,?,?,?)')
        .run(
          id,
          receipt,
          v.requestId,
          owner,
          payloadHash,
          now,
          v.basic.startDate,
          v.basic.endDate,
          encrypt(r),
        );
      audit('visitor', 'CREATE_REGISTRATION', id, { policyVersion: POLICY_VERSION });
      return { receipt, duplicate: false };
    });
    db().prepare('DELETE FROM visitor_drafts WHERE visitor_hash=?').run(owner);
    return json(result, 201);
  }
  if (route === 'video-clicks' && req.method === 'POST') {
    const owner = await visitor();
    limit('video-click:' + owner, 100, 3600000);
    const v = z.object({ videoId: z.uuid() }).parse(input);
    const video = videos().find((row) => row.id === v.videoId);
    if (!video) fail(404, '영상을 찾을 수 없습니다.');
    db()
      .prepare(
        'INSERT INTO video_clicks(visitor_hash,video_id,youtube_id,clicked_at) VALUES(?,?,?,?) ON CONFLICT(visitor_hash,video_id,youtube_id) DO NOTHING',
      )
      .run(owner, video.id, video.youtubeId, new Date().toISOString());
    return json({ clickedVideoIds: clickedVideoIds(owner) });
  }
  if (route === 'video-events' && req.method === 'POST') {
    const owner = await visitor();
    limit('video:' + owner, 100, 3600000);
    const v = z.object({ videoId: z.uuid() }).parse(input);
    const video = videos().find((r) => r.id === v.videoId);
    if (!video) fail(404, '영상을 찾을 수 없습니다.');
    const eventId = randomUUID();
    db()
      .prepare(
        'INSERT INTO view_events(id,visitor_hash,video_id,title,opened_at,youtube_id) VALUES(?,?,?,?,?,?)',
      )
      .run(eventId, owner, video.id, video.title, new Date().toISOString(), video.youtubeId);
    return json({ eventId, status: 'OPENED_ONLY' });
  }
  if (route === 'video-events/complete' && req.method === 'POST') {
    const owner = await visitor();
    limit('video-complete:' + owner, 100, 3600000);
    const { eventId, durationSeconds } = z
      .object({
        eventId: z.uuid(),
        durationSeconds: z.number().finite().min(1).max(14400),
      })
      .parse(input);
    const event = db()
      .prepare(
        `SELECT e.opened_at,e.completed_at,v.id
      FROM view_events e JOIN videos v ON v.id=e.video_id AND v.youtube_id=e.youtube_id
      WHERE e.id=? AND e.visitor_hash=? AND v.visible=1 AND v.deleted=0`,
      )
      .get(eventId, owner) as
      { opened_at: string; completed_at: string | null; id: string } | undefined;
    if (!event) fail(404, '영상 열람 기록을 찾을 수 없습니다.');
    if (!event.completed_at && Date.now() - Date.parse(event.opened_at) < durationSeconds * 450)
      fail(400, '영상 재생이 완료된 후 다시 시도해 주세요.');
    if (!event.completed_at)
      db()
        .prepare('UPDATE view_events SET completed_at=? WHERE id=?')
        .run(new Date().toISOString(), eventId);
    return json({ completedVideoIds: completedVideoIds(owner) });
  }
  if (route === 'admin/logout' && req.method === 'POST') {
    await admin(true);
    await logout();
    return json({ ok: true });
  }
  if (route === 'admin/password' && req.method === 'POST') {
    const a = await admin(true);
    limit('password:' + a.id, 5, 15 * 60 * 1000);
    const v = z
      .object({ current: z.string().min(4).max(16), next: passwordSchema, confirm: z.string() })
      .refine((v) => v.next === v.confirm, '새 비밀번호 확인이 일치하지 않습니다.')
      .refine((v) => v.current !== v.next, '기존 비밀번호와 다르게 설정하세요.')
      .parse(input);
    const old = db().prepare('SELECT password FROM admins WHERE id=?').get(a.id) as {
      password: string;
    };
    if (!passwordMatches(v.current, old.password)) fail(400, '기존 비밀번호가 올바르지 않습니다.');
    transaction(() => {
      db()
        .prepare('UPDATE admins SET password=?,must_change=0 WHERE id=?')
        .run(passwordHash(v.next), a.id);
      db().prepare('DELETE FROM sessions WHERE admin_id=?').run(a.id);
      audit(a.id, 'CHANGE_PASSWORD', null);
    });
    await logout();
    return json({ ok: true });
  }
  const a = await admin();
  if (path[0] === 'admin' && path[1] === 'registrations' && path.length === 3) {
    const id = path[2];
    if (req.method === 'DELETE') {
      const v = z
        .object({ reason: z.string().trim().min(3).max(500), version: z.number().int() })
        .parse(input);
      transaction(() => {
        const r = registration(id);
        if (r.version !== v.version) fail(409, '다른 관리자가 수정했습니다. 다시 조회하세요.');
        db().prepare('DELETE FROM registrations WHERE id=?').run(id);
        audit(a.id, 'DELETE_REGISTRATION', id, { reason: v.reason });
      });
      return json({ ok: true });
    }
    if (req.method === 'PATCH') {
      const v = z
        .object({
          basic: refinedBasic,
          reason: z.string().trim().min(3).max(500),
          version: z.number().int(),
        })
        .parse(input);
      transaction(() => {
        const r = registration(id);
        if (r.version !== v.version) fail(409, '다른 관리자가 수정했습니다. 다시 조회하세요.');
        const changed = Object.keys(v.basic).filter(
          (k) => v.basic[k as keyof typeof v.basic] !== r.basic[k as keyof typeof r.basic],
        );
        if (
          v.basic.educationCompleted !== r.basic.educationCompleted ||
          v.basic.educationDate !== r.basic.educationDate ||
          v.basic.educationCertificateContact !== (r.basic.educationCertificateContact || '')
        )
          fail(
            400,
            '본인이 확인한 교육정보는 수정할 수 없습니다. 별도의 관리자 확인 기능을 사용하세요.',
          );
        r.basic = v.basic;
        r.version++;
        db()
          .prepare('UPDATE registrations SET start_date=?,end_date=?,data=? WHERE id=?')
          .run(v.basic.startDate, v.basic.endDate, encrypt(r), id);
        audit(a.id, 'UPDATE_REGISTRATION', id, { reason: v.reason, fields: changed });
      });
      return json({ ok: true });
    }
  }
  if (
    path[0] === 'admin' &&
    path[1] === 'education' &&
    path.length === 3 &&
    req.method === 'POST'
  ) {
    const v = z
      .object({
        verified: z.boolean(),
        note: z.string().trim().min(5, '확인 근거를 5자 이상 입력하세요.').max(1000),
        version: z.number().int(),
      })
      .parse(input);
    transaction(() => {
      const r = registration(path[2]);
      if (r.version !== v.version) fail(409, '다른 관리자가 수정했습니다. 다시 조회하세요.');
      r.educationVerified = v.verified;
      r.verificationNote = v.note;
      r.verifiedAt = v.verified ? new Date().toISOString() : null;
      r.version++;
      db().prepare('UPDATE registrations SET data=? WHERE id=?').run(encrypt(r), r.id);
      audit(a.id, v.verified ? 'VERIFY_EDUCATION' : 'REVOKE_EDUCATION', r.id, { note: v.note });
    });
    return json({ ok: true });
  }
  if (path[0] === 'admin' && path[1] === 'videos') {
    const id = path[2];
    if (req.method === 'DELETE' && id) {
      transaction(() => {
        const result = db()
          .prepare('UPDATE videos SET deleted=1,visible=0 WHERE id=? AND deleted=0')
          .run(id);
        if (!result.changes) fail(404, '영상이 없습니다.');
        audit(a.id, 'DELETE_VIDEO', id);
      });
      return json({ ok: true });
    }
    if ((req.method === 'POST' && !id) || (req.method === 'PATCH' && id)) {
      const v = videoSchema.parse(input);
      const youtube = youtubeId(v.url);
      if (!youtube) fail(400, '유효한 HTTPS 유튜브 영상 주소를 입력하세요.');
      let response: Response;
      try {
        response = await fetch(
          'https://www.youtube.com/oembed?format=json&url=' +
            encodeURIComponent('https://www.youtube.com/watch?v=' + youtube),
          { signal: AbortSignal.timeout(8000), redirect: 'error' },
        );
      } catch {
        fail(422, '유튜브 연결에 실패했습니다. 네트워크를 확인하고 다시 시도하세요.');
      }
      if (!response.ok)
        fail(422, '유튜브에서 공개 영상을 확인할 수 없습니다. 주소와 공개 설정을 확인하세요.');
      const newId = id || randomUUID();
      transaction(() => {
        if (id) {
          const result = db()
            .prepare(
              'UPDATE videos SET title=?,youtube_id=?,sort_order=?,visible=? WHERE id=? AND deleted=0',
            )
            .run(v.title, youtube, v.sortOrder, +v.visible, id);
          if (!result.changes) fail(404, '영상이 없습니다.');
        } else
          db()
            .prepare('INSERT INTO videos VALUES(?,?,?,?,?,0)')
            .run(newId, v.title, youtube, v.sortOrder, +v.visible);
        audit(a.id, id ? 'UPDATE_VIDEO' : 'CREATE_VIDEO', newId);
      });
      return json({ ok: true, id: newId });
    }
  }
  fail(404, '요청한 기능이 없습니다.');
}
