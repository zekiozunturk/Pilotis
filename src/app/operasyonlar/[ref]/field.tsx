"use client";
import { useMemo } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { recordEvent, closeOperation } from "@/app/actions";
import { CANCEL_REASONS } from "@/lib/workflow";

type Asset = { id: string; name: string };

/** Saha ekranı: büyük butonlar, her gönderim tekil clientEventId taşır (tekrar gönderim çoğaltmaz). */
export function FieldActions({ opRef, opStatus, tugs, declarationChecked }: { opRef: string; opStatus: string; tugs: Asset[]; declarationChecked: boolean }) {
  const closed = ["COMPLETED", "PARTIAL", "CANCELLED"].includes(opStatus);
  if (closed) return <div className="alert ok"><span>✓</span><div><b>Operasyon kapandı</b>Kapanış; tahakkuk, fatura veya resmî bildirimin tamamlandığı anlamına gelmez.</div></div>;
  const started = ["STARTED", "PAUSED"].includes(opStatus);
  return (
    <div className="grid" style={{ gap: 10 }}>
      <div className="grid g3" style={{ gap: 8 }}>
        <Ev opRef={opRef} type="TASK_ACCEPTED" label="Görevi kabul et" />
        <Ev opRef={opRef} type="TRANSIT_START" label="İntikale başla" disabled={opStatus !== "READY"} />
        <Ev opRef={opRef} type="ARRIVED_SITE" label="Sahaya ulaş" disabled={opStatus !== "TRANSIT"} />
        <Ev opRef={opRef} type="PILOT_BOARDED" label="Kılavuz gemiye çıktı" disabled={!declarationChecked || !["ON_SITE", "STARTED"].includes(opStatus)} hint={!declarationChecked ? "Önce beyan kontrolü" : undefined} />
        <Ev opRef={opRef} type="MOORING_START" label="Palamar başladı" disabled={!declarationChecked || !["ON_SITE", "STARTED"].includes(opStatus)} />
        <Ev opRef={opRef} type="PILOT_DISEMBARKED" label="Kılavuz gemiden indi" disabled={!started} />
      </div>
      <div className="card" style={{ padding: 12, background: "var(--surface-2)" }}>
        <h3>Römorkör bazında olaylar</h3>
        <div className="grid g2" style={{ gap: 8 }}>
          {tugs.map((t) => (
            <div key={t.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <b style={{ width: 70, fontSize: 13 }}>{t.name}</b>
              <Ev opRef={opRef} type="TUG_ALONGSIDE" label="Bordada" assetId={t.id} small disabled={!declarationChecked || !["ON_SITE", "STARTED"].includes(opStatus)} />
              <Ev opRef={opRef} type="SERVICE_END" label="Bitirdi" assetId={t.id} serviceKind="TOWAGE" small disabled={!started} />
            </div>
          ))}
        </div>
      </div>
      <div className="grid g3" style={{ gap: 8 }}>
        <Ev opRef={opRef} type="SERVICE_END" label="Palamar bitti" serviceKind="MOORING" disabled={!started} />
        <ActionForm action={recordEvent} hidden={{ ref: opRef, type: opStatus === "PAUSED" ? "PAUSE_END" : "PAUSE_START" }}>
          {opStatus !== "PAUSED" && <input name="note" placeholder="Duraklama nedeni *" required style={{ marginBottom: 6 }} />}
          <CEI /><SubmitButton className="btn secondary big">{opStatus === "PAUSED" ? "Devam et" : "Bekleme / duraklama"}</SubmitButton>
        </ActionForm>
        <ActionForm action={recordEvent} hidden={{ ref: opRef, type: "INCIDENT" }}>
          <input name="note" placeholder="Olay açıklaması *" required style={{ marginBottom: 6 }} />
          <CEI /><SubmitButton className="btn danger big">Olay bildir</SubmitButton>
        </ActionForm>
      </div>
      <div className="sep" />
      <div className="grid g2" style={{ gap: 8 }}>
        <ActionForm action={closeOperation} hidden={{ ref: opRef, outcome: "COMPLETED" }}>
          <SubmitButton className="btn orange big">Hizmeti bitir (tamamlandı)</SubmitButton>
        </ActionForm>
        <ActionForm action={closeOperation} hidden={{ ref: opRef, outcome: started ? "PARTIAL" : "CANCELLED" }}>
          <select name="reason" required defaultValue="" style={{ marginBottom: 6 }}>
            <option value="">Neden seçin *</option>{CANCEL_REASONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <SubmitButton className="btn danger big">{started ? "Tamamlanamadı bildir" : "İptal bildir"}</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}

function CEI() {
  const id = useMemo(() => crypto.randomUUID(), []);
  return <input type="hidden" name="clientEventId" value={id} />;
}

function Ev({ opRef, type, label, assetId, serviceKind, disabled, hint, small }: { opRef: string; type: string; label: string; assetId?: string; serviceKind?: string; disabled?: boolean; hint?: string; small?: boolean }) {
  const hidden: Record<string, string> = { ref: opRef, type };
  if (assetId) hidden.assetId = assetId;
  if (serviceKind) hidden.serviceKind = serviceKind;
  if (disabled) return <button className={`btn secondary ${small ? "" : "big"}`} disabled title={hint}>{label}{hint && !small ? ` — ${hint}` : ""}</button>;
  return (
    <ActionForm action={recordEvent} hidden={hidden}>
      <CEI /><SubmitButton className={`btn ${small ? "" : "big"}`}>{label}</SubmitButton>
    </ActionForm>
  );
}
