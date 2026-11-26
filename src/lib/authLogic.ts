// לוגיקה טהורה של ההתחברות: בדיקת טופס, תרגום שגיאות לעברית, וזיכרון זמני של הסכמה.
// בלי Supabase ובלי React, כדי שאפשר יהיה לבדוק אותה בנפרד.

// בכל שינוי מהותי בתנאים או במדיניות: מעדכנים את הערך, וכל המשתמשות יתבקשו לאשר מחדש.
export const TERMS_VERSION = "2026-11-26";
export const MIN_PASSWORD = 8;
// התחברות עם Google. להפעיל (true) רק אחרי שהגדרת את Google ב-Supabase (Authentication ← Providers).
export const GOOGLE_LOGIN_ENABLED = false;
export const MAX_PASSWORD = 72; // מגבלת bcrypt
const MAX_EMAIL = 254;

export type AuthMode = "login" | "signup" | "forgot";

export function validateAuthForm(input: {
  mode: AuthMode;
  email: string;
  password: string;
  accepted: boolean;
}): string | null {
  const email = input.email.trim();
  if (!email) return "צריך להזין אימייל.";
  if (email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "כתובת האימייל לא נראית תקינה.";
  }
  if (input.mode === "forgot") return null;

  if (!input.password) return "צריך להזין סיסמה.";
  if (input.mode === "signup") {
    if (input.password.length < MIN_PASSWORD) return `הסיסמה צריכה להיות לפחות ${MIN_PASSWORD} תווים.`;
    if (input.password.length > MAX_PASSWORD) return `הסיסמה ארוכה מדי (עד ${MAX_PASSWORD} תווים).`;
    if (!input.accepted) return "כדי להירשם צריך לאשר את תנאי השימוש ואת מדיניות הפרטיות.";
  }
  return null;
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `הסיסמה צריכה להיות לפחות ${MIN_PASSWORD} תווים.`;
  if (password.length > MAX_PASSWORD) return `הסיסמה ארוכה מדי (עד ${MAX_PASSWORD} תווים).`;
  if (password !== confirm) return "שתי הסיסמאות לא זהות.";
  return null;
}

// מתרגם הודעת שגיאה של Supabase להודעה בעברית. לא מציג טקסט גולמי למשתמשת.
export function mapAuthError(message: string | null | undefined, code?: string | null): string {
  const text = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (/signup_not_allowed|database error saving new user|database error/.test(text)) {
    return "ההרשמה כרגע בהזמנה בלבד, והכתובת הזו לא ברשימה המאושרת.";
  }
  if (/invalid_credentials|invalid login credentials/.test(text)) return "אימייל או סיסמה שגויים.";
  if (/email_not_confirmed|email not confirmed/.test(text)) return "צריך לאשר את האימייל. אפשר לבדוק בתיבת הדואר.";
  if (/over_email_send_rate_limit|rate limit|too many|over_request_rate_limit/.test(text)) {
    return "בוצעו יותר מדי ניסיונות. כדאי לחכות כמה דקות.";
  }
  if (/weak_password|password should be|password is too/.test(text)) return "הסיסמה חלשה מדי.";
  if (/user_already_exists|already registered/.test(text)) return "כבר קיים חשבון עם האימייל הזה. אפשר להתחבר.";
  if (/same_password|different from the old/.test(text)) return "הסיסמה החדשה צריכה להיות שונה מהקודמת.";
  if (/access_denied|otp_expired|expired|invalid.*(link|token)/.test(text)) {
    return "הקישור לא תקף או שפג תוקפו. אפשר לבקש קישור חדש.";
  }
  return "משהו השתבש. אפשר לנסות שוב.";
}

// אחרי חזרה מ-Google (או מקישור באימייל) שגיאה מגיעה בכתובת, ב-# או ב-?.
export function parseAuthErrorFromUrl(hash: string, search: string): string | null {
  for (const part of [hash, search]) {
    const params = new URLSearchParams(part.replace(/^[#?]/, ""));
    const description = params.get("error_description");
    const error = params.get("error");
    if (description || error) {
      return mapAuthError(description ?? error, params.get("error_code") ?? params.get("error"));
    }
  }
  return null;
}

// ---- הסכמה שסומנה בטופס ההרשמה ----
// נשמרת רק בזיכרון של העמוד (לא ב-localStorage), ורק לכתובת האימייל שנרשמה ולזמן קצר.
// כך אישור של מישהי לא יכול "לדלוף" לחשבון אחר, ולא נוצר אישור בלי שהרשמה באמת הצליחה.
export const SIGNUP_ACCEPTANCE_TTL_MS = 2 * 60 * 1000;
export type SignupAcceptance = { email: string; t: number };

export function acceptedAtSignup(
  acceptance: SignupAcceptance | null,
  userEmail: string | null | undefined,
  now: number
): boolean {
  if (!acceptance || !userEmail) return false;
  const age = now - acceptance.t;
  return (
    acceptance.email.trim().toLowerCase() === userEmail.trim().toLowerCase() &&
    age >= 0 &&
    age <= SIGNUP_ACCEPTANCE_TTL_MS
  );
}

// עמודים שפתוחים גם בלי התחברות (כדי שאפשר לקרוא את התנאים לפני ההרשמה)
export function isPublicPath(pathname: string | null): boolean {
  return pathname === "/terms" || pathname === "/privacy";
}