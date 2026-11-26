// כאן מגדירים איך נראה "מתכון" בכל האפליקציה.

export type Ingredient = {
  name: string;   // שם המצרך
  amount: string; // כמות, כטקסט (למשל "4" או "1 כפית")
  have: boolean;  // true = המצרך כבר במזווה, false = חסר וצריך לקנות
};

export type Recipe = {
  title: string;         // שם המנה
  dish_type: string;     // ארוחה / נשנוש / קינוח
  meal_time: string;     // בוקר / צהריים / ערב (רק לארוחה, אחרת ריק)
  cuisine: string;       // מטבח, למשל איטלקי
  difficulty: string;    // קל / בינוני / מורכב
  prep_minutes: number;  // זמן הכנה בדקות
  ingredients: Ingredient[];
  steps: string[];       // שלבי ההכנה. מספר השלבים הוא "המורכבות"
  warnings?: string[];   // אזהרות מהבדיקה מול המזווה (לא נשמר ב-DB)
};