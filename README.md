# PILOTIS
**Pilotage Integrated Logistics, Operations & Tariff Information System**
*The Intelligence Behind Every Maneuver.* — Yalova Pilotaj A.Ş. için operasyon, planlama, tarife ve tahakkuk platformu.

Omurga: **talep → doğrulanmış beyan → emniyetli planlama → gerçekleşen hizmet → açıklanabilir hesap → onaylı tahakkuk → muhasebe ve devlet bildirimi**. Bütün kayıtlar tek operasyon kimliğine (`OP-2026-000123`) bağlıdır.

## Teknoloji
Next.js 15 (App Router, Server Actions) · TypeScript · PostgreSQL 16 · Drizzle ORM (sürümlü SQL migration) · decimal.js · Vitest · Zod

## Kurulum
```bash
npm install
cp .env.example .env            # DATABASE_URL=postgresql://pilotis:pilotis@localhost:5432/pilotis
npm run db:migrate              # drizzle/ altındaki migration'ları uygular
npm run db:seed                 # gerçek işletme/filo verisi + ÖRNEK işaretli demo veriler
npm test                        # 27 referans hesap/iş akışı testi
npm run dev                     # http://localhost:3000
```
Şema değişikliği: `src/db/schema.ts` düzenle → `npm run db:generate` → `npm run db:migrate`.

## Faz 0–1 durumu
| Teslimat | Durum |
|---|---|
| Süreç haritası, veri sözlüğü, kural matrisi, açık konular | `docs/faz0/` |
| Veri modeli: taraflar/roller, tesisler, gemi, liman uğrağı, operasyon (7 bağımsız durum kümesi), fatura muhatabı onayı, sürümlü beyan, hizmet satırı, saha olayları, personel (+KVKK ayrık tablo), filo, mevzuat/kural, tarife aile/sürüm, hesap sonucu, belge sürümü, denetim kaydı | ✓ |
| Açıklanabilir, deterministik tarife motoru (R-002…R-009, R-015, R-019) | ✓ 27 test |
| Talep portalı, saha ekranı (büyük butonlar, römorkör bazlı olaylar, idempotent gönderim), saha doğrulaması, "Bu bedel neden oluştu?" | ✓ |
| Sunucu tarafı yetki/geçiş denetimi, denetim kaydı, çift tıklamaya karşı idempotens | ✓ |
| Gerçek kimlik doğrulama + MFA | Geliştirme rol seçici var; canlı öncesi eklenecek |

## Önemli kurallar (kodda zorunlu)
- Talep eden taraf otomatik fatura muhatabı değildir (R-018).
- Bilinmeyen GT sıfır kabul edilmez; hesap yalnız **saha doğrulamalı** GT ile yapılır.
- Tahsis edilen römorkör ≠ ücretlendirilen; ilave römorkör kaptanın yazılı talebi ister (R-004).
- Gerçek zaman damgaları yuvarlanmaz; ücretlendirilen süre tarife sürümünden üretilir.
- **ÖRNEK** tarife veya onaysız kurala dayanan hesap üretim tahakkukuna dönüşemez.
- Operasyonun kapanması tahakkuk/fatura/bildirimi tamamlanmış saymaz.

## Kaynak
İşletme bilgileri ve filo: www.yalovapilotaj.com (22.10.2026). Mevzuat dayanakları: `docs/faz0/kural-matrisi.md`.
