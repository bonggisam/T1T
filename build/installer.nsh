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
; 주의: deleteAppDataOnUninstall=true이지만, 자동 업데이트는 uninstaller를 호출하지 않으므로
;       사용자 데이터(설정, 캐시 외) 손실 없음. 명시적 "Uninstall" 메뉴 사용 시에만 적용.
!macro customUnInstall
  DetailPrint "임시 파일 및 캐시 정리 중..."
  ; 캐시/임시 파일 (사용자 데이터 아님)
  RMDir /r "$LOCALAPPDATA\T1T\Cache"
  RMDir /r "$LOCALAPPDATA\T1T\Code Cache"
  RMDir /r "$LOCALAPPDATA\T1T\GPUCache"
  RMDir /r "$LOCALAPPDATA\T1T\Crashpad"
  RMDir /r "$LOCALAPPDATA\T1T\logs"
  Delete "$DESKTOP\T1T.lnk"
  Delete "$SMPROGRAMS\T1T.lnk"
!macroend

; 설치 시작 전 — 안전한 다단계 종료
; oneClick: true 모드 — 사용자 UI 없이 silent 진행
!macro customInit
  ; 1차: 정상 종료 시도 (저장 작업 완료할 시간 제공)
  nsExec::Exec 'taskkill /IM "T1T.exe" /T'
  Sleep 1500
  ; 2차: 강제 종료
  nsExec::Exec 'taskkill /F /IM "T1T.exe" /T'
  ; 파일 잠금 해제 대기 — 자동 업데이트로 잠긴 파일이 해제될 시간
  Sleep 3000
  ; 자동 업데이트 잔재 잠금 파일 삭제
  Delete "$LOCALAPPDATA\T1T\pending-update.lock"
  ; electron-updater가 남기는 pending update 파일 정리
  RMDir /r "$LOCALAPPDATA\t1t-updater"
!macroend
