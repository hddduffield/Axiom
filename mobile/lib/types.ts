// Inline minimal types for the mobile app.
//
// We intentionally do NOT share the web's `src/lib/api/types.ts` —
// importing across the project boundary would couple Expo's bundler to
// Next's tsconfig + paths, and the mobile surface is small enough that
// drift is manageable. Keep these in sync with the web schema by hand;
// when they drift, it's a small focused diff.

export interface Advisor {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  active: boolean;
}

export interface Client {
  id: string;
  household_name: string;
  status: "active" | "inactive" | "prospect";
}

export interface Note {
  id: string;
  client_id: string;
  author_advisor_id: string;
  body: string;
  tag: string | null;
  promoted_to_action_item_id: string | null;
  created_at: string;
}

// Joined shape used by the recent-notes list — Supabase returns the
// nested client / advisor as either an object or null.
export interface NoteWithJoins extends Note {
  clients: { household_name: string } | null;
  advisors: { first_name: string; last_name: string } | null;
}

export interface NewNoteInput {
  client_id: string;
  body: string;
  tag: string | null;
}
