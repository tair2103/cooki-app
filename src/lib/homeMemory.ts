// זיכרון זמני של עמוד הבית: המתכונים שהופקו, מה כבר נשמר, והפילטרים שנבחרו.
// נשמר בדפדפן (localStorage), כך שמעבר לעמוד אחר וחזרה, או רענון, לא מוחקים אותם.
// הם נמחקים רק בלחיצה על "נקה מתכונים", או כשמפיקים ג'נרוט חדש.
import type { Recipe } from "@/lib/types";
import { DEFAULT_FILTERS, normalizeFilters, type Filters } from "@/lib/filters";

import { currentSpaceId } from "@/lib/spaceScope";

const BASE_KEY = "cooki_home_state";
// לכל מרחב זיכרון נפרד: מתכונים שהופקו מהמזווה של מרחב אחד לא יופיעו במרחב אחר. "אישי" שומר את המפתח הישן.
const key = () => (currentSpaceId() ? `${BASE_KEY}_${currentSpaceId()}` : BASE_KEY);

export type HomeState = {
  recipes: Recipe[];
  savedIndexes: number[];
  shoppingMsgs: Record<number, string>;
  filters: Filters;
};

// בדיקת מבנה בסיסית, כדי שמידע ישן או שבור לא יקריס את העמוד
function isRecipe(r: any): r is Recipe {
  return (
    r &&
    typeof r.title === "string" &&
    Array.isArray(r.ingredients) &&
    Array.isArray(r.steps)
  );
}

export function loadHomeState(): HomeState | null {
  try {
    const raw = localStorage.getItem(key());
    if (!raw) return null;
    const data = JSON.parse(raw);

    const allRecipes: unknown[] = Array.isArray(data?.recipes) ? data.recipes : [];
    const recipes = allRecipes.filter(isRecipe);
    // אם נזרק מתכון פגום, המספור משתנה ולכן סימוני השמירה כבר לא אמינים
    const sameShape = recipes.length === allRecipes.length;

    const savedIndexes: number[] =
      sameShape && Array.isArray(data?.savedIndexes)
        ? data.savedIndexes.filter(
            (i: unknown): i is number => Number.isInteger(i) && (i as number) < recipes.length
          )
        : [];

    const shoppingMsgs: Record<number, string> = {};
    if (sameShape && data?.shoppingMsgs && typeof data.shoppingMsgs === "object") {
      for (const [k, v] of Object.entries(data.shoppingMsgs)) {
        if (typeof v === "string") shoppingMsgs[Number(k)] = v;
      }
    }

    return { recipes, savedIndexes, shoppingMsgs, filters: normalizeFilters(data?.filters) };
  } catch {
    return null;
  }
}

export function saveHomeState(state: HomeState) {
  try {
    localStorage.setItem(key(), JSON.stringify(state));
  } catch (e) {
    console.error("שמירת זיכרון עמוד הבית נכשלה:", e);
  }
}

export { DEFAULT_FILTERS };