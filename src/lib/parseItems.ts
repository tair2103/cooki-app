// מפרק טקסט חופשי לרשימת פריטים עם כמות, לפי כללים (בלי AI):
//   "2 חלב, קרטון ביצים"  ←  חלב (2), ביצים (קרטון)
// הפענוח לא מושלם, ולכן תמיד מציגים תצוגה מקדימה לתיקון לפני ההוספה.
import { numberOf, unitOf } from "@/lib/quantity";

export type ParsedItem = { name: string; amount: string };

// מילים שמתחילות ב"ו" אבל ה"ו" היא חלק מהמילה, לא "ו" החיבור
const VAV_WORDS = ["וניל", "ויסקי", "ופלים", "ורד", "ורמוט", "ודקה", "ווטסון"];
const isConjunctionWord = (w: string) => /^ו[א-ת]{2,}$/.test(w) && !VAV_WORDS.includes(w);

// מפצל לפריטים: פסיק, נקודה-פסיק, שורה חדשה, "ו" כמילה נפרדת ("חלב ו ביצים"),
// או "ו" צמודה ("חלב וביצים").
function splitItems(text: string): string[] {
  const result: string[] = [];

  for (const chunk of text.split(/[\n,;،]+/)) {
    for (const part of chunk.split(/\s+ו\s+/)) {
      let current: string[] = [];
      for (const word of part.trim().split(/\s+/).filter(Boolean)) {
        if (isConjunctionWord(word)) {
          if (current.length > 0) result.push(current.join(" "));
          current = [word.slice(1)];
        } else {
          current.push(word);
        }
      }
      if (current.length > 0) result.push(current.join(" "));
    }
  }
  return result.filter((s) => s.trim().length > 0);
}

// מוציא כמות מהפריט: בהתחלה ("2 חלב", "קרטון ביצים", "חצי קילו עגבניות")
// או בסוף ("חלב 2", "קמח 2 קילו")
function extract(text: string): ParsedItem {
  const tokens = text.split(/\s+/);
  let amount: string[] = [];
  let rest = tokens;

  if (numberOf(tokens[0]) !== null) {
    amount = [tokens[0]];
    rest = tokens.slice(1);
    if (rest.length > 0 && unitOf(rest[0])) {
      amount.push(rest[0]);
      rest = rest.slice(1);
    }
  } else if (unitOf(tokens[0]) && tokens.length > 1) {
    amount = [tokens[0]];
    rest = tokens.slice(1);
  }

  // "קרטון של ביצים"
  if (amount.length > 0 && rest[0] === "של") rest = rest.slice(1);

  // כמות בסוף, רק אם לא מצאנו בהתחלה
  if (amount.length === 0 && rest.length >= 2) {
    const last = rest[rest.length - 1];
    const beforeLast = rest[rest.length - 2];
    if (rest.length >= 3 && numberOf(beforeLast) !== null && unitOf(last)) {
      amount = [beforeLast, last];
      rest = rest.slice(0, -2);
    } else if (numberOf(last) !== null) {
      amount = [last];
      rest = rest.slice(0, -1);
    }
  }

  // לא נשאר שם: נשמור את כל הטקסט כשם, והמשתמשת תתקן בתצוגה המקדימה
  if (rest.length === 0) return { name: text, amount: "" };
  return { name: rest.join(" "), amount: amount.join(" ") };
}

export function parseItemsText(text: string): ParsedItem[] {
  return splitItems(text).map(extract);
}