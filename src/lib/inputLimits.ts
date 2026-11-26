// מגבלות גודל וקלט לנתיבי ה-API. לוגיקה טהורה, כדי שאפשר יהיה לבדוק אותה.
// הרעיון: לא קוראים גוף בקשה ענק, ולא סומכים על כמות או אורך הנתונים שהדפדפן שולח.

export const MAX_JSON_BODY_BYTES = 200_000; // 200KB: יותר ממספיק למזווה גדול
export const MAX_IMPORT_JSON_BYTES = 120_000; // טקסט מודבק עד 15,000 תווים בעברית
export const MAX_ITEMS = 300; // פריטי מזווה שנשלחים ליצירת מתכונים
export const MAX_ITEM_NAME = 60;
export const MAX_ITEM_QUANTITY = 40;

export type SizeProblem = { status: number; error: string };

// בודק את הכותרת Content-Length לפני שקוראים את הגוף. בלי כותרת תקינה: נדחה (לא ניתן לדעת כמה יגיע).
export function checkBodySize(contentLength: string | null, maxBytes: number): SizeProblem | null {
  if (contentLength === null || !/^\d{1,12}$/.test(contentLength.trim())) {
    return { status: 411, error: "הבקשה לא תקינה (חסר גודל)." };
  }
  if (Number(contentLength) > maxBytes) {
    return { status: 413, error: "הבקשה גדולה מדי." };
  }
  return null;
}

export type PantryInput = { item_name: string; quantity: string };

// מקבל נתון לא מהימן ומחזיר רשימה נקייה: לכל היותר MAX_ITEMS פריטים, שמות וכמויות קצרים.
// null אם זה לא מערך בכלל.
export function sanitizePantryItems(raw: unknown): PantryInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PantryInput[] = [];
  for (const row of raw) {
    if (out.length >= MAX_ITEMS) break;
    if (!row || typeof row !== "object") continue;
    const { item_name, quantity } = row as { item_name?: unknown; quantity?: unknown };
    if (typeof item_name !== "string") continue;
    const name = item_name.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_NAME);
    if (!name) continue;
    const qty =
      typeof quantity === "string" || typeof quantity === "number"
        ? String(quantity).replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_QUANTITY)
        : "";
    out.push({ item_name: name, quantity: qty });
  }
  return out;
}