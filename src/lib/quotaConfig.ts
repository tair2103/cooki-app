// מכסות השימוש ב-AI והודעות למשתמשת. לוגיקה טהורה, בלי Supabase, כדי שאפשר יהיה לבדוק אותה.
// לשינוי המכסות: משנים את המספרים כאן ושומרים. אין צורך לגעת בבסיס הנתונים.

export type QuotaKind = "ai" | "video" | "categorize";

export const QUOTAS: Record<QuotaKind, { user: number; global: number; label: string }> = {
  ai: { user: 15, global: 100, label: "פעולות AI" }, // יצירת מתכונים, ייבוא מקישור או מטקסט
  video: { user: 3, global: 15, label: "ייבואי סרטון" },
  categorize: { user: 60, global: 400, label: "סיווגים אוטומטיים" }, // רץ ברקע בהוספת מצרכים
};

export type QuotaVerdict = { allowed: true } | { allowed: false; status: number; error: string };

// מתרגם את מה שהפונקציה consume_ai_quota החזירה (או שגיאה) להחלטה והודעה בעברית.
// כל מצב לא ברור נחסם (fail closed): עדיף לחסום בטעות מאשר לשרוף את המכסה בלי שליטה.
export function quotaVerdict(kind: QuotaKind, data: unknown, rpcFailed: boolean): QuotaVerdict {
  if (rpcFailed || !data || typeof data !== "object") {
    return { allowed: false, status: 503, error: "לא הצלחנו לבדוק את המכסה כרגע. אפשר לנסות שוב בעוד רגע." };
  }
  const d = data as { allowed?: unknown; reason?: unknown; limit?: unknown };
  if (d.allowed === true) return { allowed: true };

  switch (d.reason) {
    case "user_limit": {
      const limit = typeof d.limit === "number" ? d.limit : QUOTAS[kind].user;
      return { allowed: false, status: 429, error: `נגמרה המכסה היומית שלך (${limit} ${QUOTAS[kind].label}). היא מתחדשת מחר בחצות.` };
    }
    case "global_limit":
      return { allowed: false, status: 429, error: "האפליקציה הגיעה למכסה היומית הכללית של ה-AI. אפשר לנסות שוב מחר." };
    case "not_signed_in":
      return { allowed: false, status: 401, error: "צריך להתחבר מחדש." };
    default:
      return { allowed: false, status: 503, error: "לא הצלחנו לבדוק את המכסה כרגע. אפשר לנסות שוב בעוד רגע." };
  }
}

// מזהה השריון שהפונקציה החזירה (uuid). null אם חסר או לא תקין.
export function reservationId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const id = (data as { reservation?: unknown }).reservation;
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

// מוציא את ה-token מכותרת Authorization: Bearer <token>. null אם חסר או לא תקין.
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(header.trim());
  return match ? match[1] : null;
}