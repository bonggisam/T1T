; ============================================================
; T1T NSIS 커스텀 — 설치/제거 안정화
; ============================================================

; 제거 시작 전 실행 중인 T1T 프로세스 강제 종료
!macro customUnInit
  DetailPrint "T1T 종료 중..."
  ; 실행 중인 T1T.exe 모두 종료 (트리 포함)
  nsExec::Exec 'taskkill /F /IM "T1T.exe" /T'
  Sleep 2500
!macroend

; 제거 시작 시 추가 정리
!macro customUnInstall
  DetailPrint "임시 파일 및 캐시 정리 중..."
  RMDir /r "$LOCALAPPDATA\T1T\Cache"
  RMDir /r "$LOCALAPPDATA\T1T\Code Cache"
  RMDir /r "$LOCALAPPDATA\T1T\GPUCache"
  RMDir /r "$LOCALAPPDATA\T1T\Crashpad"
  RMDir /r "$LOCALAPPDATA\T1T\logs"
  Delete "$DESKTOP\T1T.lnk"
  Delete "$SMPROGRAMS\T1T.lnk"
!macroend

; 설치 시작 전 — 안전한 다단계 종료
!macro customInit
  DetailPrint "기존 T1T 인스턴스 확인 중..."
  ; 1차: 정상 종료 시도 (저장 작업 완료할 시간 제공)
  nsExec::Exec 'taskkill /IM "T1T.exe" /T'
  Sleep 1000
  ; 2차: 강제 종료
  nsExec::Exec 'taskkill /F /IM "T1T.exe" /T'
  ; 파일 잠금 해제 대기 — 자동 업데이트로 잠긴 파일이 해제될 시간
  Sleep 2500
  ; 자동 업데이트 잔재 잠금 파일 삭제
  Delete "$LOCALAPPDATA\T1T\pending-update.lock"
  ; electron-updater가 남기는 pending update 파일 정리
  RMDir /r "$LOCALAPPDATA\t1t-updater"
!macroend
