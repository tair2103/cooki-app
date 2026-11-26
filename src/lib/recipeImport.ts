// ייבוא מתכון מקישור או מטקסט. כאן הלוגיקה הטהורה (בלי רשת ובלי AI), כדי שאפשר יהיה לבדוק אותה:
//  1. אימות כתובת, כדי שהשרת לא ייפתח להפנות אותו לכתובות פנימיות (SSRF)
//  2. חילוץ מתכון מובנה מהדף (JSON-LD), ואם אין: טקסט נקי של הדף
//  3. ניקוי תשובת ה-AI, כי התוכן בדף הוא מידע לא אמין
import type { Recipe } from "@/lib/types";

// ---------------- 1. אימות כתובת ----------------

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

// כתובת IPv4 פרטית או שמורה (לא אמורה להיות יעד של ייבוא)
export function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // כולל כתובות מטא-דאטה של ענן
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast ושמורות
  );
}

// כתובת כלשהי (v4/v6) שהשרת לא צריך לפנות אליה. משמש גם אחרי תרגום שם הדומיין ל-IP.
export function isBlockedAddress(addr: string): boolean {
  const a = addr.toLowerCase().replace(/^\[|\]$/g, "");
  if (a.includes(":")) {
    // IPv6: ::1, ::, fc00::/7, fe80::/10, ומפוי של IPv4 (::ffff:1.2.3.4)
    if (a === "::1" || a === "::") return true;
    if (/^f[cd]/.test(a) || /^fe[89ab]/.test(a)) return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
  }
  return isPrivateIPv4(a);
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet"];

export function validateImportUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "הכתובת לא תקינה. צריך כתובת מלאה שמתחילה ב-https://" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "אפשר לייבא רק מכתובות http או https." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "כתובות עם שם משתמש וסיסמה לא נתמכות." };
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, error: "כתובות עם פורט לא סטנדרטי לא נתמכות." };
  }
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: "אי אפשר לייבא מכתובת פנימית." };
  }
  // כתובת IP ישירה (v4 או v6) לא מתאימה לאתר מתכונים
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[") || host.includes(":")) {
    return { ok: false, error: "צריך כתובת של אתר, לא כתובת IP." };
  }
  if (!host.includes(".")) {
    return { ok: false, error: "הכתובת לא נראית כמו אתר." };
  }
  return { ok: true, url };
}

// ---------------- 2. חילוץ מהדף ----------------

export type StructuredRecipe = {
  name: string;
  ingredients: string[];
  steps: string[];
  minutes: number | null;
  cuisine: string;
  category: string;
  recipeYield: string;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-" };

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeChar(code: number): string {
  return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
}

const stripTags = (t: string) => decodeEntities(t.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

// "PT1H30M" -> 90
export function parseDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : null;
}

const asText = (v: unknown): string => {
  if (typeof v === "string") return stripTags(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
  if (v && typeof v === "object" && typeof (v as any).name === "string") return stripTags((v as any).name);
  return "";
};

// שלבי הכנה יכולים להיות טקסט, רשימה, אובייקטים של HowToStep, או סעיפים מקוננים (HowToSection)
function flattenSteps(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 4 || v == null) return out;
  if (typeof v === "string") {
    const parts = v.includes("\n") ? v.split("\n") : [v];
    for (const p of parts) {
      const t = stripTags(p);
      if (t) out.push(t);
    }
  } else if (Array.isArray(v)) {
    v.forEach((x) => flattenSteps(x, out, depth + 1));
  } else if (typeof v === "object") {
    const o = v as any;
    if (o.itemListElement) flattenSteps(o.itemListElement, out, depth + 1);
    else if (typeof o.text === "string") flattenSteps(o.text, out, depth + 1);
    else if (typeof o.name === "string") flattenSteps(o.name, out, depth + 1);
  }
  return out;
}

function collectNodes(v: unknown, out: any[] = [], depth = 0): any[] {
  if (depth > 5 || v == null) return out;
  if (Array.isArray(v)) v.forEach((x) => collectNodes(x, out, depth + 1));
  else if (typeof v === "object") {
    out.push(v);
    if ((v as any)["@graph"]) collectNodes((v as any)["@graph"], out, depth + 1);
  }
  return out;
}

const isRecipeNode = (n: any) => {
  const t = n?.["@type"];
  return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
};

// רוב אתרי המתכונים מוסיפים לדף תיאור מובנה של המתכון (JSON-LD). זה הכי אמין, כי אין מה לנחש.
export function extractStructuredRecipe(html: string): StructuredRecipe | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const node = collectNodes(data).find(isRecipeNode);
    if (!node) continue;

    const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [])
      .map((i: unknown) => asText(i))
      .filter(Boolean);
    const steps = flattenSteps(node.recipeInstructions);
    if (ingredients.length === 0 && steps.length === 0) continue;

    const total = parseDuration(node.totalTime);
    const sum = (parseDuration(node.prepTime) ?? 0) + (parseDuration(node.cookTime) ?? 0);
    return {
      name: asText(node.name),
      ingredients,
      steps,
      minutes: total ?? (sum > 0 ? sum : null),
      cuisine: asText(node.recipeCuisine),
      category: asText(node.recipeCategory),
      recipeYield: asText(node.recipeYield),
    };
  }
  return null;
}

// טקסט נקי מהדף כשאין תיאור מובנה
export function htmlToText(html: string, maxChars = 12000): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/li|\/div|\/h[1-6]|\/tr)[^>]*>/gi, "\n");
  return decodeEntities(text.replace(/<[^>]*>/g, " "))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

export function pageTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTags(m[1]).slice(0, 150) : "";
}

// ---------------- 3. ניקוי תשובת ה-AI ----------------

export type ImportedRecipe = Recipe;

const DISH_TYPES = ["ארוחה", "נשנוש", "קינוח"];
const MEAL_TIMES = ["בוקר", "צהריים", "ערב"];
const DIFFICULTIES = ["קל", "בינוני", "מורכב"];

const clean = (v: unknown, max: number) =>
  (typeof v === "string" ? v : v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);

// תוכן הדף הוא מידע שלא סומכים עליו, ותשובת המודל יכולה להיות שגויה או מוזרה.
// לכן לא מעבירים אותה הלאה כמו שהיא: מגבילים אורכים וכמויות, ובודקים שהערכים מהרשימה המותרת.
export function normalizeImported(raw: any): ImportedRecipe | null {
  if (!raw || typeof raw !== "object") return null;

  const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .map((i: any) => ({ name: clean(i?.name, 80), amount: clean(i?.amount, 40), have: false }))
    .filter((i: { name: string }) => i.name)
    .slice(0, 60);
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((s: unknown) => clean(s, 600))
    .filter(Boolean)
    .slice(0, 40);

  const title = clean(raw.title, 100);
  if (!title || ingredients.length === 0 || steps.length === 0) return null;

  const dish_type = DISH_TYPES.includes(raw.dish_type) ? raw.dish_type : "ארוחה";
  const minutes = Math.round(Number(raw.prep_minutes));

  return {
    title,
    dish_type,
    // זמן ביום רק לארוחה
    meal_time: dish_type === "ארוחה" && MEAL_TIMES.includes(raw.meal_time) ? raw.meal_time : "",
    cuisine: clean(raw.cuisine, 40),
    difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : "בינוני",
    prep_minutes: Number.isFinite(minutes) ? Math.min(Math.max(minutes, 0), 1440) : 0,
    ingredients,
    steps,
  };
}

// ---------------- 4. סרטונים ----------------

// קובץ סרטון שמועלה. המגבלה כאן כדי לא לטעון לשרת קבצים ענקיים (וגם הדפדפן בודק אותה לפני ההעלאה).
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/mpeg", "video/3gpp", "video/x-msvideo"];

const YT_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"];
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

// קישור ליוטיוב -> קישור נקי וקבוע (watch?v=ID), או null אם זה לא קישור לסרטון.
// מנקה פרמטרים של מעקב ורשימות הפעלה, ומוודא שהמארח הוא באמת יוטיוב.
export function parseYoutubeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (!YT_HOSTS.includes(host) || url.username || url.password) return null;

  let id = "";
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? "";
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v") ?? "";
  } else {
    const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
    id = m?.[1] ?? "";
  }
  return YT_ID.test(id) ? new URL(`https://www.youtube.com/watch?v=${id}`) : null;
}

// ההבדלים שה-AI מצא בין הסרטון לתיאור. מוצגים בתצוגה המקדימה, לא נשמרים.
export function normalizeNotes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is string => typeof n === "string")
    .map((n) => clean(n, 220))
    .filter(Boolean)
    .slice(0, 8);
}