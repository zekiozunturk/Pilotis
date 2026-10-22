"use client";
import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { createOperation, type ActionState } from "@/app/actions";

type Opt = { id: string; label: string };

export function NewOperationForm({ vessels, types, facilities, parties }: { vessels: (Opt & { gt: string | null })[]; types: Opt[]; facilities: Opt[]; parties: Opt[] }) {
  const idem = useMemo(() => crypto.randomUUID(), []);
  const [vesselId, setVesselId] = useState("");
  const [requester, setRequester] = useState("");
  const [billing, setBilling] = useState("");
  const vessel = vessels.find((v) => v.id === vesselId);
  return (
    <ActionForm action={createOperation as (s: ActionState, f: FormData) => Promise<ActionState>} hidden={{ idempotencyKey: idem }}>
      <div className="grid g2">
        <div className="card">
          <h2>1 · Gemi ve iş</h2>
          <div className="field"><label>Gemi *</label>
            <select name="vesselId" required value={vesselId} onChange={(e) => setVesselId(e.target.value)}>
              <option value="">Seçin…</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
          <div className="field"><label>İşin amacı / operasyon türü *</label>
            <select name="typeCode" required defaultValue=""><option value="">Seçin…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          </div>
          <div className="grid g2">
            <div className="field"><label>Başlangıç tesisi</label>
              <select name="fromFacilityId" defaultValue=""><option value="">—</option>{facilities.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
            <div className="field"><label>Hedef tesis</label>
              <select name="toFacilityId" defaultValue=""><option value="">—</option>{facilities.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
          </div>
          <div className="field"><label>İstenen tarih ve saat (Europe/Istanbul) *</label><input type="datetime-local" name="plannedStart" required /></div>
          <div className="alert info"><span>ⓘ</span><div>Olağan talepler için en az 6 saat önce bildirim önerilir (R-011 — doğrulama bekliyor).</div></div>
        </div>
        <div className="card">
          <h2>2 · Beyan</h2>
          <div className="field"><label>Beyan edilen GT</label>
            <input name="declaredGt" inputMode="decimal" placeholder={vessel?.gt ? `Kayıtlı: ${vessel.gt}` : "Bilinmiyorsa boş bırakın"} defaultValue={vessel?.gt ?? ""} key={vesselId} />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Boş değer sıfır kabul edilmez; hesap saha doğrulamasındaki GT ile yapılır.</div>
          </div>
          <label className="check"><input type="checkbox" name="engineOk" /> Ana makine ve dümen çalışır durumda</label>
          <div className="sep" />
          <h2>3 · Taraflar</h2>
          <div className="field"><label>Talep eden *</label>
            <select name="requesterPartyId" required value={requester} onChange={(e) => setRequester(e.target.value)}><option value="">Seçin…</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
          <div className="field"><label>Fatura muhatabı</label>
            <select name="billingPartyId" value={billing} onChange={(e) => setBilling(e.target.value)}><option value="">Henüz belirlenmedi</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
          {requester && !billing && <div className="alert warn"><span>⚠</span><div>Talep eden taraf otomatik olarak fatura muhatabı sayılmaz. Muhatap belirlenip onaylanana kadar iş planlama öncesinde uyarı verir.</div></div>}
          {billing && billing !== requester && <div className="alert info"><span>ⓘ</span><div>Fatura muhatabı farklı: vergi bilgisi, yetkili kişi ve onay ayrıca istenecek.</div></div>}
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <SubmitButton className="btn orange">Talebi gönder</SubmitButton>
        <span className="muted" style={{ fontSize: 12 }}>Gönderim kesin kaynak rezervasyonu veya operasyon izni anlamına gelmez.</span>
      </div>
    </ActionForm>
  );
}
