// src/lib/dbErrors.ts
// הודעות בעברית כשהשמירה נדחית בגלל מגבלות הכמות או האורך שב-DB (15_input_limits.sql, 18_spaces.sql).

export type LimitKind = "pantry" | "recipes" | "shopping" | "folders";

const LIMIT_TEXT: Record<LimitKind, string> = {
  pantry: "המזווה מלא: אפשר לשמור עד 500 פריטים. כדי להוסיף עוד, צריך למחוק פריטים שלא נחוצים.",
  recipes: "ספר המתכונים מלא: אפשר לשמור עד 500 מתכונים. כדי להוסיף עוד, צריך למחוק מתכונים.",
  shopping: "רשימת הקניות מלאה: אפשר עד 1000 פריטים. כדי להוסיף עוד, צריך למחוק פריטים.",
  folders: "אפשר ליצור עד 50 תיקיות. כדי להוסיף עוד, צריך למחוק תיקייה.",
};

type DbErr = { message?: string; code?: string } | null | undefined;

// מחזיר הודעה מותאמת אם זו מגבלת כמות או אורך, ואחרת את הודעת ברירת המחדל
export function dbErrorMessage(error: DbErr, kind: LimitKind, fallback: string): string {
  if (!error) return fallback;
  if ((error.message ?? "").includes("row_limit_exceeded")) return LIMIT_TEXT[kind];
  if (error.code === "23514") return "אחד הערכים ארוך מדי. כדאי לקצר אותו ולנסות שוב.";
  return fallback;
}

// עבור פונקציות שמחזירות רק true/false: שומרים את ההודעה, והמסך שמציג את הכשלון לוקח אותה
let lastMessage: string | null = null;

export function noteDbError(error: DbErr, kind: LimitKind): void {
  const msg = dbErrorMessage(error, kind, "");
  lastMessage = msg || null;
}

export function takeDbMessage(fallback: string): string {
  const msg = lastMessage ?? fallback;
  lastMessage = null;
  return msg;
}