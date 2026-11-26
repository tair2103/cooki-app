// עוטף את כל האפליקציה: בלי התחברות רואים רק את מסך הכניסה/הרשמה.
// שימי לב: זו שכבת חוויית משתמש. ההגנה האמיתית על הנתונים היא מדיניות RLS לפי משתמשת (שלב 3).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  TERMS_VERSION,
  acceptedAtSignup,
  isPublicPath,
  mapAuthError,
  parseAuthErrorFromUrl,
  type SignupAcceptance,
} from "@/lib/authLogic";
import { ConsentScreen, LoginScreen, NewPasswordScreen } from "@/components/AuthScreens";
import { flushUi, resetUiStore } from "@/lib/uiStore";
import { SpacesProvider, useSpaces } from "@/lib/spaces";
import SpaceBar from "@/components/SpaceBar";
import DeleteAccount from "@/components/DeleteAccount";

type SessionUser = { id: string; email?: string | null };
type ConsentState = "unknown" | "yes" | "no" | "error";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined); // undefined = טוען
  const [recovery, setRecovery] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [consent, setConsent] = useState<ConsentState>("unknown");
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState("");
  const signupAcceptance = useRef<SignupAcceptance | null>(null); // בזיכרון בלבד

  // שגיאה שחזרה בכתובת (למשל הרשמה עם Google של כתובת שלא ברשימה), ואז ניקוי הכתובת
  useEffect(() => {
    const message = parseAuthErrorFromUrl(window.location.hash, window.location.search);
    if (message) {
      setUrlError(message);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: { user: SessionUser } | null } }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: { user: SessionUser } | null) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = user?.id;
  const userEmail = user?.email;

  const checkConsent = useCallback(async () => {
    setConsentError("");
    const { data, error } = await supabase.from("user_consents").select("terms_version").eq("terms_version", TERMS_VERSION).maybeSingle();
    if (error) {
      console.error("בדיקת הסכמה נכשלה:", error);
      setConsent("error");
      return;
    }
    if (data) {
      setConsent("yes");
      return;
    }
    // סומנה הסכמה בטופס ההרשמה לאחרונה: שומרים אותה עכשיו
    if (acceptedAtSignup(signupAcceptance.current, userEmail, Date.now())) {
      const { error: insertError } = await supabase.from("user_consents").insert({ terms_version: TERMS_VERSION });
      if (!insertError || insertError.code === "23505") {
        signupAcceptance.current = null;
        setConsent("yes");
        return;
      }
      console.error("שמירת הסכמה נכשלה:", insertError);
    }
    setConsent("no");
  }, [userEmail]);

  useEffect(() => {
    if (!userId) {
      setConsent("unknown");
      return;
    }
    checkConsent();
  }, [userId, checkConsent]);

  async function acceptTerms() {
    setConsentBusy(true);
    setConsentError("");
    const { error } = await supabase.from("user_consents").insert({ terms_version: TERMS_VERSION });
    setConsentBusy(false);
    if (error && error.code !== "23505") {
      console.error("שמירת הסכמה נכשלה:", error);
      setConsentError(mapAuthError(error.message, error.code));
      return;
    }
    signupAcceptance.current = null;
    setConsent("yes");
  }

  async function signOut() {
    await flushUi(); // שומר העדפות שעדיין ממתינות, כל עוד יש התחברות
    await supabase.auth.signOut();
    resetUiStore(); // משתמשת אחרת באותו דפדפן לא תראה את ההעדפות
    setRecovery(false);
  }

  // אחרי מחיקת חשבון: מנקים את כל מה ששמור בדפדפן ויוצאים (ההתחברות כבר לא תקפה)
  async function afterAccountDeleted() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("cooki_"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* אין אחסון: אין מה לנקות */
    }
    resetUiStore();
    await supabase.auth.signOut();
    setRecovery(false);
  }

  // התנאים והמדיניות פתוחים לכולן, גם לפני הרשמה
  if (isPublicPath(pathname)) return <>{children}</>;

  if (user === undefined) return <p style={{ textAlign: "center", marginTop: "3rem" }}>טוען...</p>;
  if (!user) return (
      <LoginScreen
        initialError={urlError}
        onSignupAttempt={(email) => {
          signupAcceptance.current = { email, t: Date.now() };
        }}
        onSignupFailed={() => {
          signupAcceptance.current = null;
        }}
      />
    );
  if (recovery) return <NewPasswordScreen onDone={() => setRecovery(false)} />;

  if (consent === "unknown") return <p style={{ textAlign: "center", marginTop: "3rem" }}>טוען...</p>;
  if (consent === "error") {
    return (
      <main style={{ maxWidth: "380px", margin: "3rem auto", textAlign: "center" }}>
        <p>לא הצלחנו לבדוק את אישור התנאים. אפשר לנסות שוב.</p>
        <button onClick={checkConsent} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>ניסיון חוזר</button>
        <p><button onClick={signOut} style={{ background: "none", border: "none", color: "#4f46e5", cursor: "pointer", textDecoration: "underline" }}>התנתקות</button></p>
      </main>
    );
  }
  if (consent === "no") return <ConsentScreen onAccept={acceptTerms} onSignOut={signOut} error={consentError} busy={consentBusy} />;

  return (
    <SpacesProvider key={user.id} userId={user.id}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: "0.75rem", padding: "0.4rem 1rem", fontSize: "0.85rem", color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>
        <span dir="ltr">{user.email}</span>
        <button onClick={signOut} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: "6px", padding: "0.2rem 0.6rem", cursor: "pointer", color: "#374151" }}>
          התנתקות
        </button>
        <DeleteAccount email={user.email ?? ""} onDeleted={afterAccountDeleted} />
      </div>
      <SpaceBar />
      <ScopedContent>{children}</ScopedContent>
    </SpacesProvider>
  );
}

// המסכים מוצגים רק אחרי שידוע איזה מרחב פעיל, ונטענים מחדש בכל החלפת מרחב (לכן ה-key)
function ScopedContent({ children }: { children: React.ReactNode }) {
  const { ready, activeSpaceId } = useSpaces();
  if (!ready) return <p style={{ textAlign: "center", marginTop: "3rem" }}>טוען...</p>;
  return <div key={activeSpaceId ?? "personal"}>{children}</div>;
}