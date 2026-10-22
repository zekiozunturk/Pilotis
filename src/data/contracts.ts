/**
 * Dijital kabul metinleri — ÖRNEK taslaklar. Hukuk incelemesi (açık konu R-029 / R-030) tamamlanmadan bağlayıcı kabul edilmez;
 * yayınlanan sürüm değiştirilmez, yeni sürüm yayınlandığında müşteriden yeniden kabul istenir.
 * Metin biçimi: "## " başlık, boş satır paragraf, "- " madde.
 */
import { OPERATOR } from "./catalog";

export const CONTRACT_CODES = {
  HIZMET_SOZLESMESI: "Hizmet sözleşmesi (çerçeve)",
  ODEME_TAAHHUDU: "Ödeme ve fatura muhatabı taahhütnamesi",
  BEYAN_TAAHHUDU: "Gemi ve yük beyannamesi taahhüdü",
  KVKK_AYDINLATMA: "KVKK aydınlatma metni",
} as const;
export type ContractCode = keyof typeof CONTRACT_CODES;

/** Müşterinin talep gönderebilmesi için yürürlükteki sürümünü kabul etmiş olması gereken metinler (firma bazında, bir kez) */
export const REQUIRED_FOR_REQUESTS: ContractCode[] = ["HIZMET_SOZLESMESI", "ODEME_TAAHHUDU"];

export const CONTRACT_SEED: { code: ContractCode; title: string; body: string }[] = [
  {
    code: "HIZMET_SOZLESMESI", title: "Kılavuzluk, Römorkörcülük ve Palamar Hizmetleri Çerçeve Sözleşmesi",
    body: `## 1. Taraflar
Bu sözleşme, ${OPERATOR.legalName} ("Hizmet Veren") ile portal üzerinden kayıt olan ve bu metni yetkili temsilcisi aracılığıyla elektronik ortamda kabul eden firma ("Müşteri") arasında kurulur.

## 2. Konu ve kapsam
Hizmet Veren, Müşterinin portal veya yazılı kanal üzerinden ilettiği ve Hizmet Verence kabul edilen her talep için kılavuzluk, römorkörcülük, palamar bağlama/çözme ve bunlara bağlı hizmetleri verir. Her talep ayrı bir iş emri numarasıyla izlenir.
- Portalda gösterilen bedeller tahminidir; bağlayıcı bedel, hizmet tarihinde yürürlükteki tarife sürümü ve gerçekleşen operasyon kayıtlarıyla hesaplanır.
- Römorkör sayısı ve hizmetin icrası, liman başkanlığı talimatları ve Hizmet Verenin emniyet değerlendirmesiyle kesinleşir.
- Emniyet römorkörü gibi tarife dışı özel hizmetler ayrıca fiyatlandırılır.

## 3. Talep ve bildirim süresi
Olağan talepler, istenen hizmet zamanından en az 6 (altı) saat önce iletilir. Daha kısa süreli talepler portaldan alınmaz; acil durumlarda Hizmet Veren operasyon hattı aranır ve talep sonradan kayda alınır.

## 4. Beyan yükümlülüğü
Müşteri; gemi adı, IMO numarası, gros tonaj (GT), makine durumu, yük durumu ve tehlikeli yük bilgilerini doğru ve eksiksiz beyan eder. Beyan ile saha tespiti arasındaki farklar fiyatlamaya yansıtılır; yanlış beyandan doğan zarardan Müşteri sorumludur.

## 5. Bedel, fatura ve ödeme
Faturalar Türk Lirası (TL) olarak kesilir. Döviz cinsinden tarife kalemleri, işin tamamlandığı gün TCMB döviz satış kuru ile TL'ye çevrilir; hafta sonu tamamlanan işlerde önceki cuma günü 15:30 bülteni esas alınır. Fatura muhatabı ayrıca belirtilmemişse talebi gönderen firma fatura muhatabı sayılmaz; muhatabın onayı ayrıca alınır.

## 6. İptal ve bekleme
Hizmet başlamadan önce yapılan iptaller, gemi tarafından kaynaklanan beklemeler ve yarım kalan operasyonlar yürürlükteki tarifenin ilgili hükümlerine göre ücretlendirilir.

## 7. Sorumluluk
Kılavuz kaptan geminin kaptanına danışmanlık yapar; geminin sevk ve idaresinden geminin kaptanı sorumludur. Taraflar, ilgili mevzuat ve uluslararası denizcilik teamülleri çerçevesinde sorumludur.

## 8. Elektronik kabul ve kayıt
Bu metin portalda elektronik ortamda kabul edilir. Kabul eden kişinin adı, unvanı, kabul zamanı, cihaz bilgisi ve kabul edilen metnin özeti (sha256) değiştirilemez biçimde kaydedilir. Metnin yeni sürümü yayınlandığında yeni talepler için yeniden kabul istenir.

## 9. Yürürlük
Sözleşme kabul tarihinde yürürlüğe girer ve taraflardan biri yazılı olarak feshedene kadar yürürlükte kalır. Uyuşmazlıklarda Yalova mahkemeleri ve icra daireleri yetkilidir.`,
  },
  {
    code: "ODEME_TAAHHUDU", title: "Ödeme ve Fatura Muhatabı Taahhütnamesi",
    body: `## Taahhüt
Firmamız adına portal üzerinden iletilen ve fatura muhatabı olarak firmamızın seçildiği talepler için ${OPERATOR.legalName} tarafından kesilecek faturaların vadesinde ödeneceğini taahhüt ederiz.

- Fatura muhatabı olarak başka bir firma seçildiğinde, o firmanın ayrıca onay vermesi gerekir; onay verilmeden iş planlamaya alınmaz.
- Vergi kimlik numarası, vergi dairesi ve fatura adresimizin doğru olduğunu, değişiklikleri derhal bildireceğimizi beyan ederiz.
- Faturalar TL kesilir; ödemeler TL olarak yapılır.
- Bu taahhüt, iş bazında verilecek talepname/taahhütname onaylarını ortadan kaldırmaz; her iş için onay, o işin belge sürümüne bağlanır.`,
  },
  {
    code: "BEYAN_TAAHHUDU", title: "Gemi ve Yük Beyannamesi Taahhüdü",
    body: `## Beyan
Bu talepte yer alan gemi bilgilerinin (gemi adı, IMO, GT, makine durumu) ve yük bilgilerinin (yük durumu, tehlikeli yük sınıfı ve UN numarası, gaz serbest belgesi) gemi belgelerine uygun, doğru ve eksiksiz olduğunu beyan ederim.

- Beyan ile saha tespiti arasında fark çıkarsa bedel tespit edilen değerle yeniden hesaplanır.
- Tehlikeli yük bilgisinin eksik veya yanlış beyan edilmesinden doğacak her türlü sorumluluk beyan edene aittir.
- Beyan değişirse talep yeniden onaya düşer.`,
  },
  {
    code: "KVKK_AYDINLATMA", title: "Kişisel Verilerin Korunması — Aydınlatma Metni",
    body: `## Veri sorumlusu
${OPERATOR.legalName}, ${OPERATOR.address}.

## İşlenen veriler ve amaç
Portal hesabı için ad soyad, unvan, iş e-postası ve iş telefonu; hizmet talebinin alınması, sözleşmenin kurulması ve ifası, faturalandırma ve yasal yükümlülüklerin yerine getirilmesi amaçlarıyla işlenir.

## Hukuki sebep
6698 sayılı Kanun md. 5/2-c (sözleşmenin kurulması/ifası), 5/2-ç (hukuki yükümlülük) ve 5/2-f (meşru menfaat).

## Haklarınız
Kanunun 11. maddesindeki haklarınız için ${OPERATOR.email} adresine başvurabilirsiniz.`,
  },
];
