// בדיקת התחברות ומכסה בשרת (נתיבי /api). רץ רק בשרת.
// העיקרון: הדפדפן שולח את אישור ההתחברות, והשרת מאמת אותו מול Supabase ולא סומך על מה שהדפדפן אומר.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { QUOTAS, bearerToken, quotaVerdict, reservationId, type QuotaKind } from "@/lib/quotaConfig";

export type Authed = { ok: true; supabase: SupabaseClient; userId: string };
export type AuthFailed = { ok: false; response: NextResponse };

export async function authenticate(request: Request): Promise<Authed | AuthFailed> {
  const fail = (status: number, error: string): AuthFailed => ({ ok: false, response: NextResponse.json({ error }, { status }) });

  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return fail(401, "צריך להתחבר כדי להשתמש בזה.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("חסרים NEXT_PUBLIC_SUPABASE_URL או NEXT_PUBLIC_SUPABASE_ANON_KEY בשרת");
    return fail(500, "שגיאת הגדרות בשרת.");
  }

  // לקוח שפועל בשם המשתמשת (עם ה-token שלה), כך ש-auth.uid() ב-SQL וה-RLS עובדים עבורה
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // אימות מול שרת ההתחברות של Supabase (לא רק קריאת ה-token)
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return fail(401, "ההתחברות פגה. צריך להתחבר מחדש.");

  return { ok: true, supabase, userId: data.user.id };
}

export type QuotaGrant = { ok: true; reservation: string | null } | { ok: false; response: NextResponse };

// בודק ומעלה את מונה המכסה. אם אסור להמשיך: ok=false עם תשובת שגיאה מוכנה.
// אם מותר: reservation הוא המזהה שמאפשר להחזיר את המכסה אם הפעולה תיכשל בגלל ה-AI (נשאר בשרת בלבד).
export async function enforceQuota(supabase: SupabaseClient, kind: QuotaKind): Promise<QuotaGrant> {
  const { data, error } = await supabase.rpc("consume_ai_quota", {
    p_kind: kind,
    p_user_limit: QUOTAS[kind].user,
    p_global_limit: QUOTAS[kind].global,
  });
  if (error) console.error("בדיקת מכסה נכשלה:", error);
  const verdict = quotaVerdict(kind, data, !!error);
  if (!verdict.allowed) return { ok: false, response: NextResponse.json({ error: verdict.error }, { status: verdict.status }) };
  return { ok: true, reservation: reservationId(data) };
}

// מחזיר מכסה שנוצלה לשווא. כשל בהחזרה לא מפיל את הבקשה (רק נרשם ביומן).
export async function refundQuota(supabase: SupabaseClient, reservation: string | null): Promise<void> {
  if (!reservation) return;
  try {
    const { data, error } = await supabase.rpc("refund_ai_quota", { p_reservation: reservation });
    if (error) console.error("החזרת מכסה נכשלה:", error);
    else if (data !== true) console.log("המכסה לא הוחזרה (כבר הוחזרה, חלף הזמן או הגענו למגבלת ההחזרות)");
  } catch (e) {
    console.error("החזרת מכסה נכשלה:", e);
  }
}