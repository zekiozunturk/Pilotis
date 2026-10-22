"use client";
import { useActionState, useRef, useState, startTransition } from "react";
import { checkShift, createShift, suggestCrew, assignCrew, type PlanState } from "./actions";

type Opt = { id: string; label: string };
const hm = (m: number | null | undefined) => (m == null ? "—" : `${Math.floor(m / 60)} sa ${Math.round(m % 60)} dk`);

function Result({ st }: { st: PlanState }) {
  if (!st) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div className={`alert ${st.ok ? "ok" : "bad"}`} role="status"><span>{st.ok ? "✓" : "⚠"}</span><div>{st.message}</div></div>
      {st.violations && st.violations.length > 0 && <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 12.5, color: "var(--bad)" }}>{st.violations.map((v, i) => <li key={i}>{v.message} <span className="muted">({v.ruleRef})</span></li>)}</ul>}
      {st.warnings && st.warnings.length > 0 && <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 12.5, color: "var(--warn)" }}>{st.warnings.map((v, i) => <li key={i}>{v.message}</li>)}</ul>}
      {st.metrics && <div className="muted" style={{ fontSize: 12 }}>Kayıt sonrası (±7 gün): en düşük 24s dinlenme {hm(st.metrics.minRest24h)} · en düşük 7g dinlenme {hm(st.metrics.minRest7d)}</div>}
    </div>
  );
}

export function ShiftForm({ people, assets, defaultDay, exLimit, exUsed }: { people: Opt[]; assets: Opt[]; defaultDay: string; exLimit: number; exUsed: number }) {
  const [chk, check, checking] = useActionState<PlanState, FormData>(checkShift, null);
  const [sav, save, saving] = useActionState<PlanState, FormData>(createShift, null);
  const [ex, setEx] = useState(false);
  const needsEx = (sav?.needsException || chk?.needsException) ?? false;
  const formRef = useRef<HTMLFormElement>(null);
  // React 19 form action'ları formu sıfırlar; kontrol sonrası girilen değerler kaybolmasın diye elle gönderiyoruz
  const submit = (fn: (fd: FormData) => void) => () => {
    const f = formRef.current; if (!f || !f.reportValidity()) return;
    const fd = new FormData(f); startTransition(() => fn(fd));
  };
  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
      <div className="grid g2" style={{ gap: 8 }}>
        <div style={{ gridColumn: "span 2" }}><label>Personel *</label><select name="personnelId" required defaultValue=""><option value="">Seçin…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
        <div><label>Tür</label><select name="category" defaultValue="WORK"><option value="WORK">Görev</option><option value="STANDBY">Hazır bulunma</option><option value="TRAINING">Eğitim</option><option value="LEAVE">İzin</option></select></div>
        <div><label>Römorkör / araç</label><select name="assetId" defaultValue=""><option value="">—</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
        <div><label>Başlangıç (TR) *</label><input type="datetime-local" name="start" required defaultValue={`${defaultDay}T08:00`} /></div>
        <div><label>Bitiş (TR) *</label><input type="datetime-local" name="end" required defaultValue={`${defaultDay}T18:00`} /></div>
        <div style={{ gridColumn: "span 2" }}><label>Not</label><input name="note" placeholder="ör. Gece vardiyası, tatbikat…" /></div>
      </div>
      {(ex || needsEx) && (
        <div className="card" style={{ marginTop: 10, background: "var(--warn-bg)", borderColor: "var(--warn)" }}>
          <h3 style={{ color: "var(--warn)" }}>Acil durum istisnası (R-031)</h3>
          <div style={{ fontSize: 12, marginBottom: 6 }}>Yalnız operasyon/işletme yöneticisi onaylar. Bu ay {exUsed}/{exLimit} kullanıldı; olağan iş yoğunluğu acil durum sayılmaz.</div>
          <input type="hidden" name="withException" value="1" />
          <div className="grid g2" style={{ gap: 8 }}>
            <div><label>Dayanak *</label><input name="basis" placeholder="ör. Liman Başkanlığı talimatı tarih/sayı" /></div>
            <div><label>Telafi dinlenmesi planı *</label><input name="compensation" placeholder="ör. 24.10 08:00'e kadar görev verilmeyecek" /></div>
            <div style={{ gridColumn: "span 2" }}><label>Gerekçe *</label><input name="reason" placeholder="Neden kural dışına çıkılması zorunlu?" /></div>
            {exUsed >= exLimit && <label className="check" style={{ gridColumn: "span 2" }}><input type="checkbox" name="overLimitAck" /> Aylık sınırın aşıldığını ve yönetime raporlanacağını onaylıyorum</label>}
          </div>
        </div>
      )}
      <div className="toolbar" style={{ marginTop: 10 }}>
        <button type="button" className="btn secondary" onClick={submit(check)} disabled={checking}>{checking ? "Kontrol ediliyor…" : "Kuralları kontrol et"}</button>
        <button type="button" className="btn orange" onClick={submit(save)} disabled={saving}>{saving ? "Kaydediliyor…" : needsEx ? "İstisnayla kaydet" : "Kaydet"}</button>
        {!needsEx && <button type="button" className="btn danger" onClick={() => setEx(true)} style={{ marginLeft: "auto" }}>Acil durum istisnası</button>}
      </div>
      <Result st={sav ?? chk} />
    </form>
  );
}

export function CrewSuggest({ ops }: { ops: { ref: string; label: string; start: string }[] }) {
  const [st, run, pending] = useActionState<PlanState, FormData>(suggestCrew, null);
  const [as, assign] = useActionState<PlanState, FormData>(assignCrew, null);
  const [opRef, setOpRef] = useState(ops[0]?.ref ?? "");
  const op = ops.find((o) => o.ref === opRef);
  const [start, setStart] = useState(op?.start ?? "");
  const [end, setEnd] = useState(op?.start ? addH(op.start, 3) : "");
  return (
    <div>
      <form action={run}>
        <div className="grid g2" style={{ gap: 8 }}>
          <div style={{ gridColumn: "span 2" }}><label>Operasyon</label><select name="opRef" value={opRef} onChange={(e) => { setOpRef(e.target.value); const o = ops.find((x) => x.ref === e.target.value); if (o?.start) { setStart(o.start); setEnd(addH(o.start, 3)); } }}>{ops.length === 0 && <option value="">Açık operasyon yok</option>}{ops.map((o) => <option key={o.ref} value={o.ref}>{o.label}</option>)}</select></div>
          <div><label>Görev başlangıcı</label><input type="datetime-local" name="start" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
          <div><label>Görev bitişi</label><input type="datetime-local" name="end" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
          <div style={{ gridColumn: "span 2" }}><label>Görev rolü</label><select name="crewRole" defaultValue="KAPTAN"><option value="">Tümü</option><option value="KAPTAN">Römorkör kaptanı</option><option value="BASCARKCI">Başçarkçı</option><option value="YAGCI">Yağcı</option><option value="PIMCI">Pimci</option><option value="KILAVUZ">Kılavuz kaptan</option><option value="KIYI_OPS">Kıyı operasyon</option></select></div>
        </div>
        <div style={{ marginTop: 10 }}><button className="btn" disabled={pending}>{pending ? "Değerlendiriliyor…" : "Uygun ekibi öner"}</button></div>
      </form>
      {st && <div className={`alert ${st.ok ? "info" : "bad"}`} style={{ marginTop: 10 }}><span>ⓘ</span><div>{st.message}. Sıralama: önce kurallara uygunluk, sonra daha az gece görevi ve daha az haftalık saat.</div></div>}
      {as && <div className={`alert ${as.ok ? "ok" : "bad"}`} style={{ marginTop: 8 }} role="status"><span>{as.ok ? "✓" : "⚠"}</span><div>{as.message}{as.violations?.map((v, i) => <div key={i}>{v.message}</div>)}</div></div>}
      {st?.candidates && (
        <div style={{ marginTop: 8, maxHeight: 380, overflowY: "auto" }}>
          {st.candidates.map((c, i) => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
              <div>
                <b>{i + 1}. {c.name.replace("ÖRNEK ", "")}</b> <span className={`badge ${c.ok ? "ok" : "bad"}`}>{c.ok ? "Uygun" : "Uygun değil"}</span>
                <div className="muted" style={{ fontSize: 11.5 }}>Son 7 gün: {c.weekHours} sa · {c.nightShifts} gece görevi ({c.nightHours} sa)</div>
                <div style={{ fontSize: 12, color: c.ok ? "var(--ok)" : "var(--bad)" }}>{c.reason}</div>
              </div>
              {c.ok && <form action={assign}><input type="hidden" name="opRef" value={opRef} /><input type="hidden" name="personnelId" value={c.id} /><input type="hidden" name="start" value={start} /><input type="hidden" name="end" value={end} /><button className="btn secondary">Ata</button></form>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function addH(local: string, h: number) {
  const d = new Date(`${local}:00+03:00`); d.setTime(d.getTime() + h * 3600_000);
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 16);
}
