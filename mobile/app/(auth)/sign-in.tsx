// Step 1 of mobile auth: enter email, request a 6-digit code.
//
// Uses signInWithOtp({ email, options: { shouldCreateUser: false } }) so
// only existing PSA Wealth advisors (already in auth.users via Dashboard
// invite) can request codes. Random emails get a Supabase 422 — surfaced
// as "Email not on the advisor list".

import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      // No `emailRedirectTo` — its presence is what flips Supabase from
      // OTP-code mode to magic-link mode. Omitting it requests the
      // 6-digit code (the project's "Magic Link" email template must
      // render {{ .Token }} for the code to actually appear in the
      // email body — see the Supabase Dashboard auth templates).
      const { data, error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: false },
      });
      // Visible in `npx expo start` logs — useful when diagnosing
      // "no email arrived" vs "email arrived but with the wrong content"
      // vs "Supabase returned an error":
      console.log("[signInWithOtp] response", { data, error });
      if (error) throw error;
      router.push({ pathname: "/(auth)/verify", params: { email: trimmed } });
    } catch (e) {
      const msg = (e as Error).message ?? "Could not send code";
      console.error("[signInWithOtp] failed", e);
      Alert.alert("Couldn't send code", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.body}>
          <Text style={styles.title}>Axiom Notes</Text>
          <Text style={styles.subtitle}>
            Sign in with your PSA Wealth email.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@psawealth.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
          />

          <Pressable
            onPress={send}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              busy && styles.buttonDisabled,
              pressed && !busy && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>
              {busy ? "Sending…" : "Send code"}
            </Text>
          </Pressable>

          <Text style={styles.hint}>
            We&apos;ll email you a 6-digit code. Codes expire after a few minutes.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 6 },
  subtitle: { fontSize: 15, opacity: 0.6, marginBottom: 32 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, opacity: 0.7 },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  hint: { fontSize: 12, opacity: 0.5, marginTop: 16, textAlign: "center" },
});
