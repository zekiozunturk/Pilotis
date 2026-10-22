import { notFound } from "next/navigation";
import { analysis, peopleAndAssets, qs } from "../_lib";
import { AnalysisHeader, SheetTable } from "../_ui";
import { personSheet } from "../tables";
import { HBars } from "@/components/charts";
import { H } from "@/lib/analytics/core";
import { ExportButton } from "../export-button";
import { PersonPicker } from "../person-picker";
import type { SP } from "@/lib/analytics/load";
import { isPreviewing } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analiz — personel" };

export default async function PersonnelAnalysis({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await analysis(searchParams);
  if (a.access.people === "NONE") notFound();
  const { ps, q } = peopleAndAssets(a);
  const sheet = personSheet(a.sc, ps, a.access);
  const ranked = [...ps].sort((x, y) => y.actual - x.actual);
  const h = (ms: number) => Math.round((ms / H) * 10) / 10;
  return (
    <>
      <AnalysisHeader a={a} tab="/analiz/personel" title="Personel analizi" q={q} actions={<ExportButton tab="personel" />}
        sub="Kişi bazında planlanan ve gerçekleşen çalışma, fazla mesai, gece, hazır bulunma ve dinlenme. Görevsiz görünen süre otomatik olarak dinlenme veya verimsizlik sayılmaz." />
      {(a.access.people === "SELF" || a.access.people === "TEAM") && (await isPreviewing()) && <PersonPicker persons={a.ds.persons.map((p) => ({ v: p.id, l: p.name.replace("ÖRNEK ", "") }))} current={a.me} />}
      <div className="card" style={{ marginBottom: 16 }}>
        <HBars title="Gerçekleşen çalışmanın bileşimi" note="Aktif hizmet, intikal ve bekleme fiilî katılımdan; 'diğer vardiya süresi' görevde olunan fakat iş kaydı bulunmayan vardiya süresidir (hazır bekleme). Satıra tıklayınca kişi sayfası açılır."
          series={[{ name: "Aktif hizmet" }, { name: "İntikal" }, { name: "Bekleme" }, { name: "Diğer vardiya süresi" }]} unit=" sa"
          rows={ranked.map((p) => ({ key: p.person.id, label: p.person.name.replace("ÖRNEK ", ""), sub: p.person.teamKey ?? undefined, href: `/analiz/personel/${p.person.id}${qs(a.sp)}`, flag: !p.available ? "görevsiz/izinli" : undefined, values: [h(p.active), h(p.transit), h(p.waiting), Math.max(0, h(p.actual - p.active - p.transit - p.waiting))] }))} maxRows={25} />
      </div>
      <div className="card"><h3>Personel tablosu</h3><SheetTable sheet={sheet} links={sheet.links} highlight={(r) => Number(r.viol) > 0} /></div>
    </>
  );
}
