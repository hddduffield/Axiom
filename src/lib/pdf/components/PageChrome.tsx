// Recurring page header + footer for plan and lens-run PDFs.
//
// React-PDF's `fixed` prop causes a View to render once per page. Page
// number is rendered via the `render` prop on Text, which receives the
// pageNumber + totalPages from the renderer.

import { Text, View } from "@react-pdf/renderer";
import { COLORS, SPACE, styles } from "../styles";

interface PageHeaderProps {
  leftLabel: string;
  rightLabel: string;
}

export function PageHeader({ leftLabel, rightLabel }: PageHeaderProps) {
  return (
    <View fixed style={styles.pageHeader}>
      <Text>{leftLabel}</Text>
      <Text>{rightLabel}</Text>
    </View>
  );
}

interface PageFooterProps {
  firmName: string;
  planId: string;
  complianceTrackingId: string;
  // One-line disclaimer rendered under the meta row. Keep concise.
  shortDisclosure: string;
}

export function PageFooter({
  firmName,
  planId,
  complianceTrackingId,
  shortDisclosure,
}: PageFooterProps) {
  // v1: no per-page numbering. @react-pdf/renderer 4.5.1 fails with
  // "unsupported number: -8.987253937891275e+21" in clipBorderTop when
  // any `<Text render={({ pageNumber, ... }) => ...}>` callback is paired
  // with a multi-page body — and Holloway-scale plans are always
  // multi-page. Page numbers are tracked as v1.5 polish; see
  // specs/v1_5_backlog.md.
  return (
    <View fixed style={styles.pageFooter}>
      <Text>
        {firmName} | Confidential | Compliance ID: {complianceTrackingId}
      </Text>
      <Text style={styles.pageFooterDisclosure}>
        Plan ID {planId.slice(0, 8)}… · {shortDisclosure}
      </Text>
    </View>
  );
}

// Title-page chrome — minimal header/footer presence on the cover.
interface TitlePageFooterProps {
  firmName: string;
  complianceTrackingId: string;
}

export function TitlePageFooter({
  firmName,
  complianceTrackingId,
}: TitlePageFooterProps) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 24,
        left: SPACE.pageHorizontal,
        right: SPACE.pageHorizontal,
        flexDirection: "row",
        justifyContent: "space-between",
        fontSize: 8,
        color: COLORS.footer,
      }}
    >
      <Text>{firmName} | Confidential</Text>
      <Text>Compliance ID: {complianceTrackingId}</Text>
    </View>
  );
}
