import { createClient } from "@supabase/supabase-js";
import { getBrowserAuthStorage } from "@/lib/authStorage";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// storage מותאם: שולט אם ההתחברות נשארת אחרי סגירת הדפדפן ("הישאר/י מחובר/ת")
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: getBrowserAuthStorage() },
});