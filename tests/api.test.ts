import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
test('실제 HTTP·SQLite 인증 및 등록 통합 검증', { timeout: 180000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mbco-test-'));
  const path = join(directory, 'test.sqlite');
  const port = 3107;
  const base = 'http://127.0.0.1:' + port;
  let logs = '';
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_ORIGIN: base,
        DATABASE_PATH: path,
        DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
        INITIAL_ADMIN_PASSWORD: '1111',
        COOKIE_SECURE: 'false',
        TRUST_PROXY: 'false',
      },
      windowsHide: true,
    },
  );
  child.stdout.on('data', (x) => (logs += x));
  child.stderr.on('data', (x) => (logs += x));
  t.after(() => child.kill());
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(base + '/api/videos');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready, '테스트 서버 시작 실패: ' + logs);
  let adminCookie = '',
    visitorCookie = '';
  async function call(
    endpoint: string,
    data?: unknown,
    options: { method?: string; admin?: boolean; origin?: string; cookie?: string } = {},
  ) {
    const response = await fetch(base + '/api/' + endpoint, {
      method: options.method ?? (data === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        origin: options.origin ?? base,
        cookie: options.cookie ?? (options.admin ? adminCookie : visitorCookie),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return response;
  }
  await t.test('비인증 관리자 API 및 개인정보 노출 차단', async () => {
    assert.equal((await call('admin/dashboard')).status, 401);
    assert.equal((await call('admin/export')).status, 401);
    assert.equal((await call('registrations')).status, 401);
  });
  await t.test('잘못된 Origin의 로그인 거부', async () => {
    assert.equal(
      (await call('admin/login', { password: '1111' }, { origin: 'https://evil.test' })).status,
      403,
    );
  });
  await t.test('운영 초기 비밀번호 변경 강제 및 세션 폐기', async () => {
    const login = await call('admin/login', { password: '1111' });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=strict/i);
    adminCookie = cookie.split(';')[0];
    assert.equal((await call('admin/dashboard', undefined, { admin: true })).status, 428);
    assert.equal((await call('admin/videos', undefined, { admin: true })).status, 428);
    assert.equal(
      (
        await call(
          'admin/password',
          { current: '1111', next: '12345678', confirm: '12345678' },
          { admin: true },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          'admin/password',
          { current: '1111', next: '48296173', confirm: '48296173' },
          { admin: true },
        )
      ).status,
      200,
    );
    assert.equal((await call('admin/session', undefined, { admin: true })).status, 401);
    const login2 = await call('admin/login', { password: '48296173' });
    assert.equal(login2.status, 200);
    adminCookie = login2.headers.get('set-cookie')!.split(';')[0];
  });
  const basic = {
    startDate: '2026-10-15',
    endDate: '2026-10-16',
    company: '=2+2',
    name: '시험작업자',
    phone: '010-1234-5678',
    team: '안전팀',
    contact: '시험담당자',
    purpose: '점검',
    otherPurpose: '',
    educationCompleted: false,
    educationDate: '2099-01-01',
    educationCertificateContact: '',
  };
  const payload = {
    basic,
    pledge: true,
    safetyChecks: [true, true, true, true, true, true, true],
    consent: true,
    educationAttested: false,
    educationPledged: true,
    signature: [
      [
        { x: 0.1, y: 0.2 },
        { x: 0.7, y: 0.8 },
      ],
    ],
    requestId: randomUUID(),
  };
  let id = '',
    receipt = '',
    newWorkerCookie = '';
  await t.test('방문자 세션 및 서버 동의/서명 검증', async () => {
    const boot = await call('bootstrap');
    assert.equal(boot.status, 200);
    visitorCookie = boot.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await call('registrations', { ...payload, consent: false })).status, 400);
    assert.equal((await call('registrations', { ...payload, signature: [] })).status, 400);
    const nullSignature = await call('registrations', { ...payload, signature: null });
    assert.equal(nullSignature.status, 400);
    assert.equal((await nullSignature.json()).error, '서명란에 직접 서명해 주세요.');
  });
  await t.test('첫 단계의 유효한 교육 예정일은 저장하고 잘못된 출처는 거부', async () => {
    const draft = {
      basic,
      step: 1,
      pledge: false,
      safetyChecks: [false, false, false, false, false, false, false],
      attested: false,
      educationPledged: false,
      consent: null,
      requestId: randomUUID(),
    };
    const denied = await call('draft', draft, {
      method: 'PUT',
      origin: 'https://other.example',
    });
    assert.equal(denied.status, 403);
    assert.match((await denied.json()).error, /현재 사이트 주소/);
    const missingDate = { ...draft, basic: { ...basic, educationDate: '' } };
    assert.equal((await call('draft', { ...missingDate, step: 0 }, { method: 'PUT' })).status, 200);
    const invalid = await call('draft', missingDate, { method: 'PUT' });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, '교육 예정일을 입력하세요.');
    const nullDate = await call(
      'draft',
      { ...draft, basic: { ...basic, educationDate: null } },
      { method: 'PUT' },
    );
    assert.equal(nullDate.status, 400);
    assert.equal((await nullDate.json()).error, '교육일 또는 교육 예정일을 선택해 주세요.');
    const nullName = await call(
      'draft',
      { ...draft, basic: { ...basic, name: null } },
      { method: 'PUT' },
    );
    assert.equal(nullName.status, 400);
    assert.equal((await nullName.json()).error, '성명을 입력해 주세요.');
    const invalidPhone = await call(
      'draft',
      { ...draft, basic: { ...basic, phone: '010-1234' } },
      { method: 'PUT' },
    );
    assert.equal(invalidPhone.status, 400);
    assert.equal((await invalidPhone.json()).error, '010-0000-0000 형식으로 입력하세요.');
    assert.equal((await call('draft', draft, { method: 'PUT' })).status, 200);
    const restored = await (await call('draft')).json();
    assert.equal(restored.draft.step, 1);
    assert.equal(restored.draft.basic.educationDate, basic.educationDate);
    assert.equal((await call('draft', { ...draft, step: 0 }, { method: 'PUT' })).status, 200);
    const back = await (await call('draft')).json();
    assert.equal(back.draft.step, 0);
    assert.deepEqual(back.draft.basic, basic);
    assert.equal((await call('draft', draft, { method: 'PUT' })).status, 200);
  });
  await t.test('동시 중복 제출은 하나의 DB 레코드와 접수번호로 처리', async () => {
    const responses = await Promise.all([
      call('registrations', payload),
      call('registrations', payload),
    ]);
    for (const r of responses) assert.equal(r.status, 201);
    const nextWorker = await call('bootstrap');
    newWorkerCookie = nextWorker.headers.get('set-cookie')!.split(';')[0];
    assert.notEqual(newWorkerCookie, visitorCookie);
    const [a, b] = await Promise.all(responses.map((r) => r.json()));
    assert.equal(a.receipt, b.receipt);
    assert.notEqual(a.duplicate, b.duplicate);
    receipt = a.receipt;
    const d = await (await call('admin/dashboard', undefined, { admin: true })).json();
    assert.equal(d.total, 1);
    id = d.rows[0].id;
    assert.equal(d.rows[0].educationVerified, false);
    assert.equal(
      (await call('registrations', { ...payload, basic: { ...basic, name: '변경' } })).status,
      409,
    );
  });
  await t.test('다른 방문자에게 중복 요청 결과를 노출하지 않음', async () => {
    const b = await call('bootstrap', undefined, { cookie: '' });
    const other = b.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await call('registrations', payload, { cookie: other })).status, 409);
    assert.equal((await call('admin/registrations/' + id)).status, 401);
  });
  await t.test('SQLite 암호화 저장과 관리자 원본 조회', async () => {
    const store = new DatabaseSync(path);
    const r = store.prepare('SELECT data FROM registrations').get() as { data: string };
    assert.ok(!r.data.includes('시험작업자'));
    const a = store.prepare('SELECT password FROM admins').get() as { password: string };
    assert.ok(!a.password.includes('48296173'));
    store.close();
    const d = await (await call('admin/registrations/' + id, undefined, { admin: true })).json();
    assert.equal(d.registration.receipt, receipt);
    assert.equal(d.registration.basic.name, '시험작업자');
    assert.equal(d.registration.signature.length, 1);
  });
  await t.test('필터와 CSV 수식 방어 및 실제 XLSX 내보내기', async () => {
    const d = await (
      await call('admin/dashboard?company=없는업체', undefined, { admin: true })
    ).json();
    assert.equal(d.total, 0);
    const csv = await call('admin/export?format=csv', undefined, { admin: true });
    assert.equal(csv.status, 200);
    assert.ok((await csv.text()).includes("'=2+2"));
    const excel = await call('admin/export?format=xlsx', undefined, { admin: true });
    assert.equal(excel.status, 200);
    const bytes = new Uint8Array(await excel.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 2)], [80, 75]);
  });
  await t.test('수정 사유, 낙관적 잠금, 교육 확인과 원본 보존', async () => {
    assert.equal(
      (
        await call(
          'admin/registrations/' + id,
          { basic, reason: '', version: 1 },
          { method: 'PATCH', admin: true },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          'admin/registrations/' + id,
          { basic: { ...basic, company: '변경업체' }, reason: '회사명 오기 정정', version: 1 },
          { method: 'PATCH', admin: true },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          'admin/registrations/' + id,
          { basic, reason: '중복 수정', version: 1 },
          { method: 'PATCH', admin: true },
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          'admin/education/' + id,
          { verified: true, note: '교육대장 및 현장 교육 담당자 확인', version: 2 },
          { admin: true },
        )
      ).status,
      200,
    );
    const d = await (await call('admin/registrations/' + id, undefined, { admin: true })).json();
    assert.equal(d.registration.educationVerified, true);
    assert.equal(d.registration.educationAttested, false);
    assert.equal(d.registration.originalBasic.company, '=2+2');
    assert.equal(d.registration.basic.company, '변경업체');
  });
  await t.test('영상 클릭과 재생 완료를 분리하고 클릭 기준으로 단계 이동', async () => {
    const store = new DatabaseSync(path);
    const videoId = randomUUID();
    const secondVideoId = randomUUID();
    store
      .prepare('INSERT INTO videos VALUES(?,?,?,?,?,0)')
      .run(videoId, '테스트영상', 'dQw4w9WgXcQ', 0, 1);
    store
      .prepare('INSERT INTO videos VALUES(?,?,?,?,?,0)')
      .run(secondVideoId, '두 번째 영상', 'M7lc1UVf-VE', 1, 1);
    store.close();
    const list = await (await call('videos')).json();
    assert.equal(list.videos.length, 2);
    const before = await (await call('video-progress')).json();
    assert.deepEqual(before.clickedVideoIds, []);
    assert.deepEqual(before.completedVideoIds, []);
    const gatedDraft = {
      basic,
      step: 2,
      pledge: true,
      safetyChecks: payload.safetyChecks,
      attested: false,
      educationPledged: true,
      consent: null,
      requestId: randomUUID(),
    };
    const partialDraft = {
      ...gatedDraft,
      step: 1,
      pledge: false,
      safetyChecks: [true, true, true, true, true, true, false],
    };
    const { educationPledged: _previouslyUnavailable, ...oldDraft } = partialDraft;
    assert.equal((await call('draft', oldDraft, { method: 'PUT' })).status, 200);
    const restored = (await (await call('draft')).json()).draft;
    assert.equal(restored.basic.name, basic.name);
    assert.deepEqual(restored.safetyChecks, partialDraft.safetyChecks);
    assert.equal(restored.educationPledged, false);
    assert.equal((await call('draft', partialDraft, { method: 'PUT' })).status, 200);
    assert.equal((await (await call('draft')).json()).draft.educationPledged, true);
    assert.equal((await call('draft', gatedDraft, { method: 'PUT' })).status, 400);
    assert.equal(
      (await call('registrations', { ...payload, requestId: randomUUID() })).status,
      400,
    );
    assert.equal((await call('video-clicks', { videoId })).status, 200);
    const firstClick = await (await call('video-progress')).json();
    assert.deepEqual(firstClick.clickedVideoIds, [videoId]);
    assert.deepEqual(firstClick.completedVideoIds, []);
    assert.equal((await call('draft', gatedDraft, { method: 'PUT' })).status, 400);
    const clickedStore = new DatabaseSync(path);
    assert.equal(
      (clickedStore.prepare('SELECT COUNT(*) AS count FROM view_events').get() as { count: number })
        .count,
      0,
    );
    clickedStore.close();
    const opened = await call('video-events', { videoId });
    assert.equal(opened.status, 200);
    const { eventId } = await opened.json();
    assert.equal(
      (await call('video-events/complete', { eventId, durationSeconds: 60 })).status,
      400,
    );
    assert.deepEqual((await (await call('video-progress')).json()).completedVideoIds, []);
    const elapsedStore = new DatabaseSync(path);
    elapsedStore
      .prepare('UPDATE view_events SET opened_at=? WHERE id=?')
      .run(new Date(Date.now() - 20000).toISOString(), eventId);
    elapsedStore.close();
    assert.equal(
      (await call('video-events/complete', { eventId, durationSeconds: 60 })).status,
      400,
    );
    const completedStore = new DatabaseSync(path);
    completedStore
      .prepare('UPDATE view_events SET opened_at=? WHERE id=?')
      .run(new Date(Date.now() - 31000).toISOString(), eventId);
    completedStore.close();
    assert.equal(
      (await call('video-events/complete', { eventId, durationSeconds: 60 })).status,
      200,
    );
    assert.deepEqual((await (await call('video-progress')).json()).completedVideoIds, [videoId]);
    assert.equal((await call('draft', gatedDraft, { method: 'PUT' })).status, 400);
    assert.equal((await call('video-clicks', { videoId: secondVideoId })).status, 200);
    const clickedAll = await (await call('video-progress')).json();
    assert.deepEqual(new Set(clickedAll.clickedVideoIds), new Set([videoId, secondVideoId]));
    assert.deepEqual(clickedAll.completedVideoIds, [videoId]);
    assert.equal(
      (await call('draft', { ...partialDraft, step: 2 }, { method: 'PUT' })).status,
      400,
    );
    assert.equal(
      (await call('draft', { ...gatedDraft, educationPledged: false }, { method: 'PUT' })).status,
      400,
    );
    assert.equal((await call('draft', gatedDraft, { method: 'PUT' })).status, 200);
    assert.equal((await (await call('draft')).json()).draft.step, 2);
    const separateWorkerProgress = await (
      await call('video-progress', undefined, { cookie: newWorkerCookie })
    ).json();
    assert.deepEqual(separateWorkerProgress.clickedVideoIds, []);
    assert.deepEqual(separateWorkerProgress.completedVideoIds, []);
    for (const clickedVideoId of [videoId, secondVideoId])
      assert.equal(
        (await call('video-clicks', { videoId: clickedVideoId }, { cookie: newWorkerCookie }))
          .status,
        200,
      );
    assert.deepEqual(
      (await (await call('video-progress', undefined, { cookie: newWorkerCookie })).json())
        .completedVideoIds,
      [],
    );
    assert.equal(
      (
        await call(
          'registrations',
          { ...payload, educationPledged: false, requestId: randomUUID() },
          { cookie: newWorkerCookie },
        )
      ).status,
      400,
    );
    const clickOnlyRegistration = await call(
      'registrations',
      { ...payload, requestId: randomUUID() },
      { cookie: newWorkerCookie },
    );
    assert.equal(clickOnlyRegistration.status, 201);
    const { receipt: clickOnlyReceipt } = await clickOnlyRegistration.json();
    const clickOnlyStore = new DatabaseSync(path);
    const { id: clickOnlyId } = clickOnlyStore
      .prepare('SELECT id FROM registrations WHERE receipt=?')
      .get(clickOnlyReceipt) as { id: string };
    clickOnlyStore.close();
    const clickOnlyDetail = await (
      await call('admin/registrations/' + clickOnlyId, undefined, { admin: true })
    ).json();
    assert.deepEqual(
      new Set(clickOnlyDetail.registration.clickedVideoIds),
      new Set([videoId, secondVideoId]),
    );
    assert.deepEqual(clickOnlyDetail.registration.viewEvents, []);
    assert.equal(clickOnlyDetail.registration.educationPledged, true);
    assert.equal(
      clickOnlyDetail.registration.educationPledgeText,
      '안전교육 1시간을 이수할 것을 서약합니다.',
    );
    const secondOpened = await call('video-events', { videoId: secondVideoId });
    const { eventId: secondEventId } = await secondOpened.json();
    const secondStore = new DatabaseSync(path);
    secondStore
      .prepare('UPDATE view_events SET opened_at=? WHERE id=?')
      .run(new Date(Date.now() - 61000).toISOString(), secondEventId);
    secondStore.close();
    assert.equal(
      (await call('video-events/complete', { eventId: secondEventId, durationSeconds: 60 })).status,
      200,
    );
    assert.deepEqual(
      new Set((await (await call('video-progress')).json()).completedVideoIds),
      new Set([videoId, secondVideoId]),
    );
    const addedVideoId = randomUUID();
    const addedStore = new DatabaseSync(path);
    addedStore
      .prepare('INSERT INTO videos VALUES(?,?,?,?,?,0)')
      .run(addedVideoId, '추가 영상', '9bZkp7q19f0', 2, 1);
    addedStore.close();
    const addedProgress = await (await call('video-progress')).json();
    assert.equal(addedProgress.videos.length, 3);
    assert.equal(addedProgress.clickedVideoIds.length, 2);
    assert.equal(addedProgress.completedVideoIds.length, 2);
    assert.equal((await (await call('draft')).json()).draft.step, 1);
    assert.equal((await call('draft', gatedDraft, { method: 'PUT' })).status, 400);
    assert.equal(
      (await call('admin/videos/' + addedVideoId, {}, { method: 'DELETE', admin: true })).status,
      200,
    );
    assert.equal((await call('draft', gatedDraft, { method: 'PUT' })).status, 200);
    const cancelled = await call('draft', {}, { method: 'DELETE' });
    assert.equal(cancelled.status, 200);
    const resetCookie = cancelled.headers.get('set-cookie')!.split(';')[0];
    assert.deepEqual(
      (await (await call('video-progress', undefined, { cookie: resetCookie })).json())
        .clickedVideoIds,
      [],
    );
    assert.equal(
      (
        await call(
          'admin/videos',
          { title: '오류영상', url: 'https://evil.test/', sortOrder: 1, visible: true },
          { admin: true },
        )
      ).status,
      400,
    );
    assert.equal(
      (await call('admin/videos/' + videoId, {}, { method: 'DELETE', admin: true })).status,
      200,
    );
    assert.equal(
      (await call('admin/videos/' + secondVideoId, {}, { method: 'DELETE', admin: true })).status,
      200,
    );
    assert.equal((await (await call('videos')).json()).videos.length, 0);
    assert.equal((await call('video-events', { videoId })).status, 404);
  });
  await t.test('삭제 권한 및 감사로그', async () => {
    assert.equal(
      (
        await call(
          'admin/registrations/' + id,
          { reason: '테스트 삭제', version: 3 },
          { method: 'DELETE' },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await call(
          'admin/registrations/' + id,
          { reason: '테스트 삭제', version: 3 },
          { method: 'DELETE', admin: true },
        )
      ).status,
      200,
    );
    assert.equal((await call('admin/registrations/' + id, undefined, { admin: true })).status, 404);
    const log = await (await call('admin/audit', undefined, { admin: true })).json();
    for (const action of [
      'CREATE_REGISTRATION',
      'UPDATE_REGISTRATION',
      'VERIFY_EDUCATION',
      'DELETE_REGISTRATION',
      'EXPORT',
    ])
      assert.ok(
        log.rows.some((r: { action: string }) => r.action === action),
        action,
      );
  });
  await t.test('로그아웃과 로그인 시도 제한', async () => {
    assert.equal((await call('admin/logout', {}, { admin: true })).status, 200);
    assert.equal((await call('admin/dashboard', undefined, { admin: true })).status, 401);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call('admin/login', { password: '0000' })).status;
    assert.equal(last, 429);
  });
});
