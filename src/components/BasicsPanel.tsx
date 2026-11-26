// "מניחים שיש בבית": מוצרי הבסיס שנחשבים זמינים גם אם הם לא במזווה. כל משתמשת עורכת את שלה.
"use client";

import { useState } from "react";
import { addBasic, basicsText, isDefaultBasics, removeBasic, MAX_BASIC_NAME, type Basic } from "@/lib/basics";

type Props = {
  basics: Basic[];
  onSave: (list: Basic[] | null) => Promise<string | null>; // null = איפוס לברירת מחדל
};

const btn = { padding: "0.3rem 0.65rem", border: "1px solid #d1d5db", borderRadius: "6px", backgroundColor: "white", cursor: "pointer", color: "#374151" } as const;

export default function BasicsPanel({ basics, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [exact, setExact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setMsg("");
    const error = await action();
    setBusy(false);
    if (error) setMsg(error);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const result = addBasic(basics, name, exact);
    if (result.error) {
      setMsg(result.error);
      return;
    }
    await run(async () => {
      const error = await onSave(result.list);
      if (!error) {
        setName("");
        setExact(false);
      }
      return error;
    });
  }

  return (
    <section style={{ marginBottom: "1rem", padding: "0.75rem 1rem", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fffdf7", fontSize: "0.92rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
        <div style={{ color: "#4b5563" }}>
          <strong>מניחים שיש בבית:</strong>{" "}
          {basics.length > 0 ? basicsText(basics) : "כלום. רק מה שבמזווה נחשב כקיים."}
        </div>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ ...btn, whiteSpace: "nowrap" }}>
          {open ? "סגירה" : "עריכה"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ margin: "0 0 0.5rem", color: "#6b7280" }}>
            מצרכים כאלה לא יסומנו כחסרים, וה-AI לא יצטרך אותם במזווה. כדאי לכלול רק מה שבאמת תמיד יש לך.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
            {basics.map((b, i) => (
              <span key={`${b.name}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0.3rem 0.2rem 0.6rem", border: "1px solid #e5e7eb", borderRadius: "999px", backgroundColor: "white" }}>
                {b.name}
                {b.exact && <span title="מתאים רק לשם הזה בדיוק" style={{ color: "#9ca3af", fontSize: "0.78rem" }}>(מדויק)</span>}
                <button
                  onClick={() => run(() => onSave(removeBasic(basics, i)))}
                  disabled={busy}
                  aria-label={`הסר ${b.name}`}
                  style={{ border: "none", background: "none", cursor: busy ? "not-allowed" : "pointer", color: "#9ca3af", padding: "0 0.25rem" }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          <form onSubmit={add} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_BASIC_NAME}
              placeholder="מצרך להוסיף, למשל סוכר"
              aria-label="מצרך בסיס להוספה"
              style={{ flex: "1 1 10rem", padding: "0.4rem", border: "1px solid #ccc", borderRadius: "4px", minWidth: 0 }}
            />
            <button type="submit" disabled={busy || !name.trim()} style={{ ...btn, backgroundColor: busy || !name.trim() ? "#f3f4f6" : "#eef2ff", color: "#3730a3" }}>
              הוספה
            </button>
            <label style={{ flexBasis: "100%", fontSize: "0.85rem", color: "#6b7280" }}>
              <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> התאמה מדויקת בלבד (למשל "פלפל" ולא "פלפל אדום")
            </label>
          </form>

          {msg && <p role="alert" style={{ margin: "0.5rem 0 0", color: "#991b1b" }}>{msg}</p>}

          {!isDefaultBasics(basics) && (
            <button onClick={() => run(() => onSave(null))} disabled={busy} style={{ ...btn, marginTop: "0.6rem" }}>
              איפוס לברירת המחדל
            </button>
          )}
        </div>
      )}
    </section>
  );
}