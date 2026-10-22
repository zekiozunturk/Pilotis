# PILOTIS — Faz 0: Veri Sözlüğü (çekirdek varlıklar)

Kaynak gerçek şema: `prisma/schema.prisma`. Aşağıda iş anlamı özetlenir.

| Varlık | Anlamı | Kritik kurallar |
|--------|--------|-----------------|
| **Party** | Tüzel/gerçek kişi veya kurum (acente, donatan, tersane, Kıyı Emniyeti, Liman Başkanlığı…) | VKN/TCKN tekil; aynı taraf birden fazla rol alabilir |
| **PartyRole** | Tarafın üstlendiği rol + geçerlilik aralığı | Rol tarih aralıklı; "devlet" tek rolde birleştirilmez |
| **Facility** | Tersane, rıhtım, demir yeri, pilot noktası | Koordinat kaynağı ve doğrulanma statüsü tutulur |
| **Vessel** | Gemi kartı (IMO, MMSI, GT, NT, DWT, LOA…) | Bilinmeyen değer `null`, asla 0; GT/GRT/DWT ayrı alan |
| **PortCall** | Bir geminin her gelişi (liman uğrağı) | Altında N iş emri |
| **Operation** | Tekil operasyon kimliği `OP-YYYY-NNNNNN` | Talep, beyan, plan, olay, hesap, belge, bildirim buna bağlı |
| **ServiceRequest** | Talepname, sürümlü | Beyan / saha doğrulaması / onaylı son durum ayrı sürüm |
| **ServiceLine** | Operasyonun ücretlendirilebilir bileşeni (kılavuzluk, römorkör, palamar) | Tahsisli araç ≠ ücretlendirilebilir araç |
| **TimelineEvent** | Saha olayı (gemiye çıkış, bordaya geliş, başlangıç, bitiş, duraklama) | Değişmez; düzeltme yeni olayla yapılır |
| **TariffFamily / TariffVersion / TariffRate** | Sürümlü tarife | Hizmet tarihine göre sürüm seçimi; `Decimal` |
| **CalculationResult** | Açıklanabilir hesap çıktısı | Uygulanan + uygulanmayan kurallar ve gerekçeleri, girdi hash'i |
| **Accrual** | Faturaya esas tahakkuk | Teklif ≠ onaylı tahakkuk ≠ iş sonu; fark neden kodlu |
| **Vessel(Fleet)Asset** | Römorkör, pilot botu, palamar botu, temizleme teknesi | Sayı sabit kodlanmaz |
| **Personnel** | Personel kartı | Kan grubu ayrı, kısıtlı alan (KVKK) |
| **BusinessRule / RegulationSource** | Mevzuat/kural kataloğu | Statü ve etiket zorunlu |
| **OpenIssue** | Açık konular | Sorumlu, belge, tarih, modül |
| **AuditLog** | Denetim kaydı | Kim, ne, ne zaman, eski/yeni değer |

## Kimlik biçimleri

- Operasyon: `OP-2026-000123`
- Dosya: `ROMORKOR_GEMI_20261022T143000_000123.jpg`, `TALEPNAME_GEMI_20261022_OP000456_V02.pdf`
- Zamanlar UTC saklanır, ekranda Europe/Istanbul gösterilir.
