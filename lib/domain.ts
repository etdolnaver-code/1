import { z } from 'zod';
export const purposes = ['공사·설치', '점검', '재작업', '기타'] as const;
export const safetyRules = [
  '작업장 출입 시 안전조끼·안전화 등 지정 보호구 착용',
  '고소작업 시 안전대 착용 및 추락방지 조치',
  '화기작업 시 작업허가 승인, 가연물 제거 및 소화기 비치',
  '밀폐공간작업 시 산소·유해가스 측정, 환기 및 감시인 배치',
  '설비 점검·정비 시 에너지원 차단 및 잠금·표지(LOTO) 조치',
  '작업허가 승인 후 작업 실시 및 승인된 작업범위 준수',
  '위험상황 발생 시 즉시 작업중지 및 MBCo. 담당자 보고',
];
export const POLICY_VERSION = '2026-10-v2';
export const educationPledgeText = '안전교육 1시간을 이수할 것을 서약합니다.';
export const emptySafetyChecks = () => safetyRules.map(() => false);
export const allSafetyRulesChecked = (checks: boolean[]) =>
  checks.length === safetyRules.length && checks.every(Boolean);
export const educationPledgeSatisfied = (educationCompleted: boolean, educationPledged: boolean) =>
  educationCompleted || educationPledged;
export function educationProgress(videos: { id: string }[], completedVideoIds: string[]) {
  const completed = new Set(completedVideoIds);
  const completedCount = videos.filter((video) => completed.has(video.id)).length;
  return {
    completedCount,
    totalCount: videos.length,
    allComplete: completedCount === videos.length,
  };
}
export const canProceedToPrivacy = (
  videos: { id: string }[],
  clickedVideoIds: string[],
  checks: boolean[],
) => {
  const clicked = new Set(clickedVideoIds);
  return videos.every((video) => clicked.has(video.id)) && allSafetyRulesChecked(checks);
};
export const privacyText =
  '수집·이용 목적: 신원 확인, 출입관리, 안전교육 이력 및 작업이력 관리, 비상연락. 수집 항목: 회사명, 성명, 연락처, 작업기간, 방문 목적, 작업발주 담당자, 교육 이력, 안전서약 기록 및 전자서명. 보유기간: 작업 종료일로부터 1년(운영 전 확정 필요). 동의를 거부할 권리가 있으며, 동의하지 않으면 본 시스템에서 출입등록을 제출할 수 없습니다.';
export const todayKST = (at = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
const short = z.string().trim().min(1, '필수 항목입니다.').max(100, '100자 이내로 입력하세요.');
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜를 선택하세요.')
  .refine(
    (v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    '올바른 날짜를 입력하세요.',
  );
export const basicSchema = z.object({
  startDate: day,
  endDate: day,
  company: short,
  name: short,
  phone: z.string().regex(/^010-\d{4}-\d{4}$/, '010-0000-0000 형식으로 입력하세요.'),
  team: short,
  contact: short,
  purpose: z.enum(purposes),
  otherPurpose: z.string().trim().max(300).default(''),
  educationCompleted: z.boolean(),
  educationDate: z.union([day, z.literal('')]),
  educationCertificateContact: z.string().trim().max(100).default(''),
});
export const refinedBasic = basicSchema.superRefine((v, c) => {
  if (v.endDate < v.startDate)
    c.addIssue({ code: 'custom', path: ['endDate'], message: '종료일은 시작일 이후여야 합니다.' });
  if (v.purpose === '기타' && !v.otherPurpose)
    c.addIssue({ code: 'custom', path: ['otherPurpose'], message: '방문 목적을 입력하세요.' });
  if (!v.educationDate || (v.educationCompleted && v.educationDate > todayKST()))
    c.addIssue({
      code: 'custom',
      path: ['educationDate'],
      message: v.educationCompleted
        ? '오늘까지의 교육일을 입력하세요.'
        : '교육 예정일을 입력하세요.',
    });
  if (v.educationCompleted && !v.educationCertificateContact)
    c.addIssue({
      code: 'custom',
      path: ['educationCertificateContact'],
      message: '이수증 제출 담당자 성명을 입력하세요.',
    });
  if (!v.educationCompleted && v.educationCertificateContact)
    c.addIssue({
      code: 'custom',
      path: ['educationCertificateContact'],
      message: '미이수 상태에서는 이수증 제출 담당자를 입력할 수 없습니다.',
    });
});
export const draftSchema = z.object({
  basic: basicSchema.extend({
    startDate: z.union([day, z.literal('')]),
    endDate: z.union([day, z.literal('')]),
    company: z.string().max(100),
    name: z.string().max(100),
    phone: z
      .string()
      .max(13)
      .regex(/^[0-9-]*$/),
    team: z.string().max(100),
    contact: z.string().max(100),
  }),
  step: z.number().int().min(0).max(3),
  pledge: z.boolean(),
  safetyChecks: z.array(z.boolean()).length(safetyRules.length).default(emptySafetyChecks),
  attested: z.boolean(),
  educationPledged: z.boolean().default(false),
  consent: z.boolean().nullable(),
  requestId: z.uuid(),
});
export type Draft = z.infer<typeof draftSchema>;
export const signatureSchema = z
  .array(
    z
      .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
      .min(2)
      .max(2500),
  )
  .min(1, '서명란에 직접 서명해 주세요.')
  .max(80)
  .refine((strokes) => {
    let length = 0;
    for (const s of strokes)
      for (let i = 1; i < s.length; i++)
        length += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    return length > 0.15;
  }, '서명란에 직접 서명해 주세요.');
export const registrationSchema = z
  .object({
    basic: refinedBasic,
    pledge: z.literal(true),
    safetyChecks: z.array(z.literal(true)).length(safetyRules.length),
    consent: z.literal(true),
    educationAttested: z.boolean(),
    educationPledged: z.boolean().default(false),
    signature: signatureSchema,
    requestId: z.uuid(),
  })
  .superRefine((v, c) => {
    if (!educationPledgeSatisfied(v.basic.educationCompleted, v.educationPledged))
      c.addIssue({
        code: 'custom',
        path: ['educationPledged'],
        message: '안전교육 1시간 이수 서약에 체크해 주세요.',
      });
    if (v.basic.educationCompleted && !v.educationAttested)
      c.addIssue({
        code: 'custom',
        path: ['educationAttested'],
        message: '교육 이수 사실을 직접 확인해 주세요.',
      });
    if (!v.basic.educationCompleted && v.educationAttested)
      c.addIssue({
        code: 'custom',
        path: ['educationAttested'],
        message: '교육 이수 상태를 확인하세요.',
      });
  });
export const passwordSchema = z
  .string()
  .regex(/^\d{8,16}$/, '새 비밀번호는 숫자 8~16자리여야 합니다.')
  .refine(
    (v) =>
      !(
        /^(\d)\1+$/.test(v) ||
        '01234567890123456789'.includes(v) ||
        '98765432109876543210'.includes(v) ||
        /^(\d{2,4})\1+$/.test(v)
      ),
    '반복·연속 숫자는 사용할 수 없습니다.',
  );
export const videoSchema = z.object({
  title: short,
  url: z.string().url().max(500),
  sortOrder: z.number().int().min(0).max(9999),
  visible: z.boolean(),
});
export function youtubeId(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    let id: string | null = null;
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    else if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname)) {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/);
        id = m?.[1] ?? null;
      }
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export type Basic = z.infer<typeof basicSchema>;
export type BasicFieldErrors = Partial<Record<keyof Basic, string>>;

const basicFieldPrompts: Record<keyof Basic, string> = {
  startDate: '작업 시작일을 선택해 주세요.',
  endDate: '작업 종료일을 선택해 주세요.',
  company: '소속 회사명을 입력해 주세요.',
  name: '성명을 입력해 주세요.',
  phone: '연락처를 입력해 주세요.',
  team: '팀명을 입력해 주세요.',
  contact: '담당자명을 입력해 주세요.',
  purpose: '방문 목적을 선택해 주세요.',
  otherPurpose: '기타 방문 목적을 입력해 주세요.',
  educationCompleted: '안전교육 이수 여부를 선택해 주세요.',
  educationDate: '교육일 또는 교육 예정일을 선택해 주세요.',
  educationCertificateContact: '이수증 제출 담당자 성명을 입력해 주세요.',
};

export function basicFieldFromIssue(issue: z.ZodIssue): keyof Basic | null {
  const key = issue.path[0] === 'basic' ? issue.path[1] : issue.path[0];
  return typeof key === 'string' && Object.hasOwn(basicFieldPrompts, key)
    ? (key as keyof Basic)
    : null;
}

export function basicIssueMessage(issue: z.ZodIssue): string {
  const field = basicFieldFromIssue(issue);
  if (
    field &&
    (issue.message === '필수 항목입니다.' ||
      issue.message === '날짜를 선택하세요.' ||
      issue.code === 'invalid_type' ||
      issue.code === 'invalid_union' ||
      issue.code === 'invalid_value')
  )
    return basicFieldPrompts[field];
  if (!field && (issue.code === 'invalid_type' || issue.code === 'invalid_union'))
    return '입력값을 확인해 주세요.';
  return issue.message;
}

export function formIssueMessage(issue: z.ZodIssue): string {
  if (basicFieldFromIssue(issue)) return basicIssueMessage(issue);
  if (issue.path[0] === 'basic') return '기본정보를 확인해 주세요.';
  if (issue.path[0] === 'signature') return '서명란에 직접 서명해 주세요.';
  if (issue.path[0] === 'consent') return '개인정보 수집·이용에 동의해 주세요.';
  if (issue.path[0] === 'pledge' || issue.path[0] === 'safetyChecks')
    return '안전수칙 7개 항목을 모두 확인해 주세요.';
  if (issue.path[0] === 'requestId')
    return '등록 세션이 만료되었습니다. 페이지를 새로고침해 주세요.';
  if (issue.code === 'invalid_type' || issue.code === 'invalid_union')
    return '입력값을 확인해 주세요.';
  return issue.message;
}

export function collectBasicFieldErrors(
  issues: z.ZodIssue[],
  basic?: Partial<Record<keyof Basic, unknown>>,
): BasicFieldErrors {
  const errors: BasicFieldErrors = {};
  for (const issue of issues) {
    const field = basicFieldFromIssue(issue);
    if (field && !errors[field]) errors[field] = basicIssueMessage(issue);
  }
  // Zod does not run cross-field refinements when a base field has the wrong type.
  if (
    basic?.purpose === '기타' &&
    (typeof basic.otherPurpose !== 'string' || !basic.otherPurpose.trim())
  )
    errors.otherPurpose ??= '방문 목적을 입력하세요.';
  if (basic && (typeof basic.educationDate !== 'string' || !basic.educationDate))
    errors.educationDate ??=
      basic.educationCompleted === true
        ? '오늘까지의 교육일을 입력하세요.'
        : '교육 예정일을 입력하세요.';
  if (
    basic?.educationCompleted === true &&
    (typeof basic.educationCertificateContact !== 'string' ||
      !basic.educationCertificateContact.trim())
  )
    errors.educationCertificateContact ??= '이수증 제출 담당자 성명을 입력하세요.';
  return errors;
}
export type Signature = z.infer<typeof signatureSchema>;
export type Video = {
  id: string;
  title: string;
  youtubeId: string;
  url: string;
  sortOrder: number;
  visible: boolean;
  deleted?: number;
};
export type Registration = {
  id: string;
  receipt: string;
  createdAt: string;
  pledgeDate: string;
  basic: Basic;
  originalBasic: Basic;
  signature: Signature;
  consent: true;
  pledge: true;
  safetyChecks?: boolean[];
  clickedVideoIds?: string[];
  educationPledged?: boolean;
  educationPledgeText?: string;
  policyVersion: string;
  policyText: string;
  pledgeText: string[];
  educationAttested: boolean;
  educationVerified: boolean;
  verificationNote: string;
  verifiedAt: string | null;
  viewEvents: { videoId: string; title: string; openedAt: string; completedAt?: string | null }[];
  version: number;
};
