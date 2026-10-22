import Link from "next/link";
export default function NotFound() { return <div className="card"><h1>Kayıt bulunamadı</h1><p className="muted">Aradığınız operasyon veya sayfa yok ya da erişim yetkiniz bulunmuyor.</p><Link className="btn" href="/">Kokpite dön</Link></div>; }
