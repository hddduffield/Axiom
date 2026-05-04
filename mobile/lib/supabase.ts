// Supabase client for the Axiom mobile app.
//
// Same Supabase project as the web app — same `auth.users`, same
// `advisors` table, same RLS gate. Mobile authenticates via the same
// magic-link / OTP flow but using `verifyOtp({ type: 'email' })` so the
// 6-digit code in the email body works (no in-app browser hop).
//
// Session persistence: AsyncStorage. Without it, the app would force a
// re-auth on every cold start.

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Surface early — without these, every Supabase call would error
  // unhelpfully. The check happens at module-load so the dev sees a
  // clear error in the Expo logs rather than a runtime mystery.
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY missing. " +
      "Copy mobile/.env.example to mobile/.env and fill the values from the web app's .env.local.",
  );
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL detection on native — magic-link callback URLs aren't a
    // thing in the in-app flow; we use the OTP code directly.
    detectSessionInUrl: false,
  },
});
