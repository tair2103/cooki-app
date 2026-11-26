// הוספת המצרכים החסרים של מתכון לרשימת הקניות (הכללים ב-shoppingPlan.ts).
import { supabase } from "@/lib/supabase";
import { dbErrorMessage, takeDbMessage } from "@/lib/dbErrors";
import { inScope, withSpace } from "@/lib/spaceScope";
import type { Recipe } from "@/lib/types";
import { categorizeMany } from "@/lib/categorizeItems";
import { planAddMissing, TITLE_SEP } from "@/lib/shoppingPlan";

export type AddResult = { added: number; merged: number; skipped: number; error: string | null };

export async function addMissingToShopping(recipe: Recipe): Promise<AddResult> {
  const missing = recipe.ingredients.filter((i) => !i.have);
  if (missing.length === 0) return { added: 0, merged: 0, skipped: 0, error: null };

  // מה שכבר ברשימה ועוד לא נקנה. פריט שנקנה כבר לא נחשב.
  const { data: existing, error: selectError } = await inScope(
    supabase.from("shopping_items").select("id, name, amount, recipe_title").eq("is_checked", false)
  );

  if (selectError) {
    console.error("shopping select error:", selectError);
    return { added: 0, merged: 0, skipped: 0, error: "קריאת רשימת הקניות נכשלה." };
  }

  const plan = planAddMissing((existing ?? []) as any[], missing, recipe.title);

  for (const u of plan.updates) {
    const { error } = await supabase
      .from("shopping_items")
      .update({ amount: u.amount || null, recipe_title: u.recipe_title })
      .eq("id", u.id);
    if (error) {
      console.error("shopping merge error:", error);
      return { added: 0, merged: 0, skipped: 0, error: "עדכון רשימת הקניות נכשל." };
    }
  }

  if (plan.inserts.length > 0) {
    // מילון קודם, ו-AI רק למצרכים שהמילון לא הכיר
    const categories = await categorizeMany(plan.inserts.map((i) => i.name));

    const { error } = await supabase.from("shopping_items").insert(
      plan.inserts.map((i) => withSpace({
        name: i.name,
        amount: i.amount || null,
        category: categories[i.name],
        recipe_title: recipe.title,
      }))
    );
    if (error) {
      console.error("shopping insert error:", error);
      return { added: 0, merged: 0, skipped: 0, error: dbErrorMessage(error, "shopping", "הוספה לרשימת הקניות נכשלה.") };
    }
  }

  return { added: plan.added, merged: plan.merged, skipped: plan.skipped, error: null };
}

export { TITLE_SEP };