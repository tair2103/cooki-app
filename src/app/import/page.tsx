// src/app/import/page.tsx  ->  הכתובת: /import
// ייבוא מתכון מקישור, מטקסט או מסרטון: מזינים, רואים תצוגה מקדימה שאפשר לתקן, ורק אז שומרים לספר.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { dbErrorMessage, takeDbMessage } from "@/lib/dbErrors";
import { inScope, withSpace } from "@/lib/spaceScope";
import type { Recipe } from "@/lib/types";
import { haveIngredient, pantryTokens } from "@/lib/pantryCheck";
import { useBasics } from "@/lib/useBasics";
import { authedFetch } from "@/lib/apiFetch";
import { parseYoutubeUrl } from "@/lib/recipeImport";
import RecipeEditor from "@/components/RecipeEditor";

type Source = "url" | "text" | "video";
type Folder = { id: string; name: string };

const METHOD_NOTE: Record<string, string> = {
  structured: "המתכון נקרא מהמבנה המובנה של הדף (הכי מדויק).",
  page_text: "לא נמצא מבנה מובנה בדף, אז המתכון חולץ מהטקסט שלו. כדאי לעבור על הפרטים.",
  pasted_text: "המתכון חולץ מהטקסט שהדבקת. כדאי לעבור על הפרטים.",
  video: "המתכון חולץ מהסרטון (מה שנאמר ונראה בו). כדאי לעבור על הפרטים.",
  video_text: "המתכון חולץ מהסרטון ומהתיאור, והשניים הותאמו זה לזה.",
  mock: "מצב דוגמה (USE_MOCK): זה מתכון קבוע ולא מה שהזנת.",
};

// אתרים שלא ניתן לקרוא מהם סרטון לפי קישור. מפנים אותם להעלאת הסרטון.
const SOCIAL_HOSTS = ["tiktok.com", "instagram.com", "facebook.com", "fb.watch", "fb.com", "vm.tiktok.com"];
function isSocialLink(raw: string): boolean {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return SOCIAL_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}
const isHttpUrl = (raw: string) => /^https?:\/\//i.test(raw.trim());

const fieldStyle = { width: "100%", boxSizing: "border-box", padding: "0.6rem", border: "1px solid #ccc", borderRadius: "6px", fontSize: "1rem", fontFamily: "inherit" } as const;

export default function ImportRecipe() {
  const [source, setSource] = useState<Source>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  // לשונית סרטון: שדה קישור אחד (יוטיוב מנותח ונשמר כמקור, קישור אחר רק נשמר כמקור) ותיאור. העלאת קובץ סרטון קיימת בענף video-upload
  const [youtube, setYoutube] = useState("");
  const [description, setDescription] = useState("");
  const [hint, setHint] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [pantryNames, setPantryNames] = useState<string[] | null>(null);
  const { basics } = useBasics();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState("");

  // המזווה (לסימון "בבית / חסר") והתיקיות (לבחירה בשמירה). אם משהו נכשל, פשוט לא מציגים אותו.
  useEffect(() => {
    (async () => {
      const pan = await inScope(supabase.from("pantry_items").select("item_name"));
      if (!pan.error) setPantryNames((pan.data ?? []).map((r: any) => String(r.item_name)));
      const fol = await inScope(supabase.from("recipe_folders").select("id, name")).order("created_at", { ascending: true });
      if (!fol.error) setFolders((fol.data ?? []) as Folder[]);
    })();
  }, []);

  // /import?url=... ו-/import?text=... ממלאים את השדות (בשביל שיתוף, בהמשך). לא מריצים ייבוא אוטומטית:
  // ייבוא עולה מכסת AI, ולכן קישור לא אמור להפעיל אותו בלי שהמשתמשת לוחצת.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qUrl = (params.get("url") ?? "").trim().slice(0, 2000);
    const qText = (params.get("text") ?? "").trim().slice(0, 15000);
    if (qUrl) {
      if (parseYoutubeUrl(qUrl)) {
        setSource("video");
        setYoutube(qUrl);
        if (qText) setDescription(qText);
      } else if (isSocialLink(qUrl)) {
        setSource("video");
        setYoutube(qUrl);
        if (qText) setDescription(qText);
        setHint("קיבלתי קישור לסרטון. את הסרטון עצמו אי אפשר לקרוא מהקישור, אבל אפשר להדביק בתיאור את הכיתוב שלו.");
      } else if (isHttpUrl(qUrl)) {
        setSource("url");
        setUrl(qUrl);
      }
    } else if (qText) {
      setSource("text");
      setText(qText);
    }
  }, []);

  const canImport =
    !isLoading &&
    (source === "url" ? url.trim().length > 0 : source === "text" ? text.trim().length > 0 : youtube.trim().length > 0 || description.trim().length > 0);
  const isYoutube = !!parseYoutubeUrl(youtube);

  async function runImport() {
    setError("");
    setSavedMsg("");

    // קישור לרשת חברתית בלשונית הקישור: מפנים ללשונית הסרטון במקום לנסות לקרוא דף שאי אפשר לקרוא
    if (source === "url" && isSocialLink(url)) {
      setSource("video");
      setYoutube(url.trim());
      setUrl("");
      setHint("את הסרטון עצמו אי אפשר לקרוא מקישור של טיקטוק, אינסטגרם או פייסבוק. אפשר להדביק את הכיתוב שלו בתיאור.");
      return;
    }
    if (source === "video" && youtube.trim() && !isYoutube) {
      if (!isHttpUrl(youtube.trim())) {
        setError("זה לא נראה כמו קישור. אפשר להדביק קישור מלא שמתחיל ב-https.");
        return;
      }
      if (!description.trim()) {
        setError("את הסרטון עצמו אפשר לנתח רק מיוטיוב. לסרטון מרשת אחרת, הדביקי את הכיתוב או התיאור שלו בשדה התיאור, והקישור יישמר כמקור.");
        return;
      }
    }

    setIsLoading(true);
    setDraft(null);
    setNotes([]);
    setHint("");
    try {
      let init: RequestInit;
      if (source === "video" && isYoutube) {
        // קישור ליוטיוב (ותיאור אופציונלי). את ה-Content-Type הדפדפן קובע לבד.
        const form = new FormData();
        form.append("youtube", youtube.trim());
        if (description.trim()) form.append("text", description.trim());
        init = { method: "POST", body: form, signal: AbortSignal.timeout(210000) };
      } else {
        // קישור לדף, טקסט, או סרטון בלי קישור יוטיוב (אז התיאור הוא הטקסט)
        const payload = source === "url" ? { url: url.trim() } : { text: (source === "video" ? description : text).trim() };
        init = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(90000), // כמה מודלים ברצף יכולים לקחת זמן
        };
      }

      const response = await authedFetch("/api/import-recipe", init);
      const raw = await response.text();
      const data = raw ? JSON.parse(raw) : {};
      if (data.recipe) {
        setDraft(data.recipe as Recipe);
        setNotes(Array.isArray(data.notes) ? data.notes : []);
        // קישור מקור: מה שהמשתמשת הזינה (אם זה http/https), אחרת מה שהשרת זיהה
        setSourceUrl(source === "video" && youtube.trim() && isHttpUrl(youtube.trim()) ? youtube.trim() : data.source ?? null);
        setMethod(data.method ?? "");
      } else {
        setError(data.error || "התקבלה תשובה ריקה מהשרת.");
      }
    } catch (err: any) {
      console.error("import error:", err);
      setError(`שגיאה: ${err?.message || "תקלת תקשורת מול השרת"}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function save() {
    if (!draft) return;
    const ingredients = draft.ingredients.filter((i) => i.name.trim());
    const steps = draft.steps.map((s) => s.trim()).filter(Boolean);
    if (!draft.title.trim() || ingredients.length === 0 || steps.length === 0) {
      setError("צריך שם, לפחות מצרך אחד ולפחות שלב אחד.");
      return;
    }

    setIsSaving(true);
    setError("");
    const pantry = pantryTokens(pantryNames ?? []);
    const { error: dbError } = await supabase.from("recipes").insert([
      withSpace({
        title: draft.title.trim(),
        dish_type: draft.dish_type,
        meal_time: draft.dish_type === "ארוחה" ? draft.meal_time : "",
        cuisine: draft.cuisine.trim(),
        difficulty: draft.difficulty,
        prep_minutes: draft.prep_minutes,
        // have נשמר לפי המזווה של עכשיו. ספר המתכונים בודק מחדש בכל טעינה.
        ingredients: ingredients.map((i) => ({ name: i.name.trim(), amount: i.amount.trim(), have: haveIngredient(i.name, pantry, basics) })),
        steps,
        folder_id: folderId || null,
        source_url: sourceUrl,
      }),
    ]);
    setIsSaving(false);

    if (dbError) {
      console.error("import save error:", dbError);
      setError(dbErrorMessage(dbError, "recipes", "השמירה נכשלה. אפשר לנסות שוב."));
      return;
    }
    setSavedMsg(`"${draft.title.trim()}" נשמר בספר המתכונים ✓`);
    setDraft(null);
    setNotes([]);
    setUrl("");
    setText("");
    setYoutube("");
    setDescription("");
  }

  const tab = (value: Source, label: string) => (
    <button
      onClick={() => setSource(value)}
      style={{ padding: "0.45rem 1rem", border: "1px solid " + (source === value ? "#6366f1" : "#d1d5db"), backgroundColor: source === value ? "#6366f1" : "white", color: source === value ? "white" : "#111827", borderRadius: "999px", cursor: "pointer" }}
    >
      {label}
    </button>
  );

  return (
    <main style={{ padding: "2rem", direction: "rtl", fontFamily: "sans-serif", maxWidth: "700px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "#3b82f6" }}>
        ← חזרה למזווה
      </Link>
      <Link href="/recipes" style={{ color: "#3b82f6", marginInlineStart: "1.5rem" }}>
        📖 ספר המתכונים
      </Link>

      <h1>ייבוא מתכון</h1>
      <p style={{ color: "#6b7280", marginTop: 0 }}>
        קישור לדף מתכון, טקסט, או סרטון. תראי את המתכון לפני השמירה ותוכלי לתקן כל פרט.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        {tab("url", "🔗 קישור")}
        {tab("text", "📝 טקסט")}
        {tab("video", "🎬 סרטון")}
      </div>

      {hint && (
        <p style={{ margin: "0 0 0.75rem", padding: "0.8rem", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", color: "#1e40af" }}>{hint}</p>
      )}

      {source === "url" && (
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2000} placeholder="https://..." dir="ltr" aria-label="קישור למתכון" style={fieldStyle} />
      )}

      {source === "text" && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="הדביקי כאן את המתכון: שם, מצרכים והוראות הכנה" rows={8} maxLength={15000} aria-label="טקסט המתכון" style={fieldStyle} />
      )}

      {source === "video" && (
        <div>
          <label style={{ display: "block", fontSize: "0.92rem", margin: "0.9rem 0 0.25rem" }}>קישור לסרטון (יוטיוב מנותח, קישור מרשת אחרת נשמר כמקור)</label>
          <input
            type="url"
            value={youtube}
            maxLength={2000}
            onChange={(e) => setYoutube(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... או https://www.tiktok.com/..."
            dir="ltr"
            aria-label="קישור לסרטון"
            style={fieldStyle}
          />

          <label style={{ display: "block", fontSize: "0.92rem", margin: "0.9rem 0 0.25rem" }}>
            תיאור או כיתוב של הסרטון (מומלץ, אם יש מתכון כתוב)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="הדביקי כאן את הכיתוב או התיאור. ה-AI יתאים בינו לבין הסרטון, ואם יש הבדלים הוא יציין אותם."
            rows={5}
            maxLength={15000}
            aria-label="תיאור הסרטון"
            style={fieldStyle}
          />

          <p style={{ margin: "0.6rem 0 0", fontSize: "0.82rem", color: "#6b7280" }}>
            קישור יוטיוב נשלח ל-Google לצורך הניתוח. כדאי לוודא בתנאי השימוש של ה-API שהם מתאימים לסרטון.
          </p>
        </div>
      )}

      <button
        onClick={runImport}
        disabled={!canImport}
        style={{ marginTop: "0.75rem", padding: "0.6rem 1.4rem", backgroundColor: canImport ? "#6366f1" : "#9ca3af", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: canImport ? "pointer" : "not-allowed" }}
      >
        {isLoading ? (source === "video" ? "מנתח את הסרטון (עד כמה דקות)..." : "קורא את המתכון...") : "ייבא"}
      </button>

      {error && (
        <p style={{ marginTop: "1rem", padding: "0.9rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b" }}>{error}</p>
      )}
      {savedMsg && (
        <p style={{ marginTop: "1rem", padding: "0.9rem", backgroundColor: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", color: "#065f46" }}>
          {savedMsg} <Link href="/recipes" style={{ color: "#047857", fontWeight: "bold" }}>לספר המתכונים</Link>
        </p>
      )}

      {draft && (
        <section style={{ marginTop: "1.5rem", padding: "1.25rem", backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
          <p style={{ marginTop: 0, color: "#92400e", fontSize: "0.92rem" }}>
            {METHOD_NOTE[method] ?? ""} זו תצוגה מקדימה, עוד לא נשמר כלום.
          </p>

          {/* הבדלים או אי-ודאויות שה-AI מצא בין הסרטון לתיאור */}
          {notes.length > 0 && (
            <div style={{ margin: "0 0 1rem", padding: "0.8rem 1rem", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px" }}>
              <strong style={{ color: "#92400e" }}>⚠️ כדאי לבדוק:</strong>
              <ul style={{ margin: "0.4rem 0 0", paddingInlineStart: "1.25rem", color: "#78350f", fontSize: "0.92rem" }}>
                {notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {sourceUrl && (
            <p dir="ltr" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#6b7280", wordBreak: "break-all", textAlign: "right" }}>
              מקור: {sourceUrl}
            </p>
          )}

          <RecipeEditor value={draft} onChange={setDraft} pantryNames={pantryNames} basics={basics} />

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", marginTop: "1.25rem" }}>
            {folders.length > 0 && (
              <label style={{ fontSize: "0.92rem" }}>
                תיקייה:{" "}
                <select value={folderId} onChange={(e) => setFolderId(e.target.value)} style={{ padding: "0.35rem", border: "1px solid #d1d5db", borderRadius: "4px", backgroundColor: "white" }}>
                  <option value="">ללא תיקייה</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={save} disabled={isSaving} style={{ padding: "0.55rem 1.3rem", backgroundColor: isSaving ? "#9ca3af" : "#10b981", color: "white", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: isSaving ? "not-allowed" : "pointer" }}>
              {isSaving ? "שומר..." : "שמור לספר המתכונים"}
            </button>
            <button onClick={() => { setDraft(null); setNotes([]); }} disabled={isSaving} style={{ padding: "0.55rem 1rem", backgroundColor: "#e5e7eb", border: "none", borderRadius: "6px", cursor: "pointer" }}>
              בטל
            </button>
          </div>
        </section>
      )}
    </main>
  );
}