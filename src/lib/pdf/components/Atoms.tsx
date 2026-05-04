// Small leaf components shared across PlanDocument and LensRunDocument.
//
// Each one wraps a tiny <View>/<Text> pattern with a meaningful name so
// the document files read top-to-bottom like a layout outline.

import { Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function H3({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h3}>{children}</Text>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// Paragraph honors line breaks: long prose blocks render with proper
// spacing between paragraphs without callers having to wrap each one.
export function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

// Bullet glyph + body row. Optionally accepts a bold imperative prefix
// to render the Stage 4 "**Bold imperative.** Briefing." pattern without
// markdown parsing.
interface BulletProps {
  bold?: string;        // bold imperative prefix
  children: React.ReactNode;
  partnerRole?: string | null;
}

export function Bullet({ bold, children, partnerRole }: BulletProps) {
  return (
    <View wrap={false} style={styles.bulletRow}>
      <Text style={styles.bulletGlyph}>•</Text>
      <View style={styles.bulletBody}>
        <Text>
          {bold ? <Text style={styles.bulletBold}>{bold} </Text> : null}
          {children}
        </Text>
        {partnerRole ? (
          <Text style={styles.partnerRoleLine}>Partner: {partnerRole}</Text>
        ) : null}
      </View>
    </View>
  );
}
