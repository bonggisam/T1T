/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** TPass 웹앱 주소. 빌드 시 .env에서 주입하며 저장소에는 두지 않는다. */
  readonly VITE_TPASS_URL?: string;
  /** 외출 신청 기본 주소. 빌드 시 .env에서 주입하며 저장소에는 두지 않는다. */
  readonly VITE_OUTING_URL?: string;
}
