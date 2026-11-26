// העדפות התצוגה של משתמשת. לוגיקה טהורה: ניקוי ובדיקה של נתון לא מהימן.

export type UiSettings = {
  categoryOrder: string[]; // סדר קטגוריות ברשימת הקניות
  locationOrder: string[]; // סדר מיקומים במזווה
  hiddenLocations: string[]; // מיקומי ברירת מחדל שנמחקו
  collapsedLocations: string[]; // מיקומים שמצומצמים בתצוגה
};

export const EMPTY_UI: UiSettings = { categoryOrder: [], locationOrder: [], hiddenLocations: [], collapsedLocations: [] };

const MAX_ENTRIES = 100;
const MAX_LEN = 40;

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s || s.length > MAX_LEN || out.includes(s)) continue;
    out.push(s);
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

export function normalizeUi(raw: unknown): UiSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    categoryOrder: strList(o.categoryOrder),
    locationOrder: strList(o.locationOrder),
    hiddenLocations: strList(o.hiddenLocations),
    collapsedLocations: strList(o.collapsedLocations),
  };
}

export function isEmptyUi(u: UiSettings): boolean {
  return !u.categoryOrder.length && !u.locationOrder.length && !u.hiddenLocations.length && !u.collapsedLocations.length;
}