"use client";
import { useActionState, useState } from "react";
import { simulateCalc, type SimState } from "@/app/actions";
import { CalcCardClient } from "./card";

type V = { id: string; label: string; adjustments: { code: string; label: string }[]; categorized: boolean };

export function Simulator({ versions, categories }: { versions: V[]; categories: [string, string][] }) {
  const [state, action, pending] = useActionState<SimState, FormData>(simulateCalc, null);
  const [vid, setVid] = useState(versions.find((v) => v.categorized)?.id ?? versions[0]?.id ?? "");
  const v = versions.find((x) => x.id === vid);
  return (
    <div className="grid g2">
      <form action={action} className="card">
        <h2>Hesap simülatörü</h2>
        <div className="field"><label>Tarife sürümü</label><select name="versionId" value={vid} onChange={(e) => setVid(e.target.value)}>{versions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
        <div className="grid g2" style={{ gap: 10 }}>
          <div><label>Hizmet</label><select name="serviceKind" defaultValue="PILOTAGE"><option value="PILOTAGE">Kılavuzluk</option><option value="TOWAGE">Römorkörcülük</option><option value="MOORING">Palamar bağlama</option><option value="UNMOORING">Palamar çözme</option><option value="STANDBY_TUG">Standby römorkör</option></select></div>
          {v?.categorized ? <div><label>Gemi kategorisi</label><select name="category" defaultValue="DIGER_YUK">{categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div> : <div />}
          <div><label>Hizmet tarihi</label><input type="date" name="date" defaultValue="2025-10-22" required /></div>
          <div><label>Doğrulanmış GT</label><input name="gt" inputMode="decimal" defaultValue="8450" placeholder="Boş = bilinmiyor" /></div>
          <div><label>Gerçek süre (dk, saatlik)</label><input name="minutes" inputMode="numeric" defaultValue="61" /></div>
          <div><label>Çeki gücü (t, standby)</label><input name="bollard" inputMode="decimal" /></div>
          <div><label>Talep/standart römorkör</label><input name="requested" type="number" min={1} defaultValue={1} /></div>
          <div><label>Tahsis edilen römorkör</label><input name="allocated" type="number" min={1} defaultValue={1} /></div>
          <div><label>Bekleme (dk)</label><input name="waiting" type="number" min={0} defaultValue={0} /></div>
          <div><label>Tamamlanma</label><select name="completion" defaultValue="COMPLETED">
            <option value="COMPLETED">Tamamlandı</option><option value="INCOMPLETE_STARTED_VESSEL_OR_FACILITY_CAUSE">Başladı, gemi/tesis kaynaklı tamamlanamadı</option>
            <option value="INCOMPLETE_STARTED_OTHER_CAUSE">Başladı, başka nedenle tamamlanamadı</option><option value="CANCELLED_BEFORE_START">Başlamadan iptal</option></select></div>
        </div>
        <div style={{ marginTop: 10 }}><label className="check"><input type="checkbox" name="written" /> İlave römorkör için kaptanın yazılı talebi var (R-004)</label></div>
        <div className="sep" />
        <label>Koşullar ({v?.label.split(" · ")[0]})</label>
        <div className="grid g2" style={{ gap: 4 }} key={vid}>{v?.adjustments.map((a) => <label key={a.code} className="check"><input type="checkbox" name="cond" value={a.code} /> {a.label}</label>)}</div>
        <div style={{ marginTop: 14 }}><button className="btn orange" disabled={pending}>{pending ? "Hesaplanıyor…" : "Hesapla"}</button> <span className="muted" style={{ fontSize: 12 }}>Simülasyon kayıt oluşturmaz.</span></div>
      </form>
      <div>
        {state?.ok === false && <div className="alert bad"><span>⚠</span><div>{state.message}</div></div>}
        {state?.result ? <CalcCardClient r={state.result} /> : <div className="card muted">Parametreleri girip <b>Hesapla</b>'ya basın. Sonuç; uygulanan ve uygulanmayan kuralları gerekçeleriyle gösterir.</div>}
      </div>
    </div>
  );
}
