// טוען ושומר את רשימת מוצרי הבסיס של המשתמשת המחוברת (טבלת user_settings).
// אם הטעינה נכשלה או שעוד לא הוגדרה רשימה, משתמשים בברירת המחדל.
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_BASICS, normalizeBasics, type Basic } from "@/lib/basics";

export function useBasics() {
  const [basics, setBasics] = useState<Basic[]>(DEFAULT_BASICS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("user_settings").select("basics").maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("טעינת מוצרי הבסיס נכשלה (ברירת מחדל בשימוש):", error);
      } else {
        const list = normalizeBasics(data?.basics);
        if (list) setBasics(list);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // list = null מאפס לברירת המחדל. המסך מתעדכן רק אחרי שהשמירה הצליחה. מחזיר הודעת שגיאה או null.
  async function save(list: Basic[] | null): Promise<string | null> {
    const normalized = list === null ? null : normalizeBasics(list);
    const { error } = await supabase
      .from("user_settings")
      .upsert({ basics: normalized, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) {
      console.error("שמירת מוצרי הבסיס נכשלה:", error);
      return error.code === "42P01" ? "צריך להריץ את 11_user_settings.sql ב-Supabase." : "השמירה נכשלה. אפשר לנסות שוב.";
    }
    setBasics(normalized ?? DEFAULT_BASICS);
    return null;
  }

  return { basics, loaded, save };
}