/**
 * Yunus asistanın bilgi tabanı: sayfa açıklamaları ve sık sorulan konular.
 * Hem tarayıcıda (sayfa ipucu) hem sunucuda (soru yanıtlama) kullanılır.
 */
export interface PageHelp { path: string; title: string; text: string; tips?: string[] }
export interface Faq { id: string; q: string; keys: string[]; a: string; link?: string }

/** En uzun eşleşen yol kullanılır */
export const PAGE_HELP: PageHelp[] = [
  { path: "/", title: "Kokpit", text: "Günün özeti burada: bekleyen talepler, sahadaki işler, onay ve tahakkuk bekleyenler. Harita kokpitini seçtiyseniz üstte bölgedeki gemi trafiği ve filomuzun canlı konumu görünür.", tips: ["Kırmızı bayrak görevdeki aracı, beyaz bayrak boştaki aracı gösterir.", "Araca tıklayınca görevi, kaptanı ve ekibi açılır.", "Ana sayfa görünümünü Ayarlar'dan değiştirebilirsiniz."] },
  { path: "/saha", title: "Görevlerim", text: "Vardiyanız, aracınız ve size atanmış işler. Saha olaylarını (yola çıkış, gemiye çıkış, yanaşma, bitiş) buradan işaretlersiniz.", tips: ["Konumumu paylaş kartından aracın konumunu haritaya iletebilirsiniz.", "Konum yalnız siz paylaştığınızda ve sayfa açıkken alınır."] },
  { path: "/operasyonlar", title: "Operasyonlar", text: "Tüm talepler ve iş emirleri. Duruma, gemiye, müşteriye göre süzebilir; bir işe tıklayıp ayrıntısını, zaman çizelgesini ve hesaplamasını görebilirsiniz.", tips: ["Yeni talepler önce Yalova Pilotaj onayından geçer.", "Fatura muhatabı farklıysa muhatap onayı da beklenir."] },
  { path: "/operasyonlar/yeni", title: "Yeni talep (masa)", text: "Telefonla veya e-postayla gelen talebi masadan girersiniz. Gemi, hizmet tipi, tesis ve planlanan saat seçilir; fiyat otomatik hesaplanır." },
  { path: "/portal", title: "Müşteri portalı", text: "Müşteri gemisini seçer, hizmeti sepete ekler, otomatik fiyatı görür ve talebi Yalova Pilotaj onayına gönderir.", tips: ["İstenen saat en az 6 saat sonrası olmalıdır.", "İlk talepte hizmet sözleşmesi, beyan ve taahhütname dijital olarak onaylanır.", "Fiyatlar TL'dir; döviz gösterimi bilgi amaçlıdır."] },
  { path: "/portal/belgeler", title: "Sözleşme ve onaylar", text: "Firmanızın onayladığı hizmet sözleşmesi, KVKK metni ve beyan/taahhütnameler; fatura muhatabı olarak onayınızı bekleyen işler." },
  { path: "/portal/gemilerim", title: "Gemilerim", text: "Firmanıza kayıtlı gemiler. IMO numarası, GT ve tip bilgileri fiyat hesabında kullanılır." },
  { path: "/portal/firmam", title: "Firma bilgilerim", text: "Cari bilgileriniz ve firmanızın kullanıcıları. Yetkili kişi yeni kullanıcı davet edebilir." },
  { path: "/planlama", title: "Planlama", text: "Vardiyalar, araç ve personel ataması. Gece çalışması ve dinlenme kuralları otomatik denetlenir; ekip önerisi kurallara uygun kişileri sıralar." },
  { path: "/planlama/rotasyon", title: "Ekip rotasyonu", text: "Kaptan ve mürettebatın vardiya döngüsü. Rotasyon kuralları dinlenme süresini korur." },
  { path: "/muhasebe", title: "Muhasebe masası", text: "Tamamlanan işlerin tahakkuku, faturalar ve tahsilat eşleştirmesi. Faturalar TL kesilir; döviz kalemleri iş bitiş günü TCMB döviz satış kuruyla çevrilir." },
  { path: "/analiz", title: "Performans ve analiz", text: "İş sayıları, süreler, araç kullanım oranı, gelir ve personel performansı. Rapor tasarımcısıyla kendi raporunuzu oluşturabilirsiniz." },
  { path: "/gemiler", title: "Gemiler", text: "Hizmet verilen tüm gemiler. GT ve tip, tarife kategorisini belirler." },
  { path: "/taraflar", title: "Taraflar ve tesisler", text: "Müşteri, acente, armatör carileri ve tersane/iskele tesisleri." },
  { path: "/filo", title: "Filo", text: "Römorkörler (Römork-1…7), kılavuz ve palamar botları; teknik özellikler, bakım ve arıza kayıtları." },
  { path: "/personel", title: "Personel", text: "Kaptan, mürettebat ve kıyı personeli; belgeleri ve vardiya geçmişi." },
  { path: "/katalog", title: "Hizmet kataloğu", text: "Kılavuzluk, römorkaj, palamar gibi hizmet tipleri ve hangi hizmet kalemlerinden oluştukları." },
  { path: "/tarife", title: "Tarife ve fiyat listesi", text: "Sürümlü tarife ve kodlu fiyat listesi. Kalemler 200.001 gibi kodlarla tanımlanır; formül yazılabilir (ör. bir kalemin %30'u). Yeni sürüm onaydan geçmeden yürürlüğe girmez." },
  { path: "/kurlar", title: "Döviz kurları", text: "TCMB döviz satış kurları. İş bitiş günü kuru kullanılır; hafta sonunda biten iş için cuma 15:30 bülteni geçerlidir." },
  { path: "/kurallar", title: "Mevzuat ve kurallar", text: "Tarifeye ve operasyona etki eden mevzuat maddeleri ve işletme kararları." },
  { path: "/acik-konular", title: "Açık konular", text: "İşletmeden karar bekleyen konular. Karar verilene kadar sistem güvenli varsayımla çalışır." },
  { path: "/yonetim", title: "Sistem yönetimi", text: "Kullanıcılar, müşteri kayıt onayları, güvenlik olayları ve sistem durumu." },
  { path: "/yonetim/kullanicilar", title: "Kullanıcılar", text: "Kullanıcı oluşturma, rol verme, kilit açma, şifre sıfırlama ve oturum kapatma." },
  { path: "/yonetim/oturumlar", title: "Oturum kayıtları", text: "Kim ne zaman girdi, ne kadar kaldı, hangi sayfalara baktı, hatalı giriş denemeleri. Aktif süre yalnız sekme açık ve görünürken sayılır." },
  { path: "/yonetim/bildirimler", title: "E-posta ve SMS", text: "Giden e-posta ve SMS kuyruğu. SMTP veya SMS sağlayıcısı tanımlı değilse iletiler bekler; tanımlanınca yeniden gönderilebilir." },
  { path: "/terminoloji", title: "Terminoloji", text: "Denizcilik ve tarife terimleri sözlüğü. Ekranlarda küçük numaralı terimlere tıklayınca açıklaması gelir." },
  { path: "/aktarim", title: "Excel aktarım", text: "Gemi, cari, personel gibi kayıtları Excel'den içe aktarın veya dışa alın. İçe aktarım önizleme ve onaydan geçer, geri alınabilir." },
  { path: "/ayarlar", title: "Ayarlar", text: "Ana sayfa görünümü, tema, kur tipi ve işletme ayarları." },
  { path: "/hesabim", title: "Hesabım", text: "Şifre değişimi, bildirim tercihleri (e-posta/SMS) ve açık oturumlarınız." },
  { path: "/bildirimler", title: "Bildirimler", text: "Size gelen tüm sistem bildirimleri. Okunmamışlar üst çubuktaki zilde sayılır." },
];

export function helpFor(path: string): PageHelp | null {
  const m = PAGE_HELP.filter((p) => (p.path === "/" ? path === "/" : path === p.path || path.startsWith(p.path + "/"))).sort((a, b) => b.path.length - a.path.length)[0];
  return m ?? null;
}
export const pageTitle = (path: string) => (/^\/operasyonlar\/(?!yeni)[^/]+/.test(path) ? `İş emri ${path.split("/")[2]}` : helpFor(path)?.title ?? path);

export const FAQ: Faq[] = [
  { id: "alti-saat", q: "Talep en az kaç saat önce verilmeli?", keys: ["6", "saat", "erken", "kural", "süre", "önce", "talep", "zaman"], a: "Portaldan verilen taleplerde istenen saat en az 6 saat sonrası olmalıdır. Daha yakın bir saat seçilirse sistem uyarı verir ve talebi göndermez; acil işler için Yalova Pilotaj'ı telefonla arayın. Süre Ayarlar'dan değiştirilebilir." },
  { id: "kur", q: "Hangi döviz kuru kullanılıyor?", keys: ["kur", "döviz", "usd", "eur", "dolar", "euro", "tcmb", "çevir"], a: "Faturalar TL kesilir. Döviz kalemleri işin bittiği günün TCMB döviz satış kuruyla TL'ye çevrilir. İş hafta sonu bittiyse cuma günü 15:30 bülteni kullanılır. Üst çubuktaki USD/EUR gösterimi yalnız bilgi amaçlıdır.", link: "/kurlar" },
  { id: "onay", q: "Müşterinin açtığı işi kim onaylıyor?", keys: ["onay", "onaylıyor", "kim", "karar", "kabul", "red", "muhatap"], a: "Önce fatura muhatabı farklı bir firmaysa o firma işi onaylar. Ardından Yalova Pilotaj adına operasyon müdürü, işletme müdürü, kıyı operasyon sorumlusu veya planlamacı talebi kabul eder, eksik bilgi ister ya da reddeder. Müşteri sonucu bildirim olarak alır." },
  { id: "bayrak", q: "Haritadaki bayraklar ne anlama geliyor?", keys: ["bayrak", "kırmızı", "beyaz", "harita", "konum", "araç"], a: "Filo haritasında kırmızı dalgalanan bayrak aracın görevde olduğunu, beyaz bayrak boşta olduğunu gösterir. Araca tıklayınca görevi, kaptanı, ekibi ve vardiya bitişi görünür.", link: "/" },
  { id: "konum", q: "Kaptan konumunu nasıl paylaşır?", keys: ["konum", "paylaş", "gps", "izin", "kaptan", "ilet"], a: "Kaptan Görevlerim sayfasındaki 'Konumumu paylaş' kartında aracı seçip 'Konumu güncelle ve ilet'e basar; tarayıcı konum izni ister. 'Görev boyunca otomatik paylaş' açılırsa sayfa açık kaldıkça konum iletilir. Konum yalnız HTTPS bağlantıda alınabilir.", link: "/saha#konum" },
  { id: "fiyat", q: "Fiyat nasıl hesaplanıyor?", keys: ["fiyat", "hesap", "tarife", "ücret", "gt", "tutar", "kaç para"], a: "Fiyat, yürürlükteki tarife sürümünden geminin GT'sine ve hizmet tipine göre otomatik hesaplanır. Bekleme, bayram, gece gibi ek kalemler kurallara göre eklenir. Fiyat listesi kalemleri kodludur ve formül içerebilir.", link: "/tarife" },
  { id: "sozlesme", q: "Sözleşme ve taahhütname nasıl onaylanır?", keys: ["sözleşme", "taahhüt", "beyan", "imza", "kvkk", "belge"], a: "Müşteri ilk talebinde hizmet sözleşmesini ve KVKK metnini dijital olarak onaylar; her talepte geminin beyanını ve taahhütnameyi imzalar. Onaylanan metnin özeti saklanır, böylece hangi sürümün onaylandığı kanıtlanabilir.", link: "/portal/belgeler" },
  { id: "sifre", q: "Şifremi unuttum, ne yapmalıyım?", keys: ["şifre", "unuttum", "parola", "sıfırla", "giriş"], a: "Giriş ekranındaki 'Şifremi unuttum' bağlantısından kullanıcı adınızı veya e-postanızı yazın; 30 dakika geçerli bir sıfırlama bağlantısı gelir. Geçici şifreyle girdiyseniz önce şifrenizi değiştirmeniz istenir." },
  { id: "bildirim", q: "Bildirimleri e-posta veya SMS ile alabilir miyim?", keys: ["bildirim", "e-posta", "eposta", "mail", "sms", "mesaj", "zil"], a: "Evet. Hesabım sayfasından e-posta ve SMS tercihlerinizi seçebilirsiniz. Sistem içi bildirimler üst çubuktaki zilde görünür. Görev başlayınca ve bitince yöneticilere sesli bildirim de yapılır.", link: "/hesabim" },
  { id: "sesli", q: "Sesli görev bildirimi nasıl çalışıyor?", keys: ["ses", "sesli", "zil", "anons", "başladı", "bitti", "görev"], a: "Bir görev başladığında yöneticilere ve sistem yöneticisine sağ altta ben çıkarım, bir kez gemi zili çalar ve görevi sesli okurum. Görev bitince zil art arda üç kez çalar. Tarayıcılar sesi ancak sayfaya bir kez tıklandıktan sonra açar; sesi menümden kapatabilirsiniz." },
  { id: "oturum", q: "Kim ne zaman giriş yaptı, nereden görürüm?", keys: ["oturum", "log", "kayıt", "giriş", "kim", "süre", "durmuş"], a: "Sistem yöneticisi Sistem yönetimi → Oturum kayıtları ekranından her girişi, çıkışı, aktif süreyi, bakılan sayfaları ve hatalı denemeleri görebilir.", link: "/yonetim/oturumlar" },
  { id: "kullanici", q: "Firmama yeni kullanıcı nasıl eklerim?", keys: ["kullanıcı", "ekle", "davet", "firma", "çalışan"], a: "Firma yetkilisi Firma bilgilerim sayfasından e-posta adresiyle kullanıcı davet eder. Davet edilen kişiye 72 saat geçerli bir etkinleştirme bağlantısı gider; şifresini kendisi belirler.", link: "/portal/firmam" },
  { id: "excel", q: "Excel'den veri aktarabilir miyim?", keys: ["excel", "aktar", "içe", "dışa", "xlsx", "toplu"], a: "Evet. Excel aktarım ekranında şablonu indirip doldurun, yükleyin; sistem önizleme ve hata kontrolü yapar, onaydan sonra kaydeder. Gerekirse aktarım geri alınabilir.", link: "/aktarim" },
  { id: "tema", q: "Ekran görünümünü nasıl değiştiririm?", keys: ["tema", "renk", "görünüm", "karanlık", "ana sayfa", "harita kokpiti"], a: "Ayarlar'dan ana sayfa görünümünü (klasik veya harita kokpiti) seçebilir, Tema Stüdyosu'ndan renk temasını değiştirebilirsiniz.", link: "/ayarlar" },
];

export const YUNUS_INTRO = "Merhaba, ben Yunus! PILOTIS'te size yol gösteririm. Ekranlar, kurallar, tarifeler veya terimler hakkında sorabilirsiniz.";
