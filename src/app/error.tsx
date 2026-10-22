"use client";
import { useEffect } from "react";
/** Beklenmeyen hata — kullanıcıya anlaşılır mesaj; ayrıntı sunucu kayıtlarında (özet kimliği ile) */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="alert bad"><span aria-hidden>⛔</span><div><b>Bu sayfa şu anda yüklenemedi</b>Verileriniz değişmedi. Bağlantınızı kontrol edip yeniden deneyin; sorun sürerse sistem yöneticisine aşağıdaki kimliği iletin.</div></div>
      <div className="muted mono" style={{ margin: "10px 0" }}>Hata kimliği: {error.digest ?? "—"}</div>
      <div className="toolbar"><button className="btn" onClick={() => reset()}>Yeniden dene</button><a className="btn secondary" href="/">Kokpite dön</a></div>
    </div>
  );
}
