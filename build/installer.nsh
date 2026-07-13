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
  ; ⚠️ 바탕화면/시작메뉴 바로가기는 여기서 지우지 않는다.
  ;   electron-updater의 업데이트 재설치가 내부적으로 uninstaller를 호출하는데,
  ;   그때 이 매크로가 아이콘을 지운 뒤 재설치가 실패하면 아이콘이 영구 소실됨.
  ;   → 낮은 버전 사용자의 "바탕화면 아이콘 사라짐" 원인.
  ;   정식 제거 시의 아이콘 정리는 electron-builder 표준 템플릿이 담당하므로 생략해도 무방.
!macroend

; 설치 완료 직후 — 바탕화면 바로가기 보장 (업데이트 재설치 시 아이콘 확실히 복원)
!macro customInstall
  ; oneClick 모드에서 $DESKTOP은 현재 사용자 바탕화면.
  ; createDesktopShortcut:true가 이미 만들지만, 업데이트 경로에서 누락되는 케이스를 방어.
  CreateShortcut "$DESKTOP\T1T.lnk" "$INSTDIR\T1T.exe" "" "$INSTDIR\T1T.exe" 0
!macroend

; 설치 시작 전 — 안전한 다단계 종료
; oneClick: true 모드 — 사용자 UI 없이 silent 진행
; ⚠️ 주의: $LOCALAPPDATA\t1t-updater 경로는 electron-updater 자체 캐시이며,
;        업데이트 시 우리가 실행 중인 인스톨러가 그 경로에서 spawn됨.
;        여기서 RMDir 하면 인스톨러 자기 자신을 삭제하려 시도 → --force-run 실패 위험.
;        electron-updater가 자체적으로 cleanup 하므로 우리는 건드리지 않음.
!macro customInit
  ; 1차: 정상 종료 시도 (저장 작업 완료할 시간 제공)
  nsExec::Exec 'taskkill /IM "T1T.exe" /T'
  Sleep 800
  ; 2차: 강제 종료
  nsExec::Exec 'taskkill /F /IM "T1T.exe" /T'
  ; 파일 잠금 해제 대기
  Sleep 1500
  ; 자동 업데이트 잔재 잠금 파일만 (인스톨러 캐시는 건드리지 않음)
  Delete "$LOCALAPPDATA\T1T\pending-update.lock"
!macroend
