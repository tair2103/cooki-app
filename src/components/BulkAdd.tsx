// הוספה מהירה של כמה פריטים בבת אחת: כותבים טקסט חופשי, מקבלים תצוגה מקדימה
// שאפשר לתקן, ורק אחרי אישור הפריטים נוספים. משמש גם את המזווה וגם את רשימת הקניות.
"use client";

import { useId, useState } from "react";
import { parseItemsText } from "@/lib/parseItems";
import { findMatch } from "@/lib/mergeItems";
import { takeDbMessage } from "@/lib/dbErrors";

export type BulkRow = { name: string; amount: string; group: string };
type Row = BulkRow & { key: number };

type Props = {
  placeholder: string;
  groupLabel: string; // "קטגוריה" או "מיקום"
  groupOptions: string[];
  groupMode: "select" | "free"; // select = בחירה מרשימה, free = הקלדה חופשית עם הצעות
  existing: { name: string; amount: string | null; group?: string }[]; // לזיהוי פריטים שיאוחדו
  // true (מזווה): איחוד רק אם גם המיקום זהה. false (קניות): איחוד לפי שם בלבד.
  matchByGroup?: boolean;
  suggestGroups: (names: string[]) => Promise<Record<string, string>>;
  onConfirm: (rows: BulkRow[]) => Promise<boolean>;
};

const inputStyle = { padding: "0.4rem", border: "1px solid #ccc", borderRadius: "4px", minWidth: 0 } as const;

export default function BulkAdd({
  placeholder,
  groupLabel,
  groupOptions,
  groupMode,
  existing,
  matchByGroup = false,
  suggestGroups,
  onConfirm,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function parse() {
    setMessage("");
    const items = parseItemsText(text);
    if (items.length === 0) {
      setRows([]);
      setMessage("לא זוהו פריטים. אפשר להפריד בפסיקים או בשורות חדשות.");
      return;
    }

    setIsParsing(true);
    let groups: Record<string, string> = {};
    try {
      groups = await suggestGroups(items.map((i) => i.name));
    } catch (e) {
      console.error("הצעת קבוצות נכשלה:", e);
    }
    setRows(items.map((it, i) => ({ key: i, name: it.name, amount: it.amount, group: groups[it.name] ?? "" })));
    setIsParsing(false);
  }

  function updateRow(key: number, field: keyof BulkRow, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function confirm() {
    const valid = rows.filter((r) => r.name.trim());
    if (valid.length === 0) return;

    setIsSaving(true);
    const ok = await onConfirm(
      valid.map((r) => ({ name: r.name.trim(), amount: r.amount.trim(), group: r.group }))
    );
    setIsSaving(false);

    if (ok) {
      setText("");
      setRows([]);
      setMessage(`נוספו ${valid.length} פריטים ✓`);
    } else {
      setMessage(takeDbMessage("ההוספה נכשלה. בדקי את ה-Console."));
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ marginBottom: "1rem", padding: "0.45rem 0.9rem", backgroundColor: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe", borderRadius: "6px", cursor: "pointer" }}
      >
        ➕ הוספה מהירה של כמה פריטים
      </button>
    );
  }

  return (
    <section style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid #c7d2fe", borderRadius: "8px", backgroundColor: "#f5f7ff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>הוספה מהירה</strong>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
          סגור ✕
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={20000}
        placeholder={placeholder}
        rows={3}
        style={{ width: "100%", marginTop: "0.5rem", padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box", fontFamily: "inherit" }}
      />
      <button
        onClick={parse}
        disabled={isParsing || !text.trim()}
        style={{ marginTop: "0.5rem", padding: "0.45rem 1rem", backgroundColor: isParsing || !text.trim() ? "#9ca3af" : "#6366f1", color: "white", border: "none", borderRadius: "6px", cursor: isParsing || !text.trim() ? "not-allowed" : "pointer" }}
      >
        {isParsing ? "מפענח..." : "פענח"}
      </button>

      {message && <p style={{ margin: "0.75rem 0 0", color: message.includes("✓") ? "#047857" : "#991b1b" }}>{message}</p>}

      {rows.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem", color: "#4b5563", fontSize: "0.95rem" }}>
            כך זה יתווסף. אפשר לתקן כל שדה או למחוק שורה לפני האישור:
          </p>

          {groupMode === "free" && (
            <datalist id={listId}>
              {groupOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}

          {rows.map((row) => {
            const match = findMatch(existing, row.name, matchByGroup ? row.group : undefined);
            // באותו שם אבל במיקום אחר: לא מאחדים, ורק מודיעים
            const otherPlace = matchByGroup && !match && !!row.name.trim() ? findMatch(existing, row.name) : undefined;
            return (
              <div key={row.key} style={{ marginBottom: "0.6rem" }}>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <input value={row.name} onChange={(e) => updateRow(row.key, "name", e.target.value)} maxLength={80} aria-label="שם המצרך" placeholder="שם" style={{ ...inputStyle, flex: 2 }} />
                  <input value={row.amount} onChange={(e) => updateRow(row.key, "amount", e.target.value)} maxLength={40} aria-label="כמות" placeholder="כמות" style={{ ...inputStyle, flex: 1 }} />
                  {groupMode === "select" ? (
                    <select value={row.group} onChange={(e) => updateRow(row.key, "group", e.target.value)} aria-label={groupLabel} style={{ ...inputStyle, flex: 1.3, backgroundColor: "white" }}>
                      {row.group && !groupOptions.includes(row.group) && <option value={row.group}>{row.group}</option>}
                      {groupOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={row.group} onChange={(e) => updateRow(row.key, "group", e.target.value)} maxLength={40} list={listId} aria-label={groupLabel} placeholder={groupLabel} style={{ ...inputStyle, flex: 1.3 }} />
                  )}
                  <button onClick={() => removeRow(row.key)} aria-label="מחק שורה" style={{ backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "4px", padding: "0.3rem 0.55rem", cursor: "pointer" }}>
                    ✕
                  </button>
                </div>
                {match && (
                  <div style={{ fontSize: "0.82rem", color: "#92400e", marginTop: "0.15rem" }}>
                    כבר קיים ({match.amount ? `כמות: ${match.amount}` : "ללא כמות"}), הכמויות יאוחדו
                  </div>
                )}
                {otherPlace && (
                  <div style={{ fontSize: "0.82rem", color: "#6b7280", marginTop: "0.15rem" }}>
                    קיים גם ב{otherPlace.group?.trim() || "ללא מיקום"}, יתווסף כפריט נפרד
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={confirm}
            disabled={isSaving}
            style={{ marginTop: "0.25rem", padding: "0.5rem 1.1rem", backgroundColor: isSaving ? "#9ca3af" : "#10b981", color: "white", border: "none", borderRadius: "6px", cursor: isSaving ? "not-allowed" : "pointer" }}
          >
            {isSaving ? "מוסיף..." : `הוסף ${rows.filter((r) => r.name.trim()).length} פריטים`}
          </button>
        </div>
      )}
    </section>
  );
}