"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS: { title: string; items: [string, string, string][] }[] = [
  { title: "Operasyon", items: [["/", "◎", "Kokpit"], ["/operasyonlar", "⚓", "Operasyonlar"], ["/operasyonlar/yeni", "+", "Yeni talep"]] },
  { title: "Kayıtlar", items: [["/gemiler", "▲", "Gemiler"], ["/taraflar", "◇", "Taraflar & tesisler"], ["/filo", "⛴", "Filo"], ["/personel", "●", "Personel"]] },
  { title: "Kural & Tarife", items: [["/katalog", "≡", "Hizmet kataloğu"], ["/tarife", "∑", "Tarife & hesap"], ["/kurallar", "§", "Mevzuat / kurallar"], ["/acik-konular", "!", "Açık konular"]] },
];

export function Nav() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || (href !== "/operasyonlar" && path.startsWith(href)) || (href === "/operasyonlar" && path.startsWith("/operasyonlar/") && path !== "/operasyonlar/yeni") || (href === "/operasyonlar" && path === "/operasyonlar"));
  return (
    <nav aria-label="Ana menü">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="group">{g.title}</div>
          {g.items.map(([href, icon, label]) => (
            <Link key={href} href={href} className={isActive(href) ? "active" : ""}>
              <span aria-hidden style={{ width: 16, textAlign: "center", opacity: 0.8 }}>{icon}</span>{label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
