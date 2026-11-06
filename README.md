# T1T

투명 데스크톱 캘린더 — 학교 일정 공유 시스템

태성중학교 / 태성고등학교 교사 간 일정·할 일·회의실·식단·학사일정을 공유하는 Electron 데스크톱 앱.

## ✨ 주요 기능

- 📅 **공유 일정** — 중·고 구분(M/H 색상 배지) + 공통 일정
- 📋 **다중 뷰** — 오늘 / 월 / 주 / 일 / 년 / 목록 / 통계 (오늘과 주는 교시 기준)
- 🔁 **반복 일정과 일정 응답** — 평일·매주·격주·매월, 참석·불참·확인
- 🔒 **수업 화면 보호** — 내 수업 시간에 개인 일정 자동 가리기, Ctrl+Shift+H
- 🔎 **회의 시간 찾기** — 회원과 요일을 고르면 시간표와 공유 일정만으로 공강 5곳 추천
- 🗂 **시험감독 게시판** — 부서, 교과별로 표 사진을 올리고 탭을 골라 보기
- 📝 **쪽지·공문 붙여넣기** — 날짜를 읽어 개인 일정 초안 만들기
- 🎨 **테마 7종과 개인 옵션** — 강조색, 글자 크기, 크게 보기, 색 구분 돕기
- ✅ **할 일** — 우선순위·마감일·인라인 수정
- 🍱 **NEIS 급식·학사일정** 자동 표시
- 📚 **내 시간표** — 나이스 시간표를 담당 학급 표와 맞춰 이름과 학교로 자동 연결
- 💬 **댓글·@멘션** 알림
- 🔄 **Google Calendar 양방향 동기화**
- 🔔 **다중 알림** (10분/30분/1시간/1일 전 동시)
- 📤 **.ics 내보내기** (Google/Apple/Outlook 호환)
- ⌨️ **키보드 단축키** (N/T/M/W/D/Y/A/S/← →//)
- 🪄 **자연어 입력** ("내일 3시", "다음주 월요일")
- 🌐 **회의실 예약**
- 🚪 **외출시스템 · 외출상황** — 외출·조퇴 시스템과 외출 신청 조회를 앱 안에서 열기

## 🛠 기술 스택

- Electron 45 + React 18 + TypeScript
- Zustand (상태) + Firebase (Firestore + Auth)
- Vite + electron-builder
- date-fns (날짜) + lucide-react (아이콘)

## 📦 다운로드

[Releases](https://github.com/bonggisam/T1T/releases) | **[교사 사용 안내서 (PDF)](https://github.com/bonggisam/T1T/raw/main/docs/T1T-교사_사용안내서.pdf)** | [HTML 안내서](https://htmlpreview.github.io/?https://github.com/bonggisam/T1T/blob/main/docs/T1T-교사_사용안내서.html)

- **Mac (Apple Silicon)**: `T1T-x.y.z-arm64.dmg`
- **Mac (Intel)**: `T1T-x.y.z.dmg`
- **Windows 설치**: `T1T-Setup-x.y.z.exe`
- **Windows 포터블**: `T1T-Portable-x.y.z.exe`

## 🧰 개발

```bash
npm install
cp .env.example .env  # Firebase 키 입력
npm run dev           # 개발 모드
npm run build:mac     # macOS 빌드 (arm64 + x64)
npm run build:win     # Windows 빌드 (x64)
npm run check:privacy # 공유 기능이 개인 일정을 가져오지 않는지 검사
```

### 환경변수 (`.env`)

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
GOOGLE_CLIENT_ID=...        # Google Calendar OAuth (선택)
GOOGLE_REDIRECT_URI=...     # OAuth 콜백 URL (선택)
VITE_TPASS_URL="..."        # 외출시스템 페이지 주소 (비우면 안내 화면 표시)
VITE_OUTING_URL="..."       # 외출상황 기본 주소 (비우면 안내 화면 표시)
TPASS_PASSWORD="..."        # 외출시스템 비밀번호 자동 입력 값 (비우면 직접 입력)
```

`.env` 값은 커밋되지 않지만 빌드하면 설치 파일에 들어갑니다. 설치 파일은 풀어서 읽을 수 있으므로 비밀번호 같은 비밀값은 `.env`로 주입하지 마세요.

## 📜 라이선스

MIT — [LICENSE](LICENSE)

## 🤝 기여

이슈 / PR 환영합니다.
