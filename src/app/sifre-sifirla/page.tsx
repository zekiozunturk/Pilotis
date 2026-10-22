import { AuthShell } from "@/components/AuthShell";
import { ResetForm } from "../sifremi-unuttum/form";
export const metadata = { title: "Şifre sıfırla" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <AuthShell title="Yeni şifre belirle" lead="Bağlantı 30 dakika geçerlidir ve bir kez kullanılabilir.">{t ? <ResetForm token={t} /> : <div className="alert bad"><span>✕</span><div>Bağlantı eksik. <a href="/sifremi-unuttum">Yeni bağlantı isteyin</a>.</div></div>}</AuthShell>;
}
