// כל הפילטרים של הג'נרוט במקום אחד.
// העמוד משתמש ברשימות כדי לצייר את תיבות הבחירה,
// והשרת משתמש באותן רשימות כדי לוודא שהערכים שהגיעו תקינים.

export type Option = { value: string; label: string };

export const ANY = "any"; // "לא משנה"

export const DISH_TYPES: Option[] = [
  { value: ANY, label: "לא משנה" },
  { value: "ארוחה", label: "ארוחה" },
  { value: "נשנוש", label: "נשנוש" },
  { value: "קינוח", label: "קינוח" },
];

// רלוונטי רק כשסוג המנה הוא "ארוחה"
export const MEAL_TIMES: Option[] = [
  { value: ANY, label: "לא משנה" },
  { value: "בוקר", label: "בוקר" },
  { value: "צהריים", label: "צהריים" },
  { value: "ערב", label: "ערב" },
];

export const DIFFICULTIES: Option[] = [
  { value: ANY, label: "לא משנה" },
  { value: "קל", label: "קל" },
  { value: "בינוני", label: "בינוני" },
  { value: "מורכב", label: "מורכב" },
];

// זמן הכנה מקסימלי בדקות
export const MAX_MINUTES: Option[] = [
  { value: ANY, label: "לא משנה" },
  { value: "15", label: "עד 15 דקות" },
  { value: "30", label: "עד 30 דקות" },
  { value: "60", label: "עד שעה" },
];

// מורכבות = מספר שלבי ההכנה
export const COMPLEXITIES: Option[] = [
  { value: ANY, label: "לא משנה" },
  { value: "few", label: "מעט שלבים (עד 5)" },
  { value: "medium", label: "בינוני (6 עד 10 שלבים)" },
  { value: "many", label: "הרבה שלבים (11 ומעלה)" },
];

export const INGREDIENT_MODES: Option[] = [
  { value: "pantry_only", label: "רק ממה שיש במזווה" },
  { value: "allow_shopping", label: "מותר להשלים בקניות" },
];

export const CUISINES: Option[] = [
  { value: ANY, label: "ללא העדפה" },
  { value: "איטלקי", label: "איטלקי" },
  { value: "אסייתי", label: "אסייתי" },
  { value: "ים-תיכוני", label: "ים-תיכוני" },
  { value: "מקסיקני", label: "מקסיקני" },
  { value: "ישראלי", label: "ישראלי" },
  { value: "הודי", label: "הודי" },
];

export type Filters = {
  dishType: string;
  mealTime: string;
  difficulty: string;
  maxMinutes: string;
  complexity: string;
  ingredientsMode: string;
  cuisine: string;
};

export const DEFAULT_FILTERS: Filters = {
  dishType: ANY,
  mealTime: ANY,
  difficulty: ANY,
  maxMinutes: ANY,
  complexity: ANY,
  ingredientsMode: "pantry_only",
  cuisine: ANY,
};

// בודק שהערך נמצא ברשימה המותרת. אחרת מחזיר ערך ברירת מחדל.
function pick(options: Option[], value: unknown, fallback: string): string {
  return typeof value === "string" && options.some((o) => o.value === value)
    ? value
    : fallback;
}

// השרת קורא לפונקציה הזו על מה שהגיע מהדפדפן,
// כדי שלא יגיע לפרומפט טקסט שלא אנחנו כתבנו.
export function normalizeFilters(raw: any): Filters {
  const dishType = pick(DISH_TYPES, raw?.dishType, ANY);
  return {
    dishType,
    // זמן ביום נשמר רק אם סוג המנה הוא ארוחה
    mealTime: dishType === "ארוחה" ? pick(MEAL_TIMES, raw?.mealTime, ANY) : ANY,
    difficulty: pick(DIFFICULTIES, raw?.difficulty, ANY),
    maxMinutes: pick(MAX_MINUTES, raw?.maxMinutes, ANY),
    complexity: pick(COMPLEXITIES, raw?.complexity, ANY),
    ingredientsMode: pick(INGREDIENT_MODES, raw?.ingredientsMode, "pantry_only"),
    cuisine: pick(CUISINES, raw?.cuisine, ANY),
  };
}