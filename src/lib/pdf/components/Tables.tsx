// Reusable table primitive + the specific table renderers each Stage 4
// section needs (Top Priorities, Implementation Roadmap, Decisions
// Needed, Advisory Team, Meeting Cadence, Glossary).

import { Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

export interface TableColumn<T> {
  header: string;
  // Width as a percentage string ("40%") OR a fixed pt number.
  width: string | number;
  cell: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  zebra?: boolean;
}

export function Table<T>({ columns, rows, zebra = true }: TableProps<T>) {
  const widths = columns.map((c) =>
    typeof c.width === "number" ? { width: c.width } : { width: c.width },
  );
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow} fixed>
        {columns.map((c, i) => (
          <View key={`h-${i}`} style={[widths[i]]}>
            <Text style={styles.tableHeaderCell}>{c.header}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View
          key={`r-${ri}`}
          wrap={false}
          style={zebra && ri % 2 === 1 ? styles.tableRowAlt : styles.tableRow}
        >
          {columns.map((c, ci) => (
            <View key={`c-${ri}-${ci}`} style={[widths[ci]]}>
              <Text style={styles.tableCell}>{c.cell(row)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Roadmap bucket band — visual divider between timing-bucket groups in
// the Implementation Roadmap. Used between table renderings.
// ────────────────────────────────────────────────────────────────────────

export function GroupBand({ label }: { label: string }) {
  return (
    <View wrap={false} style={styles.groupBand}>
      <Text>{label}</Text>
    </View>
  );
}
