import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'MBCo. | 외부 작업자 출입등록 및 안전서약서',
  description: '만도브로제 협력업체 및 외부 작업자 출입등록 · 안전교육 · 안전서약',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
