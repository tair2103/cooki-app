// מסכי ההתחברות: כניסה/הרשמה/שכחתי סיסמה, אישור תנאים, וסיסמה חדשה.
"use client";

import { useState } from "react";
import { setRememberPreference } from "@/lib/authStorage";
import { supabase } from "@/lib/supabase";
import {
  GOOGLE_LOGIN_ENABLED,
  MIN_PASSWORD,
  mapAuthError,
  validateAuthForm,
  validateNewPassword,
  type AuthMode,
} from "@/lib/authLogic";

const card = { maxWidth: "380px", margin: "3rem auto", padding: "1.5rem", border: "1px solid #e5e7eb", borderRadius: "10px", backgroundColor: "white" } as const;
const input = { width: "100%", padding: "0.55rem", border: "1px solid #ccc", borderRadius: "6px", boxSizing: "border-box", marginTop: "0.25rem" } as const;
const primaryBtn = (disabled: boolean) =>
  ({ width: "100%", padding: "0.6rem", backgroundColor: disabled ? "#9ca3af" : "#6366f1", color: "white", border: "none", borderRadius: "6px", cursor: disabled ? "not-allowed" : "pointer", marginTop: "0.75rem" }) as const;
const linkBtn = { background: "none", border: "none", color: "#4f46e5", cursor: "pointer", padding: 0, textDecoration: "underline", font: "inherit" } as const;

function TermsLinks() {
  return (
    <>
      <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#4f46e5" }}>תנאי השימוש</a>
      {" ו"}
      <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#4f46e5" }}>מדיניות הפרטיות</a>
    </>
  );
}

export function LoginScreen({
  initialError,
  onSignupAttempt,
  onSignupFailed,
}: {
  initialError: string;
  onSignupAttempt: (email: string) => void;
  onSignupFailed: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [info, setInfo] = useState("");

  function switchMode(next: AuthMode) {
    setMode(next);
    setError("");
    setInfo("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    const problem = validateAuthForm({ mode, email, password, accepted });
    if (problem) {
      setError(problem);
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    setBusy(true);
    try {
      if (mode === "login") {
        setRememberPreference(remember); // לפני ההתחברות: קובע אם היא תישמר אחרי סגירת הדפדפן
        const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (err) setError(mapAuthError(err.message, err.code));
        // בהצלחה: AuthGate מקבל את ההתחברות ומחליף מסך
      } else if (mode === "signup") {
        onSignupAttempt(cleanEmail);
        const { data, error: err } = await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: window.location.origin } });
        if (err) {
          onSignupFailed();
          setError(mapAuthError(err.message, err.code));
        } else if (!data.session) {
          onSignupFailed(); // אין התחברות מיידית: האישור יתבקש במסך ההסכמה אחרי הכניסה הראשונה
          setInfo("נשלח אימייל לאישור. אחרי הלחיצה על הקישור אפשר להיכנס.");
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: window.location.origin });
        if (err) setError(mapAuthError(err.message, err.code));
        else setInfo("אם הכתובת רשומה, נשלח אליה קישור לאיפוס סיסמה.");
      }
    } catch (e2) {
      console.error("שגיאת התחברות:", e2);
      onSignupFailed();
      setError(mapAuthError(null));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError("");
    setInfo("");
    if (mode === "signup" && !accepted) {
      setError("כדי להירשם צריך לאשר את תנאי השימוש ואת מדיניות הפרטיות.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (err) {
      setError(mapAuthError(err.message, err.code));
      setBusy(false);
    }
  }

  const title = mode === "login" ? "התחברות" : mode === "signup" ? "הרשמה" : "איפוס סיסמה";

  return (
    <main style={card}>
      <h1 style={{ marginTop: 0, fontSize: "1.4rem" }}>cooki 🍳</h1>
      <h2 style={{ fontSize: "1.1rem" }}>{title}</h2>

      <form onSubmit={submit} noValidate>
        <label style={{ display: "block" }}>
          אימייל
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" style={input} />
        </label>

        {mode !== "forgot" && (
          <label style={{ display: "block", marginTop: "0.6rem" }}>
            סיסמה
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              dir="ltr"
              style={input}
            />
            {mode === "signup" && <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>לפחות {MIN_PASSWORD} תווים</span>}
          </label>
        )}

        {mode === "signup" && (
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.8rem", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: "0.25rem" }} />
            <span>
              קראתי והסכמתי ל<TermsLinks />
            </span>
          </label>
        )}

        {mode === "login" && (
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.8rem", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            הישאר/י מחובר/ת
          </label>
        )}

        {error && <p role="alert" style={{ color: "#991b1b", margin: "0.75rem 0 0" }}>{error}</p>}
        {info && <p role="status" style={{ color: "#047857", margin: "0.75rem 0 0" }}>{info}</p>}

        <button type="submit" disabled={busy} style={primaryBtn(busy)}>
          {busy ? "רגע..." : title}
        </button>
      </form>

      {GOOGLE_LOGIN_ENABLED && mode !== "forgot" && (
        <button
          onClick={google}
          disabled={busy}
          style={{ width: "100%", padding: "0.6rem", marginTop: "0.6rem", backgroundColor: "white", color: "#111827", border: "1px solid #d1d5db", borderRadius: "6px", cursor: busy ? "not-allowed" : "pointer" }}
        >
          {mode === "signup" ? "הרשמה עם Google" : "התחברות עם Google"}
        </button>
      )}

      <p style={{ marginBottom: 0, fontSize: "0.9rem", color: "#4b5563" }}>
        {mode === "login" && (
          <>
            אין חשבון? <button style={linkBtn} onClick={() => switchMode("signup")}>הרשמה</button>
            {" · "}
            <button style={linkBtn} onClick={() => switchMode("forgot")}>שכחתי סיסמה</button>
          </>
        )}
        {mode === "signup" && (
          <>
            כבר רשומה? <button style={linkBtn} onClick={() => switchMode("login")}>התחברות</button>
          </>
        )}
        {mode === "forgot" && (
          <button style={linkBtn} onClick={() => switchMode("login")}>חזרה להתחברות</button>
        )}
      </p>
    </main>
  );
}

export function ConsentScreen({ onAccept, onSignOut, error, busy }: { onAccept: () => void; onSignOut: () => void; error: string; busy: boolean }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <main style={card}>
      <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>לפני שממשיכים</h1>
      <p>כדי להשתמש ב-cooki צריך לאשר את התנאים. אפשר לקרוא אותם לפני האישור.</p>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.95rem" }}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: "0.25rem" }} />
        <span>
          קראתי והסכמתי ל<TermsLinks />
        </span>
      </label>
      {error && <p role="alert" style={{ color: "#991b1b" }}>{error}</p>}
      <button onClick={onAccept} disabled={!accepted || busy} style={primaryBtn(!accepted || busy)}>
        {busy ? "שומר..." : "המשך"}
      </button>
      <p style={{ fontSize: "0.9rem" }}>
        <button style={linkBtn} onClick={onSignOut}>התנתקות</button>
      </p>
    </main>
  );
}

export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(mapAuthError(err.message, err.code));
    else onDone();
  }

  return (
    <main style={card}>
      <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>בחירת סיסמה חדשה</h1>
      <form onSubmit={submit} noValidate>
        <label style={{ display: "block" }}>
          סיסמה חדשה
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" dir="ltr" style={input} />
        </label>
        <label style={{ display: "block", marginTop: "0.6rem" }}>
          אישור סיסמה
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" dir="ltr" style={input} />
        </label>
        {error && <p role="alert" style={{ color: "#991b1b" }}>{error}</p>}
        <button type="submit" disabled={busy} style={primaryBtn(busy)}>
          {busy ? "שומר..." : "שמירת סיסמה"}
        </button>
      </form>
    </main>
  );
}