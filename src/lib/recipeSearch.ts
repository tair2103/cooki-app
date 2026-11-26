// חיפוש וסינון מתכונים בספר המתכונים. לוגיקה טהורה (בלי DB).
import { tokens } from "@/lib/pantryCheck";

export type SearchableRecipe = {
  title: string;
  cuisine?: string | null;
  dish_type?: string | null;
  meal_time?: string | null;
  ingredients: { name: string }[];
  folder_id?: string | null;
};

// בחירת "איפה מחפשים": הכל / רק מתכונים בלי תיקייה / תיקייה מסוימת
export type FolderFilter = "all" | "none" | string;

const NIQQUD = /[֑-ׇ]/g;
const normalize = (t: string) => t.replace(NIQQUD, "").toLowerCase();

// כל מילה בחיפוש חייבת להתחיל מילה במתכון (בשם, במצרכים, במטבח או בסוג המנה).
// מתאים גם תוך כדי הקלדה ("ביצ" מוצא "ביצים") וגם לצורות שונות ("ביצה" מוצא "ביצים").
export function matchesQuery(recipe: SearchableRecipe, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = [recipe.title, recipe.cuisine, recipe.dish_type, recipe.meal_time, ...recipe.ingredients.map((i) => i.name)]
    .filter(Boolean)
    .join(" ");
  // מתחילת מילה בלבד: "שוק" מוצא "שוקולד" אבל לא את "שקשוקה"
  const plainWords = normalize(haystack).split(/[^א-תa-z0-9]+/).filter(Boolean);
  const stems = tokens(haystack);

  return words.every((w) => {
    if (plainWords.some((h) => h.startsWith(w))) return true;
    const ws = tokens(w);
    return ws.length > 0 && ws.every((t) => stems.some((h) => h.startsWith(t)));
  });
}

export function inFolder(recipe: SearchableRecipe, folder: FolderFilter): boolean {
  if (folder === "all") return true;
  if (folder === "none") return !recipe.folder_id;
  return recipe.folder_id === folder;
}

export function filterRecipes<T extends SearchableRecipe>(recipes: T[], query: string, folder: FolderFilter): T[] {
  return recipes.filter((r) => inFolder(r, folder) && matchesQuery(r, query));
}

export function countByFolder(recipes: SearchableRecipe[], folderIds: string[]) {
  const byFolder: Record<string, number> = {};
  for (const id of folderIds) byFolder[id] = 0;
  let none = 0;
  for (const r of recipes) {
    if (r.folder_id && r.folder_id in byFolder) byFolder[r.folder_id]++;
    else none++; // תיקייה שלא קיימת יותר נחשבת "ללא תיקייה"
  }
  return { all: recipes.length, none, byFolder };
}