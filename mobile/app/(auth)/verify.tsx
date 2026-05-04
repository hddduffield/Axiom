// Step 2 of mobile auth: paste the 6-digit code from the email.
//
// supabase.auth.verifyOtp({ email, token, type: 'email' }) on success
// persists the session to AsyncStorage and we redirect to /(app).

import { useLocalSearchParams, useRouter } from "expo-router";
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

export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email ?? "").toString();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify() {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      Alert.alert("Invalid code", "The code is 6 digits.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: trimmed,
        type: "email",
      });
      console.log("[verifyOtp] response", { data, error });
      if (error) throw error;
      router.replace("/(app)");
    } catch (e) {
      const msg = (e as Error).message ?? "Could not verify code";
      console.error("[verifyOtp] failed", e);
      Alert.alert("Code didn't work", msg);
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
          <Text style={styles.title}>Enter code</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{"\n"}
            <Text style={styles.email}>{email || "your email"}</Text>
          </Text>

          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            editable={!busy}
            style={styles.codeInput}
          />

          <Pressable
            onPress={verify}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              busy && styles.buttonDisabled,
              pressed && !busy && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>
              {busy ? "Verifying…" : "Verify"}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Use a different email</Text>
          </Pressable>
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
  email: { fontWeight: "600", opacity: 0.9 },
  codeInput: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: "center",
    marginBottom: 20,
    fontVariant: ["tabular-nums"],
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
  backBtn: { marginTop: 18, alignItems: "center" },
  backText: { fontSize: 14, opacity: 0.6 },
});
