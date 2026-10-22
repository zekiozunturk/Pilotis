"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { verifyDeclaration, setBillingParty, decideBilling, saveCalculation, decideRequest } from "@/app/actions";
import { SignaturePad } from "@/components/SignaturePad";

export function VerifyForm({ opRef, gt, engine, cargo }: { opRef: string; gt: string; engine: string; cargo: string }) {
  return (
    <ActionForm action={verifyDeclaration} hidden={{ ref: opRef }}>
      <div className="grid g3" style={{ gap: 8 }}>
        <div><label>Gözlenen GT</label><input name="gt" inputMode="decimal" defaultValue={gt} /></div>
        <div><label>Ana makine</label><select name="engine" defaultValue={engine || "çalışıyor"}><option>çalışıyor</option><option>arızalı</option><option>makinesiz</option></select></div>
        <div><label>Dümen</label><select name="rudder" defaultValue=""><option value="">—</option><option>çalışıyor</option><option>arızalı</option></select></div>
        <div><label>Yük durumu</label><select name="cargoCondition" defaultValue={cargo}><option value="">—</option><option value="LADEN">Yüklü</option><option value="BALLAST">Balast</option><option value="EMPTY_NOT_CLEANED">Boş, temizlenmemiş</option><option value="GAS_FREE">Gas-free</option></select></div>
        <div><label>Tehlikeli yük sınıfı</label><input name="dgClass" placeholder="ör. 3" /></div>
        <div><label>UN no</label><input name="unNumber" placeholder="ör. UN1203" /></div>
      </div>
      <div className="grid g2" style={{ gap: 8, marginTop: 8 }}>
        <div><label>Not / kanıt</label><input name="note" placeholder="Belge no, fotoğraf ref." /></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}><label className="check"><input type="checkbox" name="gasFreeCert" /> Gas-free belgesi görüldü</label></div>
      </div>
      <div style={{ marginTop: 8 }}><SubmitButton className="btn secondary">Beyanı kontrol et → yeni sürüm</SubmitButton></div>
    </ActionForm>
  );
}

export function BillingPartyForm({ opRef, parties }: { opRef: string; parties: { id: string; label: string }[] }) {
  return (
    <ActionForm action={setBillingParty} hidden={{ ref: opRef }}>
      <label>Fatura muhatabı ata</label>
      <div style={{ display: "flex", gap: 8 }}>
        <select name="billingPartyId" required defaultValue=""><option value="">Seçin…</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <SubmitButton className="btn">Ata</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function BillingDecisionForm({ opRef, customer = false, signer }: { opRef: string; customer?: boolean; signer?: string }) {
  return (
    <ActionForm action={decideBilling} hidden={{ ref: opRef }}>
      <div className="grid g2" style={{ gap: 8 }}>
        <div><label>{customer ? "Onaylayan (ad soyad / unvan) *" : "Yetkili kişi"}</label><input name="authorizedPerson" placeholder="Ad Soyad / unvan" defaultValue={signer} /></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}><label className="check"><input type="checkbox" name="taxVerified" /> {customer ? "Vergi kimlik ve fatura bilgilerimiz doğrudur" : "Vergi kimliği doğrulandı"}</label></div>
      </div>
      <div style={{ marginTop: 8 }}><SignaturePad /></div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Onay, talepnamenin o anki sürümüne bağlanır; içerik değişirse yeni onay istenir.</div>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <SubmitButton className={customer ? "btn orange" : "btn"} name="decision" value="APPROVED">{customer ? "Fatura muhatabı olarak onaylıyorum" : "Muhatap onayladı"}</SubmitButton>
        <SubmitButton className="btn danger" name="decision" value="REJECTED">{customer ? "Reddediyorum" : "Reddetti"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SaveCalcForm({ opRef }: { opRef: string }) {
  return (
    <ActionForm action={saveCalculation} hidden={{ ref: opRef }}>
      <SubmitButton className="btn">Hesabı kayda al</SubmitButton>
    </ActionForm>
  );
}

export function RequestDecisionForm({ opRef }: { opRef: string }) {
  return (
    <ActionForm action={decideRequest} hidden={{ ref: opRef }}>
      <div className="field"><label>Müşteriye not (ret ve eksik bilgide zorunlu)</label><input name="note" placeholder="ör. GT belgesi ekleyin / istenen saatte römorkör uygun değil, 14:00 önerilir" /></div>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <SubmitButton className="btn orange" name="decision" value="ACCEPTED">Talebi kabul et</SubmitButton>
        <SubmitButton className="btn secondary" name="decision" value="INFO_MISSING">Eksik bilgi iste</SubmitButton>
        <SubmitButton className="btn danger" name="decision" value="REJECTED">Reddet</SubmitButton>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Karar müşteriye ve fatura muhatabına bildirim olarak gider. Kabul, römorkör sayısını ve kesin saati bağlamaz; bunlar planlamada kesinleşir.</div>
    </ActionForm>
  );
}
