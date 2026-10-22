"use client";
import { useActionState, useState } from "react";
import { estimatePackages, addToCart, type PortalState } from "./actions";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import type { ActionState } from "@/app/actions";
import { SERVICE_LABELS } from "@/data/catalog";

type Opt = { id: string; label: string };
const money = (v: string, c: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: c }).format(Number(v));

export function PortalPlanner({ vessels, facilities, hidden }: { vessels: (Opt & { gt: string | null; type: string | null })[]; facilities: Opt[]; hidden: Record<string, string> }) {
  const [state, action, pending] = useActionState<PortalState, FormData>(estimatePackages, null);
  const [vesselId, setVesselId] = useState("");
  const v = vessels.find((x) => x.id === vesselId);
  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(300px, 380px) 1fr", alignItems: "start" }}>
      <form action={action} className="card">
        <h2>1 · Gemi ve iş</h2>
        <div className="field"><label>Gemi *</label><select name="vesselId" required value={vesselId} onChange={(e) => setVesselId(e.target.value)}><option value="">Seçin…</option>{vessels.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>Listede yoksa <a href="/gemiler">gemi kartı açın</a>.</div></div>
        <div className="field"><label>Başlangıç tesisi</label><select name="fromFacilityId" defaultValue=""><option value="">—</option>{facilities.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
        <div className="field"><label>Hedef tesis</label><select name="toFacilityId" defaultValue=""><option value="">—</option>{facilities.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
        <div className="field"><label>İstenen tarih / saat (TR) *</label><input type="datetime-local" name="plannedStart" required /></div>
        <label className="check"><input type="checkbox" name="repair" /> Bakım-onarım amaçlı (belge eklenecek)</label>
        <div className="sep" />
        <h2>2 · Beyan</h2>
        <div className="field"><label>GT</label><input name="gt" inputMode="decimal" key={vesselId} defaultValue={v?.gt ?? ""} placeholder="Bilinmiyorsa boş" /></div>
        <div className="grid g2" style={{ gap: 8 }}>
          <div className="field"><label>Ana makine</label><select name="engine" defaultValue=""><option value="">Seçin…</option><option>çalışıyor</option><option>arızalı</option><option>makinesiz</option></select></div>
          <div className="field"><label>Yük durumu</label><select name="cargoCondition" defaultValue=""><option value="">Seçin…</option><option value="LADEN">Yüklü</option><option value="BALLAST">Balast</option><option value="EMPTY_NOT_CLEANED">Boş, temizlenmemiş</option><option value="GAS_FREE">Gas-free</option></select></div>
          <div className="field"><label>Tehlikeli yük sınıfı</label><input name="dgClass" /></div>
          <div className="field"><label>UN no</label><input name="unNumber" /></div>
        </div>
        {/tanker/i.test(v?.type ?? "") && <label className="check"><input type="checkbox" name="gasFreeCert" /> Gas-free belgesi mevcut</label>}
        <div style={{ marginTop: 12 }}><button className="btn orange" disabled={pending}>{pending ? "Hesaplanıyor…" : "Önerilen paketleri göster"}</button></div>
      </form>

      <div>
        {state?.ok === false && <div className="alert bad"><span>⚠</span><div>{state.message}</div></div>}
        {!state?.cards && <div className="card muted">Bilgileri girip <b>Önerilen paketleri göster</b>'e basın. Her kartta kapsam, tahmini bedel, gerekli belgeler ve eksik bilgiler görünür.</div>}
        {state?.cards && (
          <div className="grid g2">
            {state.cards.map((c) => (
              <div className="card" key={c.code} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `3px solid ${c.review ? "var(--muted)" : "var(--orange)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div><div className="mono muted" style={{ fontSize: 11 }}>{c.code}</div><h3 style={{ fontSize: 15, margin: 0 }}>{c.title}</h3></div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--navy-800)" }}>{c.review ? "İnceleme" : c.total ? money(c.total, c.currency) : "—"}</div>
                    {!c.review && <div className="muted" style={{ fontSize: 11 }}>tahmini, bağlayıcı değil</div>}
                  </div>
                </div>
                <div style={{ fontSize: 12.5 }}><b>Kapsam:</b> {c.scope}<br /><span className="muted"><b>Kapsam dışı:</b> {c.outOfScope}</span></div>
                {c.lines.length > 0 && <div style={{ fontSize: 12.5 }}>{c.lines.map((l) => <div key={l.kind} style={{ display: "flex", justifyContent: "space-between" }}><span>{SERVICE_LABELS[l.kind]}</span><span>{l.amount ? money(l.amount, c.currency) : <span className="badge warn">{l.missing[0]}</span>}</span></div>)}</div>}
                <div style={{ fontSize: 12 }}><b>Gerekli belgeler:</b> {c.docs.join(", ")}</div>
                {c.missingInfo.length > 0 && <div className="alert warn" style={{ padding: "6px 10px" }}><span>⚠</span><div><b>Eksik bilgi</b>{c.missingInfo.join(", ")}</div></div>}
                {c.notes.map((n, i) => <div key={i} className="muted" style={{ fontSize: 11.5 }}>• {n}</div>)}
                {c.isDemoTariff && <span className="badge demo" style={{ alignSelf: "flex-start" }}>ÖRNEK tarife</span>}
                <div style={{ marginTop: "auto" }}>
                  <ActionForm action={addToCart as (s: ActionState, f: FormData) => Promise<ActionState>} hidden={{ ...hidden, ...state.input, typeCode: c.code, estimate: c.total ?? "", currency: c.currency }}>
                    <SubmitButton className="btn secondary">Sepete ekle</SubmitButton>
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
