'use client';
import { Basic, purposes } from '@/lib/domain';
export const emptyBasic: Basic = {
  startDate: '',
  endDate: '',
  company: '',
  name: '',
  phone: '',
  team: '',
  contact: '',
  purpose: '공사·설치',
  otherPurpose: '',
  educationCompleted: false,
  educationDate: '',
  educationCertificateContact: '',
};
export function BasicFields({
  value,
  onChange,
  educationReadOnly = false,
}: {
  value: Basic;
  onChange: (b: Basic) => void;
  educationReadOnly?: boolean;
}) {
  const set = (key: keyof Basic, v: string | boolean) => onChange({ ...value, [key]: v });
  return (
    <div className="form-grid">
      <label>
        작업 시작일 <b>*</b>
        <input
          type="date"
          required
          value={value.startDate}
          onChange={(e) => set('startDate', e.target.value)}
        />
      </label>
      <label>
        작업 종료일 <b>*</b>
        <input
          type="date"
          required
          min={value.startDate}
          value={value.endDate}
          onChange={(e) => set('endDate', e.target.value)}
        />
      </label>
      <label className="span-2">
        소속 회사명 <b>*</b>
        <input
          autoComplete="organization"
          required
          maxLength={100}
          placeholder="소속 회사명을 입력하세요"
          value={value.company}
          onChange={(e) => set('company', e.target.value)}
        />
      </label>
      <label>
        성명 <b>*</b>
        <input
          autoComplete="name"
          required
          maxLength={100}
          placeholder="홍길동"
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </label>
      <label>
        연락처 <b>*</b>
        <input
          autoComplete="tel"
          type="tel"
          inputMode="tel"
          required
          maxLength={13}
          placeholder="010-0000-0000"
          value={value.phone}
          onChange={(e) => {
            const s = e.target.value.replace(/\D/g, '').slice(0, 11);
            set(
              'phone',
              s.length > 7
                ? s.slice(0, 3) + '-' + s.slice(3, 7) + '-' + s.slice(7)
                : s.length > 3
                  ? s.slice(0, 3) + '-' + s.slice(3)
                  : s,
            );
          }}
        />
      </label>
      <div className="field-divider span-2">
        <span>MBCo. 작업발주 담당자</span>
      </div>
      <label>
        팀명 <b>*</b>
        <input
          required
          maxLength={100}
          placeholder="예: 생산기술팀"
          value={value.team}
          onChange={(e) => set('team', e.target.value)}
        />
      </label>
      <label>
        담당자명 <b>*</b>
        <input
          required
          maxLength={100}
          placeholder="MBCo. 담당자 성명"
          value={value.contact}
          onChange={(e) => set('contact', e.target.value)}
        />
      </label>
      <fieldset className="span-2">
        <legend>
          방문 목적 <b>*</b>
        </legend>
        <div className="purpose-options">
          {purposes.map((p) => (
            <label key={p} className={value.purpose === p ? 'selected' : ''}>
              <input
                type="radio"
                name="purpose"
                value={p}
                checked={value.purpose === p}
                onChange={() => set('purpose', p)}
              />
              {p}
            </label>
          ))}
        </div>
      </fieldset>
      {value.purpose === '기타' && (
        <label className="span-2">
          기타 방문 목적 <b>*</b>
          <input
            required
            maxLength={300}
            value={value.otherPurpose}
            onChange={(e) => set('otherPurpose', e.target.value)}
            placeholder="구체적인 방문 목적을 입력하세요"
          />
        </label>
      )}
      <div className="field-divider span-2">
        <span>안전교육 이력</span>
      </div>
      <fieldset className="span-2">
        <legend>안전교육 이수 여부 <b>*</b></legend>
        <div className="education-options">
          <label className={!value.educationCompleted ? 'selected' : ''}>
            <input type="radio" name="educationCompleted" checked={!value.educationCompleted}
              disabled={educationReadOnly}
              onChange={() => onChange({ ...value, educationCompleted: false, educationDate: '', educationCertificateContact: '' })} />
            미이수 (안전교육 1시간 이수 서약)
          </label>
          <label className={value.educationCompleted ? 'selected' : ''}>
            <input type="radio" name="educationCompleted" checked={value.educationCompleted}
              disabled={educationReadOnly}
              onChange={() => onChange({ ...value, educationCompleted: true, educationDate: '', educationCertificateContact: '' })} />
            이수 (교육이수증 제출)
          </label>
        </div>
      </fieldset>
      <label>
        {value.educationCompleted ? '교육일' : '교육 예정일'} <b>*</b>
        <input
          type="date"
          disabled={educationReadOnly}
          required
          value={value.educationDate}
          onChange={(e) => set('educationDate', e.target.value)}
        />
      </label>
      {value.educationCompleted && (
        <label>
          이수증 제출 담당자 (만도브로제) <b>*</b>
          <input required maxLength={100} disabled={educationReadOnly}
            placeholder="책임자 성명을 입력하세요"
            value={value.educationCertificateContact ?? ''}
            onChange={(e) => set('educationCertificateContact', e.target.value)} />
        </label>
      )}
    </div>
  );
}
