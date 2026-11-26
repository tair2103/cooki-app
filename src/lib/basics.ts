// מוצרי בסיס: מה מניחים שיש בבית גם אם הוא לא במזווה. לכל משתמשת רשימה משלה.
// לוגיקה טהורה (בלי DB), כדי שאפשר יהיה לבדוק אותה.

// exact = רק התאמה מדויקת. למשל "פלפל" לבדו הוא פלפל שחור,
// אבל "פלפל אדום" הוא ירק שצריך להיות במזווה.
export type Basic = { name: string; exact?: boolean };

export const DEFAULT_BASICS: Basic[] = [
  { name: "מלח", exact: true },
  { name: "פלפל שחור" },
  { name: "פלפל", exact: true },
  { name: "מים" },
  { name: "שמן" },
];

export const MAX_BASICS = 60;
export const MAX_BASIC_NAME = 40;

// מנקה שם: בלי תווי בקרה, רווחים כפולים או שורות חדשות (השם נכנס גם לפרומפט של ה-AI).
export function cleanBasicName(input: string): string {
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F‎‏‪-‮]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const keyOf = (b: Basic) => `${cleanBasicName(b.name).toLowerCase()}|${b.exact ? 1 : 0}`;

// מקבל נתון לא מהימן (מבסיס הנתונים או מהדפדפן) ומחזיר רשימה תקינה.
// null = זה לא מערך בכלל (ואז משתמשים בברירת המחדל). מערך ריק הוא תקין: "אין לי מוצרי בסיס".
export function normalizeBasics(input: unknown): Basic[] | null {
  if (!Array.isArray(input)) return null;
  const out: Basic[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const { name, exact } = raw as { name?: unknown; exact?: unknown };
    if (typeof name !== "string") continue;
    const cleaned = cleanBasicName(name);
    if (!cleaned || cleaned.length > MAX_BASIC_NAME) continue;
    const basic: Basic = exact === true ? { name: cleaned, exact: true } : { name: cleaned };
    const key = keyOf(basic);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(basic);
    if (out.length >= MAX_BASICS) break;
  }
  return out;
}

export function addBasic(list: Basic[], name: string, exact: boolean): { list: Basic[]; error: string | null } {
  const cleaned = cleanBasicName(name);
  if (!cleaned) return { list, error: "צריך להזין שם." };
  if (cleaned.length > MAX_BASIC_NAME) return { list, error: `השם ארוך מדי (עד ${MAX_BASIC_NAME} תווים).` };
  if (list.length >= MAX_BASICS) return { list, error: `אפשר עד ${MAX_BASICS} מוצרי בסיס.` };
  const basic: Basic = exact ? { name: cleaned, exact: true } : { name: cleaned };
  if (list.some((b) => keyOf(b) === keyOf(basic))) return { list, error: "המוצר הזה כבר ברשימה." };
  return { list: [...list, basic], error: null };
}

export function removeBasic(list: Basic[], index: number): Basic[] {
  return list.filter((_, i) => i !== index);
}

export function isDefaultBasics(list: Basic[]): boolean {
  if (list.length !== DEFAULT_BASICS.length) return false;
  const a = list.map(keyOf).sort();
  const b = DEFAULT_BASICS.map(keyOf).sort();
  return a.every((k, i) => k === b[i]);
}

export const basicsText = (list: Basic[]) => list.map((b) => b.name).join(", ");