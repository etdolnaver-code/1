'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Play,
  Settings,
  ScrollText,
  LogOut,
  ExternalLink,
  Users,
  UserRoundCheck,
  CalendarDays,
  GraduationCap,
  Download,
  Search,
  RefreshCw,
  Plus,
  X,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { api, send } from '@/lib/client';
import { Basic, Registration, Video, todayKST, purposes } from '@/lib/domain';
import { BasicFields } from './basic-fields';
import { SignatureView } from './signature';
import { AdminLogin } from './login';
type Row = Pick<
  Registration,
  'id' | 'receipt' | 'createdAt' | 'basic' | 'educationAttested' | 'educationVerified' | 'version'
>;
type Summary = {
  total: number;
  today: number;
  active: number;
  verified: number;
  attested: number;
  incomplete: number;
  purposes: Record<string, number>;
  months: Record<string, number>;
};
type Dashboard = { summary: Summary; rows: Row[]; total: number; page: number; pages: number };
function EducationBadge({ r }: { r: Pick<Row, 'educationAttested' | 'educationVerified'> }) {
  return (
    <span
      className={
        'badge ' +
        (r.educationVerified ? 'verified' : r.educationAttested ? 'attested' : 'incomplete')
      }
    >
      {r.educationVerified
        ? '관리자 확인'
        : r.educationAttested
          ? '본인 이수 확인'
          : '미이수 / 확인 필요'}
    </span>
  );
}
const formatDate = (d: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(d));
export function Admin() {
  const [session, setSession] = useState<{ mustChange: boolean; enforced: boolean } | null>(null),
    [checked, setChecked] = useState(false),
    [tab, setTab] = useState('dashboard'),
    [error, setError] = useState('');
  useEffect(() => {
    api<{ mustChange: boolean; enforced: boolean }>('admin/session')
      .then((s) => {
        setSession(s);
        if (s.mustChange && s.enforced) setTab('settings');
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);
  async function signOut() {
    try {
      await api('admin/logout', send({}));
      window.location.href = '/';
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!checked) return <div className="admin-loading">관리자 세션 확인 중…</div>;
  if (!session)
    return (
      <div className="admin-loading">
        <div>
          <ShieldCheck size={45} />
          <h1>안전관리자 전용 페이지</h1>
          <p>등록정보를 확인하려면 관리자 로그인이 필요합니다.</p>
          <AdminLogin />
          <Link href="/" className="text-button">
            방문자 등록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  const locked = session.mustChange && session.enforced;
  const menus = [
    ['dashboard', '등록 현황', LayoutDashboard],
    ['videos', '교육영상 관리', Play],
    ['audit', '감사로그', ScrollText],
    ['settings', '관리자 설정', Settings],
  ] as const;
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="brand-mark">
          M<span>B</span>Co<span className="brand-dot">.</span>
        </Link>
        <div className="admin-brand-sub">SAFETY ADMINISTRATION</div>
        <div className="menu-label">WORKSPACE</div>
        <nav>
          {menus.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              disabled={locked && key !== 'settings'}
              onClick={() => {
                setTab(key);
                setError('');
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/" target="_blank">
            <ExternalLink size={16} /> 방문자 등록 화면
          </Link>
          <button onClick={signOut}>
            <LogOut size={16} /> 로그아웃
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-topbar">
          <span>MBCo. / 안전관리 / {menus.find((m) => m[0] === tab)?.[1]}</span>
          <div className="admin-user">
            <span>
              <Users size={15} />
            </span>
            <span>
              안전관리자 <strong>ADMIN</strong>
            </span>
          </div>
        </div>
        {session.mustChange && (
          <div className="notice warning mb-5">
            {locked
              ? '운영 환경입니다. 초기 비밀번호를 변경해야 관리자 기능을 이용할 수 있습니다.'
              : '개발용 초기 비밀번호를 사용 중입니다. 운영 전 관리자 설정에서 반드시 변경하세요.'}
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {tab === 'dashboard' && <DashboardPanel />}
        {tab === 'videos' && <VideosPanel />}
        {tab === 'audit' && <AuditPanel />}
        {tab === 'settings' && <SettingsPanel />}
        <footer className="site-footer">
          <span>© Mando Brose Corporation.</span>
          <span>개인정보 취급 권한이 있는 관리자만 이용할 수 있습니다.</span>
        </footer>
      </main>
    </div>
  );
}
function DashboardPanel() {
  const [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState({ from: '', to: '', company: '', q: '' }),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Registration | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setData(await api<Dashboard>('admin/dashboard?' + query + '&page=' + page));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [query, page]);
  useEffect(() => {
    void load();
  }, [load]);
  async function detail(id: string) {
    try {
      setSelected(
        (await api<{ registration: Registration }>('admin/registrations/' + id)).registration,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function download(format: string) {
    try {
      const res = await fetch('/api/admin/export?' + query + '&format=' + format, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MBCo-출입등록-' + todayKST() + '.' + format;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const s = data?.summary;
  return (
    <>
      <div className="admin-title">
        <div>
          <div className="eyebrow mb-2">SAFETY OVERVIEW</div>
          <h1>출입등록 현황</h1>
          <p>외부 작업자의 방문 현황과 안전교육 상태를 한눈에 확인하세요.</p>
        </div>
        <span className="date-chip">
          <CalendarDays size={15} />
          {todayKST()} 기준
        </span>
      </div>
      <form
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(new URLSearchParams(filters).toString());
        }}
      >
        <label>
          등록 시작일
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label>
          등록 종료일
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <label>
          업체명
          <input
            placeholder="전체 업체"
            value={filters.company}
            onChange={(e) => setFilters({ ...filters, company: e.target.value })}
          />
        </label>
        <label>
          등록자 검색
          <input
            placeholder="성명 / 연락처 / 접수번호"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </label>
        <button className="button primary" disabled={busy}>
          <Search size={14} />
          조회
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label="필터 초기화"
          onClick={() => {
            setFilters({ from: '', to: '', company: '', q: '' });
            setQuery('');
            setPage(1);
          }}
        >
          <RefreshCw size={14} />
        </button>
      </form>
      {error && (
        <p className="error mb-5" role="alert">
          {error}
        </p>
      )}
      <div className="kpi-grid">
        {[
          { name: '전체 등록 인원', value: s?.total, icon: Users, note: '선택한 조회 조건 기준' },
          {
            name: '오늘 등록 인원',
            value: s?.today,
            icon: UserRoundCheck,
            note: '한국 시간 오늘 접수',
          },
          {
            name: '현재 작업기간 인원',
            value: s?.active,
            icon: CalendarDays,
            note: '오늘이 작업기간에 포함된 인원',
          },
          {
            name: '교육 관리자 확인',
            value: s?.verified,
            icon: GraduationCap,
            note: '본인 확인 ' + (s?.attested ?? 0) + '명 · 미확인 ' + (s?.incomplete ?? 0) + '명',
          },
        ].map((k) => (
          <div className="kpi" key={k.name}>
            <div className="kpi-top">
              {k.name}
              <span className="kpi-icon">
                <k.icon size={18} />
              </span>
            </div>
            <strong>
              {k.value ?? '—'}
              <small>명</small>
            </strong>
            <span>{k.note}</span>
          </div>
        ))}
      </div>
      {s && <Charts summary={s} />}
      <section className="admin-card">
        <div className="table-heading">
          <h2>
            등록자 목록 <span className="count-badge">{data?.total ?? 0}</span>
          </h2>
          <div className="table-actions">
            <button className="button secondary" onClick={() => download('csv')}>
              <Download size={13} /> CSV
            </button>
            <button className="button secondary" onClick={() => download('xlsx')}>
              <Download size={13} /> Excel
            </button>
            <button aria-label="목록 새로고침" className="button secondary" onClick={load}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>성명 / 회사명</th>
                <th>연락처</th>
                <th>작업기간</th>
                <th>방문 목적</th>
                <th>교육 상태</th>
                <th>등록일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.id}>
                  <td className="name-cell">
                    {r.basic.name}
                    <div className="field-help">{r.basic.company}</div>
                  </td>
                  <td>{r.basic.phone}</td>
                  <td>
                    {r.basic.startDate}
                    <br />
                    <span className="field-help">~ {r.basic.endDate}</span>
                  </td>
                  <td>
                    <span className="badge">{r.basic.purpose}</span>
                  </td>
                  <td>
                    <EducationBadge r={r} />
                  </td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <button onClick={() => detail(r.id)}>상세보기</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!busy && data?.rows.length === 0 && (
            <div className="admin-empty">조회 조건에 해당하는 등록자가 없습니다.</div>
          )}
          {busy && <div className="admin-empty">등록정보를 불러오는 중입니다.</div>}
        </div>
        <div className="pagination">
          <span>총 {data?.total ?? 0}건 · 페이지당 20건</span>
          <div>
            <button disabled={page <= 1 || busy} onClick={() => setPage((p) => p - 1)}>
              이전
            </button>
            {page} / {data?.pages ?? 1}
            <button
              disabled={page >= (data?.pages ?? 1) || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </button>
          </div>
        </div>
      </section>
      {selected && (
        <Detail
          r={selected}
          close={() => setSelected(null)}
          refresh={async () => {
            await load();
            await detail(selected.id);
          }}
        />
      )}
    </>
  );
}
function Charts({ summary: s }: { summary: Summary }) {
  const months = Object.entries(s.months);
  const max = Math.max(1, ...months.map((m) => m[1]));
  const colors = ['#2b6cdb', '#66a4ef', '#9fc5f4', '#d5e4f8'];
  let angle = 0;
  const stops = purposes.map((p, i) => {
    const start = angle;
    angle += ((s.purposes[p] || 0) / Math.max(1, s.total)) * 360;
    return colors[i] + ' ' + start + 'deg ' + angle + 'deg';
  });
  return (
    <div className="chart-grid">
      <section className="admin-card">
        <h2>월별 방문자 수</h2>
        <p className="card-subtitle">최근 12개월 · 등록일 기준 · 선택한 필터 적용</p>
        <div
          role="img"
          aria-label={months.map(([m, n]) => m + ' ' + n + '명').join(', ')}
          className="bar-chart"
        >
          {months.map(([m, n]) => (
            <div className="bar-group" key={m}>
              <span>{n}</span>
              <div className="bar" style={{ height: Math.max(n ? 4 : 1, (n / max) * 85) + '%' }} />
            </div>
          ))}
        </div>
        <div className="chart-labels">
          {months.map(([m]) => (
            <span key={m}>{Number(m.slice(5))}월</span>
          ))}
        </div>
      </section>
      <section className="admin-card">
        <h2>방문 목적별 현황</h2>
        <p className="card-subtitle">조회 대상의 방문 목적 분포</p>
        <div className="purpose-chart">
          <div
            className="donut"
            style={{ background: s.total ? 'conic-gradient(' + stops.join(',') + ')' : '#edf2f8' }}
          >
            <div className="donut-hole">
              <strong>{s.total}</strong>전체 등록
            </div>
          </div>
          <div className="chart-legend">
            {purposes.map((p, i) => (
              <div key={p}>
                <span className="legend-dot" style={{ background: colors[i] }} />
                {p}
                <strong>{s.purposes[p] || 0}명</strong>
                <span>{s.total ? Math.round(((s.purposes[p] || 0) / s.total) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
function Detail({
  r,
  close,
  refresh,
}: {
  r: Registration;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [basic, setBasic] = useState<Basic>(r.basic),
    [reason, setReason] = useState(''),
    [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    setBasic(r.basic);
  }, [r]);
  async function perform(action: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (action === 'save') {
        await api(
          'admin/registrations/' + r.id,
          send({ basic, reason, version: r.version }, 'PATCH'),
        );
        await refresh();
        setMessage('수정사항과 감사로그를 저장했습니다.');
      }
      if (action === 'delete') {
        await api('admin/registrations/' + r.id, send({ reason, version: r.version }, 'DELETE'));
        close();
        window.location.reload();
      }
      if (action === 'verify') {
        await api(
          'admin/education/' + r.id,
          send({ verified: !r.educationVerified, note, version: r.version }),
        );
        await refresh();
        setNote('');
        setMessage('교육 확인 상태와 감사로그를 저장했습니다.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog className="detail-dialog" ref={ref} onCancel={close}>
      <button className="close-button" aria-label="상세 닫기" onClick={close}>
        <X size={20} />
      </button>
      <div className="eyebrow mb-2">REGISTRATION DETAIL</div>
      <h2>등록정보 상세</h2>
      <p className="detail-meta">
        {r.receipt} · {formatDate(r.createdAt)}
      </p>
      <BasicFields value={basic} onChange={setBasic} educationReadOnly />
      <section className="detail-section">
        <h3>
          안전교육 확인 <EducationBadge r={r} />
        </h3>
        <p className="field-help">
          본인 교육 이력은 원본으로 보존됩니다. 관리자는 교육대장 등 실제 근거를 확인한 뒤 별도로
          확인 처리하세요.
        </p>
        {r.verificationNote && (
          <div className="notice mt-3">
            최근 확인 근거: {r.verificationNote}
            {r.verifiedAt && ' · ' + formatDate(r.verifiedAt)}
          </div>
        )}
        <label>
          교육 확인 근거
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 현장 교육대장 확인, 교육 실시일과 교육 담당자 등"
            maxLength={1000}
          />
        </label>
        <button
          className="button secondary"
          disabled={busy || note.trim().length < 5}
          onClick={() => perform('verify')}
        >
          {r.educationVerified ? '관리자 확인 취소' : '근거 확인 후 교육 이수 확인'}
        </button>
        <h3 className="mt-5">영상 열람 기록</h3>
        {r.viewEvents.length ? (
          r.viewEvents.map((v, i) => (
            <p className="field-help" key={i}>
              {v.title} · {formatDate(v.openedAt)} · {v.completedAt ? '영상 시청 완료' : '열람만 기록'}
            </p>
          ))
        ) : (
          <p className="field-help">영상 열람 기록이 없습니다.</p>
        )}
      </section>
      <section className="detail-section">
        <h3>개인정보 동의 · 안전서약 · 전자서명 원본</h3>
        <p className="field-help">
          동의 / 서약 완료 · {r.pledgeDate} · 문서 버전 {r.policyVersion}
        </p>
        <details className="mt-3">
          <summary>동의문과 안전서약 보기</summary>
          <p className="field-help">{r.policyText}</p>
          <ol className="field-help">
            {r.pledgeText.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </details>
        <details className="mt-3 mb-3">
          <summary>최초 제출 기본정보 보기</summary>
          <dl className="review-grid">
            {Object.entries({
              회사명: r.originalBasic.company,
              성명: r.originalBasic.name,
              연락처: r.originalBasic.phone,
              작업기간: r.originalBasic.startDate + ' ~ ' + r.originalBasic.endDate,
              담당자: r.originalBasic.team + ' / ' + r.originalBasic.contact,
              방문목적:
                r.originalBasic.purpose === '기타'
                  ? r.originalBasic.otherPurpose
                  : r.originalBasic.purpose,
              교육일: r.originalBasic.educationDate || '미입력',
              '이수증 제출 담당자': r.originalBasic.educationCertificateContact || '해당 없음',
            }).map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
        <SignatureView value={r.signature} />
      </section>
      <section className="detail-section">
        <label>
          등록정보 수정 / 삭제 사유 <b>*</b>
          <textarea
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="3자 이상 입력하세요. 사유가 감사로그에 기록됩니다."
          />
        </label>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success" role="status">
          {message}
        </div>
      )}
      {deleting && (
        <div className="notice warning mt-4">
          이 등록자의 개인정보와 서명 원본을 삭제합니다. 복구할 수 없습니다. 아래 ‘삭제 확정’을 눌러
          진행하세요.
        </div>
      )}
      <div className="detail-footer">
        <button
          className="button danger"
          disabled={busy}
          onClick={() => (deleting ? perform('delete') : setDeleting(true))}
        >
          {deleting ? '삭제 확정' : '등록 삭제'}
        </button>
        {deleting && (
          <button className="button secondary" onClick={() => setDeleting(false)}>
            삭제 취소
          </button>
        )}
        <button className="button secondary" onClick={close}>
          닫기
        </button>
        <button
          className="button primary"
          disabled={busy || reason.trim().length < 3}
          onClick={() => perform('save')}
        >
          {busy ? '저장 중…' : '변경사항 저장'}
        </button>
      </div>
    </dialog>
  );
}
function VideosPanel() {
  const empty = { title: '', url: '', sortOrder: 0, visible: true };
  const [videos, setVideos] = useState<Video[]>([]),
    [form, setForm] = useState(empty),
    [edit, setEdit] = useState<string | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setVideos((await api<{ videos: Video[] }>('admin/videos')).videos);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('admin/videos' + (edit ? '/' + edit : ''), send(form, edit ? 'PATCH' : 'POST'));
      setForm(empty);
      setEdit(null);
      setMessage('영상의 유효성을 확인하고 저장했습니다.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setBusy(true);
    try {
      await api('admin/videos/' + id, send({}, 'DELETE'));
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-title">
        <div>
          <div className="eyebrow mb-2">SAFETY TRAINING</div>
          <h1>교육영상 관리</h1>
          <p>공개된 유튜브 영상을 등록하고 노출 순서를 관리하세요.</p>
        </div>
      </div>
      <section className="admin-card">
        <h2>{edit ? '교육영상 수정' : '새 교육영상 등록'}</h2>
        <form onSubmit={save} className="mt-5">
          <div className="form-grid">
            <label className="span-2">
              영상 제목 <b>*</b>
              <input
                required
                maxLength={100}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="예: 외부 작업자 필수 안전교육"
              />
            </label>
            <label className="span-2">
              유튜브 URL <b>*</b>
              <input
                required
                type="url"
                maxLength={500}
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </label>
            <label>
              노출 순서
              <input
                type="number"
                min={0}
                max={9999}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              />
            </label>
            <label>
              공개 상태
              <select
                value={String(form.visible)}
                onChange={(e) => setForm({ ...form, visible: e.target.value === 'true' })}
              >
                <option value="true">방문자에게 노출</option>
                <option value="false">비노출</option>
              </select>
            </label>
          </div>
          <p className="field-help">
            숫자가 작을수록 먼저 표시됩니다. 저장 시 YouTube에서 공개 여부를 확인합니다. 실제 영상
            내용과 교육 적합성은 관리자가 확인해야 합니다.
          </p>
          <div className="flex gap-2 mt-5">
            <button className="button primary" disabled={busy}>
              <Plus size={16} />
              {busy ? '확인 중…' : edit ? '변경사항 저장' : '교육영상 추가'}
            </button>
            {edit && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setEdit(null);
                  setForm(empty);
                }}
              >
                수정 취소
              </button>
            )}
          </div>
        </form>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="success" role="status">
            {message}
          </div>
        )}
      </section>
      <section className="admin-card mt-5">
        <h2>
          교육영상 목록 <span className="count-badge">{videos.length}</span>
        </h2>
        <div className="video-admin-list">
          {videos.map((v) => (
            <div key={v.id} className="video-admin-item">
              <span className="video-icon">
                <Play size={20} />
              </span>
              <div>
                <h3>
                  {v.title} <span className="badge">{v.visible ? '노출' : '비노출'}</span>
                </h3>
                <p>{v.url}</p>
                <p>노출 순서: {v.sortOrder}</p>
              </div>
              <div className="video-admin-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setEdit(v.id);
                    setForm({
                      title: v.title,
                      url: v.url,
                      sortOrder: v.sortOrder,
                      visible: v.visible,
                    });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  수정 / 순서변경
                </button>
                <button className="button danger" disabled={busy} onClick={() => remove(v.id)}>
                  {confirmDelete === v.id ? '삭제 확정' : '삭제'}
                </button>
                {confirmDelete === v.id && (
                  <button className="button secondary" onClick={() => setConfirmDelete(null)}>
                    취소
                  </button>
                )}
              </div>
            </div>
          ))}
          {!videos.length && (
            <div className="empty-state">
              <Play size={28} />
              <p>아직 등록된 교육영상이 없습니다.</p>
              <small>실제 사용하실 교육영상 URL을 위에서 추가해 주세요.</small>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
function SettingsPanel() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('admin/password', send(form));
      window.location.href = '/admin?passwordChanged=1';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-title">
        <div>
          <div className="eyebrow mb-2">ACCOUNT SECURITY</div>
          <h1>관리자 설정</h1>
          <p>관리자 비밀번호를 변경하고 안전하게 계정을 관리하세요.</p>
        </div>
      </div>
      <section className="admin-card">
        <h2>비밀번호 변경</h2>
        <div className="notice mt-5">
          숫자 8~16자리로 설정하세요. 반복·연속 숫자는 사용할 수 없습니다. 변경하면 기존 로그인
          세션이 모두 종료되어 다시 로그인해야 합니다.
        </div>
        <form onSubmit={save} className="settings-form">
          {[
            ['current', '기존 비밀번호'],
            ['next', '새 비밀번호'],
            ['confirm', '새 비밀번호 확인'],
          ].map(([key, label]) => (
            <label key={key}>
              {label} <b>*</b>
              <input
                type="password"
                inputMode="numeric"
                autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                required
                maxLength={16}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value.replace(/\D/g, '') })}
              />
            </label>
          ))}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary mt-5" disabled={busy}>
            {busy ? '변경 중…' : '비밀번호 변경'}
          </button>
        </form>
      </section>
    </>
  );
}
function AuditPanel() {
  const [rows, setRows] = useState<
      {
        id: number;
        at: string;
        actor: string;
        action: string;
        target: string | null;
        details: unknown;
      }[]
    >([]),
    [error, setError] = useState('');
  useEffect(() => {
    api<{ rows: typeof rows }>('admin/audit')
      .then((d) => setRows(d.rows))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="admin-title">
        <div>
          <div className="eyebrow mb-2">SECURITY AUDIT</div>
          <h1>감사로그</h1>
          <p>인증, 등록정보 변경 및 내보내기 등 최근 150개 관리 작업입니다.</p>
        </div>
      </div>
      <section className="admin-card">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>수행자</th>
                <th>작업</th>
                <th>대상 ID</th>
                <th>기록</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.at)}</td>
                  <td>{r.actor}</td>
                  <td>{r.action}</td>
                  <td>{r.target?.slice(0, 8) || '—'}</td>
                  <td className="audit-details">{JSON.stringify(r.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className="admin-empty">감사로그가 없습니다.</div>}
      </section>
    </>
  );
}
