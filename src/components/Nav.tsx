"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = [string, string, string];
const ALL: { title: string; items: Item[] }[] = [
  { title: "Operasyon", items: [["/", "◎", "Kokpit"], ["/saha", "⚑", "Görevlerim"], ["/operasyonlar", "⚓", "Operasyonlar"], ["/operasyonlar/yeni", "+", "Yeni talep (masa)"], ["/portal", "▣", "Müşteri portalı"], ["/planlama", "▦", "Planlama"], ["/planlama/rotasyon", "↻", "Ekip rotasyonu"]] },
  { title: "Finans", items: [["/muhasebe", "₺", "Muhasebe masası"]] },
  { title: "Analiz", items: [["/analiz", "◔", "Performans & analiz"]] },
  { title: "Kayıtlar", items: [["/gemiler", "▲", "Gemiler"], ["/taraflar", "◇", "Taraflar & tesisler"], ["/filo", "⛴", "Filo"], ["/personel", "●", "Personel"]] },
  { title: "Kural & Tarife", items: [["/katalog", "≡", "Hizmet kataloğu"], ["/tarife", "∑", "Tarife & fiyat listesi"], ["/kurlar", "¤", "Döviz kurları"], ["/kurallar", "§", "Mevzuat / kurallar"], ["/acik-konular", "!", "Açık konular"]] },
  { title: "Sistem", items: [["/yonetim", "⚿", "Sistem yönetimi"], ["/yonetim/kullanicilar", "☺", "Kullanıcılar"], ["/yonetim/bildirimler", "✉", "E-posta ve SMS"], ["/terminoloji", "Aa", "Terminoloji"], ["/aktarim", "⇅", "Excel aktarım"], ["/ayarlar", "⚙", "Ayarlar"], ["/hesabim", "◉", "Hesabım"]] },
];
const FIELD = ["/saha", "/operasyonlar", "/planlama/rotasyon", "/analiz", "/filo", "/terminoloji", "/hesabim"];
/** Rolün menüde gördüğü sayfalar (yetki ayrıca sunucuda denetlenir) */
const ROLE_NAV: Record<string, string[] | "ALL"> = {
  SYSTEM_ADMIN: "ALL",
  BUSINESS_MANAGER: ["/", "/operasyonlar", "/operasyonlar/yeni", "/portal", "/planlama", "/planlama/rotasyon", "/muhasebe", "/analiz", "/gemiler", "/taraflar", "/filo", "/personel", "/katalog", "/tarife", "/kurlar", "/kurallar", "/acik-konular", "/terminoloji", "/aktarim", "/ayarlar", "/hesabim"],
  OPERATIONS_MANAGER: ["/", "/operasyonlar", "/operasyonlar/yeni", "/portal", "/planlama", "/planlama/rotasyon", "/analiz", "/gemiler", "/taraflar", "/filo", "/personel", "/katalog", "/tarife", "/kurlar", "/kurallar", "/acik-konular", "/terminoloji", "/aktarim", "/ayarlar", "/hesabim"],
  PLANNER: ["/", "/operasyonlar", "/operasyonlar/yeni", "/planlama", "/planlama/rotasyon", "/analiz", "/gemiler", "/filo", "/personel", "/terminoloji", "/aktarim", "/hesabim"],
  SHORE_OPS: ["/", "/saha", "/operasyonlar", "/operasyonlar/yeni", "/portal", "/planlama", "/gemiler", "/taraflar", "/filo", "/terminoloji", "/aktarim", "/hesabim"],
  PILOT: FIELD, TUG_MASTER: FIELD, CREW: FIELD,
  ACCOUNTING: ["/", "/muhasebe", "/operasyonlar", "/analiz", "/taraflar", "/tarife", "/kurlar", "/terminoloji", "/aktarim", "/hesabim"],
  TARIFF_OFFICER: ["/", "/operasyonlar", "/katalog", "/tarife", "/kurlar", "/kurallar", "/acik-konular", "/terminoloji", "/aktarim", "/hesabim"],
  AUDITOR: ["/", "/operasyonlar", "/muhasebe", "/analiz", "/tarife", "/kurlar", "/kurallar", "/terminoloji", "/hesabim"],
};
const GROUPS = ALL;
const navFor = (role: string) => { const allow = ROLE_NAV[role] ?? ["/", "/operasyonlar", "/hesabim"]; return ALL.map((g) => ({ ...g, items: g.items.filter(([h]) => allow === "ALL" || allow.includes(h)) })).filter((g) => g.items.length); };

const EXTERNAL_NAV = [{ title: "Müşteri", items: [["/portal", "▣", "Talep oluştur"], ["/portal/belgeler", "✎", "Sözleşme ve onaylar"], ["/operasyonlar", "⚓", "Taleplerim"], ["/portal/gemilerim", "▲", "Gemilerim"], ["/portal/firmam", "◇", "Firma bilgilerim"], ["/hesabim", "◉", "Hesabım"]] as Item[] }];

export function Nav({ external = false, role = "OPERATIONS_MANAGER" }: { external?: boolean; role?: string }) {
  const path = usePathname();
  const groups = external ? EXTERNAL_NAV : navFor(role);
  void GROUPS;
  // en uzun eşleşen menü öğesi etkin sayılır (ör. /portal/belgeler açıkken /portal etkin değil)
  const hrefs = groups.flatMap((g) => g.items.map(([h]) => h));
  const best = hrefs.filter((h) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"))).sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === best;
  return (
    <nav aria-label="Ana menü" id="ana-menu">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="group">{g.title}</div>
          {g.items.map(([href, icon, label]) => (
            <Link key={href} href={href} className={isActive(href) ? "active" : ""} title={label}>
              <span aria-hidden style={{ width: 16, textAlign: "center", opacity: 0.8 }}>{icon}</span><span className="lbl">{label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
