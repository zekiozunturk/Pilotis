export const STATUS_SETS: { key: string; label: string; values: Record<string, string> }[] = [
  { key: "requestStatus", label: "Talep", values: { DRAFT: "Taslak", SUBMITTED: "Gönderildi", INFO_MISSING: "Eksik bilgi", IN_REVISION: "Revizyonda", ACCEPTED: "Kabul edildi", REJECTED: "Reddedildi" } },
  { key: "approvalStatus", label: "Onay", values: { AWAITING_DECLARATION: "Beyan bekliyor", AWAITING_BILLING_PARTY: "Ödeme muhatabı bekliyor", OPS_REVIEW: "Operasyon kontrolünde", COMPLETE: "Tamamlandı" } },
  { key: "planningStatus", label: "Planlama", values: { AWAITING_RESOURCE: "Kaynak bekliyor", TENTATIVE: "Geçici plan", FIRM: "Kesin plan", REPLANNING: "Yeniden planlanıyor" } },
  { key: "opStatus", label: "Operasyon", values: { READY: "Sevke hazır", TRANSIT: "İntikalde", ON_SITE: "Sahada", STARTED: "Başladı", PAUSED: "Durakladı", COMPLETED: "Tamamlandı", PARTIAL: "Kısmen tamamlandı", CANCELLED: "İptal" } },
  { key: "accrualStatus", label: "Tahakkuk", values: { AWAITING_CALC: "Hesap bekliyor", IN_REVIEW: "Kontrolde", APPROVED: "Onaylandı", DISPUTED: "İtirazlı", CORRECTED: "Düzeltildi" } },
  { key: "accountingStatus", label: "Muhasebe", values: { AWAITING_EXPORT: "Aktarım bekliyor", EXPORTED: "Aktarıldı", REJECTED: "Reddedildi", INVOICED: "Faturalandı", RECONCILED: "Mutabık" } },
  { key: "notifyStatus", label: "Bildirim", values: { PREPARING: "Hazırlanıyor", READY: "Hazır", AWAITING_SEND: "Gönderim bekliyor", SENT: "Gönderildi", ACCEPTED: "Kabul edildi", REJECTED: "Reddedildi" } },
];

export const EVENT_LABELS: Record<string, string> = {
  TASK_ACCEPTED: "Görev kabul edildi", TRANSIT_START: "İntikale başlandı", ARRIVED_SITE: "Sahaya ulaşıldı",
  DECLARATION_CHECKED: "Beyan kontrol edildi", PILOT_BOARDED: "Kılavuz gemiye çıktı", TUG_ALONGSIDE: "Römorkör bordaya geldi",
  MOORING_START: "Palamar başladı", SERVICE_START: "Hizmet başladı", PAUSE_START: "Duraklama başladı", PAUSE_END: "Devam edildi",
  SERVICE_END: "Hizmet bitti", PILOT_DISEMBARKED: "Kılavuz gemiden indi", INCIDENT: "Olay bildirildi", CANCEL_OR_INCOMPLETE: "Tamamlanamama / iptal", WAIT_START: "Bekleme başladı", WAIT_END: "Bekleme bitti", RETURN_START: "Dönüşe başlandı", RETURN_END: "Üsse dönüldü",
};

export const ROLE_TYPE_LABELS: Record<string, string> = {
  MINISTRY_DGM: "Bakanlık / DGM", HARBOUR_MASTER: "Liman Başkanlığı", COASTAL_SAFETY: "Kıyı Emniyeti", VTS: "Gemi Trafik Hizmetleri",
  COAST_GUARD: "Sahil Güvenlik", SERVICE_PROVIDER: "Hizmet sağlayıcı", AGENT: "Acente", OWNER: "Donatan", OPERATOR_MANAGER: "İşletmeci",
  CHARTERER: "Kiracı", MASTER: "Kaptan", SHIPYARD: "Tersane", TERMINAL: "Terminal / kıyı tesisi", BILLING_PARTY: "Fatura muhatabı",
  PAYMENT_GUARANTOR: "Ödeme taahhüdü", SUBCONTRACTOR: "Alt yüklenici", INSURER_PI_SURVEYOR: "Sigorta / P&I / sörveyör", EMERGENCY_AUTHORITY: "Acil durum otoritesi",
};
