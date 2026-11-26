// מאגר העדפות התצוגה בזיכרון, עם שמירה ל-Supabase (לפי משתמשת).
// הקוד הקיים ממשיך לקרוא ולכתוב בצורה סינכרונית (loadX / saveX ב-locations.ts וב-categoryOrder.ts),
// והמאגר הזה שומר ברקע ואחרי השהיה קצרה, כדי לא לשלוח בקשה על כל לחיצה.
// אם בסיס הנתונים לא זמין, ההעדפות נשמרות בדפדפן כגיבוי.
import { supabase } from "@/lib/supabase";
import { EMPTY_UI, isEmptyUi, normalizeUi, type UiSettings } from "@/lib/uiSettings";

// המפתחות הישנים (localStorage). משמשים להעברה חד-פעמית ולגיבוי.
const LEGACY_KEYS: Record<keyof UiSettings, string> = {
  categoryOrder: "cooki_category_order",
  locationOrder: "cooki_location_order",
  hiddenLocations: "cooki_hidden_locations",
  collapsedLocations: "cooki_collapsed_locations",
};
const SAVE_DELAY_MS = 600;

let state: UiSettings = EMPTY_UI;
let hydratedFor: string | null = null;
let hydrating: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function readLegacy(): UiSettings {
  const raw: Record<string, unknown> = {};
  for (const [field, key] of Object.entries(LEGACY_KEYS)) {
    try {
      raw[field] = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      raw[field] = null;
    }
  }
  return normalizeUi(raw);
}

function writeLegacy(s: UiSettings) {
  for (const [field, key] of Object.entries(LEGACY_KEYS)) {
    try {
      localStorage.setItem(key, JSON.stringify(s[field as keyof UiSettings]));
    } catch {
      /* אחסון חסום או מלא */
    }
  }
}

function clearLegacy() {
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

async function save(): Promise<boolean> {
  const { error } = await supabase.from("user_settings").upsert({ ui: state, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    console.error("שמירת העדפות התצוגה נכשלה (נשמר בדפדפן כגיבוי):", error);
    writeLegacy(state);
    return false;
  }
  return true;
}

export function getUi(): UiSettings {
  return state;
}

export function patchUi(patch: Partial<UiSettings>): void {
  state = normalizeUi({ ...state, ...patch });
  if (!hydratedFor) return; // עוד לא נטען, או שאין משתמשת מחוברת
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void save();
  }, SAVE_DELAY_MS);
}

// שומר מיד שינוי שממתין (לפני התנתקות או סגירת הלשונית)
export async function flushUi(): Promise<void> {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  await save();
}

// טוען את ההעדפות של המשתמשת המחוברת (פעם אחת לכל משתמשת). בטוח לקרוא כמה פעמים.
export function ensureHydrated(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid: string | null = sessionData.session?.user?.id ?? null;
    if (!uid) {
      state = EMPTY_UI;
      hydratedFor = null;
      return;
    }
    if (hydratedFor === uid) return;

    state = EMPTY_UI;
    const { data, error } = await supabase.from("user_settings").select("ui").maybeSingle();
    if (error) {
      console.error("טעינת העדפות התצוגה נכשלה (משתמשים בגיבוי מהדפדפן):", error);
      state = readLegacy();
    } else if (data?.ui) {
      state = normalizeUi(data.ui);
    } else {
      // עוד אין העדפות בחשבון: מעבירים את מה ששמור בדפדפן, פעם אחת
      state = readLegacy();
      hydratedFor = uid;
      if (!isEmptyUi(state) && (await save())) clearLegacy();
    }
    hydratedFor = uid;
  })().finally(() => {
    hydrating = null;
  });
  return hydrating;
}

// ניקוי בהתנתקות, כדי שמשתמשת אחרת באותו דפדפן לא תראה את ההעדפות
export function resetUiStore(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  state = EMPTY_UI;
  hydratedFor = null;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushUi();
  });
}