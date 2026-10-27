import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { AdminLogin } from './login';
export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="MBCo. 출입등록 홈">
          <span className="mando-brose-logo" role="img" aria-label="만도브로제 로고" />
        </Link>
        <div className="header-right">
          <span className="secure-label">
            <ShieldCheck size={15} /> 안전한 사업장의 시작
          </span>
          <AdminLogin />
        </div>
      </div>
    </header>
  );
}
