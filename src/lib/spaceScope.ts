// "היקף" הנתונים הנוכחי: אישי (null) או מרחב משותף (uuid).
// כל קריאה או כתיבה של מזווה / קניות / מתכונים / תיקיות עוברת דרך כאן, כדי שמה שמוצג ומה שנשמר
// יהיו תמיד של המרחב שנבחר, ולא יתערבבו עם המרחבים האחרים (RLS נותן גישה לכולם, ולכן הסינון הכרחי).
// הערך נקבע על ידי SpacesProvider לפני שהמסכים מוצגים, והמסכים נטענים מחדש בכל החלפת מרחב.

let current: string | null = null;

export function setCurrentSpace(id: string | null): void {
  current = id;
}

export function currentSpaceId(): string | null {
  return current;
}

// מסנן שאילתה (select / update / delete) להיקף הנוכחי
export function inScope<T>(query: T): T {
  const q = query as unknown as { eq(c: string, v: string): T; is(c: string, v: null): T };
  return current ? q.eq("space_id", current) : q.is("space_id", null);
}

// מוסיף space_id לשורה חדשה (null = אישי)
export function withSpace<T extends object>(row: T): T & { space_id: string | null } {
  return { ...row, space_id: current };
}