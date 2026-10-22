import { getUiState } from "@/lib/ui-prefs-server";
import { ROLE_LABELS } from "@/lib/session";
import { requireInternalPage } from "@/lib/session";
import { Studio } from "./studio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tema Stüdyosu" };

export default async function ThemeStudio() {
  await requireInternalPage();
  const ui = await getUiState();
  return (
    <>
      <div className="pagehead"><div><h1>Tema Stüdyosu</h1><div className="muted">10 tam tema ve kişisel görünüm ayarları — değişiklikler sayfa yenilenmeden uygulanır; açık formlar, filtreler ve bulunduğunuz sayfa korunur.</div></div></div>
      <Studio prefs={ui.prefs} personal={ui.personal} policy={ui.policy} role={ui.role} roles={Object.entries(ROLE_LABELS).map(([v, l]) => ({ v, l }))} isAdmin={["SYSTEM_ADMIN", "BUSINESS_MANAGER"].includes(ui.role)} />
    </>
  );
}
