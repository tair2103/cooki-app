# cooki

A pantry, recipe and shopping-list app with AI features. The interface is in Hebrew (right-to-left).
Built as a portfolio project (not a commercial product).

Live demo: https://cooki-app-mu.vercel.app (registration is invite-only)

## What it does

- **Pantry**: track what you have at home, by category and location, with quantities.
- **AI recipes**: suggests recipes from what is in the pantry, with filters, and shows what is missing.
- **Recipe book**: save recipes, organize them in folders.
- **Import recipes** from a web page link, pasted text, or a YouTube link / pasted video description. The imported recipe is shown as an editable preview and saved only after confirmation.
- **Shopping list**: add missing ingredients from a recipe, check items off, check a whole category, finish shopping (moves bought items to the pantry).
- **Shared spaces**: share a pantry, shopping list and recipe book with other people (for example a partner or a family dinner). Invites are by email, with manager and member roles, and content can be copied between the personal space and shared spaces.
- **Accounts**: invite-only sign-up, "stay signed in" option, self-service account deletion.

## Tech stack

- Next.js (App Router), TypeScript, Tailwind CSS
- Supabase: Postgres, Auth and Row Level Security
- Google Gemini through `@google/genai`
- Hosting: Vercel (Hobby plan)

## Security and limits (short version)

- Row Level Security on every table. Shared-space management goes only through `security definer` functions.
- All AI routes require sign-in and enforce per-user and global daily quotas.
- The Gemini key is used on the server only. Security headers and a Content Security Policy are set in `next.config.ts` (CSP in production builds).
- Input limits are enforced both in the UI (`maxLength`) and in the database (CHECK constraints and per-user / per-space row limits).
- Sign-up is limited to emails listed in the `allowed_emails` table.

## Project structure

```
src/
  app/          pages and API routes (page.tsx, route.ts)
  components/   shared UI components (PascalCase file names)
  lib/          shared logic (camelCase file names)
```

File naming: components use PascalCase because each one is a React component used as a tag. Logic files in `lib` use camelCase. Special Next.js files (`page.tsx`, `layout.tsx`, `route.ts`) must stay lowercase.

## Running locally

1. Install dependencies:

   ```
   npm install
   ```

2. Create a Supabase project. In the SQL Editor, run the numbered SQL files in order (`01` and up, through `20_drop_user_fks.sql`). Add the emails that may register to the `allowed_emails` table.

3. Copy `.env.example` to `.env.local` and fill in the values (names only are listed in the example file):

   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   GEMINI_API_KEY
   ```

   `USE_MOCK=true` makes the recipes route return fixed sample recipes without calling Gemini. Leave it unset for real behavior.

4. Start the dev server:

   ```
   npm run dev
   ```

   To check the production build (including the CSP):

   ```
   npm run build
   npm start
   ```

## Deployment

The app is deployed on Vercel. Set the three environment variables above in the Vercel project settings. In Supabase, set the Site URL and Redirect URLs (Authentication, URL Configuration) to the deployed address. Every push to `main` deploys automatically.

## Branches

- `main`: the deployed version. Video import works from a link or a pasted description only, because the free hosting plan limits request size to 4.5 MB.
- `video-upload`: the same app with direct video file upload. It is not merged into `main`; it is kept to show the option. Changes that do not touch the import feature are copied to it manually.

## Notes

- This project is a draft in terms of legal text: the terms of use and privacy policy are marked as a draft and were not reviewed by a lawyer.
- Do not commit `.env.local`. It is listed in `.gitignore`.
