// Notes list — recent 30 across all clients, pull-to-refresh, FAB to
// open the new-note modal. Sign-out lives in the header.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { listRecentNotes } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import type { NoteWithJoins } from "../../lib/types";
import { NoteCard } from "../../components/NoteCard";

export default function NotesListScreen() {
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const [notes, setNotes] = useState<NoteWithJoins[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await listRecentNotes(30);
      setNotes(rows);
    } catch (e) {
      setError((e as Error).message);
      setNotes([]);
    }
  }, []);

  // Reload every time the screen regains focus (after returning from
  // /new-note, this picks up the freshly-saved row).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function signOut() {
    Alert.alert("Sign out?", "You'll need to enter a new code to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          // (app)/_layout will detect the missing session and bounce.
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { backgroundColor: dark ? "#000" : "#f4f4f5" }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: dark ? "#fff" : "#0f172a" }]}>
          Recent notes
        </Text>
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={[styles.signOut, { color: dark ? "#a1a1aa" : "#6b7280" }]}>
            Sign out
          </Text>
        </Pressable>
      </View>

      {notes === null ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: "#dc2626", textAlign: "center" }}>{error}</Text>
        </View>
      ) : notes.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: dark ? "#a1a1aa" : "#6b7280", textAlign: "center" }}>
            No notes yet. Tap the + button below to write one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NoteCard note={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      <Pressable
        onPress={() => router.push("/(app)/new-note")}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: dark ? "#fff" : "#0f172a" },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={[styles.fabPlus, { color: dark ? "#0f172a" : "#fff" }]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "600" },
  signOut: { fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingBottom: 80 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  fabPlus: { fontSize: 28, fontWeight: "300", lineHeight: 28 },
});
