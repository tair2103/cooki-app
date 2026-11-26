// "סיימתי קניות": מה קורה למצרכים שסומנו כנקנו כשמעבירים אותם למזווה.
// לוגיקה טהורה (בלי DB), כדי שאפשר יהיה להציג תצוגה מקדימה ולבדוק אותה.
import { findMatch, planMerge } from "@/lib/mergeItems";
import { sameName } from "@/lib/pantryCheck";

export type PantryRow = { id: string; name: string; amount: string | null; location: string | null };
export type BoughtItem = { id: string; name: string; amount: string | null };

// merge = לאחד עם פריט קיים במזווה (במקום שבו הוא נמצא), אם יש בדיוק אחד כזה
// none  = להוסיף הכל "ללא מיקום", והמשתמשת תבחר מקום אחר כך
export type FinishMode = "merge" | "none";

export type PreviewRow = {
  id: string;
  name: string;
  amount: string;
  outcome: "merge" | "new";
  note: string;
};

export type FinishPlan = {
  rows: PreviewRow[];
  updates: { id: string; amount: string }[];
  inserts: { name: string; amount: string; location: string }[];
};

export function planFinish(bought: BoughtItem[], pantry: PantryRow[], mode: FinishMode): FinishPlan {
  const existing = pantry.map((p) => ({ id: p.id, name: p.name, amount: p.amount, group: p.location ?? "" }));
  const incoming: { name: string; amount: string; group: string }[] = [];
  const rows: PreviewRow[] = [];

  for (const b of bought) {
    const name = b.name.trim();
    if (!name) continue;
    const amount = (b.amount ?? "").trim();

    // באיזה מיקום הפריט ייכנס
    let group = "";
    let extraNote = "";
    if (mode === "merge") {
      const matches = existing.filter((e) => sameName(e.name, name));
      if (matches.length === 1) group = matches[0].group;
      else if (matches.length > 1) extraNote = "קיים ביותר ממקום אחד";
    }

    const target = findMatch(existing, name, group);
    incoming.push({ name, amount, group });

    rows.push({
      id: b.id,
      name,
      amount,
      outcome: target ? "merge" : "new",
      note: target
        ? `יאוחד עם הפריט הקיים ${group ? `ב${group}` : "(ללא מיקום)"}`
        : extraNote
          ? `${extraNote}, יתווסף ללא מיקום`
          : "יתווסף ללא מיקום",
    });
  }

  const plan = planMerge(existing, incoming, { matchGroup: true });
  return {
    rows,
    updates: plan.updates,
    inserts: plan.inserts.map((i) => ({ name: i.name, amount: i.amount, location: i.group ?? "" })),
  };
}