// העתקה (לא העברה) בין "האישי שלי" למרחבים משותפים, ובין מרחבים. המקור נשאר כמו שהוא.
// יעד null = "האישי שלי".
import { supabase } from "@/lib/supabase";
import { inScope } from "@/lib/spaceScope";
import { dbErrorMessage } from "@/lib/dbErrors";
import { planMerge } from "@/lib/mergeItems";

export type CopyResult = { ok: boolean; message: string };

// סינון שאילתה ליעד שנבחר (שונה מההיקף הנוכחי)
function inDest<T>(query: T, dest: string | null): T {
  const q = query as unknown as { eq(c: string, v: string): T; is(c: string, v: null): T };
  return dest ? q.eq("space_id", dest) : q.is("space_id", null);
}

// שדות שלא מועתקים: הם שייכים לשורה המקורית או למרחב/תיקייה שלה (תיקיות קיימות רק בתוך מרחב אחד)
const RECIPE_SKIP = ["id", "created_at", "user_id", "space_id", "folder_id"];

export async function copyRecipe(recipe: Record<string, unknown>, dest: string | null): Promise<CopyResult> {
  const title = String(recipe.title ?? "");
  const dup = await inDest(supabase.from("recipes").select("id").eq("title", title), dest).limit(1);
  if (dup.error) return { ok: false, message: "ההעתקה נכשלה. אפשר לנסות שוב." };
  if ((dup.data ?? []).length > 0) return { ok: false, message: "כבר יש מתכון באותו שם ביעד, ולכן לא הועתק." };

  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(recipe)) if (!RECIPE_SKIP.includes(k)) copy[k] = v;

  const { error } = await supabase.from("recipes").insert([{ ...copy, space_id: dest }]);
  if (error) {
    console.error("copy recipe error:", error);
    return { ok: false, message: dbErrorMessage(error, "recipes", "ההעתקה נכשלה. אפשר לנסות שוב.") };
  }
  return { ok: true, message: "המתכון הועתק (בלי תיקייה: אפשר לשייך אותו לתיקייה ביעד)." };
}

type PantryRow = { id?: string; item_name: string; quantity: string | null; location: string | null };

// מזווה: כל הפריטים של ההיקף הנוכחי. פריט שקיים ביעד באותו מיקום מתאחד בכמות, אחרת נוסף.
export async function copyPantry(dest: string | null): Promise<CopyResult> {
  const src = await inScope(supabase.from("pantry_items").select("item_name, quantity, location"));
  if (src.error) return { ok: false, message: "ההעתקה נכשלה. אפשר לנסות שוב." };
  const rows = (src.data ?? []) as PantryRow[];
  if (rows.length === 0) return { ok: false, message: "אין פריטים להעתקה." };

  const dst = await inDest(supabase.from("pantry_items").select("id, item_name, quantity, location"), dest);
  if (dst.error) return { ok: false, message: "ההעתקה נכשלה. אפשר לנסות שוב." };
  const existing = ((dst.data ?? []) as PantryRow[]).map((i) => ({
    id: i.id as string,
    name: i.item_name,
    amount: i.quantity,
    group: i.location?.trim() ?? "",
  }));
  const plan = planMerge(
    existing,
    rows.map((r) => ({ name: r.item_name, amount: r.quantity ?? "", group: r.location?.trim() ?? "" })),
    { matchGroup: true }
  );

  for (const u of plan.updates) {
    const { error } = await supabase.from("pantry_items").update({ quantity: u.amount }).eq("id", u.id);
    if (error) return { ok: false, message: dbErrorMessage(error, "pantry", "ההעתקה נכשלה באמצע. אפשר לנסות שוב.") };
  }
  if (plan.inserts.length > 0) {
    const { error } = await supabase.from("pantry_items").insert(
      plan.inserts.map((i) => ({
        item_name: i.name,
        quantity: i.amount || null,
        location: (i.group ?? "").trim() || null,
        space_id: dest,
      }))
    );
    if (error) return { ok: false, message: dbErrorMessage(error, "pantry", "ההעתקה נכשלה באמצע. אפשר לנסות שוב.") };
  }
  return { ok: true, message: `הועתקו ${plan.inserts.length} פריטים חדשים, ו-${plan.updates.length} אוחדו עם פריטים קיימים.` };
}

type ShopRow = { id?: string; name: string; amount: string | null; category: string | null };

// רשימת קניות: הפריטים שעוד לא סומנו. אותו עיקרון איחוד.
export async function copyShopping(dest: string | null): Promise<CopyResult> {
  const src = await inScope(supabase.from("shopping_items").select("name, amount, category").eq("is_checked", false));
  if (src.error) return { ok: false, message: "ההעתקה נכשלה. אפשר לנסות שוב." };
  const rows = (src.data ?? []) as ShopRow[];
  if (rows.length === 0) return { ok: false, message: "אין פריטים להעתקה." };

  const dst = await inDest(supabase.from("shopping_items").select("id, name, amount, category").eq("is_checked", false), dest);
  if (dst.error) return { ok: false, message: "ההעתקה נכשלה. אפשר לנסות שוב." };
  const existing = ((dst.data ?? []) as ShopRow[]).map((i) => ({ id: i.id as string, name: i.name, amount: i.amount }));
  const plan = planMerge(existing, rows.map((r) => ({ name: r.name, amount: r.amount ?? "", group: r.category ?? "" })));

  for (const u of plan.updates) {
    const { error } = await supabase.from("shopping_items").update({ amount: u.amount }).eq("id", u.id);
    if (error) return { ok: false, message: dbErrorMessage(error, "shopping", "ההעתקה נכשלה באמצע. אפשר לנסות שוב.") };
  }
  if (plan.inserts.length > 0) {
    const { error } = await supabase.from("shopping_items").insert(
      plan.inserts.map((i) => ({ name: i.name, amount: i.amount || null, category: i.group || null, space_id: dest }))
    );
    if (error) return { ok: false, message: dbErrorMessage(error, "shopping", "ההעתקה נכשלה באמצע. אפשר לנסות שוב.") };
  }
  return { ok: true, message: `הועתקו ${plan.inserts.length} פריטים חדשים, ו-${plan.updates.length} אוחדו עם פריטים קיימים.` };
}