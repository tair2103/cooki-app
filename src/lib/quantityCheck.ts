// בדיקת כמויות: האם יש במזווה מספיק מכל מצרך במתכון, ולא רק האם הוא קיים.
// לוגיקה טהורה (בלי DB), כדי שאפשר יהיה לבדוק אותה.
//
// העיקרון: מסמנים "חסר חלקית" רק כשבטוח שאין מספיק. כשאי אפשר להשוות
// (אין כמות במזווה, יחידות שונות כמו "כוס" מול "גרם", או כמות לא ברורה) מניחים שיש מספיק.
import type { Recipe } from "@/lib/types";
import { formatQuantity, parseQuantity } from "@/lib/quantity";
import { haveIngredient, pantryItemMatches, pantryTokens } from "@/lib/pantryCheck";
import { DEFAULT_BASICS, type Basic } from "@/lib/basics";

export type PantryAmount = { name: string; amount: string | null };

export type Assessment =
  | { status: "ok" } // יש במזווה (או מצרך בסיס), והכמות מספיקה או שאי אפשר לדעת
  | { status: "missing" } // לא נמצא במזווה
  | { status: "short"; haveText: string; shortBy: string }; // יש, אבל לא מספיק

// יחידות שאפשר להמיר זו לזו: משקל, נפח, וכף/כפית. כל יחידה אחרת משווים רק לעצמה.
const FACTORS: Record<string, { family: string; factor: number }> = {
  גרם: { family: "mass", factor: 1 },
  קילו: { family: "mass", factor: 1000 },
  'מ"ל': { family: "volume", factor: 1 },
  ליטר: { family: "volume", factor: 1000 },
  כפית: { family: "spoon", factor: 1 },
  כף: { family: "spoon", factor: 3 },
  "": { family: "count", factor: 1 },
  יחידה: { family: "count", factor: 1 },
};
const factorOf = (unit: string) => FACTORS[unit] ?? { family: `unit:${unit}`, factor: 1 };

// כמות בבסיס (גרם, מ"ל...) בחזרה לטקסט. כשמשקל או נפח קטן מקילו או ליטר, כותבים ביחידה הקטנה:
// "700 גרם" ולא "0.7 קילו".
function formatBase(base: number, unit: string): string {
  const rounded = Math.round(base * 100) / 100;
  if (unit === "קילו" && rounded < 1000) return `${rounded} גרם`;
  if (unit === "ליטר" && rounded < 1000) return `${rounded} מ"ל`;
  return formatQuantity(base / factorOf(unit).factor, unit);
}

export function assessIngredient(
  ing: { name: string; amount: string },
  pantry: PantryAmount[],
  basics: Basic[] = DEFAULT_BASICS
): Assessment {
  const rows = pantry.filter((p) => pantryItemMatches(ing.name, p.name));

  if (rows.length === 0) {
    // לא במזווה: או מצרך בסיס (מלח, מים...) שמניחים שיש, או חסר
    return haveIngredient(ing.name, pantryTokens(pantry.map((p) => p.name)), basics) ? { status: "ok" } : { status: "missing" };
  }

  const need = parseQuantity(ing.amount ?? "");
  if (!need) return { status: "ok" }; // "מעט", "לפי הטעם"... אין מה להשוות

  const needF = factorOf(need.unit);
  const needBase = need.value * needF.factor;

  let haveBase = 0;
  let uncertain = false; // יש שורה שאי אפשר לדעת כמה בה
  for (const row of rows) {
    const have = parseQuantity(row.amount ?? "");
    const f = have ? factorOf(have.unit) : null;
    if (!have || !f || f.family !== needF.family) {
      uncertain = true;
      continue;
    }
    haveBase += have.value * f.factor;
  }

  const EPS = 1e-9;
  if (haveBase + EPS >= needBase) return { status: "ok" };
  if (uncertain) return { status: "ok" }; // ייתכן שבשורה הלא ברורה יש מספיק

  return {
    status: "short",
    haveText: formatBase(haveBase, need.unit),
    shortBy: formatBase(needBase - haveBase, need.unit),
  };
}

export function assessRecipe(recipe: Recipe, pantry: PantryAmount[], basics: Basic[] = DEFAULT_BASICS): Assessment[] {
  return recipe.ingredients.map((ing) => assessIngredient(ing, pantry, basics));
}

// מתכון שמוכן ל"הוסף חסרים": מצרך חסר נכנס בכמות המלאה, ומצרך שחסר חלקית נכנס רק בכמות החסרה.
export function toShoppingRecipe(recipe: Recipe, assessments: Assessment[]): Recipe {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ing, i) => {
      const a = assessments[i];
      if (a.status === "short") return { ...ing, have: false, amount: a.shortBy };
      return { ...ing, have: a.status === "ok" };
    }),
  };
}

// כמה מצרכים לא מוכנים (חסרים לגמרי או חלקית)
export const countMissing = (assessments: Assessment[]) => assessments.filter((a) => a.status !== "ok").length;