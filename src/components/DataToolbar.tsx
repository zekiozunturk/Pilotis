import Link from "next/link";
import { currentRole } from "@/lib/session";
import { entityByKey } from "@/lib/exchange/registry";

/**
 * Liste sayfalarının standart veri araç çubuğu — yalnız o sayfada ve o rolde geçerli düğmeler gösterilir:
 * Yeni kayıt | Excel'den al | Excel'e aktar | Şablon | Rapor oluştur | Sürüm geçmişi
 */
export async function DataToolbar({ entity, newHref, reportHref, historyHref, exportQuery = "", extra }: { entity: string; newHref?: string | null; reportHref?: string | null; historyHref?: string | null; exportQuery?: string; extra?: React.ReactNode }) {
  const role = await currentRole();
  const ent = entityByKey(entity);
  const canImport = !!ent?.canImport(role) && ent.fields.some((f) => !f.exportOnly);
  const canExport = !!ent?.canExport(role);
  return (
    <div className="toolbar datatools" role="toolbar" aria-label="Veri işlemleri">
      {newHref && <Link className="btn orange" href={newHref}>+ Yeni kayıt</Link>}
      {canImport && <Link className="btn secondary" href={`/aktarim?varlik=${entity}`}>Excel'den al</Link>}
      {canExport && <a className="btn secondary" href={`/api/disa-aktar/${entity}?withId=1${exportQuery ? `&${exportQuery}` : ""}`} download>Excel'e aktar</a>}
      {canImport && <a className="btn secondary" href={`/api/aktarim/sablon/${entity}`} download title="Boş içe aktarım şablonu (alan açıklamaları ve örnek satırla)">Şablon</a>}
      {reportHref && <Link className="btn secondary" href={reportHref}>Rapor oluştur</Link>}
      {historyHref && <Link className="btn secondary" href={historyHref}>Sürüm geçmişi</Link>}
      {extra}
    </div>
  );
}
