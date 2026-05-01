export interface CheckResult {
  status: "passed" | "warning" | "failed" | "skipped";
  details: string;
}

export interface ValidationFailure {
  check: string;
  reason: string;
  remediation: string;
}

export interface Stage0ValidationResult {
  status: "passed" | "passed_with_warnings" | "failed";

  validated_at: string;
  source_file_path: string;
  source_fr_content_hash: string;

  checks: {
    file_integrity: CheckResult;
    required_sections_present: CheckResult;
    required_field_markers: CheckResult;
    volatile_rates_freshness: CheckResult;
    content_hash: CheckResult;
  };

  flags: {
    volatile_rates_stale: boolean;
    text_length_suspicious: boolean;
    additional: Record<string, unknown>;
  };

  failures: ValidationFailure[];
  warnings: string[];

  extracted_text_length: number;
  extracted_text_preview: string;
}
