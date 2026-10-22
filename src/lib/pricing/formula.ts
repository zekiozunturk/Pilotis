/**
 * Fiyat listesi formül dili — güvenli (eval yok), deterministik (Decimal).
 *
 *   [200.001]            başka bir kalemin birim fiyatı (bu kalemin para birimine çevrilir)
 *   %30  veya  30%       0,30
 *   + - * / ( )          aritmetik
 *   > < >= <= = <>       karşılaştırma (EGER içinde)
 *   ;  (veya ,)          argüman ayırıcı — ondalık ayırıcı NOKTA'dır: 12.5
 *   Değişkenler: GT, GT_TAVAN, BLOK, CEKI, SAAT, ROMORKOR
 *   Fonksiyonlar: MIN, MAX, YUVARLA(x;n), YUKARIYUVARLA(x), ASAGIYUVARLA(x), MUTLAK(x),
 *                 EGER(koşul; doğruysa; yanlışsa), KADEME(x; e1; d1; e2; d2; …)
 *                 (İngilizce eşdeğerleri de geçerlidir: ROUND, CEIL, FLOOR, ABS, IF, STEP)
 */
import Decimal from "decimal.js";

export type Node =
  | { t: "num"; v: string }
  | { t: "ref"; code: string }
  | { t: "var"; name: string }
  | { t: "neg"; e: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[] };

export class FormulaError extends Error {
  constructor(message: string, public pos?: number) { super(message); }
}

export const VARIABLES: Record<string, string> = {
  GT: "Gemi GT değeri (doğrulanmış)",
  GT_TAVAN: "Hizmetin GT tavanı uygulanmış GT",
  BLOK: "İlk 1000 GT üzerindeki başlamış 1000 GT blok sayısı (tavanlı)",
  CEKI: "Römorkör çeki gücü (ton, sertifikalı)",
  SAAT: "Ücretlendirilen saat",
  ROMORKOR: "Ücretlendirilen römorkör sayısı",
};
const FN_ALIASES: Record<string, string> = {
  MIN: "MIN", MAX: "MAX", YUVARLA: "ROUND", ROUND: "ROUND", YUKARIYUVARLA: "CEIL", TAVAN: "CEIL", CEIL: "CEIL",
  ASAGIYUVARLA: "FLOOR", TABAN: "FLOOR", FLOOR: "FLOOR", MUTLAK: "ABS", ABS: "ABS", EGER: "IF", EĞER: "IF", IF: "IF", KADEME: "STEP", STEP: "STEP",
};

type Tok = { k: "num" | "ref" | "id" | "op" | "lp" | "rp" | "sep" | "pct"; v: string; pos: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "[") {
      const j = src.indexOf("]", i);
      if (j < 0) throw new FormulaError("Kapanmayan köşeli parantez", i);
      const code = src.slice(i + 1, j).trim();
      if (!/^\d{3}\.\d{3}$/.test(code)) throw new FormulaError(`Geçersiz kalem kodu [${code}] — biçim: 200.001`, i);
      out.push({ k: "ref", v: code, pos: i }); i = j + 1; continue;
    }
    if (/\d/.test(c)) {
      const m = src.slice(i).match(/^\d+(\.\d+)?/)!;
      out.push({ k: "num", v: m[0], pos: i }); i += m[0].length; continue;
    }
    if (/[A-Za-zÇĞİÖŞÜçğıöşü_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-zÇĞİÖŞÜçğıöşü_][A-Za-zÇĞİÖŞÜçğıöşü_0-9]*/)!;
      out.push({ k: "id", v: m[0].toLocaleUpperCase("tr-TR").replace(/İ/g, "I"), pos: i }); i += m[0].length; continue;
    }
    if (c === "%") { out.push({ k: "pct", v: "%", pos: i }); i++; continue; }
    if (c === "(") { out.push({ k: "lp", v: c, pos: i }); i++; continue; }
    if (c === ")") { out.push({ k: "rp", v: c, pos: i }); i++; continue; }
    if (c === ";" || c === ",") { out.push({ k: "sep", v: c, pos: i }); i++; continue; }
    const two = src.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "<>") { out.push({ k: "op", v: two, pos: i }); i += 2; continue; }
    if ("+-*/<>=".includes(c)) { out.push({ k: "op", v: c, pos: i }); i++; continue; }
    throw new FormulaError(`Beklenmeyen karakter "${c}"`, i);
  }
  return out;
}

export function parse(src: string): Node {
  if (!src.trim()) throw new FormulaError("Formül boş");
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const take = (k?: Tok["k"], v?: string) => {
    const t = toks[p];
    if (!t || (k && t.k !== k) || (v && t.v !== v)) throw new FormulaError(`${v ?? k ?? "ifade"} bekleniyordu${t ? `, "${t.v}" bulundu` : ", formül bitti"}`, t?.pos ?? src.length);
    p++; return t;
  };
  const cmp = (): Node => {
    let a = add();
    while (peek()?.k === "op" && ["<", ">", "<=", ">=", "=", "<>"].includes(peek().v)) { const op = take().v; a = { t: "bin", op, a, b: add() }; }
    return a;
  };
  const add = (): Node => {
    let a = mul();
    while (peek()?.k === "op" && (peek().v === "+" || peek().v === "-")) { const op = take().v; a = { t: "bin", op, a, b: mul() }; }
    return a;
  };
  const mul = (): Node => {
    let a = unary();
    while (peek()?.k === "op" && (peek().v === "*" || peek().v === "/")) { const op = take().v; a = { t: "bin", op, a, b: unary() }; }
    return a;
  };
  const unary = (): Node => {
    if (peek()?.k === "op" && peek().v === "-") { take(); return { t: "neg", e: unary() }; }
    if (peek()?.k === "op" && peek().v === "+") { take(); return unary(); }
    return postfix();
  };
  const postfix = (): Node => {
    let e = primary();
    // 30%  → 0,30
    while (peek()?.k === "pct") { take(); e = { t: "bin", op: "/", a: e, b: { t: "num", v: "100" } }; }
    return e;
  };
  const primary = (): Node => {
    const t = peek();
    if (!t) throw new FormulaError("Formül eksik bitti", src.length);
    if (t.k === "pct") { take(); const e = primary(); return { t: "bin", op: "/", a: e, b: { t: "num", v: "100" } }; } // %30
    if (t.k === "num") { take(); return { t: "num", v: t.v }; }
    if (t.k === "ref") { take(); return { t: "ref", code: t.v }; }
    if (t.k === "lp") { take(); const e = cmp(); take("rp"); return e; }
    if (t.k === "id") {
      take();
      if (peek()?.k === "lp") {
        const fn = FN_ALIASES[t.v];
        if (!fn) throw new FormulaError(`Bilinmeyen fonksiyon ${t.v}`, t.pos);
        take("lp");
        const args: Node[] = [];
        if (peek()?.k !== "rp") { args.push(cmp()); while (peek()?.k === "sep") { take(); args.push(cmp()); } }
        take("rp");
        return { t: "call", fn, args };
      }
      if (!(t.v in VARIABLES)) throw new FormulaError(`Bilinmeyen değişken ${t.v} (geçerli: ${Object.keys(VARIABLES).join(", ")})`, t.pos);
      return { t: "var", name: t.v };
    }
    throw new FormulaError(`Beklenmeyen "${t.v}"`, t.pos);
  };
  const ast = cmp();
  if (p < toks.length) throw new FormulaError(`Fazla ifade: "${toks[p].v}"`, toks[p].pos);
  return ast;
}

export function refsOf(n: Node, acc = new Set<string>()): Set<string> {
  if (n.t === "ref") acc.add(n.code);
  else if (n.t === "neg") refsOf(n.e, acc);
  else if (n.t === "bin") { refsOf(n.a, acc); refsOf(n.b, acc); }
  else if (n.t === "call") n.args.forEach((a) => refsOf(a, acc));
  return acc;
}
export function varsOf(n: Node, acc = new Set<string>()): Set<string> {
  if (n.t === "var") acc.add(n.name);
  else if (n.t === "neg") varsOf(n.e, acc);
  else if (n.t === "bin") { varsOf(n.a, acc); varsOf(n.b, acc); }
  else if (n.t === "call") n.args.forEach((a) => varsOf(a, acc));
  return acc;
}

export interface EvalCtx {
  vars: Partial<Record<string, Decimal | number | null>>;
  ref: (code: string) => Decimal;
}

const ONE = new Decimal(1), ZERO = new Decimal(0);

export function evaluate(n: Node, ctx: EvalCtx): Decimal {
  switch (n.t) {
    case "num": return new Decimal(n.v);
    case "ref": return ctx.ref(n.code);
    case "var": {
      const v = ctx.vars[n.name];
      if (v === null || v === undefined) throw new FormulaError(`${n.name} değeri bilinmiyor (${VARIABLES[n.name]})`);
      return new Decimal(v);
    }
    case "neg": return evaluate(n.e, ctx).neg();
    case "bin": {
      const a = evaluate(n.a, ctx), b = evaluate(n.b, ctx);
      switch (n.op) {
        case "+": return a.plus(b);
        case "-": return a.minus(b);
        case "*": return a.times(b);
        case "/": if (b.isZero()) throw new FormulaError("Sıfıra bölme"); return a.div(b);
        case ">": return a.gt(b) ? ONE : ZERO;
        case "<": return a.lt(b) ? ONE : ZERO;
        case ">=": return a.gte(b) ? ONE : ZERO;
        case "<=": return a.lte(b) ? ONE : ZERO;
        case "=": return a.eq(b) ? ONE : ZERO;
        case "<>": return a.eq(b) ? ZERO : ONE;
      }
      throw new FormulaError(`Bilinmeyen işlem ${n.op}`);
    }
    case "call": {
      const A = n.args;
      const need = (k: number, max = k) => { if (A.length < k || A.length > max) throw new FormulaError(`${n.fn} için ${k === max ? k : `${k}–${max}`} argüman gerekir`); };
      switch (n.fn) {
        case "MIN": if (!A.length) throw new FormulaError("MIN en az 1 argüman"); return Decimal.min(...A.map((x) => evaluate(x, ctx)));
        case "MAX": if (!A.length) throw new FormulaError("MAX en az 1 argüman"); return Decimal.max(...A.map((x) => evaluate(x, ctx)));
        case "ROUND": need(1, 2); return evaluate(A[0], ctx).toDecimalPlaces(A[1] ? evaluate(A[1], ctx).toNumber() : 0, Decimal.ROUND_HALF_UP);
        case "CEIL": need(1); return evaluate(A[0], ctx).ceil();
        case "FLOOR": need(1); return evaluate(A[0], ctx).floor();
        case "ABS": need(1); return evaluate(A[0], ctx).abs();
        case "IF": need(3); return evaluate(A[0], ctx).isZero() ? evaluate(A[2], ctx) : evaluate(A[1], ctx); // yalnız seçilen dal hesaplanır
        case "STEP": {
          if (A.length < 3 || A.length % 2 === 0) throw new FormulaError("KADEME(x; eşik1; değer1; eşik2; değer2; …)");
          const x = evaluate(A[0], ctx);
          let hit: Node | null = null;
          for (let i = 1; i < A.length; i += 2) if (x.gte(evaluate(A[i], ctx))) hit = A[i + 1];
          if (!hit) throw new FormulaError(`KADEME: ${x.toString()} ilk eşiğin altında — tanımsız`);
          return evaluate(hit, ctx);
        }
      }
      throw new FormulaError(`Bilinmeyen fonksiyon ${n.fn}`);
    }
  }
}
