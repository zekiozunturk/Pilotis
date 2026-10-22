"use client";
import { useRouter } from "next/navigation";
/** GELİŞTİRME: kendi/ekip kapsamlı rollerde hangi personel olarak görüntülendiğini seçer (canlıda kullanıcı-personel ilişkisinden gelir) */
export function PersonPicker({ persons, current }: { persons: { v: string; l: string }[]; current: string | null }) {
  const router = useRouter();
  return (
    <div className="alert info" style={{ marginBottom: 12 }}>
      <span>ⓘ</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ display: "inline" }}>Geliştirme oturumu:</b> görüntülenen personel
        <select value={current ?? ""} onChange={(e) => { document.cookie = `pilotis_person=${encodeURIComponent(e.target.value)}; path=/; max-age=2592000; samesite=lax`; router.refresh(); }} style={{ maxWidth: 320 }}>
          <option value="">Seçin…</option>{persons.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
        <span className="muted">Canlıda bu bilgi kullanıcı hesabının personel kaydından gelir.</span>
      </div>
    </div>
  );
}
