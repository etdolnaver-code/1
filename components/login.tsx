'use client';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, X, Delete, ArrowRight, ShieldCheck } from 'lucide-react';
import { api, send } from '@/lib/client';
export function AdminLogin() {
  const [open, setOpen] = useState(false),
    [pin, setPin] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('admin/login', send({ password: pin }));
      window.location.href = '/admin';
    } catch (e) {
      setError((e as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="admin-button"
        onClick={() => {
          setPin('');
          setError('');
          setOpen(true);
        }}
      >
        <LockKeyhole size={15} />
        <span>관리자</span>
      </button>
      <dialog ref={ref} className="login-dialog" onCancel={() => setOpen(false)}>
        <button className="close-button" aria-label="닫기" onClick={() => setOpen(false)}>
          <X size={21} />
        </button>
        <div className="modal-symbol">
          <ShieldCheck size={27} />
        </div>
        <h2>관리자 로그인</h2>
        <p>안전관리자 비밀번호를 입력해 주세요.</p>
        <form onSubmit={login}>
          <label className="sr-only" htmlFor="admin-pin">
            관리자 비밀번호
          </label>
          <input
            id="admin-pin"
            className="pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            maxLength={16}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
          <div className="keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '초기화', '0', '지우기'].map((k) => (
              <button
                key={k}
                type="button"
                aria-label={k}
                onClick={() =>
                  setPin(
                    k === '초기화'
                      ? ''
                      : k === '지우기'
                        ? pin.slice(0, -1)
                        : (pin + k).slice(0, 16),
                  )
                }
              >
                {k === '지우기' ? <Delete size={20} /> : k}
              </button>
            ))}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy || pin.length < 4} className="button primary w-full">
            {busy ? '확인 중…' : '로그인'}
            <ArrowRight size={17} />
          </button>
        </form>
        <small>접근 기록이 보관되는 관리자 전용 서비스입니다.</small>
      </dialog>
    </>
  );
}
