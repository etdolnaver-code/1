import test from 'node:test';
import assert from 'node:assert/strict';
import {
  refinedBasic,
  signatureSchema,
  passwordSchema,
  youtubeId,
  registrationSchema,
  draftSchema,
  allSafetyRulesChecked,
  educationPledgeSatisfied,
  emptySafetyChecks,
  educationProgress,
  canProceedToPrivacy,
} from '../lib/domain.ts';
const basic = {
  startDate: '2026-10-15',
  endDate: '2026-10-16',
  company: '테스트업체',
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
test('기본정보와 연락처/날짜 검증', () => {
  assert.ok(refinedBasic.safeParse(basic).success);
  assert.equal(refinedBasic.safeParse({ ...basic, endDate: '2026-10-14' }).success, false);
  assert.equal(refinedBasic.safeParse({ ...basic, startDate: '2026-02-30' }).success, false);
  assert.equal(refinedBasic.safeParse({ ...basic, phone: 'abc' }).success, false);
  assert.equal(refinedBasic.safeParse({ ...basic, purpose: '기타' }).success, false);
});
test('교육 이수일과 본인 확인 검증', () => {
  assert.equal(refinedBasic.safeParse({ ...basic, educationDate: '' }).success, false);
  assert.equal(refinedBasic.safeParse({ ...basic, educationCompleted: true }).success, false);
  assert.equal(
    refinedBasic.safeParse({ ...basic, educationCompleted: true, educationDate: '2099-01-01' })
      .success,
    false,
  );
  assert.equal(
    refinedBasic.safeParse({ ...basic, educationCertificateContact: '시험담당자' }).success,
    false,
  );
  assert.ok(
    refinedBasic.safeParse({
      ...basic,
      educationCompleted: true,
      educationDate: '2026-01-01',
      educationCertificateContact: '시험담당자',
    }).success,
  );
});
test('빈 서명, 점만 찍기, 범위 밖 좌표 거부', () => {
  assert.equal(signatureSchema.safeParse([]).success, false);
  assert.equal(
    signatureSchema.safeParse([
      [
        { x: 0.1, y: 0.1 },
        { x: 0.1, y: 0.1 },
      ],
    ]).success,
    false,
  );
  assert.equal(
    signatureSchema.safeParse([
      [
        { x: -1, y: 0 },
        { x: 0.9, y: 0.8 },
      ],
    ]).success,
    false,
  );
  assert.ok(
    signatureSchema.safeParse([
      [
        { x: 0.1, y: 0.2 },
        { x: 0.7, y: 0.8 },
      ],
    ]).success,
  );
});
test('동의 거부 또는 서약 미확인 등록 거부', () => {
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
    requestId: crypto.randomUUID(),
  };
  assert.ok(registrationSchema.safeParse(payload).success);
  assert.equal(registrationSchema.safeParse({ ...payload, consent: false }).success, false);
  assert.equal(registrationSchema.safeParse({ ...payload, pledge: false }).success, false);
  assert.equal(
    registrationSchema.safeParse({ ...payload, educationPledged: false }).success,
    false,
  );
  assert.equal(
    registrationSchema.safeParse({
      ...payload,
      safetyChecks: [true, true, true, true, true, true, false],
    }).success,
    false,
  );
  assert.ok(
    registrationSchema.safeParse({
      ...payload,
      basic: {
        ...basic,
        educationCompleted: true,
        educationDate: '2026-01-01',
        educationCertificateContact: '시험담당자',
      },
      educationAttested: true,
      educationPledged: false,
    }).success,
  );
});
test('미이수 작업자는 교육 이수 서약이 필요하고 기존 임시 저장은 미체크로 복원', () => {
  assert.equal(educationPledgeSatisfied(false, false), false);
  assert.equal(educationPledgeSatisfied(false, true), true);
  assert.equal(educationPledgeSatisfied(true, false), true);
  const oldDraft = draftSchema.parse({
    basic,
    step: 1,
    pledge: false,
    safetyChecks: emptySafetyChecks(),
    attested: false,
    consent: null,
    requestId: crypto.randomUUID(),
  });
  assert.equal(oldDraft.educationPledged, false);
});
test('안전수칙 7개를 모두 확인해야 서약 완료', () => {
  const checks = emptySafetyChecks();
  assert.equal(allSafetyRulesChecked(checks), false);
  assert.equal(allSafetyRulesChecked(checks.map((_, index) => index < 6)), false);
  assert.equal(allSafetyRulesChecked(checks.map(() => true)), true);
});
test('영상 클릭과 7개 수칙 확인이 모두 끝나야 개인정보 동의 단계로 이동', () => {
  const videos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const allChecks = Array(7).fill(true) as boolean[];
  assert.deepEqual(educationProgress(videos, []), {
    completedCount: 0,
    totalCount: 3,
    allComplete: false,
  });
  assert.deepEqual(educationProgress(videos, ['a', 'b']), {
    completedCount: 2,
    totalCount: 3,
    allComplete: false,
  });
  assert.equal(canProceedToPrivacy(videos, ['a', 'b'], allChecks), false);
  assert.equal(
    canProceedToPrivacy(videos, ['a', 'b', 'c'], [true, true, true, true, true, true, false]),
    false,
  );
  assert.equal(canProceedToPrivacy(videos, ['a', 'b', 'c'], allChecks), true);
  assert.equal(canProceedToPrivacy([...videos, { id: 'd' }], ['a', 'b', 'c'], allChecks), false);
  assert.equal(canProceedToPrivacy(videos.slice(0, 2), ['a', 'b', 'c'], allChecks), true);
});
test('비밀번호 정책', () => {
  for (const p of ['1111', '11111111', '12345678', '87654321', '12121212', '12341234'])
    assert.equal(passwordSchema.safeParse(p).success, false, p);
  assert.ok(passwordSchema.safeParse('48296173').success);
});
test('YouTube URL만 허용, 유사 도메인/프로토콜 거부', () => {
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  for (const u of [
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ',
    'https://localhost/',
    'https://youtu.be/short',
  ])
    assert.equal(youtubeId(u), null);
});
