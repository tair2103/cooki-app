// קריאה ל-Gemini שמחזירה JSON, עם אותה שרשרת מודלים וטיפול בתקלות כמו ביצירת מתכונים.
// תומכת גם בטקסט וגם בסרטון (קובץ שהועלה או קישור ליוטיוב).
// קוד לשרת בלבד (משתמש במפתח ה-API). משמש כרגע את ייבוא המתכונים.
import { GoogleGenAI } from "@google/genai";

// לפי סדר עדיפות. המכסה נספרת לכל מודל בנפרד, אז אם אחד נגמר עוברים לבא.
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];
const DEFAULT_TIMEOUT_MS = 25000; // ייבוא מקבל טקסט ארוך, אז קצת יותר זמן מיצירת מתכונים

// חלקי הבקשה: טקסט, או סרטון (fileUri של קובץ שהועלה, או קישור ליוטיוב)
export type Part = { text: string } | { fileData: { fileUri: string; mimeType?: string } };

export type GeminiJsonResult =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: "no_key" | "quota" | "overload" | "failed" };

const msgOf = (e: any) => String(e?.message || "");
const isOverloaded = (e: any) => /503|UNAVAILABLE|high demand/.test(msgOf(e));
const isQuota = (e: any) => /429|RESOURCE_EXHAUSTED|quota/.test(msgOf(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Options = {
  timeoutMs?: number; // זמן לכל מודל
  deadlineMs?: number; // סך הזמן לכל המודלים יחד: אחריו לא מנסים מודל נוסף
};

export async function generateJsonText(
  input: string | Part[],
  schema: unknown,
  options: Options = {}
): Promise<GeminiJsonResult> {
  if (!process.env.GEMINI_API_KEY) return { ok: false, reason: "no_key" };
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = typeof input === "string" ? input : [{ role: "user", parts: input }];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + (options.deadlineMs ?? Number.POSITIVE_INFINITY);

  let sawQuota = false;
  let sawOverload = false;

  for (const model of MODELS) {
    if (Date.now() > deadline) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
      const config: any = {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: schema,
        abortSignal: controller.signal,
      };
      if (model.startsWith("gemini-3")) config.thinkingConfig = { thinkingLevel: "low" };

      const response = await ai.models.generateContent({ model, contents, config });
      console.log(`⏱ ${model}: ענה אחרי ${Date.now() - startedAt}ms`);
      if (response.text) return { ok: true, text: response.text, model };
      console.error(`${model}: תשובה ריקה, finishReason =`, response.candidates?.[0]?.finishReason);
    } catch (error: any) {
      const timedOut = error?.name === "AbortError";
      console.log(`⏱ ${model}: נכשל אחרי ${Date.now() - startedAt}ms`);
      if (isQuota(error)) {
        sawQuota = true;
        console.error(`${model}: חריגה ממכסה (429), עוברים למודל הבא`);
      } else {
        console.error(`${model} נכשל:`, timedOut ? `timeout אחרי ${timeoutMs / 1000} שניות` : msgOf(error) || error);
        if (isOverloaded(error) || timedOut) sawOverload = true;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (sawQuota && !sawOverload) return { ok: false, reason: "quota" };
  if (sawOverload) return { ok: false, reason: "overload" };
  return { ok: false, reason: "failed" };
}

// ---- העלאת קובץ סרטון ל-Gemini (Files API) ----
// הקובץ נשמר אצל Google זמן קצר, ואנחנו מוחקים אותו מיד אחרי השימוש (deleteUploadedFile).
const UPLOAD_PROCESS_TIMEOUT_MS = 90000;

export async function uploadVideo(file: Blob, mimeType: string): Promise<{ part: Part; name: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let uploaded = await ai.files.upload({ file, config: { mimeType } });
  const name = uploaded.name as string;

  // Google צריכה זמן לעבד את הסרטון לפני שאפשר להשתמש בו
  const startedAt = Date.now();
  while (uploaded.state === "PROCESSING") {
    if (Date.now() - startedAt > UPLOAD_PROCESS_TIMEOUT_MS) {
      await deleteUploadedFile(name);
      throw new Error("עיבוד הסרטון לקח יותר מדי זמן");
    }
    await sleep(2000);
    uploaded = await ai.files.get({ name });
  }
  if (uploaded.state === "FAILED" || !uploaded.uri) {
    await deleteUploadedFile(name);
    throw new Error("Google לא הצליחה לעבד את הסרטון");
  }
  return { part: { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType || mimeType } }, name };
}

export async function deleteUploadedFile(name: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    await ai.files.delete({ name });
  } catch (e) {
    // לא קריטי: הקובץ נמחק ממילא אוטומטית אחרי זמן קצר
    console.error("מחיקת הקובץ שהועלה נכשלה:", msgOf(e));
  }
}