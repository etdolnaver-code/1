'use client';
import { useEffect, useRef } from 'react';
import type { Signature } from '@/lib/domain';
import { RotateCcw, PenLine } from 'lucide-react';
export function SignaturePad({
  value,
  onChange,
}: {
  value: Signature;
  onChange: (s: Signature) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const latest = useRef(value);
  latest.current = value;
  function paint() {
    const c = ref.current;
    if (!c) return;
    const bounds = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = bounds.width * dpr;
    c.height = bounds.height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#122a4c';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of latest.current) {
      ctx.beginPath();
      stroke.forEach((p, i) =>
        i
          ? ctx.lineTo(p.x * bounds.width, p.y * bounds.height)
          : ctx.moveTo(p.x * bounds.width, p.y * bounds.height),
      );
      ctx.stroke();
    }
  }
  useEffect(() => {
    paint();
  }, [value]);
  useEffect(() => {
    const obs = new ResizeObserver(paint);
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div>
      <div className="signature-box">
        <div className="signature-hint">
          <PenLine size={18} /> 이곳에 손가락 또는 마우스로 서명하세요
        </div>
        <canvas
          aria-label="전자서명 입력 영역"
          ref={ref}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const r = e.currentTarget.getBoundingClientRect();
            onChange([
              ...latest.current,
              [
                {
                  x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
                  y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
                },
              ],
            ]);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const r = e.currentTarget.getBoundingClientRect();
            const next = latest.current.map((s) => [...s]);
            if (next.at(-1)!.length >= 2500) return;
            next
              .at(-1)!
              .push({
                x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
                y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
              });
            onChange(next);
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
          style={{ touchAction: 'none' }}
        />
        <span className="signature-baseline">서명</span>
      </div>
      <button type="button" className="text-button mt-3" onClick={() => onChange([])}>
        <RotateCcw size={15} /> 서명 초기화 / 다시 서명하기
      </button>
      <p className="field-help">
        직접 서명이 어려운 경우 현장 안전관리 담당자에게 도움을 요청해 주세요.
      </p>
    </div>
  );
}
export function SignatureView({ value }: { value: Signature }) {
  return (
    <svg
      viewBox="0 0 600 220"
      className="signature-preview"
      role="img"
      aria-label="제출된 전자서명"
    >
      {value.map((stroke, i) => (
        <polyline
          key={i}
          points={stroke.map((p) => p.x * 600 + ',' + p.y * 220).join(' ')}
          fill="none"
          stroke="#122a4c"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
