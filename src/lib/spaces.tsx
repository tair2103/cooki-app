// ספק המרחבים: טוען את המרחבים וההזמנות של המשתמש/ת המחובר/ת, ושומר איזה מרחב פעיל.
// activeSpaceId הוא null כשנבחר "האישי שלי", ומזהה (uuid) כשנבחר מרחב משותף.
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { setCurrentSpace } from "@/lib/spaceScope";
import {
  PERSONAL,
  activeStorageKey,
  mapSpaceError,
  resolveActive,
  type Member,
  type PendingInvite,
  type Space,
} from "@/lib/spacesLogic";

type Result = { ok: boolean; error?: string };

type SpacesContextValue = {
  ready: boolean;
  userId: string;
  spaces: Space[];
  invites: PendingInvite[];
  activeSpaceId: string | null; // null = אישי
  activeSpace: Space | null;
  setActive: (id: string | null) => void;
  refresh: () => Promise<void>;
  createSpace: (name: string) => Promise<Result>;
  listMembers: (spaceId: string) => Promise<{ members: Member[]; error?: string }>;
  invite: (spaceId: string, email: string) => Promise<Result>;
  acceptInvite: (inviteId: string) => Promise<Result>;
  declineInvite: (inviteId: string) => Promise<Result>;
  leave: (spaceId: string) => Promise<Result>;
  removeMember: (spaceId: string, userId: string) => Promise<Result>;
  transfer: (spaceId: string, userId: string) => Promise<Result>;
  renameSpace: (spaceId: string, name: string) => Promise<Result>;
  deleteSpace: (spaceId: string) => Promise<Result>;
};

const SpacesContext = createContext<SpacesContextValue | null>(null);

export function useSpaces(): SpacesContextValue {
  const ctx = useContext(SpacesContext);
  if (!ctx) throw new Error("useSpaces חייב להיות בתוך SpacesProvider");
  return ctx;
}

// תשובה מפונקציית RPC: { ok, reason } או שגיאה
function toResult(res: { data: unknown; error: { message: string } | null }): Result {
  if (res.error) return { ok: false, error: mapSpaceError(res.error.message) };
  const d = res.data as { ok?: boolean; reason?: string } | null;
  if (d && d.ok === false) return { ok: false, error: mapSpaceError(d.reason) };
  return { ok: true };
}

export function SpacesProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [active, setActiveState] = useState<string>(PERSONAL);

  const refresh = useCallback(async () => {
    const [sp, inv] = await Promise.all([
      supabase.from("spaces").select("id, name, created_by").order("created_at", { ascending: true }),
      supabase.rpc("my_pending_invites"),
    ]);
    if (sp.error) console.error("טעינת מרחבים נכשלה:", sp.error);
    if (inv.error) console.error("טעינת הזמנות נכשלה:", inv.error);
    const list = ((sp.data ?? []) as Space[]);
    setSpaces(list);
    setInvites(((inv.data ?? []) as PendingInvite[]));
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(activeStorageKey(userId));
    } catch {
      /* אין אחסון: נשארים באישי */
    }
    // אם הטעינה נכשלה לא מאפסים בחירה שמורה (שלא תקפוץ לאישי בגלל תקלת רשת)
    setActiveState((prev) => (sp.error ? prev : resolveActive(saved ?? prev, list)));
    setReady(true);
  }, [userId]);

  useEffect(() => {
    setReady(false);
    refresh();
  }, [refresh]);

  // Keep invites and spaces fresh without a manual page reload: refresh when the tab becomes
  // visible again and once a minute while it is visible (throttled to at most once per 15 seconds)
  useEffect(() => {
    let last = Date.now();
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 15000) return;
      last = Date.now();
      refresh();
    };
    const timer = setInterval(maybeRefresh, 60000);
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [refresh]);

  const setActive = useCallback(
    (id: string | null) => {
      const value = id ?? PERSONAL;
      setActiveState(value);
      try {
        localStorage.setItem(activeStorageKey(userId), value);
      } catch {
        /* לא קריטי */
      }
    },
    [userId],
  );

  const createSpace = useCallback(
    async (name: string): Promise<Result> => {
      const res = await supabase.rpc("create_space", { p_name: name });
      if (res.error) return { ok: false, error: mapSpaceError(res.error.message) };
      await refresh();
      setActive(res.data as string);
      return { ok: true };
    },
    [refresh, setActive],
  );

  const listMembers = useCallback(async (spaceId: string) => {
    const res = await supabase.rpc("space_member_list", { p_space: spaceId });
    if (res.error) return { members: [], error: mapSpaceError(res.error.message) };
    const rows = (res.data ?? []) as { member_id: string; member_email: string; member_role: "owner" | "member" }[];
    return { members: rows.map((r) => ({ id: r.member_id, email: r.member_email, role: r.member_role })) };
  }, []);

  const invite = useCallback(
    async (spaceId: string, email: string) => toResult(await supabase.rpc("invite_to_space", { p_space: spaceId, p_email: email })),
    [],
  );

  const acceptInvite = useCallback(
    async (inviteId: string): Promise<Result> => {
      const res = await supabase.rpc("accept_space_invite", { p_invite: inviteId });
      const out = toResult(res);
      await refresh();
      const sid = (res.data as { space_id?: string } | null)?.space_id;
      if (out.ok && sid) setActive(sid);
      return out;
    },
    [refresh, setActive],
  );

  const declineInvite = useCallback(
    async (inviteId: string): Promise<Result> => {
      const { error } = await supabase.from("space_invites").delete().eq("id", inviteId);
      await refresh();
      return error ? { ok: false, error: mapSpaceError(error.message) } : { ok: true };
    },
    [refresh],
  );

  const leave = useCallback(
    async (spaceId: string): Promise<Result> => {
      const out = toResult(await supabase.rpc("leave_space", { p_space: spaceId }));
      if (out.ok) setActive(null);
      await refresh();
      return out;
    },
    [refresh, setActive],
  );

  const removeMember = useCallback(
    async (spaceId: string, uid: string) => toResult(await supabase.rpc("remove_space_member", { p_space: spaceId, p_user: uid })),
    [],
  );

  const transfer = useCallback(
    async (spaceId: string, uid: string): Promise<Result> => {
      const out = toResult(await supabase.rpc("transfer_space_ownership", { p_space: spaceId, p_new_owner: uid }));
      await refresh();
      return out;
    },
    [refresh],
  );

  const renameSpace = useCallback(
    async (spaceId: string, name: string): Promise<Result> => {
      const { error } = await supabase.from("spaces").update({ name }).eq("id", spaceId);
      await refresh();
      return error ? { ok: false, error: mapSpaceError(error.message) } : { ok: true };
    },
    [refresh],
  );

  const deleteSpace = useCallback(
    async (spaceId: string): Promise<Result> => {
      const { error } = await supabase.from("spaces").delete().eq("id", spaceId);
      if (!error) setActive(null);
      await refresh();
      return error ? { ok: false, error: mapSpaceError(error.message) } : { ok: true };
    },
    [refresh, setActive],
  );

  const activeSpace = useMemo(() => spaces.find((s) => s.id === active) ?? null, [spaces, active]);

  // קובע את היקף הנתונים לפני שהמסכים מוצגים (ראו spaceScope.ts)
  setCurrentSpace(activeSpace ? activeSpace.id : null);

  const value: SpacesContextValue = {
    ready,
    userId,
    spaces,
    invites,
    activeSpaceId: activeSpace ? activeSpace.id : null,
    activeSpace,
    setActive,
    refresh,
    createSpace,
    listMembers,
    invite,
    acceptInvite,
    declineInvite,
    leave,
    removeMember,
    transfer,
    renameSpace,
    deleteSpace,
  };

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}