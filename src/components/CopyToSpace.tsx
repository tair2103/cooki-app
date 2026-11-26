// בורר יעד וכפתור "העתקה". היעדים: "האישי שלי" ומרחבים משותפים, חוץ מהמקום שבו נמצאים עכשיו.
"use client";

import { useState } from "react";
import { useSpaces } from "@/lib/spaces";
import type { CopyResult } from "@/lib/copyToSpace";

const PERSONAL = "__personal__";

export default function CopyToSpace({ label, onCopy }: { label: string; onCopy: (dest: string | null) => Promise<CopyResult> }) {
  const { spaces, activeSpaceId } = useSpaces();
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CopyResult | null>(null);

  const options: { value: string; name: string }[] = [];
  if (activeSpaceId !== null) options.push({ value: PERSONAL, name: "האישי שלי" });
  for (const s of spaces) if (s.id !== activeSpaceId) options.push({ value: s.id, name: s.name });
  if (options.length === 0) return null; // אין לאן להעתיק

  async function copy() {
    if (!dest || busy) return;
    setBusy(true);
    setResult(null);
    const r = await onCopy(dest === PERSONAL ? null : dest);
    setBusy(false);
    setResult(r);
  }

  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
      <select
        value={dest}
        onChange={(e) => {
          setDest(e.target.value);
          setResult(null);
        }}
        aria-label={label}
        style={{ padding: "0.3rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.name}
          </option>
        ))}
      </select>
      <button
        onClick={copy}
        disabled={!dest || busy}
        style={{ padding: "0.3rem 0.7rem", border: "1px solid #c7d2fe", background: dest ? "#eef2ff" : "#f9fafb", color: "#3730a3", borderRadius: "6px", cursor: dest && !busy ? "pointer" : "not-allowed" }}
      >
        {busy ? "מעתיק..." : "העתקה"}
      </button>
      {result && (
        <span role="status" style={{ color: result.ok ? "#15803d" : "#b91c1c" }}>
          {result.message}
        </span>
      )}
    </div>
  );
}