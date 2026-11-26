// src/app/api/recipes/route.ts
import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import type { Recipe } from "@/lib/types";
import { normalizeFilters, type Filters } from "@/lib/filters";
import { verifyRecipes } from "@/lib/pantryCheck";
import { authenticate, enforceQuota, refundQuota } from "@/lib/serverAuth";
import { MAX_JSON_BODY_BYTES, checkBodySize, sanitizePantryItems } from "@/lib/inputLimits";
import { DEFAULT_BASICS, basicsText, normalizeBasics } from "@/lib/basics";
import { anyRecipeHasForeignScript } from "@/lib/languageCheck";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// לפי סדר עדיפות. המכסה נספרת לכל מודל בנפרד, אז אם אחד נגמר עוברים לבא.
const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
];
const ATTEMPT_TIMEOUT_MS = 15000;
// ניסיון אחד לכל מודל: מודל שעמוס עכשיו בדרך כלל יהיה עמוס גם שנייה אחר כך,
// ועדיף לעבור ישר למודל הבא. אפשר להעלות ל-2 אם נראה שזה משתלם.
const ATTEMPTS_PER_MODEL = 1;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- מצב Mock: מתכונים קבועים בלי לפנות ל-Gemini (לא צורך מכסה) ----
// מפעילים ע"י USE_MOCK=true בקובץ .env.local (ואז מפעילים מחדש את npm run dev)
// שימי לב: ה-Mock לא מתחשב בפילטרים, הוא תמיד מחזיר אותם שני מתכונים.
const MOCK_RECIPES: Recipe[] = [
  {
    title: "שקשוקה קלאסית (דוגמה)",
    dish_type: "ארוחה",
    meal_time: "בוקר",
    cuisine: "ים-תיכוני",
    difficulty: "קל",
    prep_minutes: 25,
    ingredients: [
      { name: "ביצים", amount: "4", have: true },
      { name: "עגבניות מרוסקות", amount: "קופסה", have: true },
      { name: "פפריקה מתוקה", amount: "1 כפית", have: false },
    ],
    steps: [
      "מחממים שמן במחבת ומטגנים בצל עד שקיפות.",
      "מוסיפים עגבניות ופפריקה ומבשלים 10 דקות.",
      "יוצרים גומחות ושוברים לתוכן את הביצים.",
      "מכסים ומבשלים עד שהביצים מוצקות.",
    ],
  },
  {
    title: "עוגיות שוקולד ללא אפייה (דוגמה)",
    dish_type: "קינוח",
    meal_time: "",
    cuisine: "",
    difficulty: "קל",
    prep_minutes: 15,
    ingredients: [
      { name: "ביסקוויטים", amount: "חבילה", have: true },
      { name: "קקאו", amount: "3 כפות", have: true },
      { name: "קוקוס טחון", amount: "חצי כוס", have: false },
    ],
    steps: [
      "שוברים את הביסקוויטים לחתיכות קטנות.",
      "ממיסים קקאו עם מעט מים וסוכר ומערבבים לרוטב.",
      "מערבבים הכל, יוצרים כדורים ומקררים שעה.",
    ],
  },
];

// ---- הגדרת המבנה שאנחנו דורשים מ-Gemini ----
const RECIPES_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      dish_type: { type: Type.STRING },
      meal_time: { type: Type.STRING },
      cuisine: { type: Type.STRING },
      difficulty: { type: Type.STRING },
      prep_minutes: { type: Type.INTEGER },
      ingredients: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            amount: { type: Type.STRING },
            have: { type: Type.BOOLEAN },
          },
          required: ["name", "amount", "have"],
        },
      },
      steps: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: [
      "title",
      "dish_type",
      "meal_time",
      "cuisine",
      "difficulty",
      "prep_minutes",
      "ingredients",
      "steps",
    ],
  },
};

// הופך את הפילטרים לשורות הנחיה בעברית לפרומפט.
// רק פילטרים שהוגדרו (לא "לא משנה") נכנסים.
function buildFilterLines(f: Filters): string[] {
  const lines: string[] = [];

  if (f.dishType !== "any") {
    lines.push(`סוג המנה: ${f.dishType}.`);
    if (f.dishType === "ארוחה" && f.mealTime !== "any") {
      lines.push(`זמן ביום: ארוחת ${f.mealTime}.`);
    }
  }
  if (f.difficulty !== "any") {
    lines.push(`רמת קושי: ${f.difficulty}.`);
  }
  if (f.maxMinutes !== "any") {
    lines.push(`זמן הכנה כולל של עד ${f.maxMinutes} דקות.`);
  }
  if (f.complexity === "few") {
    lines.push("מספר שלבי ההכנה: לכל היותר 5.");
  } else if (f.complexity === "medium") {
    lines.push("מספר שלבי ההכנה: בין 6 ל-10.");
  } else if (f.complexity === "many") {
    lines.push("מספר שלבי ההכנה: 11 ומעלה, כל שלב קצר וברור.");
  }
  if (f.cuisine !== "any") {
    lines.push(`מטבח: ${f.cuisine}.`);
  }
  if (f.ingredientsMode === "pantry_only") {
    lines.push(
      "להשתמש רק במצרכים שברשימה שלי ובמצרכי הבסיס שציינתי. אסור להוסיף אף מצרך אחר, גם לא פשוט כמו קמח או סוכר. לכל המצרכים have=true."
    );
  } else {
    lines.push(
      "מותר להוסיף עד 3 מצרכים לכל מתכון שאין לי ברשימה. מצרכים כאלה יסומנו have=false."
    );
  }

  return lines;
}

function isOverloaded(error: any) {
  const msg = error?.message || "";
  return msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand");
}

function isQuotaExceeded(error: any) {
  const msg = error?.message || "";
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota");
}

function parseRecipes(text: string): Recipe[] | null {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(cleaned);
    const list = Array.isArray(data) ? data : data.recipes;
    if (!Array.isArray(list) || list.length === 0) return null;
    return list as Recipe[];
  } catch (e) {
    console.error("JSON.parse נכשל:", e);
    return null;
  }
}

async function tryModel(model: string, prompt: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const config: any = {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: RECIPES_SCHEMA,
      abortSignal: controller.signal,
    };
    if (model.startsWith("gemini-3")) {
      config.thinkingConfig = { thinkingLevel: "low" };
    }
    return await ai.models.generateContent({ model, contents: prompt, config });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  // מחזיר את המכסה אם הפעולה נכשלה בגלל ה-AI. מוגדר אחרי שהמכסה נוצלה.
  let refund: (() => Promise<void>) | null = null;
  try {
    // קודם כל: משתמשת מחוברת. בלי זה לא קוראים אפילו את גוף הבקשה.
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;

    // גודל הבקשה נבדק לפני שקוראים אותה
    const tooBig = checkBodySize(request.headers.get("content-length"), MAX_JSON_BODY_BYTES);
    if (tooBig) return NextResponse.json({ error: tooBig.error }, { status: tooBig.status });

    const body = await request.json();
    // רשימת המזווה מנוקה ומוגבלת (מספר פריטים, אורך שם וכמות)
    const items = sanitizePantryItems(body?.items);
    // בודקים שהפילטרים שהגיעו מהדפדפן באמת מהרשימה המותרת
    const filters = normalizeFilters(body?.filters);
    // מוצרי הבסיס של המשתמשת. נתון לא תקין או חסר: ברירת מחדל. רשימה ריקה היא תקינה.
    const basics = normalizeBasics(body?.basics) ?? DEFAULT_BASICS;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "המזווה ריק, הוסיפי מצרכים כדי לקבל המלצות." },
        { status: 400 }
      );
    }

    // שמות המצרכים האמיתיים במזווה, לבדיקת המתכונים
    const pantryNames: string[] = items.map((i: any) => String(i?.item_name ?? ""));

    if (process.env.USE_MOCK === "true") {
      console.log("USE_MOCK פעיל: מחזיר מתכוני דוגמה. הפילטרים שהתקבלו:", filters);
      // גם מתכוני הדוגמה עוברים את הבדיקה, כדי שאפשר יהיה לראות את האזהרות בלי לצרוך מכסה
      return NextResponse.json({
        recipes: verifyRecipes(MOCK_RECIPES, pantryNames, filters.ingredientsMode, basics),
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY חסר - הפעילי מחדש את npm run dev");
      return NextResponse.json({ error: "חסר מפתח AI בשרת." }, { status: 500 });
    }

    // מכסה יומית: נבדקת רק כשבאמת פונים ל-AI (לא במצב דוגמה)
    const quota = await enforceQuota(auth.supabase, "ai");
    if (!quota.ok) return quota.response;
    refund = () => refundQuota(auth.supabase, quota.reservation);

    const ingredientsList = items
      .map((item: any) => `${item.item_name} (${item.quantity || "ללא כמות מוגדרת"})`)
      .join(", ");

    const filterLines = buildFilterLines(filters)
      .map((line) => `- ${line}`)
      .join("\n");

    const prompt = `יש לי במטבח את המצרכים הבאים: ${ingredientsList}.
${basics.length > 0 ? `אפשר להניח שיש לי רק את מצרכי הבסיס האלה: ${basicsText(basics)}.` : "אל תניח שיש לי שום מצרך נוסף מעבר לרשימה: גם מלח, שמן ומים צריכים להופיע ברשימה כדי להיחשב שיש לי."}
הצע 3 מתכונים יצירתיים ופרקטיים לפי ההגדרות הבאות:
${filterLines}

מבנה כל מתכון:
- dish_type: אחד מהערכים "ארוחה", "נשנוש", "קינוח".
- meal_time: "בוקר", "צהריים" או "ערב" רק אם dish_type הוא "ארוחה". אחרת מחרוזת ריקה.
- cuisine: שם המטבח בעברית, או מחרוזת ריקה אם אין מטבח מסוים.
- difficulty: אחד מהערכים "קל", "בינוני", "מורכב".
- prep_minutes: זמן הכנה כולל בדקות, מספר שלם.
- ingredients: כל המצרכים של המתכון, כל אחד עם have=true אם הוא ברשימה שלי (או מצרך בסיס), אחרת have=false.
- steps: שלבי הכנה קצרים וברורים, כל שלב במחרוזת נפרדת.
כתוב בעברית תקנית ובדוק את האיות.
כל הטקסט חייב להיות בעברית בלבד: בלי מילים בערבית או בכל שפה אחרת (מותר שם מותג באנגלית).`;

    const requestStartedAt = Date.now();
    let sawOverload = false;
    let sawQuota = false;
    let sawWrongLanguage = false;

    for (const model of MODELS) {
      for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
        const startedAt = Date.now();
        try {
          const response = await tryModel(model, prompt);
          console.log(`⏱ ${model}: ענה אחרי ${Date.now() - startedAt}ms`);

          if (response.text) {
            const recipes = parseRecipes(response.text);
            if (recipes && anyRecipeHasForeignScript(recipes)) {
              // החלקה לשפה אחרת באמצע הטקסט: לא מציגים, מנסים שוב
              sawWrongLanguage = true;
              console.error(`${model}: נמצאו תווים בשפה אחרת בתשובה (ניסיון ${attempt}), מנסים שוב`);
              continue;
            }
            if (recipes) {
              console.log(
                `OK: ${model} (ניסיון ${attempt}), ${recipes.length} מתכונים, סה"כ ${Date.now() - requestStartedAt}ms`
              );
              // לא סומכים על ה-have של המודל: בודקים מול המזווה האמיתי
              const checked = verifyRecipes(recipes, pantryNames, filters.ingredientsMode, basics);
              return NextResponse.json({ recipes: checked });
            }
            console.error(`${model}: התשובה לא JSON תקין, עוברים למודל הבא`);
          } else {
            console.error(
              `${model}: תשובה ריקה, finishReason =`,
              response.candidates?.[0]?.finishReason
            );
          }
          break;
        } catch (error: any) {
          const timedOut = error?.name === "AbortError";
          console.log(`⏱ ${model}: נכשל אחרי ${Date.now() - startedAt}ms`);

          if (isQuotaExceeded(error)) {
            sawQuota = true;
            console.error(`${model}: חריגה ממכסה (429), עוברים למודל הבא`);
            break;
          }

          console.error(
            `${model} נכשל (ניסיון ${attempt}):`,
            timedOut ? `timeout אחרי ${ATTEMPT_TIMEOUT_MS / 1000} שניות` : error?.message || error
          );

          if (isOverloaded(error)) {
            sawOverload = true;
            if (attempt < ATTEMPTS_PER_MODEL) {
              await sleep(1500);
              continue;
            }
          } else if (timedOut) {
            sawOverload = true;
          }
          break;
        }
      }
    }

    // מכאן והלאה כל מסלול הוא כשל, ולכן מחזירים את המכסה
    await refund();

    if (sawQuota && !sawOverload) {
      return NextResponse.json(
        { error: "הגענו למכסה היומית החינמית של ה-AI. נסי שוב מחר, או הפעילי חיוב ב-Google AI Studio." },
        { status: 429 }
      );
    }
    if (sawOverload) {
      return NextResponse.json(
        { error: "שרתי ה-AI עמוסים כרגע. נסי שוב בעוד כמה שניות." },
        { status: 503 }
      );
    }
    if (sawWrongLanguage) {
      return NextResponse.json(
        { error: "ה-AI החזיר טקסט עם מילים בשפה אחרת. נסי שוב." },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "לא התקבלה תשובה תקינה מהמודל. בדקי את הטרמינל." },
      { status: 500 }
    );
  } catch (error: any) {
    await refund?.();
    console.error("Route error:", error);
    return NextResponse.json({ error: "שגיאה בשרת. בדקי את הטרמינל." }, { status: 500 });
  }
}