# PILOTIS — Faz 0: Süreç Haritası

**PILOTIS** — Pilotage Integrated Logistics, Operations & Tariff Information System
*The Intelligence Behind Every Maneuver.*

İşletme: **Yalova Pilotaj A.Ş.** — Çavuşçiftliği Köyü Tersaneler Bölgesi Mevkii Plajyolu Sok. No:12/1 Altınova/YALOVA · 0 226 461 20 77 · info@yalovapilotaj.com · www.yalovapilotaj.com (2017'de kuruldu; Yalova Hizmet Sahası'nda kılavuzluk, römorkör, palamar, çevre ve acil durum hizmetleri)

## Omurga

```
TALEP → DOĞRULANMIŞ BEYAN → EMNİYETLİ PLANLAMA → GERÇEKLEŞEN HİZMET
     → AÇIKLANABİLİR HESAP → ONAYLI TAHAKKUK → MUHASEBE ve DEVLET BİLDİRİMİ
```

Bütün belgeler (talepname, taahhütname, bill, iş bitim raporu, tahakkuk, LYBS verisi)
**tek operasyon kimliğine (OperationId)** bağlı aynı iş kaydından üretilir.

## Ana süreç adımları

| # | Adım | Girdi | Çıktı | Sorumlu rol | Durum kümesi |
|---|------|-------|-------|-------------|--------------|
| 1 | Liman uğrağı açılışı | Gemi + sefer bilgisi | PortCall kaydı | Acente / Operasyon | Talep |
| 2 | Talep (talepname) | Portal formu, beyanlar | ServiceRequest v1 | Acente / Kaptan | Talep |
| 3 | Fatura muhatabı onayı | VKN, yetkili kişi | BillingPartyApproval | Fatura muhatabı | Onay |
| 4 | Beyan doğrulama | Saha kontrolü | DeclarationCheck | Kıyı operasyon sorumlusu | Onay |
| 5 | Emniyet/kaynak kararı | Gemi, hava, filo | TugRequirementDecision | Operasyon yöneticisi + Kaptan | Planlama |
| 6 | Planlama | Uygun ekip/araç | Assignment (geçici→kesin) | Planlamacı | Planlama |
| 7 | Saha operasyonu | Görev kabul → olaylar | TimelineEvent'ler | Kılavuz/Römorkör kaptanı | Operasyon |
| 8 | İş bitimi | Olay zinciri | ServiceCompletion + Bill | Kıyı kaptanı | Operasyon |
| 9 | Hesaplama | Tarife sürümü + onaylı parametreler | CalculationResult (izlenebilir) | Hesap motoru | Tahakkuk |
| 10 | Tahakkuk onayı | Hesap + kanıtlar | ApprovedAccrual | Muhasebe/Yönetici | Tahakkuk |
| 11 | ETA aktarımı | Tahakkuk | ExportBatch (tek yönlü, mükerrersiz) | Muhasebe | Muhasebe |
| 12 | LYBS bildirimi | Tamamlanma + ≤48 saat kuralı* | NotificationRecord | Bildirim sorumlusu | Bildirim |
| 13 | İtiraz / düzeltme | Müşteri itirazı | DisputeCase → yeni sürüm | Yönetici | Tahakkuk |

\* 48 saat kuralı R-007 olarak kural kataloğunda "Kaynak bulundu" statüsündedir; resmî nüsha ile doğrulanacaktır.

## Taraf ilişkileri (özet)

- Talep eden ≠ fatura muhatabı ≠ ödeme taahhüdü veren olabilir; üçü ayrı ilişki kaydıdır.
- Devlet tarafları (Bakanlık/DGM, Liman Başkanlığı, Kıyı Emniyeti, GTH) ayrı taraf kayıtlarıdır; tek "devlet" kullanıcısı yoktur.
- Bir şirket birden fazla rol üstlenebilir (ör. tersane hem tesis hem fatura muhatabı); temsil yetkisi tarih aralıklıdır.

## Durum kümeleri (bağımsız, bağlantılı)

Talep · Onay · Planlama · Operasyon · Tahakkuk · Muhasebe · Bildirim — her küme kendi
geçiş tablosuna sahiptir (bkz. `src/lib/workflow.ts`). Operasyonun kapanması faturayı,
tahsilatı veya bildirimi otomatik "tamam" yapmaz.

## Zaman ayrımı (üç süre)

1. **Gerçek olay süreleri** — saha zaman damgaları, asla yuvarlanmaz/ezilmez.
2. **Ücretlendirilen süre** — tarife sürümünün yuvarlama kuralıyla hesaplanır.
3. **Bildirilecek süre** — LYBS alan tanımına göre ayrı üretilir (doğrulama bekliyor: AK-07).
