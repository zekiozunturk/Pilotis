"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import type { ActionState } from "@/app/actions";
import { transition, resolveNote, addRefCase, deriveVersion, type TState } from "../actions";

type A = (s: ActionState, f: FormData) => Promise<ActionState>;
const cast = (x: (s: TState, f: FormData) => Promise<TState>) => x as unknown as A;

export function TransitionButton({ id, to, label, danger, needReason }: { id: string; to: string; label: string; danger?: boolean; needReason?: boolean }) {
  return (
    <ActionForm action={cast(transition)} hidden={{ id, to }}>
      <div style={{ display: "flex", gap: 6 }}>
        {needReason && <input name="reason" placeholder="Gerekçe *" required style={{ minWidth: 180 }} />}
        <SubmitButton className={`btn ${danger ? "danger" : ""}`}>{label}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ResolveNoteForm({ id, noteId }: { id: string; noteId: string }) {
  return (
    <ActionForm action={cast(resolveNote)} hidden={{ id, noteId }}>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input name="resolution" placeholder="Nasıl doğrulandı? (belge, madde, kişi)" required />
        <SubmitButton className="btn secondary">Çözüldü</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DeriveForm({ parentId, parentLabel }: { parentId: string; parentLabel: string }) {
  return (
    <ActionForm action={cast(deriveVersion)} hidden={{ parentId }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Yönerge md.5(1)(b): ücretler her yıl 1 Şubat'tan itibaren ABD TÜFE oranında artırılır; oran negatifse önceki ücret geçerlidir. Artırım/indirim yüzdeleri endekslenmez.</div>
      <div className="grid g2" style={{ gap: 8 }}>
        <div><label>Yeni sürüm etiketi *</label><input name="label" required defaultValue={`KRP 2026–2027 (${parentLabel.slice(0, 24)}… endeksli)`} /></div>
        <div><label>ABD TÜFE oranı (%) *</label><input name="ratePct" required inputMode="decimal" placeholder="Resmî DGM duyurusundaki oran" /></div>
        <div><label>Geçerlilik başlangıcı *</label><input type="date" name="validFrom" required defaultValue="2026-02-01" /></div>
        <div><label>Geçerlilik bitişi *</label><input type="date" name="validTo" required defaultValue="2027-01-31" /></div>
        <div><label>Yuvarlama</label><select name="rounding" defaultValue="CENT"><option value="CENT">0,01 USD</option><option value="UNIT">1 USD</option><option value="NONE">Yuvarlama yok</option></select></div>
        <div><label>Oranın kaynağı *</label><input name="indexNote" required placeholder="DGM duyurusu tarih/sayı" /></div>
      </div>
      <div style={{ marginTop: 8 }}><SubmitButton className="btn">Endeksle yeni taslak türet</SubmitButton></div>
    </ActionForm>
  );
}

export function AddCaseForm({ id, categories, adjustments, services, defaultDate }: { id: string; categories: [string, string][]; adjustments: [string, string][]; services: string[]; defaultDate: string }) {
  return (
    <ActionForm action={cast(addRefCase)} hidden={{ id }} resetOnOk>
      <div className="grid g3" style={{ gap: 8 }}>
        <div><label>Kod *</label><input name="code" required placeholder="RC-19" /></div>
        <div style={{ gridColumn: "span 2" }}><label>Başlık *</label><input name="title" required /></div>
        <div><label>Hizmet</label><select name="serviceKind">{services.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label>Kategori</label><select name="category"><option value="">—</option>{categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label>Hizmet tarihi</label><input type="date" name="serviceDate" defaultValue={defaultDate} /></div>
        <div><label>GT</label><input name="gt" inputMode="decimal" /></div>
        <div><label>Süre (dk)</label><input name="minutes" inputMode="numeric" /></div>
        <div><label>Çeki gücü (t)</label><input name="bollard" inputMode="decimal" /></div>
        <div><label>Talep/tahsis</label><div style={{ display: "flex", gap: 4 }}><input name="requested" defaultValue="1" /><input name="allocated" defaultValue="1" /></div></div>
        <div><label>Tamamlanma</label><select name="completion"><option value="COMPLETED">Tamamlandı</option><option value="INCOMPLETE_STARTED_VESSEL_OR_FACILITY_CAUSE">Yarım (gemi/tesis)</option><option value="CANCELLED_BEFORE_START">Başlamadan iptal</option></select></div>
        <div><label>Kaynak</label><select name="source"><option value="INDEPENDENT_MANUAL">Bağımsız elle hesap</option><option value="OFFICIAL_EXAMPLE">Resmî tablo/örnek</option><option value="HISTORICAL_JOB">Geçmiş sonuçlanmış iş</option></select></div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "8px 0" }}>{adjustments.map(([k, l]) => <label key={k} className="check"><input type="checkbox" name="cond" value={k} /> {l}</label>)}</div>
      <div className="grid g2" style={{ gap: 8 }}>
        <div><label>Beklenen net tutar *</label><input name="expected" required inputMode="decimal" /></div>
        <div><label>Hesap açıklaması (bağımsız) *</label><input name="working" required placeholder="ör. 197 + 8 × 81 = 845" /></div>
      </div>
      <div style={{ marginTop: 8 }}><SubmitButton className="btn secondary">Vakayı ekle</SubmitButton></div>
    </ActionForm>
  );
}
