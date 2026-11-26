// "סיימתי קניות": מעביר את המצרכים שסומנו כנקנו אל המזווה.
// קודם בוחרים איך לשייך למיקום, רואים תצוגה מקדימה, ורק אחרי אישור זה קורה.
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { dbErrorMessage, takeDbMessage } from "@/lib/dbErrors";
import { inScope, withSpace } from "@/lib/spaceScope";
import { planFinish, type FinishMode, type PantryRow } from "@/lib/finishShopping";

export type BoughtItem = { id: string; name: string; amount: string | null };

type Props = {
  bought: BoughtItem[]; // הפריטים המסומנים ברשימת הקניות
  onDone: (message: string) => void; // נקרא אחרי הצלחה, כדי לרענן את הרשימה
};

export default function FinishShopping({ bought, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FinishMode>("merge");
  const [pantry, setPantry] = useState<PantryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  if (bought.length === 0) return null;

  // המזווה נטען רק כשפותחים, כדי שהתצוגה המקדימה תתבסס על המצב העדכני
  async function openPanel() {
    setError("");
    setIsLoading(true);
    const { data, error: err } = await inScope(supabase.from("pantry_items").select("id, item_name, quantity, location"));
    setIsLoading(false);
    if (err) {
      console.error("finish shopping: pantry load error:", err);
      setError("טעינת המזווה נכשלה.");
      return;
    }
    setPantry(
      (data ?? []).map((r: any) => ({ id: r.id, name: r.item_name, amount: r.quantity, location: r.location }))
    );
    setOpen(true);
  }

  const plan = planFinish(bought, pantry, mode);

  async function confirm() {
    setIsSaving(true);
    setError("");

    for (const u of plan.updates) {
      const { error: err } = await supabase.from("pantry_items").update({ quantity: u.amount || null }).eq("id", u.id);
      if (err) {
        console.error("finish shopping update error:", err);
        setError("העדכון נכשל. לא נמחק כלום מרשימת הקניות.");
        setIsSaving(false);
        return;
      }
    }

    if (plan.inserts.length > 0) {
      const { error: err } = await supabase.from("pantry_items").insert(
        plan.inserts.map((i) => withSpace({
          item_name: i.name,
          quantity: i.amount || null,
          location: i.location.trim() || null,
        }))
      );
      if (err) {
        console.error("finish shopping insert error:", err);
        setError(dbErrorMessage(err, "pantry", "ההוספה נכשלה.") + " לא נמחק כלום מרשימת הקניות.");
        setIsSaving(false);
        return;
      }
    }

    // רק אחרי שהמזווה התעדכן, מסירים את הפריטים מרשימת הקניות
    const { error: delErr } = await supabase
      .from("shopping_items")
      .delete()
      .in("id", bought.map((b) => b.id));
    setIsSaving(false);
    if (delErr) {
      console.error("finish shopping delete error:", delErr);
      setError("המזווה התעדכן, אבל הסרת הפריטים מהרשימה נכשלה. אפשר ללחוץ על 'נקה פריטים שנקנו'.");
      return;
    }

    setOpen(false);
    const merged = plan.rows.filter((r) => r.outcome === "merge").length;
    const noLocation = plan.inserts.filter((i) => !i.location.trim()).length;
    onDone(
      `${bought.length} פריטים עברו למזווה` +
        (merged ? `, מתוכם ${merged} אוחדו עם פריט קיים` : "") +
        (noLocation ? `. ${noLocation} נוספו ללא מיקום, אפשר לשייך אותם במזווה (✏️)` : "")
    );
  }

  const radio = (value: FinishMode, title: string, hint: string) => (
    <label style={{ display: "block", padding: "0.5rem 0.6rem", marginBottom: "0.4rem", border: "1px solid " + (mode === value ? "#6366f1" : "#e5e7eb"), borderRadius: "8px", backgroundColor: mode === value ? "#eef2ff" : "white", cursor: "pointer" }}>
      <input type="radio" name="finish-mode" checked={mode === value} onChange={() => setMode(value)} style={{ marginInlineEnd: "0.5rem" }} />
      <strong>{title}</strong>
      <span style={{ display: "block", color: "#6b7280", fontSize: "0.88rem", marginInlineStart: "1.5rem" }}>{hint}</span>
    </label>
  );

  return (
    <div style={{ marginTop: "1rem" }}>
      {!open && (
        <button
          onClick={openPanel}
          disabled={isLoading}
          style={{ padding: "0.6rem 1rem", backgroundColor: isLoading ? "#9ca3af" : "#10b981", color: "white", border: "none", borderRadius: "6px", cursor: isLoading ? "not-allowed" : "pointer", fontWeight: "bold" }}
        >
          {isLoading ? "טוען..." : `סיימתי קניות - הוסף מסומנים למזווה (${bought.length})`}
        </button>
      )}

      {open && (
        <section style={{ padding: "1rem", border: "1px solid #a7f3d0", borderRadius: "8px", backgroundColor: "#f0fdf4" }}>
          <strong>הוספת {bought.length} פריטים למזווה</strong>

          <div style={{ marginTop: "0.6rem" }}>
            {radio("merge", "לאחד עם פריט קיים", "אם הפריט כבר במזווה, הכמות מתווספת אליו במקום שבו הוא נמצא. אחרת הוא נכנס ללא מיקום.")}
            {radio("none", "הכל ללא מיקום", "הפריטים נכנסים ל\"ללא מיקום\" ואת מקום האחסון בוחרים אחר כך.")}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: "0.6rem 0" }}>
            {plan.rows.map((r) => (
              <li key={r.id} style={{ padding: "0.35rem 0", borderBottom: "1px solid #dcfce7" }}>
                <strong>{r.name}</strong> {r.amount ? `- ${r.amount}` : ""}
                <span style={{ display: "block", fontSize: "0.82rem", color: r.outcome === "merge" ? "#92400e" : "#6b7280" }}>{r.note}</span>
              </li>
            ))}
          </ul>

          {error && <p style={{ color: "#991b1b" }}>{error}</p>}

          <button
            onClick={confirm}
            disabled={isSaving}
            style={{ padding: "0.5rem 1.1rem", backgroundColor: isSaving ? "#9ca3af" : "#10b981", color: "white", border: "none", borderRadius: "6px", cursor: isSaving ? "not-allowed" : "pointer" }}
          >
            {isSaving ? "מעביר..." : "אישור והעברה"}
          </button>
          <button onClick={() => setOpen(false)} disabled={isSaving} style={{ marginInlineStart: "0.5rem", padding: "0.5rem 1rem", backgroundColor: "#e5e7eb", border: "none", borderRadius: "6px", cursor: "pointer" }}>
            ביטול
          </button>
        </section>
      )}

      {!open && error && <p style={{ color: "#991b1b" }}>{error}</p>}
    </div>
  );
}