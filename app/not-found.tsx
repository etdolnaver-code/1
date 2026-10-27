import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="admin-loading">
      <div>
        <h1>페이지를 찾을 수 없습니다.</h1>
        <p>주소가 변경되었거나 공개되지 않은 페이지입니다.</p>
        <Link className="button primary" href="/">
          출입등록으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
