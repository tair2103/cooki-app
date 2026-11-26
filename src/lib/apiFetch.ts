// כמו fetch רגיל, אבל מצרף את אישור ההתחברות של המשתמשת. כל קריאה לנתיבי /api צריכה לעבור דרכו.
import { supabase } from "@/lib/supabase";

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession(); // מחדש token שפג תוקפו אם אפשר
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}