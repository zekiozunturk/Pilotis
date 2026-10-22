import { AuthShell } from "@/components/AuthShell";
import { RequestForm } from "./form";
export const metadata = { title: "Şifremi unuttum" };
export const dynamic = "force-dynamic";
export default function Page() {
  return <AuthShell title="Şifremi unuttum" lead="Kullanıcı adınızı veya e-posta adresinizi yazın; şifre sıfırlama bağlantısı kayıtlı e-postanıza gönderilir."><RequestForm /></AuthShell>;
}
