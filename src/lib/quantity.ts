// כמויות כטקסט חופשי ("2", "קרטון", "חצי קילו", "תבנית 12") ואיחוד ביניהן.
// הכלל: מאחדים רק כשברור שאפשר (אותה יחידה). בכל מקרה אחר מחברים עם " + ",
// כך שאף מידע לא הולך לאיבוד.

const SINGULAR: Record<string, string> = {
  קרטונים: "קרטון",
  חבילות: "חבילה",
  בקבוקים: "בקבוק",
  שקיות: "שקית",
  קופסאות: "קופסה",
  תבניות: "תבנית",
  כוסות: "כוס",
  כפות: "כף",
  כפיות: "כפית",
  ליטרים: "ליטר",
  קילוגרם: "קילו",
  'ק"ג': "קילו",
  קג: "קילו",
  גרמים: "גרם",
  יחידות: "יחידה",
  פחיות: "פחית",
  צנצנות: "צנצנת",
  חופנים: "חופן",
};

const PLURAL: Record<string, string> = {
  קרטון: "קרטונים",
  חבילה: "חבילות",
  בקבוק: "בקבוקים",
  שקית: "שקיות",
  קופסה: "קופסאות",
  תבנית: "תבניות",
  כוס: "כוסות",
  כף: "כפות",
  כפית: "כפיות",
  יחידה: "יחידות",
  פחית: "פחיות",
  צנצנת: "צנצנות",
  חופן: "חופנים",
};

const UNITS = new Set([
  "קרטון", "חבילה", "בקבוק", "שקית", "קופסה", "תבנית", "כוס", "כף", "כפית",
  "ליטר", "קילו", "גרם", 'מ"ל', "יחידה", "פחית", "צנצנת", "חופן",
]);

const NUMBER_WORDS: Record<string, number> = {
  אחד: 1, אחת: 1, שני: 2, שתי: 2, שניים: 2, שתיים: 2,
  שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
  חצי: 0.5, רבע: 0.25,
};

// גרשיים וגרש בצורות שונות ← צורה אחת
function clean(word: string): string {
  return word.replace(/[״”“]/g, '"').replace(/[׳’‘`]/g, "'");
}

// אם המילה היא יחידה מוכרת, מחזיר את צורתה היחידה. אחרת null.
export function unitOf(word: string): string | null {
  const w = clean(word);
  const single = SINGULAR[w] ?? w;
  return UNITS.has(single) ? single : null;
}

// אם המילה היא מספר (ספרות, שבר או מילה כמו "חצי"), מחזיר אותו. אחרת null.
export function numberOf(word: string): number | null {
  const w = clean(word);
  if (/^\d+([.,]\d+)?$/.test(w)) return parseFloat(w.replace(",", "."));
  const fraction = w.match(/^(\d+)\/(\d+)$/);
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
  return w in NUMBER_WORDS ? NUMBER_WORDS[w] : null;
}

type Parsed = { value: number; unit: string } | null;

// מחזיר ערך ויחידה רק אם הכמות ברורה: "2", "קרטון", "2 קרטונים", "חצי קילו".
// "תבנית 12" (יחידה ואז מספר) לא ברורה: תבנית של 12, לא 12 תבניות.
function parse(text: string): Parsed {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    const n = numberOf(tokens[0]);
    if (n !== null) return { value: n, unit: "" };
    const u = unitOf(tokens[0]);
    if (u) return { value: 1, unit: u };
  }
  if (tokens.length === 2) {
    const n = numberOf(tokens[0]);
    const u = unitOf(tokens[1]);
    if (n !== null && u) return { value: n, unit: u };
  }
  return null;
}

// מחוץ לקובץ משתמשים בזה להשוואת כמויות (quantityCheck.ts)
export const parseQuantity = parse;

const round = (v: number) => Math.round(v * 100) / 100;

export function formatQuantity(value: number, unit: string): string {
  const v = round(value);
  if (!unit) return String(v);
  if (v === 1) return unit;
  if (v === 0.5) return `חצי ${unit}`;
  if (v === 0.25) return `רבע ${unit}`;
  return `${v} ${v > 1 && PLURAL[unit] ? PLURAL[unit] : unit}`;
}

export function mergeQuantities(a: string, b: string): string {
  const ta = (a ?? "").trim();
  const tb = (b ?? "").trim();
  if (!ta) return tb;
  if (!tb) return ta;

  const pa = parse(ta);
  const pb = parse(tb);
  if (pa && pb && pa.unit === pb.unit) {
    return formatQuantity(pa.value + pb.value, pa.unit);
  }
  return `${ta} + ${tb}`;
}