// אזור המזווה: הוספה (בודדת ומהירה), תצוגה לפי מיקום, עריכה ומחיקה, ואיחוד כמויות.
"use client";

import { useEffect, useId, useState } from "react";
import { useUiReady } from "@/lib/useUiSettings";
import { supabase } from "@/lib/supabase";
import { noteDbError, takeDbMessage } from "@/lib/dbErrors";
import { inScope, withSpace } from "@/lib/spaceScope";
import BulkAdd, { type BulkRow } from "@/components/BulkAdd";
import CopyToSpace from "@/components/CopyToSpace";
import { copyPantry } from "@/lib/copyToSpace";
import {
  DEFAULT_LOCATIONS,
  NO_LOCATION,
  applyLocationOrder,
  loadCollapsedLocations,
  loadHiddenLocations,
  loadLocationOrder,
  mergeSavedOrder,
  resetLocationOrder,
  saveCollapsedLocations,
  saveHiddenLocations,
  saveLocationOrder,
} from "@/lib/locations";
import { moveAmongVisible } from "@/lib/categoryOrder";
import { findMatch, planMerge } from "@/lib/mergeItems";
import { planRename, renameInList, validateRename } from "@/lib/locationRename";
import { mergeQuantities } from "@/lib/quantity";

export type PantryItem = {
  id: string;
  item_name: string;
  quantity: string | null;
  location: string | null;
};

type Props = { onItemsChange: (items: PantryItem[]) => void };

const inputStyle = { padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px", minWidth: 0 } as const;

export default function PantrySection({ onItemsChange }: Props) {
  const listId = useId();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editLoc, setEditLoc] = useState("");
  // סדר המיקומים שנשמר (נטען מהדפדפן אחרי שהעמוד עלה)
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  // מיקומי ברירת מחדל שנמחקו, ופתיחת חלונית הניהול
  const [hidden, setHidden] = useState<string[]>([]);
  const [showManage, setShowManage] = useState(false);
  // מיקומים שמצומצמים (רק הכותרת נראית). נטען מהדפדפן אחרי שהעמוד עלה.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  // שינוי שם של מיקום: איזה מיקום עורכים עכשיו, והשם החדש
  const [renamingLoc, setRenamingLoc] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // העדפות התצוגה נטענות מהחשבון, ולכן מחכים עד שהן מוכנות
  const uiReady = useUiReady();
  useEffect(() => {
    fetchItems();
  }, []);
  useEffect(() => {
    if (!uiReady) return;
    setSavedOrder(loadLocationOrder());
    setHidden(loadHiddenLocations());
    setCollapsed(loadCollapsedLocations());
  }, [uiReady]);

  async function fetchItems() {
    const { data, error } = await inScope(supabase.from("pantry_items").select("*")).order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase select error:", error);
      setErrorMsg("טעינת המזווה נכשלה. בדקי את ה-Console.");
      return;
    }
    const list = (data ?? []) as PantryItem[];
    setItems(list);
    onItemsChange(list);
  }

  // פריטי המזווה בצורה שהלוגיקה מכירה. group = המיקום, ומאחדים רק כששם ומיקום זהים.
  const existingRows = () =>
    items.map((i) => ({ id: i.id, name: i.item_name, amount: i.quantity, group: i.location?.trim() ?? "" }));

  // שמירה משותפת להוספה בודדת ומהירה: פריט קיים באותו מיקום מתעדכן באיחוד כמויות, אחרת נוסף
  async function saveRows(rows: BulkRow[]): Promise<boolean> {
    const plan = planMerge(existingRows(), rows, { matchGroup: true });

    for (const u of plan.updates) {
      const { error } = await supabase.from("pantry_items").update({ quantity: u.amount }).eq("id", u.id);
      if (error) {
        console.error("Supabase update error:", error);
        return false;
      }
    }

    if (plan.inserts.length > 0) {
      const { error } = await supabase.from("pantry_items").insert(
        plan.inserts.map((i) => withSpace({
          item_name: i.name,
          quantity: i.amount || null,
          location: (i.group ?? "").trim() || null,
        }))
      );
      if (error) {
        console.error("Supabase insert error:", error);
        noteDbError(error, "pantry");
        return false;
      }
    }

    await fetchItems();
    return true;
  }

  async function addSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErrorMsg("");
    setInfoMsg("");

    const ok = await saveRows([{ name: name.trim(), amount: quantity.trim(), group: location }]);
    if (!ok) {
      setErrorMsg(takeDbMessage("ההוספה נכשלה. בדקי את ה-Console."));
      return;
    }
    // אם הפריט נוסף למיקום מצומצם, פותחים אותו כדי שיראו שהפריט נכנס
    const target = location.trim() || NO_LOCATION;
    if (collapsed.includes(target)) {
      const next = collapsed.filter((l) => l !== target);
      setCollapsed(next);
      saveCollapsedLocations(next);
    }
    setName("");
    setQuantity("");
    // המיקום נשאר, כדי שאפשר יהיה להוסיף כמה פריטים ברצף לאותו מקום
  }

  async function deleteItem(id: string) {
    const { error } = await supabase.from("pantry_items").delete().eq("id", id);
    if (error) {
      console.error("Supabase delete error:", error);
      setErrorMsg("המחיקה נכשלה.");
      return;
    }
    fetchItems();
  }

  function startEdit(item: PantryItem) {
    setEditingId(item.id);
    setEditName(item.item_name);
    setEditQty(item.quantity ?? "");
    setEditLoc(item.location ?? "");
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;

    // אם אחרי העריכה יש כבר פריט באותו שם ובאותו מיקום: מאחדים אליו ומוחקים את הפריט הערוך
    const target = findMatch(
      existingRows().filter((r) => r.id !== editingId),
      editName.trim(),
      editLoc.trim()
    );
    if (target) {
      const { error: upErr } = await supabase
        .from("pantry_items")
        .update({ quantity: mergeQuantities(target.amount ?? "", editQty.trim()) || null })
        .eq("id", target.id);
      if (upErr) {
        console.error("Supabase merge error:", upErr);
        setErrorMsg("האיחוד נכשל.");
        return;
      }
      const { error: delErr } = await supabase.from("pantry_items").delete().eq("id", editingId);
      if (delErr) {
        console.error("Supabase merge delete error:", delErr);
        setErrorMsg("האיחוד נכשל.");
        return;
      }
      setEditingId(null);
      setErrorMsg("");
      setInfoMsg(`"${target.name}" כבר היה ב${editLoc.trim() || "ללא מיקום"}, אז הכמויות אוחדו`);
      fetchItems();
      return;
    }

    const { error } = await supabase
      .from("pantry_items")
      .update({
        item_name: editName.trim(),
        quantity: editQty.trim() || null,
        location: editLoc.trim() || null,
      })
      .eq("id", editingId);

    if (error) {
      console.error("Supabase update error:", error);
      setErrorMsg("העדכון נכשל.");
      return;
    }
    setEditingId(null);
    setErrorMsg("");
    setInfoMsg("");
    fetchItems();
  }

  // מיקומים להצעה ולתצוגה: ברירות המחדל + מה שהמשתמשת כבר הקלידה
  const usedLocations = items.map((i) => i.location?.trim()).filter((l): l is string => !!l);
  // הסדר להצגה (בלי "ללא מיקום"). משמש גם להצעות בהקלדת מיקום.
  const displayOrder = applyLocationOrder(savedOrder, usedLocations, hidden);
  const locationOptions = displayOrder;

  const groups = [...displayOrder, NO_LOCATION]
    .map((loc) => ({
      loc,
      list: items
        .filter((i) => (i.location?.trim() || NO_LOCATION) === loc)
        .sort((a, b) => a.item_name.localeCompare(b.item_name, "he")),
    }))
    .filter((g) => g.list.length > 0);

  // מיקומים שמוצגים כרגע, בלי "ללא מיקום" שאינו ניתן להזזה
  const visibleLocations = groups.map((g) => g.loc).filter((l) => l !== NO_LOCATION);

  // מחיקת מיקום: הפריטים שבו עוברים ל"ללא מיקום" (לא נמחקים).
  // מיקום ברירת מחדל גם מוסתר מההצעות, ואפשר להחזיר אותו.
  async function deleteLocation(loc: string) {
    const count = items.filter((i) => i.location?.trim() === loc).length;
    const message =
      count > 0
        ? `${count} פריטים ב"${loc}" יעברו ל"ללא מיקום" (הם לא יימחקו). למחוק את המיקום?`
        : `למחוק את המיקום "${loc}"?`;
    if (!window.confirm(message)) return;

    if (count > 0) {
      const { error } = await inScope(supabase.from("pantry_items").update({ location: null }).eq("location", loc));
      if (error) {
        console.error("Supabase location delete error:", error);
        setErrorMsg("מחיקת המיקום נכשלה.");
        return;
      }
    }

    if (DEFAULT_LOCATIONS.includes(loc) && !hidden.includes(loc)) {
      const nextHidden = [...hidden, loc];
      setHidden(nextHidden);
      saveHiddenLocations(nextHidden);
    }
    const nextOrder = savedOrder.filter((l) => l !== loc);
    setSavedOrder(nextOrder);
    saveLocationOrder(nextOrder);

    setErrorMsg("");
    await fetchItems();
  }

  function toggleCollapsed(loc: string) {
    const next = collapsed.includes(loc) ? collapsed.filter((l) => l !== loc) : [...collapsed, loc];
    setCollapsed(next);
    saveCollapsedLocations(next);
  }

  // צמצום/פתיחה של כל המיקומים שמוצגים כרגע
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.includes(g.loc));
  function toggleAll() {
    const next = allCollapsed ? [] : groups.map((g) => g.loc);
    setCollapsed(next);
    saveCollapsedLocations(next);
  }

  // שינוי שם מיקום: כל הפריטים שבו עוברים לשם החדש. אם השם החדש כבר קיים,
  // הפריטים עוברים אליו, ופריט באותו שם שכבר שם מתאחד אליו (כלל האיחוד של המזווה).
  async function renameLocation(from: string) {
    const to = renameValue.trim();
    const problem = validateRename(from, to);
    if (problem) {
      setErrorMsg(problem);
      return;
    }

    const plan = planRename(
      items.map((i) => ({ id: i.id, name: i.item_name, amount: i.quantity, location: i.location })),
      from,
      to
    );
    if (plan.mergedCount > 0) {
      const ok = window.confirm(`יש כבר מיקום "${to}". ${plan.mergedCount} פריטים יתאחדו עם פריטים באותו שם שכבר שם. להמשיך?`);
      if (!ok) return;
    }

    if (plan.moveIds.length > 0) {
      const { error } = await supabase.from("pantry_items").update({ location: to }).in("id", plan.moveIds);
      if (error) {
        console.error("Supabase rename move error:", error);
        setErrorMsg("שינוי השם נכשל.");
        return;
      }
    }
    for (const m of plan.merges) {
      const { error: upErr } = await supabase.from("pantry_items").update({ quantity: m.amount || null }).eq("id", m.keepId);
      const { error: delErr } = upErr ? { error: null } : await supabase.from("pantry_items").delete().in("id", m.deleteIds);
      if (upErr || delErr) {
        console.error("Supabase rename merge error:", upErr || delErr);
        setErrorMsg("שינוי השם הושלם חלקית: האיחוד נכשל. אפשר לרענן ולנסות שוב.");
        await fetchItems();
        return;
      }
    }

    // ההגדרות השמורות בדפדפן עוברות לשם החדש (סדר, צמצום, מיקומי ברירת מחדל שהוסתרו)
    const nextOrder = renameInList(savedOrder, from, to);
    setSavedOrder(nextOrder);
    saveLocationOrder(nextOrder);
    const nextCollapsed = renameInList(collapsed, from, to);
    setCollapsed(nextCollapsed);
    saveCollapsedLocations(nextCollapsed);
    // אם שינו שם של מיקום ברירת מחדל, הישן מוסתר כדי שלא יחזור כהצעה ריקה. ואם נתנו שם של ברירת מחדל מוסתרת, היא חוזרת.
    let nextHidden = hidden.filter((h) => h !== to);
    if (DEFAULT_LOCATIONS.includes(from) && !nextHidden.includes(from)) nextHidden = [...nextHidden, from];
    setHidden(nextHidden);
    saveHiddenLocations(nextHidden);
    if (location.trim() === from) setLocation(to);

    setRenamingLoc(null);
    setErrorMsg("");
    setInfoMsg(`המיקום "${from}" שונה ל"${to}"` + (plan.mergedCount > 0 ? `, ו-${plan.mergedCount} פריטים אוחדו` : "") + " ✓");
    await fetchItems();
  }

  function restoreLocations() {
    setHidden([]);
    saveHiddenLocations([]);
  }

  function moveLocation(loc: string, dir: -1 | 1) {
    const moved = moveAmongVisible(displayOrder, loc, visibleLocations, dir);
    const next = mergeSavedOrder(moved, savedOrder);
    setSavedOrder(next);
    saveLocationOrder(next);
  }

  return (
    <section style={{ marginBottom: "2rem" }}>
      <datalist id={listId}>
        {locationOptions.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <form onSubmit={addSingle} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <input type="text" placeholder="שם המצרך (למשל: ביצים)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={{ ...inputStyle, flex: "2 1 9rem" }} />
        <input type="text" placeholder="כמות (למשל: תבנית 12)" value={quantity} onChange={(e) => setQuantity(e.target.value)} maxLength={40} style={{ ...inputStyle, flex: "1 1 7rem" }} />
        <input type="text" placeholder="מיקום (אופציונלי)" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={40} list={listId} style={{ ...inputStyle, flex: "1 1 7rem" }} />
        <button type="submit" style={{ padding: "0.5rem 1rem", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
          הוסף
        </button>
      </form>

      <BulkAdd
        placeholder={"למשל: 2 חלב, קרטון ביצים, חצי קילו עגבניות\nאפשר גם שורה לכל פריט"}
        groupLabel="מיקום"
        groupOptions={locationOptions}
        groupMode="free"
        existing={existingRows()}
        matchByGroup
        suggestGroups={async () => ({})}
        onConfirm={saveRows}
      />

      <div style={{ marginBottom: "1rem" }}>
        <CopyToSpace label="העתקת כל המזווה אל..." onCopy={(d) => copyPantry(d)} />
      </div>

      {errorMsg && (
        <p style={{ padding: "0.75rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b" }}>{errorMsg}</p>
      )}

      {infoMsg && (
        <p style={{ padding: "0.75rem", backgroundColor: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", color: "#065f46" }}>{infoMsg}</p>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
      {groups.length > 0 && (
        <button
          onClick={toggleAll}
          style={{ padding: "0.4rem 0.8rem", backgroundColor: "transparent", color: "#374151", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer" }}
        >
          {allCollapsed ? "▸ פתח הכל" : "▾ צמצם הכל"}
        </button>
      )}
      <button
        onClick={() => setShowManage((v) => !v)}
        style={{ padding: "0.4rem 0.8rem", backgroundColor: showManage ? "#e5e7eb" : "transparent", color: "#374151", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer" }}
      >
        ⚙️ ניהול מיקומים
      </button>
      </div>

      {showManage && (
        <div style={{ marginBottom: "1.25rem", padding: "0.75rem 1rem", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#f9fafb" }}>
          <p style={{ margin: "0 0 0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
            מחיקת מיקום לא מוחקת פריטים: הם עוברים ל"ללא מיקום". שינוי שם (✏️) מעביר את כל הפריטים לשם החדש. מיקום חדש אפשר ליצור פשוט בהקלדת שמו בעת הוספת פריט.
          </p>
          {displayOrder.map((loc) => {
            const count = items.filter((i) => i.location?.trim() === loc).length;
            return (
              <div key={loc} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0", borderBottom: "1px solid #eee" }}>
                {renamingLoc === loc ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameLocation(loc);
                    }}
                    style={{ display: "flex", gap: "0.4rem", flex: 1 }}
                  >
                    <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={40} aria-label={`שם חדש למיקום ${loc}`} style={{ ...inputStyle, flex: 1 }} />
                    <button type="submit" style={{ backgroundColor: "#10b981", color: "white", border: "none", padding: "0.25rem 0.8rem", borderRadius: "4px", cursor: "pointer" }}>שמור</button>
                    <button type="button" onClick={() => setRenamingLoc(null)} style={{ backgroundColor: "#e5e7eb", border: "none", padding: "0.25rem 0.8rem", borderRadius: "4px", cursor: "pointer" }}>ביטול</button>
                  </form>
                ) : (
                <>
                <span style={{ flex: 1 }}>
                  {DEFAULT_LOCATIONS.includes(loc) ? "🏠" : "📍"} {loc}{" "}
                  <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>({count} פריטים)</span>
                </span>
                <button onClick={() => { setRenamingLoc(loc); setRenameValue(loc); setErrorMsg(""); }} aria-label={`שנה שם למיקום ${loc}`} style={{ backgroundColor: "#e5e7eb", border: "none", padding: "0.25rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}>
                  ✏️
                </button>
                <button onClick={() => deleteLocation(loc)} aria-label={`מחק את המיקום ${loc}`} style={{ backgroundColor: "#ef4444", color: "white", border: "none", padding: "0.25rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}>
                  מחק
                </button>
                </>
                )}
              </div>
            );
          })}
          {displayOrder.length === 0 && <p style={{ color: "#6b7280", margin: 0 }}>אין מיקומים. אפשר להקליד מיקום חדש בהוספת פריט.</p>}
          {hidden.length > 0 && (
            <button onClick={restoreLocations} style={{ marginTop: "0.6rem", padding: "0.35rem 0.8rem", backgroundColor: "transparent", color: "#4b5563", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer" }}>
              שחזור מיקומי ברירת המחדל שנמחקו ({hidden.length})
            </button>
          )}
        </div>
      )}

      {items.length === 0 && <p style={{ color: "#6b7280" }}>המזווה ריק. אפשר להוסיף מצרכים למעלה.</p>}

      {groups.map((g) => (
        <div key={g.loc} style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", borderBottom: "2px solid #e5e7eb", paddingBottom: "0.25rem" }}>
            <h2
              onClick={() => toggleCollapsed(g.loc)}
              role="button"
              aria-expanded={!collapsed.includes(g.loc)}
              style={{ flex: 1, margin: 0, fontSize: "1.05rem", fontWeight: "bold", cursor: "pointer", userSelect: "none" }}
            >
              {collapsed.includes(g.loc) ? "▸" : "▾"} {g.loc === NO_LOCATION ? "📦" : DEFAULT_LOCATIONS.includes(g.loc) ? "🏠" : "📍"} {g.loc}{" "}
              <span style={{ color: "#9ca3af", fontWeight: "normal", fontSize: "0.9rem" }}>({g.list.length})</span>
            </h2>
            {/* "ללא מיקום" תמיד בסוף ולא ניתן להזזה */}
            {g.loc !== NO_LOCATION && (
              <>
                <button onClick={() => moveLocation(g.loc, -1)} disabled={visibleLocations.indexOf(g.loc) === 0} aria-label={`הזז את ${g.loc} למעלה`} style={arrowStyle(visibleLocations.indexOf(g.loc) === 0)}>
                  ▲
                </button>
                <button onClick={() => moveLocation(g.loc, 1)} disabled={visibleLocations.indexOf(g.loc) === visibleLocations.length - 1} aria-label={`הזז את ${g.loc} למטה`} style={arrowStyle(visibleLocations.indexOf(g.loc) === visibleLocations.length - 1)}>
                  ▼
                </button>
              </>
            )}
          </div>
          {!collapsed.includes(g.loc) && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "1.05rem" }}>
            {g.list.map((item) => (
              <li key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", padding: "0.6rem 0.25rem", borderBottom: "1px solid #eee" }}>
                {editingId === item.id ? (
                  <>
                    <span style={{ display: "flex", gap: "0.4rem", flex: 1, flexWrap: "wrap" }}>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} aria-label="שם" style={{ ...inputStyle, flex: "2 1 7rem" }} />
                      <input value={editQty} onChange={(e) => setEditQty(e.target.value)} maxLength={40} aria-label="כמות" placeholder="כמות" style={{ ...inputStyle, flex: "1 1 5rem" }} />
                      <input value={editLoc} onChange={(e) => setEditLoc(e.target.value)} maxLength={40} list={listId} aria-label="מיקום" placeholder="מיקום" style={{ ...inputStyle, flex: "1 1 6rem" }} />
                    </span>
                    <button onClick={saveEdit} style={{ backgroundColor: "#10b981", color: "white", border: "none", padding: "0.3rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}>שמור</button>
                    <button onClick={() => setEditingId(null)} style={{ backgroundColor: "#e5e7eb", border: "none", padding: "0.3rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}>ביטול</button>
                  </>
                ) : (
                  <>
                    <span>
                      <strong>{item.item_name}</strong> {item.quantity ? `- ${item.quantity}` : ""}
                    </span>
                    <span style={{ display: "flex", gap: "0.4rem" }}>
                      <button onClick={() => startEdit(item)} aria-label={`ערוך את ${item.item_name}`} style={{ backgroundColor: "#e5e7eb", border: "none", padding: "0.3rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}>✏️</button>
                      <button onClick={() => deleteItem(item.id)} style={{ backgroundColor: "#ef4444", color: "white", border: "none", padding: "0.3rem 0.6rem", borderRadius: "4px", cursor: "pointer" }}>מחק</button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          )}
        </div>
      ))}

      {savedOrder.length > 0 && (
        <button
          onClick={() => {
            resetLocationOrder();
            setSavedOrder([]);
          }}
          style={{ padding: "0.4rem 0.8rem", backgroundColor: "transparent", color: "#6b7280", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer" }}
        >
          חזרה לסדר מיקומים ברירת המחדל
        </button>
      )}
    </section>
  );
}

function arrowStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "2rem",
    height: "2rem",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    backgroundColor: disabled ? "#f3f4f6" : "white",
    color: disabled ? "#d1d5db" : "#111827",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}