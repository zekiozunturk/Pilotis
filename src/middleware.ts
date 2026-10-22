import { NextResponse, type NextRequest } from "next/server";
/** Oturum çerezi olmayan istekleri giriş ekranına yönlendirir (asıl doğrulama sunucuda yapılır). */
const PUBLIC = [/^\/giris/, /^\/kayit/, /^\/sifremi-unuttum/, /^\/_next\//, /^\/brand\//, /^\/favicon/, /^\/api\/rapor\/zamanla/, /^\/api\/saglik/];
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (req.cookies.get("pilotis_sid")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Oturum gerekli", { status: 401 });
  const u = req.nextUrl.clone(); u.pathname = "/giris"; u.search = pathname === "/" ? "" : `?sonra=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(u);
}
export const config = { matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|svg|ico|webp|woff2?)$).*)"] };
