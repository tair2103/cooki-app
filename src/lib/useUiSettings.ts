// "ready" נהיה true אחרי שהעדפות התצוגה נטענו. רכיבים טוענים את ההעדפות שלהם רק אז.
"use client";

import { useEffect, useState } from "react";
import { ensureHydrated } from "@/lib/uiStore";

export function useUiReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    ensureHydrated().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}