# 개발 지침

## 기술 및 실행 환경

- Next.js App Router, TypeScript strict, React, Tailwind CSS 사용.
- Node.js 24 LTS, npm. 로컬 데이터는 Node 내장 SQLite로 영속 저장한다.
- 서버는 Node 런타임을 사용하며 정적 내보내기 및 Edge 런타임은 지원하지 않는다.
- 한글 UI, 모바일 우선, 네이비/화이트/블루 기업용 디자인.

## 프로젝트 구조

- app/: 페이지, 레이아웃 및 API Route Handlers
- components/: 방문자 및 관리자 UI, 서명, 차트
- lib/: DB, 인증, 보안, 입력 검증, 공통 타입
- scripts/: 초기화, 보유기간 만료 데이터 정리
- tests/: 핵심 API 및 보안 통합 테스트
- data/: 로컬 SQLite 데이터(버전 관리 제외)
- README.md, .env.example: 실행과 운영 설정

## 코딩 규칙

- 명확한 타입과 함수명을 사용하고 입력은 서버에서 Zod로 검증한다.
- 공통 도메인 로직은 lib에 둔다. SQL은 반드시 매개변수 바인딩한다.
- 날짜는 작업일 YYYY-MM-DD, 시각은 UTC ISO. 집계 기준일은 Asia/Seoul이다.
- 오류 메시지에 개인정보, 서명, 비밀번호, DB 내부 오류를 포함하지 않는다.
- 의미 있는 HTML, 키보드 조작, 레이블, 오류 안내, 모바일 터치 영역을 제공한다.
- 기존 파일을 읽고 수정한다. 사용자 파일을 임의 삭제하지 않는다.

## 보안

- 개인정보와 서명은 localStorage/sessionStorage에 저장하지 않는다.
- 관리자 비밀번호는 salt를 사용하는 scrypt 해시로 저장한다.
- 개발 초기 비밀번호 1111은 개발 환경에서만 허용. 운영에서는 변경 전 관리자 데이터 접근 차단.
- 세션은 암호학적 난수 토큰, DB에는 토큰 해시만 저장. HttpOnly/SameSite 쿠키, 운영 Secure.
- 로그인 속도 제한을 DB에 기록한다. 변경 API는 Origin 검증과 인증/권한 검증을 한다.
- 개인정보 조회와 내보내기는 관리자 전용. 수정/삭제/내보내기/인증/설정 작업은 감사로그 기록.
- 등록 요청의 중복 방지는 서버 트랜잭션 및 요청키로 처리한다.
- 교육영상 열람, 본인 이수 확인, 관리자 확인을 구분한다. 열람을 실제 이수로 자동 판정하지 않는다.
- DB와 백업은 비공개 저장소에 유지하고 운영 전 접근권한/디스크 암호화/HTTPS/백업을 설정한다.
- 보유기간 만료 데이터 정리 기능을 제공하되 실제 운영 정책은 운영자가 확정한다.

## 개발 및 검증

- PRD.md를 기능 기준으로 삼고 구현과 운영 전 설정을 구분해 문서화한다.
- npm run typecheck, npm test, npm run build로 검증한다.
- 보안 경계, 동의 거부, 빈 서명, 중복 등록, 인증, 권한, 감사로그를 테스트한다.
- 외부 서비스와 실교육 이수는 검증 가능한 근거 없이 성공으로 표시하지 않는다.
- 배포 및 외부 메시지 전송은 별도 요청 없이 진행하지 않는다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
