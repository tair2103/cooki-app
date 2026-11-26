// "הוסף חסרים" של מתכון: איך מצרכים חסרים נכנסים לרשימת הקניות.
// לוגיקה טהורה (בלי DB), כדי שאפשר יהיה לבדוק אותה.
//
// הכלל, לכל מצרך חסר:
//  - אין אותו ברשימה (עוד לא נקנה)            -> נוסף כפריט חדש
//  - יש אותו ברשימה, והוא כבר "עבור" המתכון הזה -> מדלגים (לחיצה שנייה לא מכפילה כמויות)
//  - יש אותו ברשימה, עבור מתכון אחר / הוספה ידנית -> מאחדים כמויות ורושמים גם את שם המתכון
import { sameName } from "@/lib/pantryCheck";
import { mergeQuantities } from "@/lib/quantity";

// מפריד בין שמות מתכונים בשדה recipe_title, למשל "פסטה · שקשוקה"
export const TITLE_SEP = " · ";

export type OpenShoppingItem = { id: string; name: string; amount: string | null; recipe_title: string | null };
export type MissingIngredient = { name: string; amount: string };

export type AddMissingPlan = {
  updates: { id: string; amount: string; recipe_title: string }[];
  inserts: { name: string; amount: string }[];
  added: number; // נוספו כפריט חדש
  merged: number; // אוחדו עם פריט קיים
  skipped: number; // כבר ברשימה עבור המתכון הזה
};

export function splitTitles(title: string | null): string[] {
  return (title ?? "")
    .split(TITLE_SEP)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function planAddMissing(
  existing: OpenShoppingItem[],
  missing: MissingIngredient[],
  recipeTitle: string
): AddMissingPlan {
  const title = recipeTitle.trim();
  // מצב עדכני של כל פריט קיים שנגענו בו, כדי ששני מצרכים דומים באותו מתכון לא ידרסו זה את זה
  const touched = new Map<string, { amount: string; titles: string[] }>();
  const inserts: { name: string; amount: string }[] = [];
  let added = 0;
  let merged = 0;
  let skipped = 0;

  for (const ing of missing) {
    const name = ing.name.trim();
    if (!name) continue;
    const amount = (ing.amount ?? "").trim();

    const match = existing.find((e) => sameName(e.name, name));
    if (match) {
      const state = touched.get(match.id) ?? { amount: match.amount ?? "", titles: splitTitles(match.recipe_title) };
      if (state.titles.includes(title)) {
        skipped++;
      } else {
        touched.set(match.id, { amount: mergeQuantities(state.amount, amount), titles: [...state.titles, title] });
        merged++;
      }
      continue;
    }

    // אותו מצרך פעמיים בתוך המתכון עצמו
    const dup = inserts.find((i) => sameName(i.name, name));
    if (dup) {
      dup.amount = mergeQuantities(dup.amount, amount);
      continue;
    }
    inserts.push({ name, amount });
    added++;
  }

  return {
    updates: Array.from(touched, ([id, s]) => ({ id, amount: s.amount, recipe_title: s.titles.join(TITLE_SEP) })),
    inserts,
    added,
    merged,
    skipped,
  };
}