import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInternalPage } from "@/lib/session";
import { loadVersion } from "@/lib/tariff/repo";
import { SERVICE_LABELS } from "@/data/catalog";
import { EditForm } from "./form";

export const metadata = { title: "Tarife düzenle" };

export default async function EditVersion({ params }: { params: Promise<{ id: string }> }) {
  await requireInternalPage();
  const v = await loadVersion((await params).id);
  if (!v) notFound();
  const def = v.input.definition;
  if (!["DRAFT", "SOURCE_FOUND"].includes(v.row.status)) {
    return <div className="card"><h1>Bu sürüm düzenlenemez</h1><p className="muted">Onaylı veya yürürlükteki sürüm değiştirilemez; değişiklik için yeni sürüm türetin.</p><Link className="btn" href={`/tarife/${v.row.id}`}>Sürüme dön</Link></div>;
  }
  const groups = (def.categories ? Object.entries(def.categories) : [["_", { label: "Genel", services: def.services }]]) as [string, { label: string; services: typeof def.services }][];
  return (
    <>
      <div className="pagehead"><div><div className="muted" style={{ fontSize: 12 }}><Link href={`/tarife/${v.row.id}`}>{v.row.label}</Link> / düzenle</div><h1>Taslak tarife düzenleme</h1>
        <div className="muted">Her kayıt yeni revizyon üretir ve değişen hücreler denetim kaydına yazılır. Sayfa açıkken başka biri kaydederse çakışma uyarısı verilir.</div></div></div>
      <EditForm id={v.row.id} rev={v.row.rev} label={v.row.label}
        groups={groups.map(([k, c]) => ({ key: k, label: c.label, services: Object.entries(c.services).filter(([, s]) => s).map(([sk, s]) => ({ key: sk, label: SERVICE_LABELS[sk] ?? sk, bands: s!.bands.map((b) => ({ base: b.base, perBlock: b.perBlock ?? null })), cap: s!.gtCap ?? null, bollard: s!.bollardBands?.map((b) => ({ fromT: b.fromT, toT: b.toT, rate: b.rate })) ?? null })) }))}
        adjustments={def.adjustments.map((a) => ({ code: a.code, label: a.label, rate: a.rate, kind: a.kind }))} />
    </>
  );
}
