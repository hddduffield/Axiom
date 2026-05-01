import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import mammoth from "mammoth";

export interface FactReviewExtraction {
  text: string;
  warnings: string[];
}

// Extracts plain text from a Fact Review .docx using mammoth. Returns the text
// plus any non-fatal warnings mammoth reported (e.g., unsupported style refs).
//
// Throws iff the file cannot be read or mammoth cannot parse the .docx. Callers
// that must never throw should wrap in try/catch and produce their own failure
// shape (Stage 0 and Stage 1 both do this).
export async function extractFactReviewText(
  filePath: string,
): Promise<FactReviewExtraction> {
  const buffer = await readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const warnings = (result.messages ?? [])
    .filter((m) => m.type === "warning")
    .map((m) => m.message);
  return { text: result.value ?? "", warnings };
}

// SHA-256 of the extracted FR text. Used as `source_fr_content_hash` carried
// through every downstream stage's metadata so artifacts can be tied back to
// their source document.
export function computeFactReviewHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
