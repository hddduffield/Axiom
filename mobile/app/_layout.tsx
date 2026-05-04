// Root layout for the Axiom mobile app.
//
// expo-router pattern: this <Stack> hosts the two route groups:
//   (auth)/* — sign-in + verify
//   (app)/*  — protected screens (notes list, new note)
//
// Auth gating: each group's _layout decides whether to redirect based on
// session state (see (app)/_layout.tsx). Putting the gate at the group
// level rather than the root keeps the deep-link handling clean.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
