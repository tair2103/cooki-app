// עריכת מתכון לפני שמירה: שם, פרטים, מצרכים ושלבים. שדות פשוטים, בלי שמירה בפנים:
// הרכיב רק מציג את המתכון ומדווח על כל שינוי דרך onChange.
"use client";

import type { Recipe } from "@/lib/types";
import { haveIngredient, pantryTokens } from "@/lib/pantryCheck";
import type { Basic } from "@/lib/basics";

type Props = {
  value: Recipe;
  onChange: (next: Recipe) => void;
  pantryNames?: string[] | null; // אם נתון, מציגים ליד כל מצרך אם הוא בבית
  basics?: Basic[]; // מוצרי הבסיס של המשתמשת (ברירת מחדל אם לא נתון)
};

const DISH_TYPES = ["ארוחה", "נשנוש", "קינוח"];
const MEAL_TIMES = ["בוקר", "צהריים", "ערב"];
const DIFFICULTIES = ["קל", "בינוני", "מורכב"];

const input = { padding: "0.4rem", border: "1px solid #ccc", borderRadius: "4px", minWidth: 0, fontFamily: "inherit" } as const;
const small = { padding: "0.3rem 0.55rem", border: "none", borderRadius: "4px", cursor: "pointer" } as const;

export default function RecipeEditor({ value, onChange, pantryNames, basics }: Props) {
  const set = <K extends keyof Recipe>(key: K, v: Recipe[K]) => onChange({ ...value, [key]: v });
  const pantry = pantryNames ? pantryTokens(pantryNames) : null;

  const setIng = (i: number, field: "name" | "amount", v: string) =>
    set("ingredients", value.ingredients.map((x, idx) => (idx === i ? { ...x, [field]: v } : x)));
  const setStep = (i: number, v: string) => set("steps", value.steps.map((x, idx) => (idx === i ? v : x)));
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.steps.length) return;
    const next = [...value.steps];
    [next[i], next[j]] = [next[j], next[i]];
    set("steps", next);
  };

  const label = (text: string, child: React.ReactNode, flex = "1 1 8rem") => (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex, fontSize: "0.9rem" }}>
      {text}
      {child}
    </label>
  );

  return (
    <div>
      {label(
        "שם המתכון",
        <input value={value.title} onChange={(e) => set("title", e.target.value)} maxLength={100} style={{ ...input, fontSize: "1.05rem", fontWeight: "bold" }} />,
        "1 1 100%"
      )}

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", margin: "0.75rem 0" }}>
        {label(
          "סוג מנה",
          <select value={value.dish_type} onChange={(e) => onChange({ ...value, dish_type: e.target.value, meal_time: e.target.value === "ארוחה" ? value.meal_time : "" })} style={{ ...input, backgroundColor: "white" }}>
            {DISH_TYPES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        )}
        {value.dish_type === "ארוחה" &&
          label(
            "זמן ביום",
            <select value={value.meal_time} onChange={(e) => set("meal_time", e.target.value)} style={{ ...input, backgroundColor: "white" }}>
              <option value="">לא משנה</option>
              {MEAL_TIMES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          )}
        {label(
          "קושי",
          <select value={value.difficulty} onChange={(e) => set("difficulty", e.target.value)} style={{ ...input, backgroundColor: "white" }}>
            {DIFFICULTIES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        )}
        {label("זמן (דקות)", <input type="number" min={0} max={1440} value={value.prep_minutes} onChange={(e) => set("prep_minutes", Math.max(0, Math.min(1440, Math.round(Number(e.target.value) || 0))))} style={input} />, "1 1 6rem")}
        {label("מטבח", <input value={value.cuisine} onChange={(e) => set("cuisine", e.target.value)} maxLength={40} style={input} />)}
      </div>

      <h4 style={{ margin: "0.5rem 0 0.25rem" }}>מצרכים</h4>
      {value.ingredients.map((ing, i) => {
        const have = pantry ? haveIngredient(ing.name, pantry, basics) : null;
        return (
          <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.35rem" }}>
            <input value={ing.name} onChange={(e) => setIng(i, "name", e.target.value)} aria-label="שם מצרך" placeholder="מצרך" maxLength={80} style={{ ...input, flex: 2 }} />
            <input value={ing.amount} onChange={(e) => setIng(i, "amount", e.target.value)} aria-label="כמות" placeholder="כמות" maxLength={40} style={{ ...input, flex: 1 }} />
            {have !== null && (
              <span style={{ fontSize: "0.82rem", minWidth: "3.2rem", color: have ? "#047857" : "#b45309" }}>{have ? "✓ בבית" : "חסר"}</span>
            )}
            <button onClick={() => set("ingredients", value.ingredients.filter((_, idx) => idx !== i))} aria-label="מחק מצרך" style={{ ...small, backgroundColor: "#ef4444", color: "white" }}>
              ✕
            </button>
          </div>
        );
      })}
      <button onClick={() => set("ingredients", [...value.ingredients, { name: "", amount: "", have: false }])} style={{ ...small, backgroundColor: "#eef2ff", color: "#3730a3" }}>
        ➕ מצרך
      </button>

      <h4 style={{ margin: "1rem 0 0.25rem" }}>הכנה</h4>
      {value.steps.map((step, i) => (
        <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start", marginBottom: "0.4rem" }}>
          <span style={{ paddingTop: "0.4rem", minWidth: "1.5rem", color: "#6b7280" }}>{i + 1}.</span>
          <textarea value={step} onChange={(e) => setStep(i, e.target.value)} aria-label={`שלב ${i + 1}`} rows={2} maxLength={600} style={{ ...input, flex: 1, resize: "vertical" }} />
          <span style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <button onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="הזז שלב למעלה" style={{ ...small, backgroundColor: "#e5e7eb", opacity: i === 0 ? 0.4 : 1 }}>▲</button>
            <button onClick={() => moveStep(i, 1)} disabled={i === value.steps.length - 1} aria-label="הזז שלב למטה" style={{ ...small, backgroundColor: "#e5e7eb", opacity: i === value.steps.length - 1 ? 0.4 : 1 }}>▼</button>
          </span>
          <button onClick={() => set("steps", value.steps.filter((_, idx) => idx !== i))} aria-label="מחק שלב" style={{ ...small, backgroundColor: "#ef4444", color: "white" }}>
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => set("steps", [...value.steps, ""])} style={{ ...small, backgroundColor: "#eef2ff", color: "#3730a3" }}>
        ➕ שלב
      </button>
    </div>
  );
}