import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import mammoth from "mammoth";

export interface FactReviewExtraction {
  text: string;
  warnings: string[];
  source_format: "docx" | "pdf";
}

function getExt(filePath: string): string {
  const i = filePath.lastIndexOf(".");
  return i === -1 ? "" : filePath.slice(i).toLowerCase();
}

// Extracts plain text from a Fact Review (.docx or .pdf). Dispatches by
// file extension. Returns the text + any non-fatal warnings.
//
// .docx → mammoth.extractRawText (preserves Phase 5b behavior — same path
//         that produced the Holloway baseline output).
// .pdf  → pdf-parse, imported via its lib/pdf-parse.js entry to skip the
//         package's index.js which executes test code at require time.
//
// Throws iff the file cannot be read or the parser cannot extract content.
// Callers that must never throw wrap in try/catch (Stage 0 and Stage 1 both
// do this).
export async function extractFactReviewText(
  filePath: string,
): Promise<FactReviewExtraction> {
  const ext = getExt(filePath);
  if (ext === ".docx") {
    const buffer = await readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const warnings = (result.messages ?? [])
      .filter((m) => m.type === "warning")
      .map((m) => m.message);
    return { text: result.value ?? "", warnings, source_format: "docx" };
  }
  if (ext === ".pdf") {
    const buffer = await readFile(filePath);
    // Side-step pdf-parse's index.js which runs a smoke test against a
    // bundled fixture on require. The lib entry exports the same function
    // without that side-effect.
    const pdfParseMod = (await import("pdf-parse/lib/pdf-parse.js")) as {
      default: (data: Buffer) => Promise<{ text: string; numpages: number }>;
    };
    const pdfParse = pdfParseMod.default;
    const result = await pdfParse(buffer);
    const text = result.text ?? "";
    const warnings: string[] = [];
    if (text.trim().length === 0) {
      warnings.push(
        `pdf-parse produced empty text from ${result.numpages ?? "?"}-page PDF — file may be image-only / scanned (OCR not supported)`,
      );
    }
    return { text, warnings, source_format: "pdf" };
  }
  throw new Error(
    `Unsupported Fact Review extension "${ext}". Expected .docx or .pdf.`,
  );
}

// SHA-256 of the extracted FR text. Used as `source_fr_content_hash` carried
// through every downstream stage's metadata so artifacts can be tied back to
// their source document.
export function computeFactReviewHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
