# T1T

투명 데스크톱 캘린더 — 학교 일정 공유 시스템

태성중학교 / 태성고등학교 교사 간 일정·할 일·회의실·식단·학사일정을 공유하는 Electron 데스크톱 앱.

## ✨ 주요 기능

- 📅 **공유 일정** — 중·고 구분(M/H 색상 배지) + 공통 일정
- 📋 **다중 뷰** — 오늘 / 월 / 주 / 일 / 년 / 아젠다 / 통계
- ✅ **할 일** — 우선순위·마감일·인라인 수정
- 🍱 **NEIS 급식·학사일정** 자동 표시
- 📚 **컴시간 시간표** 연동
- 💬 **댓글·@멘션** 알림
- 🔄 **Google Calendar 양방향 동기화**
- 🔔 **다중 알림** (10분/30분/1시간/1일 전 동시)
- 📤 **.ics 내보내기** (Google/Apple/Outlook 호환)
- ⌨️ **키보드 단축키** (N/T/M/W/D/Y/A/S/← →//)
- 🪄 **자연어 입력** ("내일 3시", "다음주 월요일")
- 🌐 **회의실 예약** (TPass 통합)

## 🛠 기술 스택

- Electron 41 + React 18 + TypeScript
- Zustand (상태) + Firebase (Firestore + Auth)
- Vite + electron-builder
- date-fns (날짜) + lucide-react (아이콘)

## 📦 다운로드

[Releases](https://github.com/bonggisam/T1T/releases)

- **Mac (Apple Silicon)**: `T1T-x.y.z-arm64.dmg`
- **Mac (Intel)**: `T1T-x.y.z.dmg`
- **Windows 설치**: `T1T Setup x.y.z.exe`
- **Windows 포터블**: `T1T x.y.z.exe`

## 🧰 개발

```bash
npm install
cp .env.example .env  # Firebase 키 입력
npm run dev           # 개발 모드
npm run build:mac     # macOS 빌드 (arm64 + x64)
npm run build:win     # Windows 빌드 (x64)
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
```

## 📜 라이선스

MIT — [LICENSE](LICENSE)

## 🤝 기여

이슈 / PR 환영합니다.
