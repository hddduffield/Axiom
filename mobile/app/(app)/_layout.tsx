// Protected route group. Auth gate runs in useEffect — checks session
// state, redirects to /sign-in if missing or if the signed-in user
// isn't an active advisor (defensive: web's proxy.ts enforces this for
// /api/* but mobile reads Supabase directly, so the check is local).

import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { getCurrentAdvisor } from "../../lib/api";

export default function AppLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const advisor = await getCurrentAdvisor().catch(() => null);
      if (cancelled) return;
      if (!advisor || !advisor.active) {
        await supabase.auth.signOut();
        router.replace("/(auth)/sign-in");
        return;
      }
      setReady(true);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Re-check on auth state change (sign-out from another screen).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/(auth)/sign-in");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Notes" }} />
      <Stack.Screen
        name="new-note"
        options={{ title: "New note", presentation: "modal" }}
      />
    </Stack>
  );
}
