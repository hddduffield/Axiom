// Compact card for a single note in the recent-notes list.
//
// Renders: client name (small label), body (truncated), relative time +
// author + tag in the meta row.

import { StyleSheet, Text, useColorScheme, View } from "react-native";
import type { NoteWithJoins } from "../lib/types";

const MAX_BODY = 200;

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function NoteCard({ note }: { note: NoteWithJoins }) {
  const dark = useColorScheme() === "dark";
  const palette = dark ? darkPalette : lightPalette;
  const truncated =
    note.body.length > MAX_BODY ? `${note.body.slice(0, MAX_BODY)}…` : note.body;
  const author = note.advisors
    ? `${note.advisors.first_name} ${note.advisors.last_name}`
    : "Unknown";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.cardBg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.client, { color: palette.label }]}>
        {note.clients?.household_name ?? "—"}
      </Text>
      <Text style={[styles.body, { color: palette.body }]}>{truncated}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: palette.meta }]}>
          {relTime(note.created_at)} · {author}
        </Text>
        {note.tag ? (
          <View style={[styles.tag, { backgroundColor: palette.tagBg }]}>
            <Text style={[styles.tagText, { color: palette.tagText }]}>
              {note.tag}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const lightPalette = {
  cardBg: "#ffffff",
  border: "#e5e7eb",
  label: "#0f172a",
  body: "#1f2937",
  meta: "#6b7280",
  tagBg: "#e5e7eb",
  tagText: "#374151",
};

const darkPalette = {
  cardBg: "#18181b",
  border: "#27272a",
  label: "#f4f4f5",
  body: "#e4e4e7",
  meta: "#a1a1aa",
  tagBg: "#27272a",
  tagText: "#d4d4d8",
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  client: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 21 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  meta: { fontSize: 12 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tagText: { fontSize: 11, fontWeight: "600" },
});
