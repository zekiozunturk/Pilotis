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

## Faz 2 durumu
| Teslimat | Durum |
|---|---|
| Müşteri portalı (`/portal`): gemi → tesis → zaman → beyan → tahmini bedelli paket kartları (kapsam, kapsam dışı, gerekli belgeler, eksik bilgi) | ✓ |
| Sepet: rezervasyon değil; kalem bazında fatura muhatabı; tekrar gönderimde çoğaltma yok; sonuç ekranında talep numaraları | ✓ |
| Kayıt düzeyi erişim: dış kullanıcı yalnız taraf olduğu işleri görür (liste, detay, PDF indirme 404) | ✓ |
| Beyan etki analizi: değişen alan → etkilenen fiyat/belge/onay; kritik değişiklikte muhatap onayı otomatik düşer | ✓ |
| PDF belgeler (talepname, beyan formu, taahhütname, iş emri, bill, iş bitim raporu, hesap dökümü) — aynı operasyon verisinden, `TIP_GEMI_YYYYMMDD_OP000123_V01.pdf`, SHA-256, içerik özeti; içerik değişmedikçe yeni sürüm açılmaz | ✓ |
| Onay belge sürümüne bağlı; talepname/taahhütname yeni sürüme geçerse onay yenilenir | ✓ |
| İmza düzeyleri: çizilmiş imza, hesap onayı, ıslak imzalı nüsha yükleme (içerik imzası kontrollü); nitelikli e-imza entegrasyonu ayrı | ✓ / entegrasyon bekliyor |
| Nesne depolama adaptörü (yerel → S3), üzerine yazma yasak | ✓ |

Testler: `npm test` → 41 birim testi. Uçtan uca tarayıcı senaryoları sepet, belge, onay, yeniden onay, ıslak imza ve başka müşteri erişimini doğrular.

## Faz 3 durumu
| Teslimat | Durum |
|---|---|
| Kaynaklı KRP tablosu (Petkim ABU-TRO-LST-0141 Rev.4, UAB Oluru 2187670'e dayanır): 4 gemi kategorisi × kılavuzluk/römorkör/palamar, 120.000 GT tavanı, çeki gücüne göre standby, 7 artırım/indirim | ✓ statü: Kaynak bulundu |
| Motor: kategori seçimi + gerekçe (kabotaj/liner/gemi tipi), kategori bazlı oran kapsamı (TR bayrak indirimi kabotajda yok), bayram takvimi (Europe/Istanbul, arife 13:00), standby'da yalnız doğrulanmış çeki gücü | ✓ |
| Doğrulama notları: çözülmeyen not varsa sürüm onaylanamaz, hesap üretime geçmez | ✓ |
| Referans test seti: 18 elle hesaplanmış vaka (3'ü kaynak tablo satırı) — veritabanında, sürüm sayfasında canlı koşulur | ✓ 18/18 |
| Tarife iş akışı: Taslak/Kaynak → Uzman incelemesi → Onay → Yürürlük → Kaldırma; görev ayrılığı, dönem çakışma kontrolü, örnek sürümün otomatik kaldırılması | ✓ |
| Endeksle türetme (Yönerge md.5(1)(b), ABD TÜFE; negatifse ücret değişmez; oranlar endekslenmez) | ✓ |
| Taslak düzenleme: iyimser kilit (rev), hücre bazlı denetim kaydı, kaydedilmemiş değişiklik uyarısı | ✓ |
| Sürüm karşılaştırma: değişen hücreler + 7 GT noktasında kategori bazlı tutar matrisi | ✓ |
| Kural kataloğu statü yönetimi (kaynak ve kontrol eden zorunlu) | ✓ |

Testler: `npm test` → 85 birim/referans testi.

**2026–2027 tarifesi için gereken tek veri:** Bakanlık ücret eki ya da DGM'nin duyurduğu ABD TÜFE oranı (AK-15). Oran girilince sistem 2026–2027 taslağını türetir; vakalar eklenir, notlar çözülür, onaylanıp yürürlüğe alınır.

## Önemli kurallar (kodda zorunlu)
- Talep eden taraf otomatik fatura muhatabı değildir (R-018).
- Bilinmeyen GT sıfır kabul edilmez; hesap yalnız **saha doğrulamalı** GT ile yapılır.
- Tahsis edilen römorkör ≠ ücretlendirilen; ilave römorkör kaptanın yazılı talebi ister (R-004).
- Gerçek zaman damgaları yuvarlanmaz; ücretlendirilen süre tarife sürümünden üretilir.
- **ÖRNEK** tarife veya onaysız kurala dayanan hesap üretim tahakkukuna dönüşemez.
- Operasyonun kapanması tahakkuk/fatura/bildirimi tamamlanmış saymaz.

## Kaynak
İşletme bilgileri ve filo: www.yalovapilotaj.com (22.10.2026). Mevzuat dayanakları: `docs/faz0/kural-matrisi.md`.
