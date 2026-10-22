# PILOTIS — Faz 0: Mevzuat / Kural Matrisi

Statü akışı: `TASLAK → KAYNAK_BULUNDU → UZMAN_KONTROLUNDE → ONAYLI → YURURLUKTE → YURURLUKTEN_KALKTI`
Etiketler: `MEVZUAT` · `SOZLESME` · `ISLETME_UYGULAMASI` · `ULUSLARARASI_IYI_UYGULAMA`

> Kural, **ONAYLI** veya **YURURLUKTE** statüsüne gelmeden üretim ortamında otomatik tahakkuk üretemez; hesap inceleme kuyruğuna düşer.

| Kod | Kural | Etiket | Dayanak (aday) | Statü | Etkilenen modül |
|-----|-------|--------|----------------|-------|-----------------|
| R-001 | Hizmet başlangıcı hizmet türüne göre ayrı olaydır (kılavuz gemiye çıkış / römorkör bordaya geliş / palamar başlangıcı) | MEVZUAT | KRP Yönergesi md. 5 (19.09.2024 kopyası) | KAYNAK_BULUNDU | Saha, Hesap |
| R-002 | Yarım ücret: başlamış hizmetin gemi/tesis kaynaklı tamamlanamaması; her iptale uygulanmaz | MEVZUAT | KRP Yönergesi md. 6 | KAYNAK_BULUNDU | Hesap, İptal |
| R-003 | Gemi/tesis kaynaklı aksamada ayrıca bekleme ücreti alınmaz | MEVZUAT | KRP Yönergesi md. 6 | KAYNAK_BULUNDU | Hesap |
| R-004 | İlave römorkör ancak kaptanın yazılı talebiyle ücretlendirilir | MEVZUAT | KRP Yönergesi | KAYNAK_BULUNDU | Hesap, Belge |
| R-005 | Artırım/indirimde en yüksek oranlar esas; birlikte uygulamada oran farkı | MEVZUAT | KRP Yönergesi | KAYNAK_BULUNDU | Hesap motoru |
| R-006 | Makinesiz çekilme %50 artırımı yalnız römorkörcülüğe uygulanır | MEVZUAT | KRP Yönergesi | KAYNAK_BULUNDU | Hesap motoru |
| R-007 | Tamamlanmadan itibaren en geç 48 saatte idare sistemine veri girişi | MEVZUAT | KRP Yönergesi | KAYNAK_BULUNDU | LYBS bildirim |
| R-008 | Hava muhalefetinde başlamadan iptal ≠ hava nedeniyle fiilî yer değiştirme | MEVZUAT | KRP Yönergesi md. 5–6 | KAYNAK_BULUNDU | İptal, Hesap |
| R-009 | Ücret tablosu sürümü hizmet tarihine göre seçilir (2026-02-01 – 2027-01-31) | MEVZUAT | UAB DGM KRP ücret tablosu | KAYNAK_BULUNDU | Tarife |
| R-010 | Kıyı Emniyeti tarifesi ayrı tarife ailesi (16.09.2026 metni) | MEVZUAT | KEGM tarife sayfası | TASLAK | Tarife |
| R-011 | Olağan talepler en az 6 saat önce bildirilir | ISLETME_UYGULAMASI | Doğrulanacak | TASLAK | Talep portalı |
| R-012 | Bakım-onarım indirimi; yük elleçleme varsa etkisi | MEVZUAT | Doğrulanacak | TASLAK | Hesap |
| R-013 | Belirli tonaj tankerlerde asgari römorkör sayısı | MEVZUAT | Liman Yönetmeliği / yerel talimat | TASLAK | Römorkör karar motoru |
| R-014 | Gas-free / boş tanker / yük kalıntısı etkisi | MEVZUAT | Doğrulanacak | TASLAK | Beyan, Hesap |
| R-015 | Saat kesri yuvarlama (ör. 1s01dk → 2 saat ücret) ve LYBS'ye yansıması | MEVZUAT | Ücret tablosu + LYBS alan tanımı | TASLAK | Süre, Bildirim |
| R-016 | Ekrana çizilen imza güvenli e-imza sayılmaz | MEVZUAT | 5070 s. Kanun / BTK SSS | ONAYLI | Belge/İmza |
| R-017 | Kan grubu sağlık verisidir; sınırlı erişim | MEVZUAT | KVKK md. 6, Kurul kararı 2022/1357 | ONAYLI | Personel, Yetki |
| R-018 | Talep eden taraf otomatik fatura muhatabı değildir | ISLETME_UYGULAMASI | Şartname §3 | ONAYLI | Taraflar, Talep |
| R-019 | Tahsis edilen römorkör sayısı ≠ ücretlendirilebilir römorkör sayısı | ISLETME_UYGULAMASI | Şartname §9 + R-004 | ONAYLI | Planlama, Hesap |
| R-020 | Dinlenme kontrolü kayan zaman penceresiyle yapılır | ULUSLARARASI_IYI_UYGULAMA | STCW A-VIII/1, ILO MLC (uygulanabilirlik doğrulanacak) | UZMAN_KONTROLUNDE | Personel, Planlama |

Her kural kaydında ayrıca tutulur: yayımlayan kurum, belge no, resmî URL + arşiv nüshası hash'i, yayım/yürürlük/kalkış tarihleri, madde/bent/tablo no, uygulama koşulları, önceki/sonraki sürüm, kontrol eden + tarih, bağlı test senaryoları (bkz. `prisma/schema.prisma` → `RegulationSource`, `BusinessRule`).
