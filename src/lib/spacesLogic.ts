// לוגיקה טהורה למרחבים משותפים: בדיקות קלט והודעות שגיאה בעברית (בלשון ניטרלית).

export const MAX_SPACE_NAME = 40;
export const PERSONAL = "personal"; // ערך הבורר עבור "האישי שלי"

export type Space = { id: string; name: string; created_by: string };
export type Member = { id: string; email: string; role: "owner" | "member" };
export type PendingInvite = { invite_id: string; space_id: string; space_name: string; invited_by_email: string | null };

export function cleanSpaceName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function validateSpaceName(raw: string): string | null {
  const n = cleanSpaceName(raw);
  if (n.length < 1) return "צריך לתת שם למרחב.";
  if (n.length > MAX_SPACE_NAME) return `השם ארוך מדי (עד ${MAX_SPACE_NAME} תווים).`;
  return null;
}

export function validateInviteEmail(raw: string): { email: string; error: string | null } {
  const email = raw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return { email, error: "כתובת האימייל לא נראית תקינה." };
  }
  return { email, error: null };
}

// סיבות שהפונקציות בבסיס הנתונים מחזירות (reason) או שגיאות (message), בעברית ובניסוח ניטרלי
const REASONS: Record<string, string> = {
  not_signed_in: "צריך להתחבר מחדש.",
  not_member: "אין לך גישה למרחב הזה.",
  not_owner: "רק מנהל/ת המרחב יכול/ה לבצע את הפעולה הזאת.",
  bad_email: "כתובת האימייל לא נראית תקינה.",
  self: "זו הכתובת שלך. אי אפשר להזמין את עצמך.",
  already_member: "מי שבכתובת הזאת כבר חבר/ה במרחב.",
  too_many_invites: "יש יותר מדי הזמנות ממתינות. אפשר לבטל חלק מהן.",
  not_found: "ההזמנה לא נמצאה. אולי בוטלה.",
  space_full: "המרחב מלא (עד 10 חברים).",
  too_many_spaces: "אפשר להיות חבר/ה בעד 10 מרחבים.",
  too_many_owned: "אפשר לנהל עד 5 מרחבים.",
  owner_must_transfer: "צריך קודם להעביר את ניהול המרחב לחבר/ה אחר/ת.",
  use_leave: "כדי לצאת מהמרחב משתמשים ב״יציאה מהמרחב״.",
  bad_target: "אי אפשר להעביר את הניהול לבחירה הזאת.",
  bad_name: "שם המרחב לא תקין (1 עד 40 תווים).",
};

export function mapSpaceError(reasonOrMessage: string | null | undefined): string {
  const s = (reasonOrMessage ?? "").trim();
  if (REASONS[s]) return REASONS[s];
  for (const key of Object.keys(REASONS)) {
    if (s.includes(key)) return REASONS[key];
  }
  return "משהו השתבש. אפשר לנסות שוב.";
}

// הבחירה השמורה חייבת להיות מרחב שעדיין קיים; אחרת חוזרים ל"אישי"
export function resolveActive(saved: string | null, spaces: Space[]): string {
  if (saved && saved !== PERSONAL && spaces.some((s) => s.id === saved)) return saved;
  return PERSONAL;
}

export function activeStorageKey(userId: string): string {
  return `cooki_active_space_${userId}`;
}