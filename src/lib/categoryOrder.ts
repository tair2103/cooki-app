// סדר הקטגוריות שהמשתמשת בחרה. נשמר בחשבון שלה (דרך lib/uiStore.ts).
import { DEFAULT_ORDER } from "@/lib/categories";
import { getUi, patchUi } from "@/lib/uiStore";

// מנקה ערך שמור: רק קטגוריות מוכרות, בלי כפילויות,
// וקטגוריות שחסרות (למשל חדשות שנוספו בעתיד) מתווספות בסוף.
export function normalizeOrder(saved: unknown): string[] {
  const valid = Array.isArray(saved)
    ? saved.filter((c): c is string => typeof c === "string" && DEFAULT_ORDER.includes(c))
    : [];
  const unique = Array.from(new Set(valid));
  return [...unique, ...DEFAULT_ORDER.filter((c) => !unique.includes(c))];
}

export function loadOrder(): string[] {
  return normalizeOrder(getUi().categoryOrder);
}

export function saveOrder(order: string[]) {
  patchUi({ categoryOrder: order });
}

// מזיז קטגוריה צעד אחד למעלה או למטה ביחס לקטגוריות שמוצגות כרגע על המסך.
// קטגוריות ריקות מוסתרות, ולכן מחליפים עם השכנה המוצגת ולא עם השכנה ברשימה המלאה,
// אחרת לחיצה על החץ הייתה נראית כאילו לא קרה כלום.
export function moveAmongVisible(
  order: string[],
  category: string,
  visible: string[],
  dir: -1 | 1
): string[] {
  const vi = visible.indexOf(category);
  const neighbor = vi === -1 ? undefined : visible[vi + dir];
  if (neighbor === undefined) return order;

  const next = [...order];
  const a = next.indexOf(category);
  const b = next.indexOf(neighbor);
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function resetOrder(): string[] {
  patchUi({ categoryOrder: [] });
  return DEFAULT_ORDER;
}