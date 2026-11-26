// בורר המרחבים (למעלה באפליקציה) ולוח הניהול: יצירה, הזמנות, חברים, יציאה, מחיקה.
"use client";

import { useEffect, useState } from "react";
import { useSpaces } from "@/lib/spaces";
import { PERSONAL, MAX_SPACE_NAME, validateInviteEmail, validateSpaceName, cleanSpaceName, type Member } from "@/lib/spacesLogic";

const btn: React.CSSProperties = { border: "1px solid #d1d5db", background: "#fff", borderRadius: "6px", padding: "0.25rem 0.6rem", cursor: "pointer", color: "#374151", fontSize: "0.85rem" };
const danger: React.CSSProperties = { ...btn, color: "#b91c1c", borderColor: "#fca5a5" };
const input: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: "6px", padding: "0.3rem 0.5rem", fontSize: "0.9rem" };

export default function SpaceBar() {
  const { ready, spaces, invites, activeSpace, setActive, acceptInvite, declineInvite } = useSpaces();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  if (!ready) return null;

  return (
    <div style={{ borderBottom: "1px solid #f3f4f6", padding: "0.4rem 1rem", fontSize: "0.9rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
        <label htmlFor="space-select" style={{ color: "#6b7280" }}>מרחב:</label>
        <select
          id="space-select"
          value={activeSpace ? activeSpace.id : PERSONAL}
          onChange={(e) => setActive(e.target.value === PERSONAL ? null : e.target.value)}
          style={{ ...input, minWidth: "9rem" }}
        >
          <option value={PERSONAL}>האישי שלי</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button style={btn} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "סגירה" : "ניהול מרחבים"}
          {invites.length > 0 && !open ? ` (${invites.length} הזמנות)` : ""}
        </button>
        {activeSpace && <span style={{ color: "#4f46e5" }}>משותף: כל החברים במרחב רואים ועורכים</span>}
      </div>

      {invites.length > 0 && (
        <div style={{ marginTop: "0.5rem", background: "#eef2ff", borderRadius: "8px", padding: "0.5rem 0.75rem" }}>
          {invites.map((inv) => (
            <div key={inv.invite_id} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", margin: "0.2rem 0" }}>
              <span>
                הוזמנת למרחב <b>{inv.space_name}</b>
                {inv.invited_by_email ? <> על ידי <span dir="ltr">{inv.invited_by_email}</span></> : null}
              </span>
              <button
                style={btn}
                onClick={async () => {
                  const r = await acceptInvite(inv.invite_id);
                  setMessage(r.ok ? "" : r.error ?? "");
                }}
              >
                אישור
              </button>
              <button
                style={btn}
                onClick={async () => {
                  const r = await declineInvite(inv.invite_id);
                  setMessage(r.ok ? "" : r.error ?? "");
                }}
              >
                דחייה
              </button>
            </div>
          ))}
        </div>
      )}
      {message && <p role="alert" style={{ color: "#b91c1c", margin: "0.4rem 0 0" }}>{message}</p>}
      {open && <ManagePanel />}
    </div>
  );
}

function ManagePanel() {
  const { spaces, activeSpace, userId, createSpace, listMembers, invite, leave, removeMember, transfer, renameSpace, deleteSpace } = useSpaces();
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState("");

  const spaceId = activeSpace?.id ?? null;

  async function reloadMembers() {
    if (!spaceId) {
      setMembers([]);
      return;
    }
    const r = await listMembers(spaceId);
    setMembers(r.members);
    if (r.error) setErr(r.error);
  }

  useEffect(() => {
    setMsg("");
    setErr("");
    setRenaming(activeSpace?.name ?? "");
    reloadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    setBusy(true);
    setErr("");
    setMsg("");
    const r = await action();
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "משהו השתבש.");
      return;
    }
    setMsg(success);
    after?.();
  }

  const owner = members.find((m) => m.role === "owner");
  const meOwner = owner?.id === userId;

  return (
    <div style={{ marginTop: "0.6rem", padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "10px", display: "grid", gap: "0.9rem" }}>
      <section>
        <b>יצירת מרחב חדש</b>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
          <input
            style={{ ...input, flex: "1 1 10rem" }}
            value={newName}
            maxLength={MAX_SPACE_NAME}
            placeholder="למשל: בית, ארוחת חג"
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            style={btn}
            disabled={busy}
            onClick={() => {
              const v = validateSpaceName(newName);
              if (v) return setErr(v);
              run(() => createSpace(cleanSpaceName(newName)), "המרחב נוצר.", () => setNewName(""));
            }}
          >
            יצירה
          </button>
        </div>
        {spaces.length === 0 && <p style={{ color: "#6b7280", margin: "0.4rem 0 0" }}>עוד אין מרחבים משותפים. מרחב חדש מתחיל ריק: המזווה והמתכונים האישיים נשארים אצלך.</p>}
      </section>

      {activeSpace ? (
        <section>
          <b>המרחב: {activeSpace.name}</b>
          <ul style={{ listStyle: "none", padding: 0, margin: "0.4rem 0" }}>
            {members.map((m) => (
              <li key={m.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", margin: "0.2rem 0" }}>
                <span dir="ltr">{m.email}</span>
                {m.role === "owner" && <span style={{ color: "#6b7280" }}>(מנהל/ת המרחב)</span>}
                {activeSpace.created_by === m.id && <span style={{ color: "#6b7280" }}>(יצר/ה את המרחב)</span>}
                {m.id === userId && <span style={{ color: "#6b7280" }}>(זה/זו את/ה)</span>}
                {meOwner && m.id !== userId && (
                  <>
                    <button
                      style={btn}
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`להעביר את ניהול המרחב ל-${m.email}? הוא/היא יוכלו להסיר חברים ולמחוק את המרחב, ולך לא תהיה יותר הרשאה כזאת.`)) {
                          run(() => transfer(activeSpace.id, m.id), "הניהול הועבר.", reloadMembers);
                        }
                      }}
                    >
                      העברת ניהול
                    </button>
                    <button
                      style={danger}
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`להסיר את ${m.email} מהמרחב?`)) run(() => removeMember(activeSpace.id, m.id), "הוסר/ה מהמרחב.", reloadMembers);
                      }}
                    >
                      הסרה
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              style={{ ...input, flex: "1 1 14rem", direction: "ltr" }}
              type="email"
              value={email}
              placeholder="אימייל של מי שרשום/ה באפליקציה"
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              style={btn}
              disabled={busy}
              onClick={() => {
                const v = validateInviteEmail(email);
                if (v.error) return setErr(v.error);
                run(() => invite(activeSpace.id, v.email), "ההזמנה נשלחה. היא תופיע אצל מי שהוזמן/ה כשייכנס/תיכנס לאפליקציה.", () => setEmail(""));
              }}
            >
              הזמנה
            </button>
          </div>
          <p style={{ color: "#6b7280", fontSize: "0.8rem", margin: "0.3rem 0" }}>
            ההזמנה עובדת רק למי שכבר רשום/ה באפליקציה. מי שעוד לא רשום/ה צריך/ה קודם שתתווסף לרשימת המורשים.
          </p>

          {meOwner && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
              <input style={{ ...input, flex: "1 1 10rem" }} value={renaming} maxLength={MAX_SPACE_NAME} onChange={(e) => setRenaming(e.target.value)} />
              <button
                style={btn}
                disabled={busy}
                onClick={() => {
                  const v = validateSpaceName(renaming);
                  if (v) return setErr(v);
                  run(() => renameSpace(activeSpace.id, cleanSpaceName(renaming)), "השם עודכן.");
                }}
              >
                שינוי שם
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
            <button
              style={danger}
              disabled={busy}
              onClick={() => {
                const last = members.length <= 1;
                const text = last
                  ? "את/ה החבר/ה האחרון/ה, אז יציאה תמחק את המרחב ואת כל מה שבו. להמשיך?"
                  : "לצאת מהמרחב? התוכן ימשיך להיות שייך למרחב ולא יעבור אליך.";
                if (confirm(text)) run(() => leave(activeSpace.id), "יצאת מהמרחב.");
              }}
            >
              יציאה מהמרחב
            </button>
            {meOwner && (
              <button
                style={danger}
                disabled={busy}
                onClick={() => {
                  if (confirm(`למחוק את המרחב "${activeSpace.name}" לצמיתות, עם המזווה, הרשימות והמתכונים שבו, לכל החברים?`)) {
                    run(() => deleteSpace(activeSpace.id), "המרחב נמחק.");
                  }
                }}
              >
                מחיקת המרחב
              </button>
            )}
          </div>
          {!meOwner && members.length > 0 && <p style={{ color: "#6b7280", fontSize: "0.8rem" }}>רק מנהל/ת המרחב יכול/ה למחוק אותו או להסיר חברים.</p>}
        </section>
      ) : (
        <p style={{ color: "#6b7280", margin: 0 }}>נבחר "האישי שלי". כדי לנהל חברים, בוחרים מרחב משותף בתפריט.</p>
      )}

      {err && <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{err}</p>}
      {msg && <p role="status" style={{ color: "#15803d", margin: 0 }}>{msg}</p>}
    </div>
  );
}