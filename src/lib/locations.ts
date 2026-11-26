// מיקומים במזווה. ברירות מחדל, ובנוסף כל מיקום שהמשתמשת מקלידה בעצמה.
import { getUi, patchUi } from "@/lib/uiStore";

export const NO_LOCATION = "ללא מיקום";
export const DEFAULT_LOCATIONS = ["מקרר", "מקפיא", "ארון", "מזווה"];

// סדר ההצגה: ברירות המחדל, אחר כך מיקומים אישיים לפי א"ב, ובסוף "ללא מיקום"
export function orderedLocations(used: string[]): string[] {
  const custom = Array.from(new Set(used))
    .filter((l) => l !== NO_LOCATION && !DEFAULT_LOCATIONS.includes(l))
    .sort((a, b) => a.localeCompare(b, "he"));
  return [...DEFAULT_LOCATIONS, ...custom, NO_LOCATION];
}

// ---- סדר מיקומים שהמשתמשת בחרה (נשמר בחשבון שלה, דרך lib/uiStore.ts) ----

// הסדר להצגה (בלי "ללא מיקום", שתמיד בסוף): קודם מה שנשמר ועדיין קיים,
// ואחר כך מיקומים חדשים שעוד לא סודרו, בסדר ברירת המחדל.
// hidden = מיקומי ברירת מחדל שהמשתמשת מחקה. הם נעלמים מההצעות, אלא אם יש בהם פריטים.
export function applyLocationOrder(saved: string[], used: string[], hidden: string[] = []): string[] {
  const universe = orderedLocations(used).filter(
    (l) => l !== NO_LOCATION && !(hidden.includes(l) && !used.includes(l))
  );
  const unique = Array.from(new Set(saved));
  return [...unique.filter((l) => universe.includes(l)), ...universe.filter((l) => !unique.includes(l))];
}

// שומרים גם מיקומים שכרגע ריקים, כדי שאם יחזרו בעתיד הם יחזרו למקום שלהם
export function mergeSavedOrder(newOrder: string[], saved: string[]): string[] {
  return [...newOrder, ...saved.filter((l) => !newOrder.includes(l))];
}

export function loadLocationOrder(): string[] {
  return getUi().locationOrder;
}

export function saveLocationOrder(order: string[]) {
  patchUi({ locationOrder: order });
}

export function resetLocationOrder() {
  patchUi({ locationOrder: [] });
}

// ---- מיקומי ברירת מחדל שהמשתמשת מחקה ----
export function loadHiddenLocations(): string[] {
  return getUi().hiddenLocations.filter((l) => DEFAULT_LOCATIONS.includes(l));
}

export function saveHiddenLocations(hidden: string[]) {
  patchUi({ hiddenLocations: hidden });
}

// ---- מיקומים שמצומצמים (סגורים) בתצוגה ----
export function loadCollapsedLocations(): string[] {
  return getUi().collapsedLocations;
}

export function saveCollapsedLocations(collapsed: string[]) {
  patchUi({ collapsedLocations: collapsed });
}