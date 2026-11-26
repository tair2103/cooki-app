// הוספת פריטים לרשימה קיימת (מזווה או קניות): פריט שכבר קיים מתעדכן
// באיחוד הכמויות, ופריט חדש נוסף. הלוגיקה כאן היא טהורה, בלי DB.
//
// matchGroup = true (במזווה): פריטים מתאחדים רק אם גם השם וגם הקבוצה (המיקום) זהים.
// "ביצים במקרר" ו"ביצים בארון" נשארים שני פריטים נפרדים.
import { sameName } from "@/lib/pantryCheck";
import { mergeQuantities } from "@/lib/quantity";

export type Existing = { id: string; name: string; amount: string | null; group?: string };
export type Incoming = { name: string; amount: string; group?: string };
export type MergePlan = {
  updates: { id: string; amount: string }[];
  inserts: Incoming[];
};

const groupKey = (g?: string | null) => (g ?? "").trim();

// הפריט הקיים שמתאים לשם (לפי שורש המילים: "ביצה" = "ביצים"), ואם נתנו group, גם באותה קבוצה
export function findMatch<T extends { name: string; group?: string | null }>(
  list: T[],
  name: string,
  group?: string
): T | undefined {
  return list.find(
    (item) => sameName(item.name, name) && (group === undefined || groupKey(item.group) === groupKey(group))
  );
}

export function planMerge(
  existing: Existing[],
  incoming: Incoming[],
  options: { matchGroup?: boolean } = {}
): MergePlan {
  const amounts = new Map<string, string>();
  const inserts: Incoming[] = [];

  for (const item of incoming) {
    const name = item.name.trim();
    if (!name) continue;
    const group = options.matchGroup ? groupKey(item.group) : undefined;

    const match = findMatch(existing, name, group);
    if (match) {
      const current = amounts.get(match.id) ?? match.amount ?? "";
      amounts.set(match.id, mergeQuantities(current, item.amount));
      continue;
    }

    // אותו פריט מופיע פעמיים בבקשה עצמה
    const duplicate = findMatch(inserts, name, group);
    if (duplicate) {
      duplicate.amount = mergeQuantities(duplicate.amount, item.amount);
      continue;
    }

    inserts.push({ ...item, name });
  }

  return {
    updates: Array.from(amounts, ([id, amount]) => ({ id, amount })),
    inserts,
  };
}