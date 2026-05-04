// React-PDF style tokens for plan + lens-run exports.
//
// v1 visual fidelity: professional, not premium. Helvetica family (built
// into PDFKit, no font registration needed). Restrained color palette —
// dark navy for headers, near-black body, gray for metadata.

import { StyleSheet } from "@react-pdf/renderer";

export const COLORS = {
  body: "#1a1a1a",
  header: "#1a3a5f",       // dark navy for section headers
  subheader: "#33567a",    // mid navy for subsections
  metaLabel: "#666666",
  metaValue: "#333333",
  footer: "#888888",
  rule: "#cccccc",          // hairline rule color
  tableHeader: "#1a3a5f",
  tableHeaderText: "#ffffff",
  tableRowAlt: "#f5f7fa",
} as const;

export const FONT = {
  family: "Helvetica",
  familyBold: "Helvetica-Bold",
  familyItalic: "Helvetica-Oblique",
  familyMono: "Courier",
} as const;

// Sizes are in PDF points (1pt = 1/72in).
export const SIZE = {
  body: 10.5,
  bodySmall: 9.5,
  h1: 16,
  h2: 13,
  h3: 11.5,
  bullet: 10.5,
  meta: 9,
  footer: 8,
  pageNum: 8,
} as const;

export const LINE = {
  body: 1.45,
  header: 1.2,
} as const;

export const SPACE = {
  pageTop: 54,        // 0.75in
  pageBottom: 60,     // 0.83in (extra room for footer)
  pageHorizontal: 72, // 1in
  beforeH1: 18,
  afterH1: 8,
  beforeH2: 14,
  afterH2: 6,
  beforeH3: 10,
  afterH3: 4,
  paragraph: 6,
  bullet: 5,
  cellPadX: 6,
  cellPadY: 4,
} as const;

export const styles = StyleSheet.create({
  page: {
    paddingTop: SPACE.pageTop,
    paddingBottom: SPACE.pageBottom,
    paddingLeft: SPACE.pageHorizontal,
    paddingRight: SPACE.pageHorizontal,
    fontFamily: FONT.family,
    fontSize: SIZE.body,
    color: COLORS.body,
    lineHeight: LINE.body,
  },

  // Title page (cover)
  titlePageWrapper: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  titleFirm: {
    fontFamily: FONT.familyBold,
    fontSize: 11,
    color: COLORS.header,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  titleHeading: {
    fontFamily: FONT.familyBold,
    fontSize: 28,
    color: COLORS.header,
    lineHeight: 1.15,
    marginBottom: 6,
  },
  titleSubheading: {
    fontFamily: FONT.family,
    fontSize: 14,
    color: COLORS.metaValue,
    marginBottom: 32,
  },
  titleMetaRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  titleMetaLabel: {
    width: 120,
    fontFamily: FONT.familyBold,
    fontSize: SIZE.meta,
    color: COLORS.metaLabel,
  },
  titleMetaValue: {
    flex: 1,
    fontSize: SIZE.meta,
    color: COLORS.metaValue,
  },

  // Recurring page header (top of every body page)
  pageHeader: {
    position: "absolute",
    top: 24,
    left: SPACE.pageHorizontal,
    right: SPACE.pageHorizontal,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: SIZE.footer,
    color: COLORS.footer,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.rule,
  },

  // Recurring page footer
  pageFooter: {
    position: "absolute",
    bottom: 24,
    left: SPACE.pageHorizontal,
    right: SPACE.pageHorizontal,
    fontSize: SIZE.footer,
    color: COLORS.footer,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.rule,
  },
  pageFooterTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  pageFooterDisclosure: {
    fontSize: 7.5,
    color: COLORS.footer,
    lineHeight: 1.3,
  },

  // Section headings
  h1: {
    fontFamily: FONT.familyBold,
    fontSize: SIZE.h1,
    color: COLORS.header,
    marginTop: SPACE.beforeH1,
    marginBottom: SPACE.afterH1,
    lineHeight: LINE.header,
  },
  h2: {
    fontFamily: FONT.familyBold,
    fontSize: SIZE.h2,
    color: COLORS.header,
    marginTop: SPACE.beforeH2,
    marginBottom: SPACE.afterH2,
    lineHeight: LINE.header,
  },
  h3: {
    fontFamily: FONT.familyBold,
    fontSize: SIZE.h3,
    color: COLORS.subheader,
    marginTop: SPACE.beforeH3,
    marginBottom: SPACE.afterH3,
    lineHeight: LINE.header,
  },
  sectionLabel: {
    fontSize: SIZE.bodySmall,
    color: COLORS.metaLabel,
    fontFamily: FONT.familyItalic,
    marginBottom: 6,
  },
  paragraph: {
    marginBottom: SPACE.paragraph,
  },

  // Bullets
  bulletRow: {
    flexDirection: "row",
    marginBottom: SPACE.bullet,
  },
  bulletGlyph: {
    width: 12,
    fontFamily: FONT.familyBold,
    color: COLORS.header,
  },
  bulletBody: {
    flex: 1,
  },
  bulletBold: {
    fontFamily: FONT.familyBold,
  },
  partnerRoleLine: {
    marginTop: 2,
    fontSize: SIZE.meta,
    fontFamily: FONT.familyItalic,
    color: COLORS.metaLabel,
  },

  // Tables
  table: {
    marginTop: 6,
    marginBottom: 8,
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: COLORS.rule,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: COLORS.rule,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: COLORS.rule,
    backgroundColor: COLORS.tableRowAlt,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: COLORS.tableHeader,
  },
  tableCell: {
    paddingHorizontal: SPACE.cellPadX,
    paddingVertical: SPACE.cellPadY,
    fontSize: SIZE.bodySmall,
    lineHeight: 1.35,
  },
  tableHeaderCell: {
    paddingHorizontal: SPACE.cellPadX,
    paddingVertical: SPACE.cellPadY + 1,
    fontSize: SIZE.bodySmall,
    fontFamily: FONT.familyBold,
    color: COLORS.tableHeaderText,
  },

  // Group/bucket label inside the roadmap (mini-heading between groups)
  groupBand: {
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: COLORS.subheader,
    color: "#ffffff",
    fontFamily: FONT.familyBold,
    fontSize: 10,
  },
});
