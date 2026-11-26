// מחיקת חשבון עצמית: כפתור, הסבר ברור על מה נמחק ומה נשאר, ואישור בהקלדת כתובת האימייל.
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DeleteAccount({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirmed = typed.trim().toLowerCase() === email.trim().toLowerCase();

  async function doDelete() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("delete_my_account");
    if (rpcError) {
      console.error("מחיקת חשבון נכשלה:", rpcError.message, rpcError.code, rpcError.details, rpcError.hint);
      setError("המחיקה נכשלה. אפשר לנסות שוב, ואם זה חוזר, לפנות אלינו.");
      setBusy(false);
      return;
    }
    onDeleted();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", textDecoration: "underline", fontSize: "0.85rem" }}
      >
        מחיקת חשבון
      </button>
    );
  }

  return (
    <div role="dialog" aria-label="מחיקת חשבון" style={{ flex: "1 1 100%", border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: "8px", padding: "0.75rem 1rem", margin: "0.5rem 1rem", color: "#374151", fontSize: "0.9rem", textAlign: "right" }}>
      <b style={{ color: "#b91c1c" }}>מחיקת החשבון היא סופית ואי אפשר לבטל אותה.</b>
      <ul style={{ margin: "0.4rem 1rem", padding: 0 }}>
        <li>יימחקו: המזווה, רשימת הקניות, המתכונים והתיקיות האישיים, וההגדרות שלך.</li>
        <li>מרחבים משותפים שאת/ה מנהל/ת יישארו לשאר החברים, והניהול יעבור לחבר/ה אחר/ת. מרחב בלי חברים נוספים יימחק.</li>
        <li>תוכן שהוספת למרחבים משותפים נשאר שם.</li>
        <li>כדי להירשם שוב, הכתובת צריכה להיות ברשימת המורשים.</li>
      </ul>
      <label>
        לאישור, כתבו את כתובת האימייל של החשבון:
        <input
          dir="ltr"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          maxLength={254}
          autoComplete="off"
          style={{ display: "block", marginTop: "0.3rem", width: "100%", maxWidth: "20rem", padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
        />
      </label>
      {error && <p role="alert" style={{ color: "#b91c1c", margin: "0.4rem 0 0" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
        <button
          onClick={doDelete}
          disabled={!confirmed || busy}
          style={{ background: confirmed ? "#b91c1c" : "#e5e7eb", color: confirmed ? "#fff" : "#9ca3af", border: "none", borderRadius: "6px", padding: "0.4rem 0.9rem", cursor: confirmed && !busy ? "pointer" : "not-allowed" }}
        >
          {busy ? "מוחק..." : "מחיקת החשבון לצמיתות"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError("");
          }}
          disabled={busy}
          style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: "6px", padding: "0.4rem 0.9rem", cursor: "pointer" }}
        >
          ביטול
        </button>
      </div>
    </div>
  );
}