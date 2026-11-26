// src/app/api/categorize/route.ts
// מסווג מצרכים שהמילון לא הכיר, בעזרת Gemini.
// מחזיר תמיד 200: כשל כאן לא אמור לעצור הוספה לרשימת הקניות.
import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { authenticate, enforceQuota, refundQuota } from "@/lib/serverAuth";
import { checkBodySize } from "@/lib/inputLimits";
import { CATEGORY_NAMES, OTHER } from "@/lib/categories";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// מודל קטן וזול קודם: סיווג מצרך לא דורש מודל חזק, וכך שומרים מכסה לג'נרוט מתכונים
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"];
const ATTEMPT_TIMEOUT_MS = 12000;
const MAX_NAMES = 30;

const SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      category: { type: Type.STRING, enum: CATEGORY_NAMES },
    },
    required: ["name", "category"],
  },
};

async function tryModel(model: string, prompt: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const config: any = {
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
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
  let refund: (() => Promise<void>) | null = null; // מחזיר מכסה אם הסיווג נכשל בגלל ה-AI
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;

    const tooBig = checkBodySize(request.headers.get("content-length"), 20_000);
    if (tooBig) return NextResponse.json({ error: tooBig.error }, { status: tooBig.status });

    const body = await request.json();

    // אימות: רק מערך של מחרוזות קצרות, ומספר מוגבל
    const names: string[] = Array.isArray(body?.names)
      ? body.names
          .filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 0)
          .map((n: string) => n.trim().slice(0, 60))
          .slice(0, MAX_NAMES)
      : [];

    if (names.length === 0) return NextResponse.json({ categories: {} });

    if (process.env.USE_MOCK === "true") {
      console.log("USE_MOCK פעיל: מדלגים על סיווג AI עבור", names);
      return NextResponse.json({ categories: {} });
    }
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY חסר");
      return NextResponse.json({ categories: {} });
    }

    const quota = await enforceQuota(auth.supabase, "categorize");
    if (!quota.ok) return quota.response;
    refund = () => refundQuota(auth.supabase, quota.reservation);

    const prompt = `סווג כל אחד מהמצרכים הבאים לקטגוריה של מדף בסופרמרקט.
הקטגוריות המותרות: ${CATEGORY_NAMES.join(", ")}.
אם אינך בטוח לגבי מצרך, השתמש בקטגוריה "${OTHER}".
החזר רשימה עם שם המצרך כפי שנשלח, בדיוק, ואת הקטגוריה.
המצרכים:
${names.map((n) => `- ${n}`).join("\n")}`;

    for (const model of MODELS) {
      try {
        const response = await tryModel(model, prompt);
        if (!response.text) continue;

        const list = JSON.parse(response.text.replace(/```json|```/g, "").trim());
        if (!Array.isArray(list)) continue;

        const categories: Record<string, string> = {};
        list.forEach((row: any, i: number) => {
          // התאמה לפי שם. אם המודל שינה את השם והאורך זהה, לפי המקום ברשימה.
          const name =
            names.includes(row?.name) ? row.name : list.length === names.length ? names[i] : null;
          if (name && CATEGORY_NAMES.includes(row?.category)) categories[name] = row.category;
        });

        console.log(`סיווג AI (${model}):`, categories);
        return NextResponse.json({ categories });
      } catch (error: any) {
        console.error(`${model} סיווג נכשל:`, error?.message || error);
      }
    }

    await refund(); // כל המודלים נכשלו
    return NextResponse.json({ categories: {} });
  } catch (error: any) {
    await refund?.();
    console.error("categorize route error:", error);
    return NextResponse.json({ categories: {} });
  }
}