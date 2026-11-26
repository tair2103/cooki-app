// שינוי שם של מיקום במזווה, בלי לאבד פריטים. לוגיקה טהורה (בלי DB).
//
// אם השם החדש כבר קיים כמיקום, הפריטים עוברים אליו. ולפי כלל האיחוד של המזווה
// (אותו שם ואותו מיקום = פריט אחד), פריט שכבר יש באותו שם במיקום היעד מתאחד אליו.
import { NO_LOCATION } from "@/lib/locations";
import { mergeQuantities } from "@/lib/quantity";
import { sameName } from "@/lib/pantryCheck";

export type RenameItem = { id: string; name: string; amount: string | null; location: string | null };

export type RenamePlan = {
  moveIds: string[]; // פריטים שפשוט מקבלים את שם המיקום החדש
  merges: { keepId: string; amount: string; deleteIds: string[] }[]; // פריטים שמתאחדים עם פריט קיים ביעד
  mergedCount: number; // כמה פריטים אוחדו (ונמחקו כשורות נפרדות)
};

export const MAX_LOCATION_LENGTH = 40;

// מחזיר הודעת שגיאה, או null אם אפשר להמשיך
export function validateRename(from: string, to: string): string | null {
  const name = to.trim();
  if (!name) return "צריך להקליד שם למיקום.";
  if (name.length > MAX_LOCATION_LENGTH) return `שם המיקום ארוך מדי (עד ${MAX_LOCATION_LENGTH} תווים).`;
  if (name === NO_LOCATION) return `"${NO_LOCATION}" שמור לפריטים בלי מיקום ואי אפשר להשתמש בו כשם.`;
  if (name === from.trim()) return "זה כבר השם של המיקום.";
  return null;
}

export function planRename(items: RenameItem[], from: string, to: string): RenamePlan {
  const src = from.trim();
  const dst = to.trim();

  // פריטי היעד שכבר קיימים (מתעדכן תוך כדי, כדי שגם שני פריטים זהים שמועברים יתאחדו)
  const target = items
    .filter((i) => (i.location ?? "").trim() === dst)
    .map((i) => ({ id: i.id, name: i.name, amount: i.amount ?? "" }));

  const moveIds: string[] = [];
  const mergeMap = new Map<string, { amount: string; deleteIds: string[] }>();

  for (const item of items.filter((i) => (i.location ?? "").trim() === src)) {
    const hit = target.find((t) => sameName(t.name, item.name));
    if (hit) {
      hit.amount = mergeQuantities(hit.amount, item.amount ?? "");
      const entry = mergeMap.get(hit.id) ?? { amount: hit.amount, deleteIds: [] };
      entry.amount = hit.amount;
      entry.deleteIds.push(item.id);
      mergeMap.set(hit.id, entry);
    } else {
      moveIds.push(item.id);
      target.push({ id: item.id, name: item.name, amount: item.amount ?? "" });
    }
  }

  const merges = Array.from(mergeMap, ([keepId, v]) => ({ keepId, amount: v.amount, deleteIds: v.deleteIds }));
  return { moveIds, merges, mergedCount: merges.reduce((n, m) => n + m.deleteIds.length, 0) };
}

// החלפת שם ברשימת שמות שנשמרה (סדר מיקומים, מיקומים מצומצמים). אם השם החדש כבר ברשימה, השם הישן פשוט יוצא.
export function renameInList(list: string[], from: string, to: string): string[] {
  const out: string[] = [];
  for (const l of list) {
    const name = l === from ? to : l;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}