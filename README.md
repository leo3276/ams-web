# AMS Web — Bookkeeping companion site

A Next.js web app that shares the exact same Supabase backend as the mobile app. Same accounts, same data — this is just a second front door onto the same database, built for fast desk-based bookkeeping instead of on-the-go mobile capture.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Open `lib/supabase.ts` and paste in the **same** Project URL and anon key you used in the mobile app's `src/lib/supabase.ts`. This is what makes login and data shared between both apps.
3. Run it locally:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000 — it'll redirect you to `/login`.

Log in with an account you already created in the mobile app — it'll work here too, since it's the same Supabase project. If the account doesn't have a business set up yet, you'll land on `/business-profile` first, same as the mobile onboarding.

## What's here

- `/login`, `/signup`, `/business-profile` — same auth flow as the mobile app
- `/bookkeeping` — the spreadsheet-style entry page. Fill in vendor + amount on a row and it saves automatically (no "save" button — it saves the moment you click away from a completed row, or the moment you change the Type dropdown)
- `/reports` — pulls the same `get_pnl_report` Postgres function the mobile Reports tab uses. One calculation, shared by both apps.
- `/dashboard` — placeholder, not built yet

## How the spreadsheet page works

Each row represents one transaction. There's always one empty row at the top ready for new entry. Once you type a vendor name and an amount greater than 0, the row saves to Supabase automatically when you click away (or immediately when you change the category dropdown). A fresh empty row appears above it so you can keep entering the next one without touching the mouse much — designed for rapid, spreadsheet-style batch entry of a full day's transactions at once.

Existing transactions (including ones scanned via the mobile app's OCR) load in below the empty row, editable in place. Delete a row with the ✕ button on the right.

## What's not built yet

- `/dashboard` is a placeholder
- No file upload / receipt attachment on this page (that's the mobile app's job via OCR) — this page is for typed entry
- No column sorting/filtering yet on the bookkeeping table
- Balance Sheet and Cash Flow aren't on `/reports` yet — same as mobile, they follow the same SQL-function pattern once you're ready to build them
