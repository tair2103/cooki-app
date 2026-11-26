// src/app/recipes/page.tsx  ->  הכתובת: /recipes
// ספר המתכונים: חיפוש תוך כדי הקלדה, תיקיות, וגרירת מתכון לתיקייה.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import CopyToSpace from "@/components/CopyToSpace";
import { copyRecipe } from "@/lib/copyToSpace";
import { dbErrorMessage, takeDbMessage } from "@/lib/dbErrors";
import { inScope, withSpace } from "@/lib/spaceScope";
import type { Recipe } from "@/lib/types";
import { assessRecipe, countMissing, toShoppingRecipe, type Assessment, type PantryAmount } from "@/lib/quantityCheck";
import { isBasicOnly } from "@/lib/pantryCheck";
import { useBasics } from "@/lib/useBasics";
import { addMissingToShopping } from "@/lib/shopping";
import { countByFolder, filterRecipes, type FolderFilter } from "@/lib/recipeSearch";

// מתכון כפי שהוא שמור בטבלה: אותם שדות + id, תאריך שמירה ותיקייה
// meal_type הוא העמודה הישנה: מתכונים ששמרנו לפני שלב 17 עדיין משתמשים בה
type SavedRecipe = Recipe & { id: string; created_at: string; meal_type?: string | null; folder_id?: string | null; source_url?: string | null };
type Folder = { id: string; name: string };

const chipBase: React.CSSProperties = {
  padding: "0.35rem 0.8rem",
  borderRadius: "999px",
  border: "1px solid #d1d5db",
  cursor: "pointer",
  fontSize: "0.95rem",
};

export default function RecipeBook() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [folderMsg, setFolderMsg] = useState("");
  // שמות הפריטים במזווה, לבדיקה "מה יש בבית". null = לא נטען (אז לא מציגים בדיקה)
  const [pantry, setPantry] = useState<PantryAmount[] | null>(null);
  const { basics, loaded: basicsLoaded } = useBasics();
  // הודעת "הוסף חסרים" לכל מתכון
  const [shopMsgs, setShopMsgs] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FolderFilter>("all");
  const [expanded, setExpanded] = useState<string[]>([]);
  // תיקייה חדשה / שינוי שם
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  // גרירה: איזה מתכון נגרר, ומעל איזו תיקייה הוא עכשיו
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const rec = await inScope(supabase.from("recipes").select("*")).order("created_at", { ascending: false });
    if (rec.error) {
      console.error("Supabase recipes select error:", rec.error);
      setErrorMsg("טעינת המתכונים נכשלה. בדקי את ה-Console.");
    } else if (rec.data) {
      setRecipes(rec.data as SavedRecipe[]);
    }

    const fol = await inScope(supabase.from("recipe_folders").select("id, name")).order("created_at", { ascending: true });
    if (fol.error) {
      console.error("Supabase folders select error:", fol.error);
      setFolderMsg("התיקיות לא זמינות. צריך להריץ את 07_recipe_folders.sql ב-Supabase.");
    } else if (fol.data) {
      setFolders(fol.data as Folder[]);
      setFolderMsg("");
    }

    // המזווה הנוכחי. הסימון שנשמר יחד עם המתכון ישן, אז בודקים מחדש מול מה שיש עכשיו.
    const pan = await inScope(supabase.from("pantry_items").select("item_name, quantity"));
    if (pan.error) {
      console.error("Supabase pantry select error:", pan.error);
    } else {
      setPantry((pan.data ?? []).map((r: any) => ({ name: String(r.item_name), amount: r.quantity ?? null })));
    }
    setIsLoading(false);
  }

  // מצרך שחסר חלקית נכנס לרשימה רק בכמות החסרה (toShoppingRecipe)
  async function addMissing(recipe: SavedRecipe, assessed: Assessment[]) {
    const result = await addMissingToShopping(toShoppingRecipe(recipe, assessed));
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
    setShopMsgs((prev) => ({ ...prev, [recipe.id]: msg }));
  }

  async function deleteRecipe(id: string) {
    // שואלים לפני שמוחקים, כדי שלא יימחק בטעות
    if (!window.confirm("למחוק את המתכון?")) return;

    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) {
      console.error("Supabase recipes delete error:", error);
      setErrorMsg("מחיקת המתכון נכשלה. בדקי את ה-Console.");
      return;
    }
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  // ---- תיקיות ----
  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (folders.some((f) => f.name.trim().toLowerCase() === name.toLowerCase())) {
      setFolderMsg(`כבר יש תיקייה בשם "${name}".`);
      return;
    }
    const { data, error } = await supabase.from("recipe_folders").insert([withSpace({ name })]).select("id, name").single();
    if (error || !data) {
      console.error("Supabase folder insert error:", error);
      setFolderMsg(dbErrorMessage(error, "folders", "יצירת התיקייה נכשלה. בדקי את ה-Console."));
      return;
    }
    setFolders((prev) => [...prev, data as Folder]);
    setSelected((data as Folder).id);
    setNewName("");
    setShowNew(false);
    setFolderMsg("");
  }

  async function renameFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name || selected === "all" || selected === "none") return;
    if (folders.some((f) => f.id !== selected && f.name.trim().toLowerCase() === name.toLowerCase())) {
      setFolderMsg(`כבר יש תיקייה בשם "${name}".`);
      return;
    }
    const { error } = await supabase.from("recipe_folders").update({ name }).eq("id", selected);
    if (error) {
      console.error("Supabase folder rename error:", error);
      setFolderMsg("שינוי השם נכשל.");
      return;
    }
    setFolders((prev) => prev.map((f) => (f.id === selected ? { ...f, name } : f)));
    setRenaming(false);
    setFolderMsg("");
  }

  async function deleteFolder(folder: Folder) {
    const count = recipes.filter((r) => r.folder_id === folder.id).length;
    const message =
      count > 0
        ? `${count} מתכונים בתיקייה "${folder.name}" יחזרו ל"ללא תיקייה" (הם לא יימחקו). למחוק את התיקייה?`
        : `למחוק את התיקייה "${folder.name}"?`;
    if (!window.confirm(message)) return;

    const { error } = await supabase.from("recipe_folders").delete().eq("id", folder.id);
    if (error) {
      console.error("Supabase folder delete error:", error);
      setFolderMsg("מחיקת התיקייה נכשלה.");
      return;
    }
    // בבסיס הנתונים המתכונים כבר חזרו ל"ללא תיקייה" (on delete set null). כאן מעדכנים את התצוגה.
    setRecipes((prev) => prev.map((r) => (r.folder_id === folder.id ? { ...r, folder_id: null } : r)));
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setSelected("all");
    setRenaming(false);
    setFolderMsg("");
  }

  async function moveRecipe(id: string, folderId: string | null) {
    const current = recipes.find((r) => r.id === id);
    if (!current || (current.folder_id ?? null) === folderId) return;

    // מעדכנים את המסך מיד, ומחזירים אם השמירה נכשלה
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, folder_id: folderId } : r)));
    const { error } = await supabase.from("recipes").update({ folder_id: folderId }).eq("id", id);
    if (error) {
      console.error("Supabase recipe move error:", error);
      setErrorMsg("העברת המתכון נכשלה. בדקי שהרצת את 07_recipe_folders.sql.");
      setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, folder_id: current.folder_id ?? null } : r)));
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // ---- גרירה: כל תיקייה (ו"ללא תיקייה") היא יעד לשחרור ----
  function dropProps(targetKey: string, folderId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault(); // בלי זה הדפדפן לא מאפשר לשחרר
        setDropTarget(targetKey);
      },
      onDragLeave: () => setDropTarget((t) => (t === targetKey ? null : t)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain") || dragId;
        setDropTarget(null);
        setDragId(null);
        if (id) moveRecipe(id, folderId);
      },
    };
  }

  const folderIds = folders.map((f) => f.id);
  const counts = countByFolder(recipes, folderIds);
  const selectedFolder = folders.find((f) => f.id === selected);
  // תיקייה שנבחרה ונעלמה (למשל נמחקה במקום אחר) חוזרת ל"הכל"
  const effective: FolderFilter = selected !== "all" && selected !== "none" && !selectedFolder ? "all" : selected;
  const visible = filterRecipes(recipes, query, effective);
  const searching = query.trim().length > 0;

  const chip = (key: string, label: string, count: number, active: boolean, onClick: () => void, drop?: ReturnType<typeof dropProps>) => (
    <button
      key={key}
      onClick={onClick}
      {...drop}
      style={{
        ...chipBase,
        backgroundColor: dropTarget === key ? "#d1fae5" : active ? "#6366f1" : "white",
        color: active && dropTarget !== key ? "white" : "#111827",
        borderColor: dropTarget === key ? "#10b981" : active ? "#6366f1" : "#d1d5db",
        outline: dragId && drop ? "2px dashed #a7f3d0" : "none",
      }}
    >
      {label} ({count})
    </button>
  );

  return (
    <main style={{ padding: "2rem", direction: "rtl", fontFamily: "sans-serif", maxWidth: "700px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "#3b82f6" }}>
        ← חזרה למזווה
      </Link>

      <Link href="/import" style={{ color: "#3b82f6", marginInlineStart: "1.5rem" }}>
        ➕ ייבוא מתכון
      </Link>

      <h1>ספר המתכונים שלי</h1>

      {errorMsg && (
        <p style={{ padding: "1rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b" }}>
          {errorMsg}
        </p>
      )}

      {isLoading && <p>טוען מתכונים...</p>}

      {!isLoading && recipes.length === 0 && !errorMsg && (
        <p style={{ color: "#6b7280" }}>עוד לא שמרת מתכונים. חזרי למזווה, הכיני המלצות ולחצי על "שמור מתכון".</p>
      )}

      {recipes.length > 0 && (
        <>
          {/* חיפוש חי: התוצאות מתעדכנות עם כל אות. מחפש בתוך התיקייה שנבחרה. */}
          <div style={{ position: "relative", marginBottom: "0.9rem" }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder={
                effective === "all"
                  ? "חיפוש לפי שם, מצרך או מטבח..."
                  : `חיפוש בתוך "${effective === "none" ? "ללא תיקייה" : selectedFolder?.name}"...`
              }
              aria-label="חיפוש מתכונים"
              style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", border: "1px solid #ccc", borderRadius: "8px", fontSize: "1rem" }}
            />
          </div>

          {/* תיקיות */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
            {chip("all", "📖 הכל", counts.all, effective === "all", () => setSelected("all"))}
            {folders.map((f) =>
              chip(f.id, `📁 ${f.name}`, counts.byFolder[f.id] ?? 0, effective === f.id, () => setSelected(f.id), dropProps(f.id, f.id))
            )}
            {chip("none", "📂 ללא תיקייה", counts.none, effective === "none", () => setSelected("none"), dropProps("none", null))}
            {!folderMsg.startsWith("התיקיות לא זמינות") && (
              <button onClick={() => setShowNew((v) => !v)} style={{ ...chipBase, backgroundColor: "#eef2ff", color: "#3730a3", borderColor: "#c7d2fe" }}>
                ➕ תיקייה חדשה
              </button>
            )}
          </div>

          {showNew && (
            <form onSubmit={createFolder} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="שם התיקייה (למשל: קינוחים)"
                maxLength={40}
                style={{ flex: 1, padding: "0.45rem", border: "1px solid #ccc", borderRadius: "4px" }}
              />
              <button type="submit" style={{ padding: "0.45rem 1rem", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                צור
              </button>
            </form>
          )}

          {/* ניהול התיקייה שנבחרה */}
          {selectedFolder && effective === selectedFolder.id && (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
              {renaming ? (
                <form onSubmit={renameFolder} style={{ display: "flex", gap: "0.4rem", flex: 1 }}>
                  <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={40} aria-label="שם חדש לתיקייה" style={{ flex: 1, padding: "0.4rem", border: "1px solid #ccc", borderRadius: "4px" }} />
                  <button type="submit" style={{ backgroundColor: "#10b981", color: "white", border: "none", padding: "0.3rem 0.8rem", borderRadius: "4px", cursor: "pointer" }}>שמור</button>
                  <button type="button" onClick={() => setRenaming(false)} style={{ backgroundColor: "#e5e7eb", border: "none", padding: "0.3rem 0.8rem", borderRadius: "4px", cursor: "pointer" }}>ביטול</button>
                </form>
              ) : (
                <>
                  <button onClick={() => { setRenameValue(selectedFolder.name); setRenaming(true); }} style={{ backgroundColor: "#e5e7eb", border: "none", padding: "0.3rem 0.8rem", borderRadius: "4px", cursor: "pointer" }}>
                    ✏️ שנה שם
                  </button>
                  <button onClick={() => deleteFolder(selectedFolder)} style={{ backgroundColor: "#ef4444", color: "white", border: "none", padding: "0.3rem 0.8rem", borderRadius: "4px", cursor: "pointer" }}>
                    מחק תיקייה
                  </button>
                </>
              )}
            </div>
          )}

          {folderMsg && <p style={{ margin: "0 0 0.75rem", color: "#92400e", fontSize: "0.92rem" }}>{folderMsg}</p>}

          <p style={{ color: "#6b7280", fontSize: "0.88rem", margin: "0 0 0.75rem" }}>
            {searching || effective !== "all" ? `${visible.length} מתכונים. ` : ""}
            {folders.length > 0 && "אפשר לגרור מתכון אל תיקייה, או לבחור תיקייה בתוך המתכון."}
          </p>

          {visible.length === 0 && (
            <p style={{ color: "#6b7280" }}>
              {searching ? `לא נמצאו מתכונים עבור "${query.trim()}"${effective === "all" ? "" : " בתיקייה הזו"}.` : "אין מתכונים בתיקייה הזו עדיין."}
            </p>
          )}
        </>
      )}

      {visible.map((stored) => {
        const recipe = stored;
        // בדיקה מול המזווה העדכני, כולל כמויות. null = המזווה לא נטען, ואז לא מציגים בדיקה.
        const assessed = pantry && basicsLoaded ? assessRecipe(recipe, pantry, basics) : null;
        const missingCount = assessed ? countMissing(assessed) : 0;
        const isOpen = expanded.includes(recipe.id);
        const folderName = folders.find((f) => f.id === recipe.folder_id)?.name;
        return (
          <article
            key={recipe.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", recipe.id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(recipe.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropTarget(null);
            }}
            style={{
              marginBottom: "1rem",
              padding: "1rem 1.25rem",
              backgroundColor: "#f9fafb",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              lineHeight: "1.6",
              opacity: dragId === recipe.id ? 0.5 : 1,
            }}
          >
            {/* כותרת: לחיצה פותחת וסוגרת את המתכון. כרטיס סגור קל יותר לגרירה ולחיפוש. */}
            <div onClick={() => toggleExpanded(recipe.id)} role="button" aria-expanded={isOpen} style={{ cursor: "pointer", display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
              <span title="אפשר לגרור" style={{ color: "#9ca3af", cursor: "grab", userSelect: "none" }}>⠿</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontWeight: "bold" }}>
                  {recipe.title}{" "}
                  {folderName && effective === "all" && (
                    <span style={{ fontSize: "0.8rem", fontWeight: "normal", color: "#6366f1" }}>📁 {folderName}</span>
                  )}
                </h3>
                <p style={{ margin: "0.15rem 0 0", color: "#6b7280", fontSize: "0.92rem" }}>
                  {[recipe.dish_type, recipe.meal_time, recipe.cuisine].filter(Boolean).join(" · ") || recipe.meal_type} · {recipe.difficulty} · {recipe.prep_minutes} דקות · {recipe.steps.length} שלבים
                </p>
                {assessed && (
                  <p style={{ margin: "0.15rem 0 0", fontSize: "0.88rem", color: missingCount === 0 ? "#047857" : "#b45309" }}>
                    {missingCount === 0 ? "✓ יש לך הכל בבית" : `חסרים ${missingCount} מצרכים`}
                  </p>
                )}
              </div>
              <span style={{ color: "#6b7280" }}>{isOpen ? "▴" : "▾"}</span>
            </div>

            {isOpen && (
              <>
                {/* מציגים קישור רק אם הוא באמת http/https */}
                {recipe.source_url && /^https?:\/\//i.test(recipe.source_url) && (
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.88rem" }}>
                    <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>
                      🔗 למתכון המקורי
                    </a>
                  </p>
                )}
                <h4 style={{ marginBottom: "0.25rem", fontWeight: "bold" }}>מצרכים</h4>
                <ul style={{ paddingInlineStart: "1.25rem", marginTop: 0, listStyle: "none" }}>
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} style={{ color: assessed && assessed[i].status !== "ok" ? "#b45309" : "inherit" }}>
                      {ing.name} - {ing.amount}{" "}
                      {assessed
                        ? assessed[i].status === "ok"
                          ? pantry && isBasicOnly(ing.name, pantry.map((p) => p.name), basics)
                            ? "✓ מצרך בסיס"
                            : "✓"
                          : assessed[i].status === "short"
                            ? `(יש ${(assessed[i] as { haveText: string }).haveText} מתוך ${ing.amount})`
                            : "(חסר)"
                        : ""}
                    </li>
                  ))}
                </ul>

                <h4 style={{ marginBottom: "0.25rem", fontWeight: "bold" }}>הכנה</h4>
                <ol style={{ paddingInlineStart: "1.25rem", marginTop: 0, listStyle: "decimal" }}>
                  {recipe.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>

                <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  {/* בחירת תיקייה בלי גרירה: מתאים גם למסך מגע, שבו גרירה לא עובדת */}
                  {folders.length > 0 && (
                    <label style={{ fontSize: "0.92rem" }}>
                      תיקייה:{" "}
                      <select
                        value={recipe.folder_id && folderIds.includes(recipe.folder_id) ? recipe.folder_id : ""}
                        onChange={(e) => moveRecipe(recipe.id, e.target.value || null)}
                        style={{ padding: "0.3rem", border: "1px solid #d1d5db", borderRadius: "4px", backgroundColor: "white" }}
                      >
                        <option value="">ללא תיקייה</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {assessed && missingCount > 0 && (
                    <button
                      onClick={() => addMissing(recipe, assessed)}
                      style={{ backgroundColor: "#f59e0b", color: "white", border: "none", padding: "0.4rem 0.9rem", borderRadius: "4px", cursor: "pointer" }}
                    >
                      🛒 הוסף חסרים לרשימת קניות
                    </button>
                  )}
                  <CopyToSpace label="העתקת מתכון אל..." onCopy={(d) => copyRecipe(recipe as unknown as Record<string, unknown>, d)} />
                  <button
                    onClick={() => deleteRecipe(recipe.id)}
                    style={{ backgroundColor: "#ef4444", color: "white", border: "none", padding: "0.4rem 0.9rem", borderRadius: "4px", cursor: "pointer" }}
                  >
                    מחק מתכון
                  </button>
                </div>
                {shopMsgs[recipe.id] && <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", color: "#92400e" }}>{shopMsgs[recipe.id]}</p>}
              </>
            )}
          </article>
        );
      })}
    </main>
  );
}