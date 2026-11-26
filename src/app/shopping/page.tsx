// src/app/shopping/page.tsx  ->  הכתובת: /shopping
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { noteDbError, takeDbMessage } from "@/lib/dbErrors";
import { inScope, withSpace } from "@/lib/spaceScope";
import { CATEGORY_NAMES, DEFAULT_ORDER, OTHER, getEmoji } from "@/lib/categories";
import { categorizeMany } from "@/lib/categorizeItems";
import BulkAdd, { type BulkRow } from "@/components/BulkAdd";
import FinishShopping from "@/components/FinishShopping";
import CopyToSpace from "@/components/CopyToSpace";
import { copyShopping } from "@/lib/copyToSpace";
import { findMatch, planMerge } from "@/lib/mergeItems";
import { loadOrder, moveAmongVisible, resetOrder, saveOrder } from "@/lib/categoryOrder";
import { useUiReady } from "@/lib/useUiSettings";

type ShoppingItem = {
  id: string;
  name: string;
  amount: string | null;
  category: string;
  is_checked: boolean;
  recipe_title: string | null;
};

export default function ShoppingList() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  // עריכת פריט: שם וכמות
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  // סדר הקטגוריות. מתחיל בברירת מחדל, ונטען מהדפדפן אחרי שהעמוד עולה.
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);

  // סדר הקטגוריות נטען מהחשבון, ולכן מחכים עד שהוא מוכן
  const uiReady = useUiReady();
  useEffect(() => {
    fetchItems();
  }, []);
  useEffect(() => {
    if (uiReady) setOrder(loadOrder());
  }, [uiReady]);

  async function fetchItems() {
    const { data, error } = await inScope(supabase.from("shopping_items").select("*")).order("created_at", { ascending: true });

    if (error) {
      console.error("shopping select error:", error);
      setErrorMsg("טעינת הרשימה נכשלה. בדקי את ה-Console.");
    } else if (data) {
      setItems(data as ShoppingItem[]);
    }
    setIsLoading(false);
  }

  // פריטים שעוד לא נקנו. רק איתם מאחדים, פריט שכבר נקנה נחשב חדש.
  const openItems = () =>
    items.filter((i) => !i.is_checked).map((i) => ({ id: i.id, name: i.name, amount: i.amount }));

  // שמירה משותפת להוספה בודדת ולהוספה מהירה: פריט קיים מתעדכן באיחוד כמויות, חדש נוסף
  async function saveRows(rows: BulkRow[]): Promise<boolean> {
    const plan = planMerge(openItems(), rows);

    for (const u of plan.updates) {
      const { error } = await supabase.from("shopping_items").update({ amount: u.amount }).eq("id", u.id);
      if (error) {
        console.error("shopping update error:", error);
        return false;
      }
    }

    if (plan.inserts.length > 0) {
      const { error } = await supabase.from("shopping_items").insert(
        plan.inserts.map((i) => withSpace({
          name: i.name,
          amount: i.amount || null,
          category: i.group && CATEGORY_NAMES.includes(i.group) ? i.group : OTHER,
        }))
      );
      if (error) {
        console.error("shopping insert error:", error);
        noteDbError(error, "shopping");
        return false;
      }
    }

    await fetchItems();
    return true;
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsAdding(true);
    // פריט שכבר ברשימה לא צריך סיווג מחדש (וגם לא קריאה ל-AI)
    const isExisting = !!findMatch(openItems(), trimmed);
    const categories = isExisting ? {} : await categorizeMany([trimmed]);

    const ok = await saveRows([{ name: trimmed, amount: amount.trim(), group: categories[trimmed] ?? "" }]);
    setIsAdding(false);

    if (!ok) {
      setErrorMsg(takeDbMessage("ההוספה נכשלה."));
      return;
    }
    setName("");
    setAmount("");
    setErrorMsg("");
  }

  function startEdit(item: ShoppingItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditAmount(item.amount ?? "");
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    const { error } = await supabase
      .from("shopping_items")
      .update({ name: editName.trim(), amount: editAmount.trim() || null })
      .eq("id", editingId);
    if (error) {
      console.error("shopping edit error:", error);
      setErrorMsg("העדכון נכשל.");
      return;
    }
    setEditingId(null);
    setErrorMsg("");
    fetchItems();
  }

  async function changeCategory(item: ShoppingItem, category: string) {
    const { error } = await supabase
      .from("shopping_items")
      .update({ category })
      .eq("id", item.id);
    if (error) {
      console.error("shopping category update error:", error);
      setErrorMsg("שינוי הקטגוריה נכשל.");
      return;
    }
    fetchItems();
  }

  async function toggleItem(item: ShoppingItem) {
    const { error } = await supabase
      .from("shopping_items")
      .update({ is_checked: !item.is_checked })
      .eq("id", item.id);
    if (error) {
      console.error("shopping update error:", error);
      setErrorMsg("העדכון נכשל.");
      return;
    }
    fetchItems();
  }

  async function deleteItem(id: string) {
    const { error } = await supabase.from("shopping_items").delete().eq("id", id);
    if (error) {
      console.error("shopping delete error:", error);
      setErrorMsg("המחיקה נכשלה.");
      return;
    }
    fetchItems();
  }

  async function clearChecked() {
    if (!window.confirm("למחוק את כל הפריטים שסומנו כנקנו?")) return;
    const { error } = await inScope(supabase.from("shopping_items").delete().eq("is_checked", true));
    if (error) {
      console.error("shopping clear error:", error);
      setErrorMsg("הניקוי נכשל.");
      return;
    }
    fetchItems();
  }

  function moveCategory(category: string, dir: -1 | 1) {
    const next = moveAmongVisible(order, category, visibleGroups.map((g) => g.cat), dir);
    setOrder(next);
    saveOrder(next);
  }

  // קטגוריה לא מוכרת (למשל ערך ישן) נספרת כ"אחר"
  const categoryOf = (item: ShoppingItem) =>
    CATEGORY_NAMES.includes(item.category) ? item.category : OTHER;

  const groups = order.map((cat) => ({
    cat,
    list: items
      .filter((i) => categoryOf(i) === cat)
      // פריטים שנקנו יורדים לסוף הקבוצה
      .sort((a, b) => Number(a.is_checked) - Number(b.is_checked)),
  }));

  // רק קטגוריות שיש בהן פריטים מוצגות על המסך
  const visibleGroups = groups.filter((g) => g.list.length > 0);
  const isDefaultOrder = order.join("|") === DEFAULT_ORDER.join("|");

  const checkedCount = items.filter((i) => i.is_checked).length;

  return (
    <main style={{ padding: "2rem", direction: "rtl", fontFamily: "sans-serif", maxWidth: "700px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "#3b82f6" }}>
        ← חזרה למזווה
      </Link>

      <h1>רשימת קניות</h1>

          <form onSubmit={addManual} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <input
              type="text"
              placeholder="מצרך (למשל: חלב)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              style={{ padding: "0.5rem", flex: 2, border: "1px solid #ccc", borderRadius: "4px" }}
            />
            <input
              type="text"
              placeholder="כמות"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              maxLength={40}
              style={{ padding: "0.5rem", flex: 1, border: "1px solid #ccc", borderRadius: "4px" }}
            />
            <button
              type="submit"
              disabled={isAdding}
              style={{ padding: "0.5rem 1rem", backgroundColor: isAdding ? "#9ca3af" : "#10b981", color: "white", border: "none", borderRadius: "4px", cursor: isAdding ? "not-allowed" : "pointer" }}
            >
              {isAdding ? "מוסיף..." : "הוסף"}
            </button>
          </form>

          <BulkAdd
            placeholder={"למשל: 2 חלב, קרטון ביצים, חצי קילו עגבניות\nאפשר גם שורה לכל פריט"}
            groupLabel="קטגוריה"
            groupOptions={order}
            groupMode="select"
            existing={items.filter((i) => !i.is_checked).map((i) => ({ name: i.name, amount: i.amount }))}
            suggestGroups={categorizeMany}
            onConfirm={saveRows}
          />

          <div style={{ marginBottom: "1rem" }}>
            <CopyToSpace label="העתקת הרשימה אל..." onCopy={(d) => copyShopping(d)} />
          </div>

          {errorMsg && (
            <p style={{ padding: "1rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b" }}>
              {errorMsg}
            </p>
          )}

          {infoMsg && (
            <p style={{ padding: "1rem", backgroundColor: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", color: "#065f46" }}>
              {infoMsg}
            </p>
          )}

          {isLoading && <p>טוען רשימה...</p>}

          {!isLoading && items.length === 0 && !errorMsg && (
            <p style={{ color: "#6b7280" }}>הרשימה ריקה. אפשר להוסיף מצרך למעלה, או ללחוץ על "הוסף חסרים לרשימת קניות" בכרטיס מתכון.</p>
          )}

          {visibleGroups.map((g, vi) => (
              <section key={g.cat} style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", borderBottom: "2px solid #e5e7eb", paddingBottom: "0.25rem" }}>
                  <h2 style={{ flex: 1, margin: 0, fontSize: "1.1rem", fontWeight: "bold" }}>
                    {getEmoji(g.cat)} {g.cat}
                  </h2>
                  {/* שינוי סדר הקטגוריות ישירות בתצוגה */}
                  <button onClick={() => moveCategory(g.cat, -1)} disabled={vi === 0} aria-label={`הזז את ${g.cat} למעלה`} style={arrowStyle(vi === 0)}>
                    ▲
                  </button>
                  <button onClick={() => moveCategory(g.cat, 1)} disabled={vi === visibleGroups.length - 1} aria-label={`הזז את ${g.cat} למטה`} style={arrowStyle(vi === visibleGroups.length - 1)}>
                    ▼
                  </button>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {g.list.map((item) => (
                    <li
                      key={item.id}
                      style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.25rem", borderBottom: "1px solid #f3f4f6" }}
                    >
                      <input
                        type="checkbox"
                        checked={item.is_checked}
                        onChange={() => toggleItem(item)}
                        style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
                      />
                      {editingId === item.id ? (
                        <span style={{ display: "flex", gap: "0.4rem", flex: 1, flexWrap: "wrap" }}>
                          <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} aria-label="שם" style={{ padding: "0.4rem", border: "1px solid #ccc", borderRadius: "4px", flex: "2 1 7rem", minWidth: 0 }} />
                          <input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} maxLength={40} aria-label="כמות" placeholder="כמות" style={{ padding: "0.4rem", border: "1px solid #ccc", borderRadius: "4px", flex: "1 1 5rem", minWidth: 0 }} />
                          <button onClick={saveEdit} style={{ backgroundColor: "#10b981", color: "white", border: "none", padding: "0.3rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}>שמור</button>
                          <button onClick={() => setEditingId(null)} style={{ backgroundColor: "#e5e7eb", border: "none", padding: "0.3rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}>ביטול</button>
                        </span>
                      ) : (
                        <span
                          style={{
                            flex: 1,
                            textDecoration: item.is_checked ? "line-through" : "none",
                            color: item.is_checked ? "#9ca3af" : "inherit",
                          }}
                        >
                          <strong>{item.name}</strong> {item.amount ? `- ${item.amount}` : ""}
                          {item.recipe_title && (
                            <span style={{ display: "block", fontSize: "0.8rem", color: "#9ca3af" }}>
                              עבור: {item.recipe_title}
                            </span>
                          )}
                        </span>
                      )}

                      {/* שינוי קטגוריה ידני, אם הסיווג האוטומטי טעה */}
                      <select
                        value={categoryOf(item)}
                        onChange={(e) => changeCategory(item, e.target.value)}
                        aria-label={`קטגוריה של ${item.name}`}
                        style={{ padding: "0.25rem", border: "1px solid #d1d5db", borderRadius: "4px", backgroundColor: "white", maxWidth: "9rem" }}
                      >
                        {order.map((c) => (
                          <option key={c} value={c}>
                            {getEmoji(c)} {c}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => startEdit(item)}
                        aria-label={`ערוך את ${item.name}`}
                        style={{ backgroundColor: "#e5e7eb", border: "none", padding: "0.3rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => deleteItem(item.id)}
                        style={{ backgroundColor: "#ef4444", color: "white", border: "none", padding: "0.3rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}
                      >
                        מחק
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

          {!isDefaultOrder && (
            <button
              onClick={() => setOrder(resetOrder())}
              style={{ display: "block", marginBottom: "1rem", padding: "0.4rem 0.8rem", backgroundColor: "transparent", color: "#6b7280", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer" }}
            >
              חזרה לסדר קטגוריות ברירת המחדל
            </button>
          )}

          <FinishShopping
            bought={items.filter((i) => i.is_checked).map((i) => ({ id: i.id, name: i.name, amount: i.amount }))}
            onDone={(msg) => {
              setInfoMsg(msg);
              fetchItems();
            }}
          />

          {checkedCount > 0 && (
            <button
              onClick={clearChecked}
              style={{ marginTop: "0.75rem", padding: "0.6rem 1rem", backgroundColor: "#6b7280", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}
            >
              נקה פריטים שנקנו ({checkedCount})
            </button>
          )}
    </main>
  );
}

function arrowStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "2.2rem",
    height: "2.2rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    backgroundColor: disabled ? "#f3f4f6" : "white",
    color: disabled ? "#d1d5db" : "#111827",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}