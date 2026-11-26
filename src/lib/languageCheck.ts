// ה-AI לפעמים "מחליק" למילה בשפה אחרת (למשל ערבית) באמצע משפט בעברית.
// הקוד בודק את התשובה: כתב שאינו עברית, אנגלית (לשמות מותגים) או סימנים נפסל.

// ערבית, קירילית, סינית/יפנית/קוריאנית, תאית, דוואנגרית, ארמנית, גאורגית.
const FOREIGN_SCRIPT =
  /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿Ѐ-ԯ԰-֏Ⴀ-ჿऀ-ॿ฀-๿぀-ヿ㐀-䶿一-鿿가-힯]/;

export function hasForeignScript(text: string): boolean {
  return FOREIGN_SCRIPT.test(text);
}

type TextRecipe = {
  title?: unknown;
  cuisine?: unknown;
  ingredients?: unknown;
  steps?: unknown;
};

// בודק את כל הטקסטים של מתכון אחד.
export function recipeHasForeignScript(recipe: TextRecipe): boolean {
  const texts: string[] = [];
  if (typeof recipe.title === "string") texts.push(recipe.title);
  if (typeof recipe.cuisine === "string") texts.push(recipe.cuisine);
  if (Array.isArray(recipe.ingredients)) {
    for (const ing of recipe.ingredients) {
      if (ing && typeof ing === "object") {
        const { name, amount } = ing as { name?: unknown; amount?: unknown };
        if (typeof name === "string") texts.push(name);
        if (typeof amount === "string") texts.push(amount);
      }
    }
  }
  if (Array.isArray(recipe.steps)) {
    for (const step of recipe.steps) if (typeof step === "string") texts.push(step);
  }
  return texts.some(hasForeignScript);
}

export function anyRecipeHasForeignScript(recipes: TextRecipe[]): boolean {
  return recipes.some(recipeHasForeignScript);
}