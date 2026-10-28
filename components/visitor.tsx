'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ZodIssue } from 'zod';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  UserRound,
  Play,
  LockKeyhole,
  PenLine,
  CheckCircle2,
  Clock3,
  Info,
  ExternalLink,
  FileCheck2,
  HardHat,
} from 'lucide-react';
import {
  Basic,
  BasicFieldErrors,
  Draft,
  Signature,
  Video,
  refinedBasic,
  basicIssueMessage,
  basicFieldFromIssue,
  collectBasicFieldErrors,
  formIssueMessage,
  registrationSchema,
  safetyRules,
  emptySafetyChecks,
  allSafetyRulesChecked,
  educationProgress,
  canProceedToPrivacy,
  educationPledgeSatisfied,
  educationPledgeText,
  privacyText,
} from '@/lib/domain';
import { api, send } from '@/lib/client';
import { BasicFields, emptyBasic } from './basic-fields';
import { SignaturePad } from './signature';
const steps = ['기본정보', '안전교육/서약', '개인정보 동의', '전자서명', '완료'];
type VideoProgress = {
  videos: Video[];
  clickedVideoIds: string[];
  completedVideoIds: string[];
};
export function Visitor() {
  const [step, setStep] = useState(0),
    [basic, setBasic] = useState<Basic>(emptyBasic),
    [basicErrors, setBasicErrors] = useState<BasicFieldErrors>({}),
    [videos, setVideos] = useState<Video[]>([]),
    [clickedVideoIds, setClickedVideoIds] = useState<string[]>([]),
    [completedVideoIds, setCompletedVideoIds] = useState<string[]>([]),
    [safetyChecks, setSafetyChecks] = useState<boolean[]>(emptySafetyChecks),
    [today, setToday] = useState(''),
    [attested, setAttested] = useState(false),
    [educationPledged, setEducationPledged] = useState(false),
    [consent, setConsent] = useState<boolean | null>(null),
    [signature, setSignature] = useState<Signature>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState(''),
    [ready, setReady] = useState(false);
  const request = useRef('');
  const submitting = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingVideoClicks = useRef(new Set<string>());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pledge = allSafetyRulesChecked(safetyChecks);
  function showBasicIssues(issues: ZodIssue[]) {
    const errors = collectBasicFieldErrors(issues, basic);
    setBasicErrors(errors);
    const firstBasicIssue = issues.find((issue) => basicFieldFromIssue(issue)) ?? issues[0];
    setError(firstBasicIssue ? basicIssueMessage(firstBasicIssue) : '기본정보를 확인해 주세요.');
    const firstField = Object.keys(errors)[0];
    if (firstField)
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>(`[name="${firstField}"]`)?.focus();
      });
  }
  function clearBasicError(field: keyof Basic) {
    setError('');
    setBasicErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }
  const currentDraft = (nextStep = step): Draft => ({
    basic,
    step: nextStep,
    pledge,
    safetyChecks,
    attested,
    educationPledged,
    consent,
    requestId: request.current,
  });
  function saveDraft(draft: Draft) {
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        await api('draft', send(draft, 'PUT'));
      });
    return saveQueue.current;
  }
  async function refreshVideoProgress() {
    const progress = await api<VideoProgress>('video-progress');
    setVideos(progress.videos);
    setClickedVideoIds([...new Set([...progress.clickedVideoIds, ...pendingVideoClicks.current])]);
    setCompletedVideoIds(progress.completedVideoIds);
    return progress;
  }
  async function recordVideoClick(videoId: string) {
    if (pendingVideoClicks.current.has(videoId)) return;
    pendingVideoClicks.current.add(videoId);
    setClickedVideoIds((current) => [...new Set([...current, videoId])]);
    try {
      await api('video-clicks', send({ videoId }));
    } catch {
      setError('영상 클릭 기록을 저장하지 못했습니다. 다시 클릭해 주세요.');
    } finally {
      pendingVideoClicks.current.delete(videoId);
      void refreshVideoProgress().catch(() =>
        setError('영상 클릭 기록을 불러오지 못했습니다. 다시 시도해 주세요.'),
      );
    }
  }
  useEffect(() => {
    api<{ videos: Video[]; today: string; requestId: string }>('bootstrap')
      .then(async (d) => {
        request.current = d.requestId;
        setToday(d.today);
        await refreshVideoProgress();
        const { draft } = await api<{ draft: Draft | null }>('draft');
        if (draft) {
          setBasic(draft.basic);
          setStep(draft.step);
          setSafetyChecks(draft.safetyChecks);
          setAttested(draft.attested);
          setEducationPledged(draft.educationPledged);
          setConsent(draft.consent);
          request.current = draft.requestId;
        }
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!ready || step !== 1) return;
    const refresh = () => {
      void refreshVideoProgress().catch(() =>
        setError('영상 시청 기록을 불러오지 못했습니다. 다시 시도해 주세요.'),
      );
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('mbco-video-progress');
    if (channel) channel.onmessage = refresh;
    const poll = window.setInterval(refreshWhenVisible, 3000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.clearInterval(poll);
      channel?.close();
    };
  }, [ready, step]);
  useEffect(() => {
    if (!ready || step === 4) return;
    const timer = window.setTimeout(() => {
      void saveDraft(currentDraft()).catch((e: unknown) => {
        setError(e instanceof Error ? e.message : '임시 저장에 실패했습니다. 다시 시도해 주세요.');
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ready, step, basic, safetyChecks, attested, educationPledged, consent]);
  async function next() {
    setError('');
    if (step === 0) {
      const result = refinedBasic.safeParse(basic);
      if (!result.success) {
        showBasicIssues(result.error.issues);
        return;
      }
      setBasicErrors({});
      if (!basic.educationCompleted) setAttested(false);
    }
    if (step === 1 && !pledge) {
      setError('안전수칙 7개 항목을 모두 확인해 주세요.');
      return;
    }
    if (step === 1 && !educationPledgeSatisfied(basic.educationCompleted, educationPledged)) {
      setError('안전교육 1시간 이수 서약에 체크해 주세요.');
      return;
    }
    if (step === 1) {
      try {
        const progress = await refreshVideoProgress();
        if (progress.videos.some((video) => !progress.clickedVideoIds.includes(video.id))) {
          setError('안전교육 영상을 모두 클릭해 주세요.');
          return;
        }
      } catch {
        setError('영상 시청 기록을 확인하지 못했습니다. 다시 시도해 주세요.');
        return;
      }
    }
    if (step === 2 && consent !== true) {
      setError('개인정보 수집·이용에 동의해야 등록을 제출할 수 있습니다.');
      return;
    }
    try {
      await saveDraft(currentDraft(step + 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : '임시 저장에 실패했습니다. 다시 시도해 주세요.');
      return;
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 120, behavior: 'smooth' });
    setTimeout(() => titleRef.current?.focus(), 50);
  }
  async function submit() {
    if (submitting.current) return;
    setError('');
    const payload = {
      basic,
      pledge,
      safetyChecks,
      consent,
      educationAttested: attested,
      educationPledged,
      signature,
      requestId: request.current,
    };
    const valid = registrationSchema.safeParse(payload);
    if (!valid.success) {
      if (valid.error.issues.some((issue) => issue.path[0] === 'basic')) {
        setStep(0);
        showBasicIssues(valid.error.issues);
      } else setError(formIssueMessage(valid.error.issues[0]));
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await saveQueue.current;
      const d = await api<{ receipt: string }>('registrations', send(payload));
      setReceipt(d.receipt);
      setStep(4);
      setBasic(emptyBasic);
      setBasicErrors({});
      setSafetyChecks(emptySafetyChecks());
      setSignature([]);
      setAttested(false);
      setEducationPledged(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  async function cancel() {
    if (busy) return;
    setBusy(true);
    try {
      await saveQueue.current.catch(() => {});
      await api('draft', send({}, 'DELETE'));
      window.location.reload();
    } catch {
      setError('작성 취소에 실패했습니다. 다시 시도해 주세요.');
      setBusy(false);
    }
  }
  const icon = [UserRound, ShieldCheck, LockKeyhole, PenLine, CheckCircle2][step];
  const Icon = icon;
  const { completedCount: completedVideoCount } = educationProgress(videos, completedVideoIds);
  const clickedVideoCount = videos.filter((video) => clickedVideoIds.includes(video.id)).length;
  const allVideosClicked = clickedVideoCount === videos.length;
  const educationReady =
    canProceedToPrivacy(videos, clickedVideoIds, safetyChecks) &&
    educationPledgeSatisfied(basic.educationCompleted, educationPledged);
  return (
    <main className="visitor-shell">
      <section className="intro">
        <div className="eyebrow">
          <span /> MBCo. PARTNER SAFETY PORTAL
        </div>
        <h1>
          외부 작업자 출입등록 <span>및 안전서약서</span>
        </h1>
        <p>만도브로제(MBCo.) | 협력업체 및 외부 작업자용</p>
        <div className="intro-caption">안전한 작업은 정확한 등록과 작은 실천에서 시작됩니다.</div>
      </section>
      <nav className="steps" aria-label="등록 진행 단계">
        {steps.map((s, i) => (
          <div
            key={s}
            className={'step ' + (step === i ? 'current' : step > i ? 'done' : '')}
            aria-current={step === i ? 'step' : undefined}
          >
            <span className="step-circle">
              {step > i ? <Check size={17} /> : String(i + 1).padStart(2, '0')}
            </span>
            <span>{s}</span>
          </div>
        ))}
      </nav>
      <div className="visitor-layout">
        <section className="form-card">
          <div className="card-heading">
            <span className="section-icon">
              <Icon size={24} />
            </span>
            <div>
              <div className="section-kicker">STEP {String(step + 1).padStart(2, '0')} / 05</div>
              <h2 tabIndex={-1} ref={titleRef}>
                {
                  [
                    '작업자 기본정보',
                    '안전교육 및 안전서약',
                    '개인정보 수집·이용 동의',
                    '최종 확인 및 전자서명',
                    '출입등록이 완료되었습니다',
                  ][step]
                }
              </h2>
            </div>
            {step === 0 && (
              <span className="required-note">
                <b>*</b> 필수 입력
              </span>
            )}
          </div>
          <div className="card-body">
            {step === 0 && (
              <>
                <p className="section-description">
                  원활한 출입과 안전관리를 위해 아래 정보를 정확하게 입력해 주세요.
                </p>
                <BasicFields
                  value={basic}
                  onChange={setBasic}
                  onFieldChange={clearBasicError}
                  errors={basicErrors}
                />
              </>
            )}
            {step === 1 && (
              <>
                <div className="notice">
                  <Info size={19} />
                  <span>
                    영상 열람만으로 교육 이수가 확정되지 않습니다. 실제 교육 이수 여부는 본인 확인과
                    관리자 확인으로 구분하여 기록됩니다.
                  </span>
                </div>
                <h3 className="subheading">
                  안전교육 영상 <span className="count-badge">{videos.length}</span>
                </h3>
                <div className="training-progress" role="status" aria-live="polite">
                  <strong>전체 교육 진행률</strong>
                  <span>
                    {completedVideoCount}/{videos.length}개 영상 이수 완료
                  </span>
                  <div
                    className="training-progress-track"
                    role="progressbar"
                    aria-label="안전교육 영상 이수 진행률"
                    aria-valuemin={0}
                    aria-valuemax={videos.length}
                    aria-valuenow={completedVideoCount}
                  >
                    <span
                      style={{
                        width: videos.length
                          ? `${(completedVideoCount / videos.length) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                  <small>
                    영상 클릭 {clickedVideoCount}/{videos.length}개 · 다음 단계는 영상 전체 클릭과
                    안전수칙 확인 후 이동할 수 있습니다.
                  </small>
                </div>
                {videos.length === 0 ? (
                  <div className="empty-state compact">
                    <Play size={25} />
                    <p>등록된 교육영상이 없습니다.</p>
                    <small>현장 담당자에게 교육 진행 방법을 확인해 주세요.</small>
                  </div>
                ) : (
                  videos.map((v, i) => {
                    const clicked = clickedVideoIds.includes(v.id);
                    const completed = completedVideoIds.includes(v.id);
                    return (
                      <div key={v.id} className={'video-row' + (completed ? ' completed' : '')}>
                        <span
                          className={'video-click-checkbox' + (clicked ? ' checked' : '')}
                          role="checkbox"
                          aria-checked={clicked}
                          aria-readonly="true"
                          aria-label={`${v.title} 클릭 여부`}
                        >
                          {clicked && <Check size={15} strokeWidth={3} />}
                        </span>
                        <Link
                          className="video-link"
                          href={'/education/' + v.id}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${v.title}, ${clicked ? '클릭 확인' : '미클릭'}, ${completed ? '이수 완료' : '미이수'}`}
                          onClick={() => void recordVideoClick(v.id)}
                          onAuxClick={(event) => {
                            if (event.button === 1) void recordVideoClick(v.id);
                          }}
                        >
                          <span className="video-icon">
                            {completed ? <CheckCircle2 size={23} /> : <Play size={20} />}
                          </span>
                          <div>
                            <small>SAFETY TRAINING {String(i + 1).padStart(2, '0')}</small>
                            <strong>{v.title}</strong>
                            <span className="video-status">
                              {completed ? '이수 완료' : '미이수'}
                            </span>
                          </div>
                          <ExternalLink size={17} />
                        </Link>
                      </div>
                    );
                  })
                )}
                {!allVideosClicked && (
                  <p className="notice warning" role="status">
                    <Info size={18} /> 안전교육 영상을 모두 클릭해 주세요.
                  </p>
                )}
                {basic.educationCompleted ? (
                  <label className="check-panel">
                    <input
                      type="checkbox"
                      checked={attested}
                      onChange={(e) => setAttested(e.target.checked)}
                    />
                    <span>
                      <strong>
                        {basic.educationDate}에 안전교육을 실제 이수했음을 확인합니다.
                      </strong>
                      <small>본인 확인으로 기록되며 관리자 확인과는 구분됩니다.</small>
                    </span>
                  </label>
                ) : (
                  <>
                    <label
                      className={
                        'check-panel education-pledge' + (educationPledged ? ' selected' : '')
                      }
                    >
                      <input
                        type="checkbox"
                        required
                        checked={educationPledged}
                        onChange={(event) => setEducationPledged(event.target.checked)}
                      />
                      <strong>{educationPledgeText}</strong>
                    </label>
                    {!educationPledged && (
                      <p className="notice warning" role="status">
                        <Info size={18} /> 안전교육 1시간 이수 서약에 체크해 주세요.
                      </p>
                    )}
                  </>
                )}
                <h3 className="subheading">작업 전 반드시 지켜야 할 7가지 안전수칙</h3>
                <ol className="safety-list">
                  {safetyRules.map((r, i) => (
                    <li key={r}>
                      <label
                        className={'safety-rule-option' + (safetyChecks[i] ? ' selected' : '')}
                      >
                        <input
                          type="checkbox"
                          checked={safetyChecks[i]}
                          onChange={(event) =>
                            setSafetyChecks((current) =>
                              current.map((checked, index) =>
                                index === i ? event.target.checked : checked,
                              ),
                            )
                          }
                        />
                        <span className="safety-rule-number">{String(i + 1).padStart(2, '0')}</span>
                        <span>{r}</span>
                      </label>
                    </li>
                  ))}
                </ol>
                {!pledge && (
                  <p className="notice warning" role="status">
                    <Info size={18} /> 안전수칙 7개 항목을 모두 확인해 주세요.
                  </p>
                )}
                <div className={'check-panel' + (pledge ? ' highlighted' : '')} role="status">
                  <CheckCircle2
                    size={20}
                    className={pledge ? 'safety-check-complete' : 'safety-check-pending'}
                  />
                  <span>
                    <strong>안전수칙을 숙지하였으며 성실히 준수할 것을 서약합니다.</strong>
                    <small>7개 항목을 모두 체크하면 서약이 완료됩니다.</small>
                  </span>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <p className="section-description">
                  출입등록에 필요한 개인정보 처리 내용을 확인해 주세요.
                </p>
                <div className="policy-box">
                  <h3>개인정보 수집·이용 안내</h3>
                  <dl>
                    <dt>수집·이용 목적</dt>
                    <dd>신원 확인, 출입관리, 안전교육 이력 및 작업이력 관리, 비상연락</dd>
                    <dt>수집 항목</dt>
                    <dd>
                      회사명, 성명, 연락처, 작업기간, 방문 목적, 작업발주 담당자, 교육 이력,
                      안전서약 기록 및 전자서명
                    </dd>
                    <dt>보유기간</dt>
                    <dd>
                      <strong>작업 종료일로부터 1년</strong>
                      <br />
                      <span className="policy-note">보유기간은 운영 전 확정이 필요합니다.</span>
                    </dd>
                    <dt>동의 거부 권리</dt>
                    <dd>
                      수집·이용에 대한 동의를 거부할 수 있습니다. 다만, 필수 정보에 동의하지 않으면
                      본 시스템의 출입등록 제출이 제한됩니다.
                    </dd>
                  </dl>
                </div>
                <fieldset className="consent-options">
                  <legend>
                    개인정보 수집·이용에 동의하시나요? <b>*</b>
                  </legend>
                  <label className={'check-panel ' + (consent === true ? 'highlighted' : '')}>
                    <input
                      type="radio"
                      name="consent"
                      checked={consent === true}
                      onChange={() => setConsent(true)}
                    />
                    <strong>동의함</strong>
                  </label>
                  <label className="check-panel">
                    <input
                      type="radio"
                      name="consent"
                      checked={consent === false}
                      onChange={() => setConsent(false)}
                    />
                    <strong>동의하지 않음</strong>
                  </label>
                </fieldset>
                {consent === false && (
                  <div className="notice warning">
                    동의하지 않으면 등록할 수 없습니다. 현장 담당자에게 문의해 주세요.
                  </div>
                )}
                <span className="sr-only">{privacyText}</span>
              </>
            )}
            {step === 3 && (
              <>
                <p className="section-description">
                  입력 내용을 확인하고 아래에 직접 서명해 주세요.
                </p>
                <dl className="review-grid">
                  <dt>작업자</dt>
                  <dd>
                    {basic.company} · {basic.name}
                  </dd>
                  <dt>연락처</dt>
                  <dd>{basic.phone}</dd>
                  <dt>작업기간</dt>
                  <dd>
                    {basic.startDate} ~ {basic.endDate}
                  </dd>
                  <dt>방문 목적</dt>
                  <dd>{basic.purpose === '기타' ? basic.otherPurpose : basic.purpose}</dd>
                  <dt>담당자</dt>
                  <dd>
                    {basic.team} · {basic.contact}
                  </dd>
                  <dt>안전교육</dt>
                  <dd>
                    {attested ? '본인 이수 확인 · ' + basic.educationDate : '미이수 / 확인 필요'}
                  </dd>
                  <dt>안전서약 / 동의</dt>
                  <dd>동의 완료</dd>
                  <dt>서약일</dt>
                  <dd>
                    {today} <small>(제출 시 서버 기준)</small>
                  </dd>
                </dl>
                <h3 className="subheading">
                  전자서명 <b>*</b>
                </h3>
                <SignaturePad value={signature} onChange={setSignature} />
                <div className="notice mt-5">
                  <LockKeyhole size={18} />
                  <span>
                    서명과 개인정보는 보호되어 저장되며, 권한이 있는 관리자만 확인할 수 있습니다.
                  </span>
                </div>
              </>
            )}
            {step === 4 && (
              <div className="completion">
                <div className="completion-check">
                  <Check size={40} />
                </div>
                <h3>
                  안전을 위한 첫 단계,
                  <br />
                  등록이 완료되었습니다.
                </h3>
                <p>접수번호를 저장한 후 현장 담당자에게 안내해 주세요.</p>
                <div className="receipt">
                  <small>접수번호</small>
                  <strong>{receipt}</strong>
                </div>
                <div className="notice warning">
                  <Info size={20} />
                  <span>
                    접수 완료는 출입 또는 작업허가 승인이 아닙니다.
                    <br />
                    작업 전 안전교육과 담당자의 승인을 확인해 주세요.
                  </span>
                </div>
                <button
                  className="button secondary w-full"
                  onClick={() => window.location.reload()}
                >
                  새 작업자 등록
                </button>
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
          </div>
          {step < 4 && (
            <footer className="form-footer">
              <span className="autosave-note">
                <LockKeyhole size={14} /> 작성 중 정보는 암호화되어 30분간 임시 보관됩니다.
              </span>
              <div className="form-actions">
                <button className="button secondary" disabled={busy || !ready} onClick={cancel}>
                  작성 취소
                </button>
                {step > 0 && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setStep(step - 1);
                      setError('');
                    }}
                  >
                    <ArrowLeft size={17} /> 이전
                  </button>
                )}
                <button
                  className="button primary"
                  disabled={
                    !ready ||
                    busy ||
                    (step === 1 && !educationReady) ||
                    (step === 2 && consent !== true)
                  }
                  onClick={step === 3 ? submit : next}
                >
                  {busy ? '접수 중…' : step === 3 ? '서약 및 등록 제출' : '다음 단계'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </footer>
          )}
        </section>
        <aside className="visitor-aside">
          <div className="safety-banner">
            <span className="aside-eyebrow">SAFETY FIRST</span>
            <div className="safety-illustration">
              <ShieldCheck size={84} strokeWidth={1.2} />
              <span className="illustration-dot" />
              <HardHat size={35} />
            </div>
            <h3>
              모두의 안전을 위한
              <br />
              작은 약속
            </h3>
            <p>
              나의 안전이 동료의 안전입니다.
              <br />
              안전수칙 준수에 함께해 주세요.
            </p>
            <div className="safety-banner-bottom">
              <CheckCircle2 size={16} /> 안전은 모든 작업의 시작입니다.
            </div>
          </div>
          <div className="guide-card">
            <h3>
              <FileCheck2 size={18} /> 등록 전 확인해 주세요
            </h3>
            <ul>
              <li>작업 일정과 발주 담당자를 확인해 주세요.</li>
              <li>교육 이력은 사실대로 입력해 주세요.</li>
              <li>마지막 단계에서 직접 서명이 필요합니다.</li>
            </ul>
            <div className="guide-time">
              <Clock3 size={16} /> 예상 소요시간 <strong>약 3–5분</strong>
              <small>교육영상 시청 시간 별도</small>
            </div>
          </div>
          <p className="aside-privacy">
            <LockKeyhole size={14} /> 입력하신 개인정보는 출입 및 안전관리 목적으로만 사용됩니다.
          </p>
        </aside>
      </div>
      <footer className="site-footer">
        <span>© Mando Brose Corporation. All rights reserved.</span>
        <span>안전한 일터, 함께 만드는 MBCo.</span>
      </footer>
    </main>
  );
}
