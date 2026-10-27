import pkg from "../../package.json";
/** Uygulama sürümü (package.json) — alt bilgide ve yönetim ekranında gösterilir */
export const APP_VERSION = pkg.version.replace(/\.0$/, "");
