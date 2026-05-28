; ============================================================
; T1T NSIS 커스텀 — 제거(언인스톨) 안정화
; ============================================================

; 제거 시작 전 실행 중인 T1T 프로세스 강제 종료
!macro customUnInit
  DetailPrint "T1T 종료 중..."
  ; 실행 중인 T1T.exe 모두 종료 (출력 없이)
  nsExec::Exec 'taskkill /F /IM "T1T.exe" /T'
  ; 종료 후 파일 잠금 해제 대기
  Sleep 1500
!macroend

; 제거 시작 시 추가 정리
!macro customUnInstall
  DetailPrint "임시 파일 및 캐시 정리 중..."
  ; LocalAppData의 캐시·임시 파일 삭제 (사용자 데이터는 deleteAppDataOnUninstall 설정으로 처리됨)
  RMDir /r "$LOCALAPPDATA\T1T\Cache"
  RMDir /r "$LOCALAPPDATA\T1T\Code Cache"
  RMDir /r "$LOCALAPPDATA\T1T\GPUCache"
  RMDir /r "$LOCALAPPDATA\T1T\Crashpad"
  RMDir /r "$LOCALAPPDATA\T1T\logs"
  ; 바탕화면 / 시작메뉴 단축키 명시적 제거
  Delete "$DESKTOP\T1T.lnk"
  Delete "$SMPROGRAMS\T1T.lnk"
!macroend

; 설치 시작 전 — 이미 실행 중이면 종료
!macro customInit
  ; 기존 T1T 실행 중이면 종료
  nsExec::Exec 'taskkill /F /IM "T1T.exe" /T'
  Sleep 1000
!macroend
