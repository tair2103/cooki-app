// מסווג רשימת מצרכים: קודם מילון (חינם ומיידי), ורק מה שהמילון לא הכיר נשלח ל-AI.
// אם ה-AI נכשל, המצרך נשאר ב"אחר" והמשתמשת יכולה לשנות ידנית. הוספה לרשימה לא נחסמת.
import { CATEGORY_NAMES, OTHER, categorize } from "@/lib/categories";
import { authedFetch } from "@/lib/apiFetch";

export async function categorizeMany(names: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const unknown: string[] = [];

  for (const name of names) {
    const category = categorize(name);
    result[name] = category;
    if (category === OTHER && !unknown.includes(name)) unknown.push(name);
  }

  if (unknown.length > 0) {
    try {
      const response = await authedFetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: unknown }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      for (const name of unknown) {
        const category = data?.categories?.[name];
        if (typeof category === "string" && CATEGORY_NAMES.includes(category)) {
          result[name] = category;
        }
      }
    } catch (e) {
      console.error("סיווג AI נכשל, המצרכים נשארים ב'אחר':", e);
    }
  }

  return result;
}