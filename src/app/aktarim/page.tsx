import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage, currentRole, ROLE_LABELS } from "@/lib/session";
import { ENTITIES, entityByKey } from "@/lib/exchange/registry";
import { Wizard } from "./wizard";
import { BatchActions } from "./batch-actions";

export const metadata = { title: "Excel aktarım merkezi" };
export const dynamic = "force-dynamic";
const ST: Record<string, [string, string]> = {
  UPLOADED: ["Yüklendi", "grey"], VALIDATED: ["Doğrulandı", "grey"], AWAITING_APPROVAL: ["Onay bekliyor", "warn"], RUNNING: ["Çalışıyor", ""], DONE: ["Tamamlandı", "ok"],
  DRY_RUN: ["Kuru çalıştırma", ""], FAILED: ["Başarısız", "bad"], REVERTED: ["Geri alındı", "grey"], PARTIALLY_REVERTED: ["Kısmen geri alındı", "warn"],
};

export default async function Aktarim({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireInternalPage();
  const role = await currentRole();
  const sp = await searchParams;
  const pick = entityByKey(sp.varlik ?? "");
  const importable = ENTITIES.filter((e) => e.canImport(role) && e.fields.some((f) => !f.exportOnly));
  const exportable = ENTITIES.filter((e) => e.canExport(role));
  const history = await db.select().from(s.importBatches).orderBy(desc(s.importBatches.createdAt)).limit(40);
  const targets = pick?.target ? await pick.target.options() : [];
  return (
    <>
      <div className="pagehead">
        <div><h1>Excel aktarım merkezi</h1>
          <div className="muted">Excel'den toplu kayıt al, Excel'e aktar, şablon indir. Her aktarım önce doğrulanır ve önizlenir; tamamlanan aktarım sonradan değişmeyen kayıtlar için geri alınabilir.</div></div>
      </div>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Excel'den al</h3>
          {importable.length === 0 ? <div className="empty">Rolünüz ({ROLE_LABELS[role]}) için içe aktarılabilir kayıt türü yok.</div> : (
            <Wizard
              entities={importable.map((e) => ({ key: e.key, label: e.label, group: e.group, description: e.description, keys: e.keys, fields: e.fields.filter((f) => !f.exportOnly).map((f) => ({ key: f.key, header: f.header, required: !!f.required, type: f.type, help: f.help ?? "" })), mode: e.mode, target: e.target?.label ?? null, needsApproval: e.needsApproval(role) }))}
              initial={pick && pick.canImport(role) ? pick.key : ""} targets={targets} initialTarget={sp.hedef ?? null} />
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Excel'e aktar ve şablonlar</h3>
          <table className="table">
            <thead><tr><th>Kayıt türü</th><th></th></tr></thead>
            <tbody>
              {exportable.map((e) => (
                <tr key={e.key}>
                  <td><b>{e.label}</b><div className="muted small">{e.description}</div></td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <a className="btn secondary" href={`/api/disa-aktar/${e.key}?withId=1`} download>Excel'e aktar</a>{" "}
                    {e.canImport(role) && e.fields.some((f) => !f.exportOnly) && <a className="btn secondary" href={`/api/aktarim/sablon/${e.key}`} download>Şablon</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Aktarım geçmişi</h3>
        {history.length === 0 ? <div className="empty">Henüz aktarım yok.</div> : (
          <div className="tablewrap"><table className="table">
            <thead><tr><th>No</th><th>Kayıt türü</th><th>Dosya</th><th>Hazırlayan</th><th>Tarih</th><th>Durum</th><th className="num">Ekle</th><th className="num">Güncelle</th><th className="num">Atla</th><th className="num">Hata</th><th></th></tr></thead>
            <tbody>
              {history.map((b) => {
                const sm = (b.summary ?? {}) as { insert?: number; update?: number; skip?: number; error?: number };
                const [l, c] = ST[b.status] ?? [b.status, "grey"];
                return (
                  <tr key={b.id}>
                    <td className="mono">{b.no}</td><td>{entityByKey(b.entity)?.label ?? b.entity}</td><td className="small">{b.fileName}</td>
                    <td>{ROLE_LABELS[b.createdBy as keyof typeof ROLE_LABELS] ?? b.createdBy}{b.approvedBy && <div className="muted small">Onay: {b.approvedBy}</div>}</td>
                    <td className="small">{b.createdAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })}</td>
                    <td><span className={`badge ${c}`}>{l}</span>{b.message && <div className="muted small" style={{ maxWidth: 260 }}>{b.message}</div>}</td>
                    <td className="num">{sm.insert ?? "—"}</td><td className="num">{sm.update ?? "—"}</td><td className="num">{sm.skip ?? "—"}</td><td className="num">{sm.error ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {["DONE", "DRY_RUN", "FAILED", "PARTIALLY_REVERTED", "REVERTED"].includes(b.status) && <a className="btn secondary" href={`/api/aktarim/${b.id}/hata`} download>Sonuç raporu</a>}{" "}
                      <BatchActions id={b.id} status={b.status} canApprove={(entityByKey(b.entity)?.approvers.includes(role) || role === "SYSTEM_ADMIN") && b.createdBy !== role} canRevert={b.createdBy === role || ["SYSTEM_ADMIN", "BUSINESS_MANAGER", "OPERATIONS_MANAGER"].includes(role)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>Kurallar: yalnız tekil anahtarla eşleştirilir (isimle birleştirme yapılmaz) · makrolar çalıştırılmaz · dış bağlantılı formüller reddedilir · onaylı/kesinleşmiş kayıtlar değiştirilmez · en fazla 20.000 satır. Ayrıntı: <Link href="/terminoloji">terminoloji</Link>.</p>
    </>
  );
}
