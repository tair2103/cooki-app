// "הישאר/י מחובר/ת": שולט במשך ההתחברות.
//   מסומן: ההתחברות נשמרת בדפדפן גם אחרי סגירה (כמו עד עכשיו).
//   לא מסומן: ההתחברות נשמרת רק כל עוד הדפדפן פתוח. בסגירה הוא מתנתק, אבל אפשר לפתוח כמה לשוניות באותה הפעלה.
// איך: ה-session נשמר ב-localStorage כרגיל, ובנוסף "עוגיית הפעלה" (בלי תאריך תפוגה) שהדפדפן מוחק כשנסגר.
// כשלא מסומן "הישאר מחובר" והעוגייה חסרה, ההתחברות השמורה נמחקת ומוצג מסך הכניסה.

export const REMEMBER_KEY = "cooki_remember";
export const ALIVE_COOKIE = "cooki_alive";

export type KV = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type AliveMarker = { has(): boolean; set(): void };

// מזהה את המפתח שבו Supabase שומרת את ההתחברות (sb-<project>-auth-token)
const isSessionKey = (key: string) => key.endsWith("-auth-token");

export function createAuthStorage(store: KV, alive: AliveMarker): KV {
  const remembered = () => store.getItem(REMEMBER_KEY) === "1";
  return {
    getItem(key) {
      if (!remembered() && !alive.has()) {
        // הדפדפן נסגר מאז ההתחברות האחרונה: ההתחברות פגה
        store.removeItem(key);
        return null;
      }
      return store.getItem(key);
    },
    setItem(key, value) {
      store.setItem(key, value);
      if (!remembered()) alive.set();
    },
    removeItem(key) {
      store.removeItem(key);
      if (isSessionKey(key)) store.removeItem(REMEMBER_KEY); // התנתקות: הבחירה מתאפסת
    },
  };
}

export function setRemember(store: KV, value: boolean): void {
  if (value) store.setItem(REMEMBER_KEY, "1");
  else store.removeItem(REMEMBER_KEY);
}

// ---- המימוש בדפדפן (לא רץ בשרת) ----
function browserStore(): KV | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

const browserAlive: AliveMarker = {
  has: () => typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith(`${ALIVE_COOKIE}=`)),
  set: () => {
    if (typeof document === "undefined") return;
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ALIVE_COOKIE}=1; path=/; SameSite=Lax${secure}`; // בלי expires: נמחקת כשהדפדפן נסגר
  },
};

// ה-storage שמועבר ל-Supabase. בשרת (בלי דפדפן) מחזיר זיכרון ריק.
export function getBrowserAuthStorage(): KV {
  const store = browserStore();
  if (!store) return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  return createAuthStorage(store, browserAlive);
}

export function setRememberPreference(value: boolean): void {
  const store = browserStore();
  if (store) setRemember(store, value);
}