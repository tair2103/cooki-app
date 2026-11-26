// בדיקת מתכונים מול המזווה האמיתי, בקוד ולא לפי מה שה-AI טוען.
// ה-AI מציע מתכונים, אבל השרת קובע לכל מצרך אם הוא באמת במזווה (או מצרך בסיס).
import type { Recipe } from "@/lib/types";
import { DEFAULT_BASICS, type Basic } from "@/lib/basics";

// מצרכי הבסיס (מה שמניחים שיש בבית) לכל משתמשת: lib/basics.ts. כאן משתמשים בהם רק לבדיקה.
export type { Basic };
export const BASIC_INGREDIENTS = DEFAULT_BASICS; // שם ישן, למי שעדיין מייבא אותו

// ---- נרמול שמות בעברית ----

// מקצר סיומות ריבוי ונקבה, כך ש"ביצים" ו"ביצה" נראים אותו דבר,
// וגם "עגבניות" ו"עגבניה". לא מקצרים אם נשארות פחות משלוש אותיות.
function stem(word: string): string {
  for (const suffix of ["ות", "ים", "ה"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

export function tokens(text: string): string[] {
  return text
    .replace(/[֑-ׇ]/g, "") // ניקוד וטעמים
    .toLowerCase()
    .replace(/[^א-תa-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(stem);
}

const isSubset = (small: string[], big: string[]) =>
  small.length > 0 && small.every((t) => big.includes(t));

// שני שמות הם אותו מצרך אם קבוצות המילים שלהם זהות (אחרי קיצור ריבוי):
// "ביצה" = "ביצים", אבל "שמן" ≠ "שמן זית". משמש לאיחוד פריטים כפולים.
export function sameName(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  return ta.length > 0 && ta.length === tb.length && isSubset(ta, tb);
}

// המצרך במתכון מתאים לפריט במזווה אם המילים של אחד מהם כלולות בשני.
// "עגבניות שרי" מתאים ל"עגבניות", ו"שמן זית" מתאים ל"שמן".
function inPantry(ingredient: string[], pantry: string[][]): boolean {
  return pantry.some((p) => isSubset(p, ingredient) || isSubset(ingredient, p));
}

function isBasic(ingredient: string[], basics: Basic[]): boolean {
  return basics.some((b) => {
    const bt = tokens(b.name);
    return b.exact
      ? bt.length === ingredient.length && isSubset(bt, ingredient)
      : isSubset(bt, ingredient);
  });
}

// האם פריט במזווה הוא המצרך הזה (אותו כלל התאמה כמו ב-haveIngredient, אבל לפריט בודד).
// משמש לבדיקת כמויות: צריך לדעת אילו שורות במזווה שייכות למצרך.
export function pantryItemMatches(ingredientName: string, pantryName: string): boolean {
  const t = tokens(ingredientName);
  const p = tokens(pantryName);
  return t.length > 0 && p.length > 0 && (isSubset(p, t) || isSubset(t, p));
}

// רשימת מילים לכל פריט במזווה, מוכנה לבדיקות
export const pantryTokens = (names: string[]) => names.map(tokens).filter((t) => t.length > 0);

// האם מצרך נמצא בבית: במזווה, או שהוא מצרך בסיס. הכלל היחיד לכל האפליקציה
// (גם ביצירת מתכונים וגם בספר המתכונים).
export function haveIngredient(name: string, pantry: string[][], basics: Basic[] = DEFAULT_BASICS): boolean {
  const t = tokens(name);
  return t.length > 0 && (inPantry(t, pantry) || isBasic(t, basics));
}

// המצרך "בבית" רק בזכות רשימת הבסיס (לא במזווה). משמש לתווית "בסיס" במתכון.
export function isBasicOnly(name: string, pantryNames: string[], basics: Basic[]): boolean {
  const t = tokens(name);
  if (t.length === 0) return false;
  return !inPantry(t, pantryTokens(pantryNames)) && isBasic(t, basics);
}

const MAX_MISSING_WITH_SHOPPING = 3; // תואם לפרומפט: עד 3 מצרכים חסרים למתכון

// עובר על כל המתכונים: קובע have לכל מצרך לפי המזווה, ומוסיף אזהרות.
export function verifyRecipes(
  recipes: Recipe[],
  pantryNames: string[],
  ingredientsMode: string,
  basics: Basic[] = DEFAULT_BASICS
): Recipe[] {
  const pantry = pantryTokens(pantryNames);

  return recipes.map((recipe) => {
    let corrections = 0;

    const ingredients = recipe.ingredients.map((ing) => {
      const have = haveIngredient(ing.name, pantry, basics);
      if (have !== ing.have) corrections++;
      return { ...ing, have };
    });

    if (corrections > 0) {
      console.log(`🔎 "${recipe.title}": תוקנו ${corrections} סימוני have לפי המזווה`);
    }

    const missing = ingredients.filter((i) => !i.have && i.name.trim()).map((i) => i.name);
    const warnings: string[] = [];

    if (ingredientsMode === "pantry_only" && missing.length > 0) {
      warnings.push(`ביקשת רק ממה שיש במזווה, אבל המתכון כולל מצרכים שלא נמצאו אצלך: ${missing.join(", ")}.`);
    } else if (ingredientsMode !== "pantry_only" && missing.length > MAX_MISSING_WITH_SHOPPING) {
      warnings.push(`חסרים ${missing.length} מצרכים: ${missing.join(", ")}.`);
    }

    return { ...recipe, ingredients, warnings };
  });
}