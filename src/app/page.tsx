// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dbErrorMessage, takeDbMessage } from "@/lib/dbErrors";
import { inScope, withSpace } from "@/lib/spaceScope";
import Link from "next/link";
import { addMissingToShopping } from "@/lib/shopping";
import { loadHomeState, saveHomeState } from "@/lib/homeMemory";
import PantrySection, { type PantryItem } from "@/components/PantrySection";
import type { Recipe } from "@/lib/types";
import { assessRecipe, countMissing, toShoppingRecipe } from "@/lib/quantityCheck";
import { isBasicOnly } from "@/lib/pantryCheck";
import { useBasics } from "@/lib/useBasics";
import { authedFetch } from "@/lib/apiFetch";
import BasicsPanel from "@/components/BasicsPanel";
import {
  ANY,
  CUISINES,
  COMPLEXITIES,
  DEFAULT_FILTERS,
  DIFFICULTIES,
  DISH_TYPES,
  INGREDIENT_MODES,
  MAX_MINUTES,
  MEAL_TIMES,
  type Filters,
  type Option,
} from "@/lib/filters";

// תיבת בחירה אחת עם תווית. משמשת לכל הפילטרים.
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.9rem" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "0.45rem", border: "1px solid #ccc", borderRadius: "4px", backgroundColor: "white" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Home() {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const { basics, loaded: basicsLoaded, save: saveBasics } = useBasics();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // הודעה קצרה לכל כרטיס אחרי הוספה לרשימת הקניות (לפי מספר הכרטיס)
  const [shoppingMsgs, setShoppingMsgs] = useState<Record<number, string>>({});
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // האם כבר טענו את הזיכרון. עד אז לא שומרים, כדי שהמצב הריק ההתחלתי לא ידרוס אותו.
  const [hydrated, setHydrated] = useState(false);
  // אילו כרטיסי מתכון (לפי מספר) כבר נשמרו, כדי לא לשמור פעמיים
  const [savedIndexes, setSavedIndexes] = useState<number[]>([]);

  useEffect(() => {
    // טעינת הזיכרון הזמני: מתכונים שהופקו קודם, סימוני שמירה ופילטרים
    const saved = loadHomeState();
    if (saved) {
      setRecipes(saved.recipes);
      setSavedIndexes(saved.savedIndexes);
      setShoppingMsgs(saved.shoppingMsgs);
      setFilters(saved.filters);
    }
    setHydrated(true);
  }, []);

  // כל שינוי באחד הערכים האלה נשמר אוטומטית
  useEffect(() => {
    if (!hydrated) return;
    saveHomeState({ recipes, savedIndexes, shoppingMsgs, filters });
  }, [hydrated, recipes, savedIndexes, shoppingMsgs, filters]);

  // משנה פילטר אחד. אם סוג המנה כבר לא "ארוחה", מאפסים את זמן היום.
  function updateFilter(key: keyof Filters, value: string) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "dishType" && value !== "ארוחה") next.mealTime = ANY;
      return next;
    });
  }

  // מנקה את המתכונים שמוצגים (ואת הזיכרון שלהם). הפילטרים נשארים.
  function clearRecipes() {
    setRecipes([]);
    setSavedIndexes([]);
    setShoppingMsgs({});
    setErrorMsg("");
  }

  async function generateRecipes() {
    // ג'נרוט חדש מחליף את המתכונים הקיימים, אז מבקשים אישור אם יש כאלה שעוד לא נשמרו
    const hasUnsaved = recipes.some((_, i) => !savedIndexes.includes(i));
    if (
      hasUnsaved &&
      !window.confirm("יש מתכונים שעוד לא שמרת, והם יוחלפו במתכונים חדשים. להמשיך?")
    ) {
      return;
    }

    setIsLoading(true);
    setRecipes([]);
    setSavedIndexes([]);
    setShoppingMsgs({});
    setErrorMsg("");

    try {
      const response = await authedFetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: pantryItems, filters, basics }),
        signal: AbortSignal.timeout(90000),
      });

      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : {};

      if (Array.isArray(data.recipes)) {
        setRecipes(data.recipes);
      } else if (data.error) {
        setErrorMsg(data.error);
      } else {
        setErrorMsg("התקבלה תשובה ריקה מהשרת.");
      }
    } catch (err: any) {
      console.error("generateRecipes error:", err);
      setErrorMsg(`שגיאה: ${err?.message || "תקלת תקשורת מול השרת"}`);
    } finally {
      setIsLoading(false);
    }
  }

  // שומר מתכון אחד בטבלת recipes
  async function saveRecipe(recipe: Recipe, index: number) {
    setErrorMsg("");

    const { error } = await supabase.from("recipes").insert([
      withSpace({
        title: recipe.title,
        dish_type: recipe.dish_type,
        meal_time: recipe.meal_time,
        cuisine: recipe.cuisine,
        difficulty: recipe.difficulty,
        prep_minutes: recipe.prep_minutes,
        ingredients: recipe.ingredients, // נשמר כ-jsonb
        steps: recipe.steps,             // נשמר כ-jsonb
      }),
    ]);

    if (error) {
      console.error("Supabase recipes insert error:", error);
      setErrorMsg(dbErrorMessage(error, "recipes", "שמירת המתכון נכשלה. בדקי את ה-Console."));
      return;
    }

    setSavedIndexes((prev) => [...prev, index]);
  }

  async function addMissing(recipe: Recipe, index: number) {
    const result = await addMissingToShopping(recipe);
    let msg: string;
    if (result.error) msg = result.error;
    else if (result.added === 0 && result.merged === 0 && result.skipped > 0) msg = "כל המצרכים החסרים כבר ברשימה עבור המתכון הזה ✓";
    else {
      const parts: string[] = [];
      if (result.added > 0) parts.push(`נוספו ${result.added} מצרכים`);
      if (result.merged > 0) parts.push(`${result.merged} אוחדו עם פריטים שכבר ברשימה`);
      if (result.skipped > 0) parts.push(`${result.skipped} כבר היו ברשימה עבור המתכון הזה`);
      msg = parts.length > 0 ? parts.join(", ") + " ✓" : "אין מצרכים חסרים ✓";
    }
    setShoppingMsgs((prev) => ({ ...prev, [index]: msg }));
  }

  const isButtonDisabled = isLoading || pantryItems.length === 0 || !basicsLoaded;

  return (
    <main style={{ padding: "2rem", direction: "rtl", fontFamily: "sans-serif", maxWidth: "700px", margin: "0 auto" }}>
      <h1>המזווה של cooki</h1>

      <Link href="/recipes" style={{ color: "#3b82f6", display: "inline-block", marginBottom: "1.5rem" }}>
        📖 ספר המתכונים שלי
      </Link>
      <Link href="/shopping" style={{ color: "#3b82f6", display: "inline-block", marginBottom: "1.5rem", marginInlineStart: "1.5rem" }}>
        🛒 רשימת קניות
      </Link>
      <Link href="/import" style={{ color: "#3b82f6", display: "inline-block", marginBottom: "1.5rem", marginInlineStart: "1.5rem" }}>
        ➕ ייבוא מתכון
      </Link>

      <PantrySection onItemsChange={setPantryItems} />

      <section style={{ marginBottom: "1rem", padding: "1rem", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fff" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem", fontWeight: "bold" }}>מה בא לך להכין?</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
          <FilterSelect label="סוג מנה" value={filters.dishType} options={DISH_TYPES} onChange={(v) => updateFilter("dishType", v)} />

          {/* זמן ביום מופיע רק כשבוחרים ארוחה */}
          {filters.dishType === "ארוחה" && (
            <FilterSelect label="זמן ביום" value={filters.mealTime} options={MEAL_TIMES} onChange={(v) => updateFilter("mealTime", v)} />
          )}

          <FilterSelect label="רמת קושי" value={filters.difficulty} options={DIFFICULTIES} onChange={(v) => updateFilter("difficulty", v)} />
          <FilterSelect label="זמן הכנה" value={filters.maxMinutes} options={MAX_MINUTES} onChange={(v) => updateFilter("maxMinutes", v)} />
          <FilterSelect label="מורכבות (מספר שלבים)" value={filters.complexity} options={COMPLEXITIES} onChange={(v) => updateFilter("complexity", v)} />
          <FilterSelect label="העדפה קולינרית" value={filters.cuisine} options={CUISINES} onChange={(v) => updateFilter("cuisine", v)} />
          <FilterSelect label="מצרכים" value={filters.ingredientsMode} options={INGREDIENT_MODES} onChange={(v) => updateFilter("ingredientsMode", v)} />
        </div>
      </section>

      <BasicsPanel basics={basics} onSave={saveBasics} />

      <button
        onClick={generateRecipes}
        disabled={isButtonDisabled}
        style={{
          width: "100%",
          padding: "0.9rem",
          backgroundColor: isButtonDisabled ? "#9ca3af" : "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "6px",
          fontSize: "1.1rem",
          fontWeight: "bold",
          cursor: isButtonDisabled ? "not-allowed" : "pointer",
        }}
      >
        {isLoading ? "חושב על מתכונים..." : "מה אפשר להכין מהמזווה שלי?"}
      </button>

      {errorMsg && (
        <p style={{ marginTop: "1.5rem", padding: "1rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b" }}>
          {errorMsg}
        </p>
      )}

      {recipes.length > 0 && (
        <section style={{ marginTop: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0 }}>המלצות השף:</h2>
            <button
              onClick={() => {
                if (window.confirm("לנקות את המתכונים שמוצגים? מתכונים שלא שמרת יימחקו.")) clearRecipes();
              }}
              style={{ padding: "0.4rem 0.8rem", backgroundColor: "transparent", color: "#6b7280", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer" }}
            >
              נקה מתכונים
            </button>
          </div>

          {recipes.map((recipe, index) => {
            const isSaved = savedIndexes.includes(index);
            // בדיקה לפי המזווה העדכני, כולל כמויות (לא רק האם המצרך קיים)
            const assessed = assessRecipe(
              recipe,
              pantryItems.map((p) => ({ name: p.item_name, amount: p.quantity })),
              basics
            );

            return (
              <article
                key={index}
                style={{ marginBottom: "1.5rem", padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", lineHeight: "1.6" }}
              >
                <h3 style={{ marginTop: 0, marginBottom: "0.25rem", fontWeight: "bold" }}>{recipe.title}</h3>
                <p style={{ marginTop: 0, color: "#6b7280", fontSize: "0.95rem" }}>
                  {[recipe.dish_type, recipe.meal_time, recipe.cuisine].filter(Boolean).join(" · ")} · {recipe.difficulty} · {recipe.prep_minutes} דקות · {recipe.steps.length} שלבים
                </p>

                {recipe.warnings && recipe.warnings.length > 0 && (
                  <div style={{ margin: "0.5rem 0", padding: "0.6rem 0.8rem", backgroundColor: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "6px", color: "#92400e", fontSize: "0.9rem" }}>
                    {recipe.warnings.map((w, i) => (
                      <div key={i}>⚠️ {w}</div>
                    ))}
                  </div>
                )}

                <h4 style={{ marginBottom: "0.25rem", fontWeight: "bold" }}>מצרכים</h4>
                <ul style={{ paddingInlineStart: "1.25rem", marginTop: 0, listStyle: "none" }}>
                  {recipe.ingredients.map((ing, i) => {
                    const a = assessed[i];
                    // מצרך שנחשב "בבית" רק כי הוא ברשימת הבסיס, לא כי הוא במזווה
                    const basicOnly = a.status === "ok" && isBasicOnly(ing.name, pantryItems.map((p) => p.item_name), basics);
                    return (
                      <li key={i} style={{ color: a.status === "ok" ? "inherit" : "#b45309" }}>
                        {ing.name} - {ing.amount}{" "}
                        {basicOnly ? (
                          <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>✓ מצרך בסיס</span>
                        ) : a.status === "ok" ? (
                          "✓"
                        ) : a.status === "short" ? (
                          `(יש ${a.haveText} מתוך ${ing.amount})`
                        ) : (
                          "(חסר)"
                        )}
                      </li>
                    );
                  })}
                </ul>

                <h4 style={{ marginBottom: "0.25rem", fontWeight: "bold" }}>הכנה</h4>
                <ol style={{ paddingInlineStart: "1.25rem", marginTop: 0, listStyle: "decimal" }}>
                  {recipe.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>

                <button
                  onClick={() => saveRecipe(recipe, index)}
                  disabled={isSaved}
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.5rem 1rem",
                    backgroundColor: isSaved ? "#9ca3af" : "#10b981",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: isSaved ? "not-allowed" : "pointer",
                  }}
                >
                  {isSaved ? "נשמר ✓" : "שמור מתכון"}
                </button>

                {countMissing(assessed) > 0 && (
                  <>
                    <button
                      onClick={() => addMissing(toShoppingRecipe(recipe, assessed), index)}
                      style={{
                        marginTop: "0.5rem",
                        marginInlineStart: "0.5rem",
                        padding: "0.5rem 1rem",
                        backgroundColor: "#f59e0b",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      הוסף חסרים לרשימת קניות
                    </button>
                    {shoppingMsgs[index] && (
                      <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", color: "#92400e" }}>{shoppingMsgs[index]}</p>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}