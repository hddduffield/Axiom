# Axiom Notes (Mobile)

iOS notes-only companion to the Axiom web app. v1 distribution is via
**Expo Go** — no Apple Developer account required.

## What this app does

- Sign in with the same PSA Wealth email as the web app (6-digit code,
  no password).
- See the most recent 30 notes across all clients.
- Write a new note: pick client, type, optionally tag (call / email /
  meeting / review), save.
- That's it. Action items, plans, lens runs, partners — all web-only.

Same Supabase project as the web app. Notes written here appear in the
web Notes Hub immediately (single source of truth).

## First-time setup

```bash
cd mobile
npm install
cp .env.example .env
# Edit .env and paste the same NEXT_PUBLIC_SUPABASE_URL +
# NEXT_PUBLIC_SUPABASE_ANON_KEY values that the web app uses
# (in the parent .env.local), but with the EXPO_PUBLIC_ prefix.
npx expo start
```

Expo opens a dev server in your terminal and prints a QR code.

## Connecting your iPhone

1. Install **Expo Go** from the App Store (free).
2. Open Expo Go.
3. Tap **Scan QR Code** and point at the QR in your terminal.
4. The app loads on your phone.

The phone needs to be on the same Wi-Fi as your Mac.

## Auth flow

Mobile uses **OTP** (one-time password): you enter your email, Supabase
sends a 6-digit code, you paste the code into the verify screen, you're
in. Sessions persist via AsyncStorage so cold starts don't force a
re-auth.

Only emails already invited as PSA Wealth advisors (web Dashboard →
Auth → Users) can sign in. Random emails get a polite error.

## Architecture

- **expo-router** — file-based routing. See `app/`.
  - `app/index.tsx` — root redirect (signed-in → app, else → auth)
  - `app/(auth)/sign-in.tsx`, `verify.tsx` — email + code
  - `app/(app)/_layout.tsx` — auth gate + protected stack
  - `app/(app)/index.tsx` — recent notes list
  - `app/(app)/new-note.tsx` — modal to write a note
- **Supabase JS** with AsyncStorage adapter — see `lib/supabase.ts`.
- **Direct table reads/writes** — mobile doesn't go through the web app's
  /api routes; it talks to Supabase directly. The same `is_active_advisor()`
  RLS policy gates everything.
- **Inline types** at `lib/types.ts` — minimal subset of the web's
  `database.types.ts`. Update by hand when the schema changes.

## v1 deferrals

These are intentionally out of scope:
- Action item viewing or editing
- Client detail / plan viewing
- Plan generation
- Push notifications
- TestFlight distribution (Apple Developer enrollment is v1.5)
- Offline-first / queueing notes when offline

## Troubleshooting

- **"Network request failed" on sign-in:** check your Mac and phone are
  on the same Wi-Fi. Expo Go talks to your Mac's dev server.
- **"Email not on the advisor list":** that email isn't invited in
  Supabase. Hayden invites via Dashboard → Auth → Users.
- **Code didn't work:** codes expire after a few minutes. Tap
  "Use a different email" then re-enter to get a new code.
