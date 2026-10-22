"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { generateDoc, uploadWetSigned } from "@/app/actions";

export interface DocRow { id: string; docType: string; version: number; fileName: string; sha256: string | null; origin: string; signature: string; signedBy: string | null; createdAt: string; sizeBytes: number | null; approvals: { name: string; level: string; decision: string; at: string }[]; isApprovedBase: boolean }

const LEVEL: Record<string, [string, string]> = {
  QUALIFIED_E_SIGNATURE: ["Güvenli e-imza", "ok"], DRAWN: ["Çizilmiş imza", "warn"], OTP_ACCOUNT: ["Hesap onayı", "warn"], WET_UPLOADED: ["Islak imza (yüklendi)", "grey"], NONE: ["İmzasız", "grey"],
};

export function DocumentsPanel({ opRef, types, docs, canGenerate }: { opRef: string; types: [string, string][]; docs: DocRow[]; canGenerate: boolean }) {
  return (
    <div>
      {canGenerate && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {types.map(([k, label]) => (
            <ActionForm key={k} action={generateDoc} hidden={{ ref: opRef, docType: k }}>
              <SubmitButton className="btn secondary">{label}</SubmitButton>
            </ActionForm>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {docs.map((d) => (
          <div key={d.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: d.isApprovedBase ? "var(--ok-bg)" : "var(--surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <a href={`/api/belge/${d.id}`} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11.5, wordBreak: "break-all" }}>{d.fileName}</a>
              <b style={{ whiteSpace: "nowrap" }}>V{String(d.version).padStart(2, "0")}</b>
            </div>
            <div className="muted" style={{ fontSize: 11 }}>{new Date(d.createdAt).toLocaleString("tr-TR")} · {d.sizeBytes ? `${Math.round(d.sizeBytes / 1024)} KB` : ""} · SHA-256 <span className="mono" title={d.sha256 ?? ""}>{d.sha256?.slice(0, 16)}</span>{d.origin !== "GENERATED" ? " · yüklenen nüsha" : ""}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
              <span className={`badge ${LEVEL[d.signature][1]}`}>{LEVEL[d.signature][0]}{d.signedBy ? ` · ${d.signedBy}` : ""}</span>
              {d.approvals.map((a, i) => <span key={i} className={`badge ${a.decision === "APPROVED" ? "ok" : "bad"}`}>{a.decision === "APPROVED" ? "Onay" : "Ret"}: {a.name} · {LEVEL[a.level][0]}</span>)}
              {d.isApprovedBase && <span className="badge ok">Geçerli muhatap onayının dayanağı</span>}
            </div>
            {canGenerate && d.origin === "GENERATED" && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontSize: 12 }}>Islak imzalı nüsha yükle</summary>
                <ActionForm action={uploadWetSigned} hidden={{ ref: opRef, documentVersionId: d.id }} resetOnOk>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <input name="signer" placeholder="İmzalayan ad / unvan *" required style={{ flex: "1 1 160px" }} />
                    <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required style={{ flex: "1 1 160px" }} />
                    <SubmitButton className="btn secondary">Yükle</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            )}
          </div>
        ))}
        {docs.length === 0 && <div className="muted">Henüz belge üretilmedi. Belgeler aynı operasyon verisinden üretilir; içerik değişmedikçe yeni sürüm açılmaz.</div>}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Güvenli elektronik imza (nitelikli sertifika) entegrasyonu ayrıca kurulacak; çizilmiş imza ve hesap onayı ona eşdeğer sayılmaz (R-016).</div>
    </div>
  );
}
