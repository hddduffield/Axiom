// New-note modal — pick a client, write the body, optionally tag, save.
//
// Loads the client list once on mount via listClients(). The picker is
// a horizontal scroll of pill-buttons (works in Expo Go without native
// pickers; Phase 9 can promote to a proper @react-native-picker if
// the client count grows past ~20).

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createNote, listClients } from "../../lib/api";
import type { Client } from "../../lib/types";

const TAG_OPTIONS = ["call", "email", "meeting", "review"];

export default function NewNoteScreen() {
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const [clients, setClients] = useState<Client[] | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch((e) => Alert.alert("Couldn't load clients", (e as Error).message));
  }, []);

  async function save() {
    if (!clientId) {
      Alert.alert("Pick a client", "Tap a client name first.");
      return;
    }
    if (body.trim().length === 0) {
      Alert.alert("Empty note", "Write something before saving.");
      return;
    }
    setBusy(true);
    try {
      await createNote({ client_id: clientId, body: body.trim(), tag });
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const palette = dark ? darkPalette : lightPalette;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.background }]}
      edges={["bottom"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.label, { color: palette.label }]}>Client</Text>
          {clients === null ? (
            <ActivityIndicator />
          ) : clients.length === 0 ? (
            <Text style={{ color: palette.meta }}>
              No active clients. Add one in the web app.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {clients.map((c) => {
                const selected = c.id === clientId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setClientId(c.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? palette.chipSelectedBg : palette.chipBg,
                        borderColor: selected ? palette.chipSelectedBg : palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected ? palette.chipSelectedText : palette.body,
                        fontWeight: selected ? "600" : "400",
                      }}
                    >
                      {c.household_name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Text style={[styles.label, { color: palette.label, marginTop: 24 }]}>
            Note
          </Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What did you learn or do?"
            placeholderTextColor={palette.meta}
            multiline
            editable={!busy}
            style={[
              styles.bodyInput,
              {
                backgroundColor: palette.cardBg,
                borderColor: palette.border,
                color: palette.body,
              },
            ]}
          />

          <Text style={[styles.label, { color: palette.label, marginTop: 24 }]}>
            Tag (optional)
          </Text>
          <View style={styles.chipRow}>
            {TAG_OPTIONS.map((t) => {
              const selected = t === tag;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTag(selected ? null : t)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? palette.chipSelectedBg : palette.chipBg,
                      borderColor: selected ? palette.chipSelectedBg : palette.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? palette.chipSelectedText : palette.body,
                      fontWeight: selected ? "600" : "400",
                    }}
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: palette.border }]}>
          <Pressable
            onPress={() => router.back()}
            disabled={busy}
            style={({ pressed }) => [
              styles.footerBtn,
              styles.footerCancel,
              { borderColor: palette.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={{ color: palette.body, fontWeight: "500" }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={busy}
            style={({ pressed }) => [
              styles.footerBtn,
              styles.footerSave,
              { backgroundColor: palette.primary },
              busy && { opacity: 0.5 },
              pressed && !busy && { opacity: 0.85 },
            ]}
          >
            <Text style={{ color: palette.primaryText, fontWeight: "600" }}>
              {busy ? "Saving…" : "Save note"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const lightPalette = {
  background: "#f4f4f5",
  cardBg: "#ffffff",
  border: "#e5e7eb",
  label: "#6b7280",
  body: "#0f172a",
  meta: "#9ca3af",
  chipBg: "#ffffff",
  chipSelectedBg: "#0f172a",
  chipSelectedText: "#ffffff",
  primary: "#0f172a",
  primaryText: "#ffffff",
};

const darkPalette = {
  background: "#000000",
  cardBg: "#18181b",
  border: "#27272a",
  label: "#a1a1aa",
  body: "#f4f4f5",
  meta: "#71717a",
  chipBg: "#18181b",
  chipSelectedBg: "#f4f4f5",
  chipSelectedText: "#0f172a",
  primary: "#f4f4f5",
  primaryText: "#0f172a",
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  bodyInput: {
    minHeight: 160,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  footerCancel: { borderWidth: 1 },
  footerSave: {},
});
