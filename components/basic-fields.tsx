'use client';
import { useId } from 'react';
import { Basic, BasicFieldErrors, purposes } from '@/lib/domain';
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
  onFieldChange,
  errors = {},
  educationReadOnly = false,
}: {
  value: Basic;
  onChange: (b: Basic) => void;
  onFieldChange?: (field: keyof Basic) => void;
  errors?: BasicFieldErrors;
  educationReadOnly?: boolean;
}) {
  const prefix = useId();
  const set = (key: keyof Basic, v: string | boolean) => {
    onChange({ ...value, [key]: v });
    onFieldChange?.(key);
  };
  const fieldAttributes = (key: keyof Basic) => ({
    id: `${prefix}-${key}`,
    name: key,
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `${prefix}-${key}-error` : undefined,
  });
  const fieldError = (key: keyof Basic) =>
    errors[key] ? (
      <span className="field-error" id={`${prefix}-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  const setEducationCompleted = (completed: boolean) => {
    onChange({
      ...value,
      educationCompleted: completed,
      educationDate: '',
      educationCertificateContact: '',
    });
    onFieldChange?.('educationCompleted');
    onFieldChange?.('educationDate');
    onFieldChange?.('educationCertificateContact');
  };
  return (
    <div className="form-grid">
      <label>
        작업 시작일 <b>*</b>
        <input
          {...fieldAttributes('startDate')}
          type="date"
          required
          value={value.startDate}
          onChange={(e) => set('startDate', e.target.value)}
        />
        {fieldError('startDate')}
      </label>
      <label>
        작업 종료일 <b>*</b>
        <input
          {...fieldAttributes('endDate')}
          type="date"
          required
          min={value.startDate}
          value={value.endDate}
          onChange={(e) => set('endDate', e.target.value)}
        />
        {fieldError('endDate')}
      </label>
      <label className="span-2">
        소속 회사명 <b>*</b>
        <input
          {...fieldAttributes('company')}
          autoComplete="organization"
          required
          maxLength={100}
          placeholder="소속 회사명을 입력하세요"
          value={value.company}
          onChange={(e) => set('company', e.target.value)}
        />
        {fieldError('company')}
      </label>
      <label>
        성명 <b>*</b>
        <input
          {...fieldAttributes('name')}
          autoComplete="name"
          required
          maxLength={100}
          placeholder="홍길동"
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
        />
        {fieldError('name')}
      </label>
      <label>
        연락처 <b>*</b>
        <input
          {...fieldAttributes('phone')}
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
        {fieldError('phone')}
      </label>
      <div className="field-divider span-2">
        <span>MBCo. 작업발주 담당자</span>
      </div>
      <label>
        팀명 <b>*</b>
        <input
          {...fieldAttributes('team')}
          required
          maxLength={100}
          placeholder="예: 생산기술팀"
          value={value.team}
          onChange={(e) => set('team', e.target.value)}
        />
        {fieldError('team')}
      </label>
      <label>
        담당자명 <b>*</b>
        <input
          {...fieldAttributes('contact')}
          required
          maxLength={100}
          placeholder="MBCo. 담당자 성명"
          value={value.contact}
          onChange={(e) => set('contact', e.target.value)}
        />
        {fieldError('contact')}
      </label>
      <fieldset
        className="span-2"
        aria-invalid={Boolean(errors.purpose)}
        aria-describedby={errors.purpose ? `${prefix}-purpose-error` : undefined}
      >
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
                onChange={() => {
                  set('purpose', p);
                  onFieldChange?.('otherPurpose');
                }}
              />
              {p}
            </label>
          ))}
        </div>
        {fieldError('purpose')}
      </fieldset>
      {value.purpose === '기타' && (
        <label className="span-2">
          기타 방문 목적 <b>*</b>
          <input
            {...fieldAttributes('otherPurpose')}
            required
            maxLength={300}
            value={value.otherPurpose}
            onChange={(e) => set('otherPurpose', e.target.value)}
            placeholder="구체적인 방문 목적을 입력하세요"
          />
          {fieldError('otherPurpose')}
        </label>
      )}
      <div className="field-divider span-2">
        <span>안전교육 이력</span>
      </div>
      <fieldset
        className="span-2"
        aria-invalid={Boolean(errors.educationCompleted)}
        aria-describedby={
          errors.educationCompleted ? `${prefix}-educationCompleted-error` : undefined
        }
      >
        <legend>
          안전교육 이수 여부 <b>*</b>
        </legend>
        <div className="education-options">
          <label className={!value.educationCompleted ? 'selected' : ''}>
            <input
              type="radio"
              name="educationCompleted"
              checked={!value.educationCompleted}
              disabled={educationReadOnly}
              onChange={() => setEducationCompleted(false)}
            />
            미이수 (안전교육 1시간 이수 서약)
          </label>
          <label className={value.educationCompleted ? 'selected' : ''}>
            <input
              type="radio"
              name="educationCompleted"
              checked={value.educationCompleted}
              disabled={educationReadOnly}
              onChange={() => setEducationCompleted(true)}
            />
            이수 (교육이수증 제출)
          </label>
        </div>
        {fieldError('educationCompleted')}
      </fieldset>
      <label>
        {value.educationCompleted ? '교육일' : '교육 예정일'} <b>*</b>
        <input
          {...fieldAttributes('educationDate')}
          type="date"
          disabled={educationReadOnly}
          required
          value={value.educationDate}
          onChange={(e) => set('educationDate', e.target.value)}
        />
        {fieldError('educationDate')}
      </label>
      {value.educationCompleted && (
        <label>
          이수증 제출 담당자 (만도브로제) <b>*</b>
          <input
            {...fieldAttributes('educationCertificateContact')}
            required
            maxLength={100}
            disabled={educationReadOnly}
            placeholder="책임자 성명을 입력하세요"
            value={value.educationCertificateContact ?? ''}
            onChange={(e) => set('educationCertificateContact', e.target.value)}
          />
          {fieldError('educationCertificateContact')}
        </label>
      )}
    </div>
  );
}
