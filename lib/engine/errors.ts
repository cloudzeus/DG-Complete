// Error taxonomy (docs/06 §5). The engine throws only these codes.

export const ERROR_CODES = {
  E_INPUT_VALIDATION: false,
  E_LOCATOR_NOT_FOUND: true,
  E_ELEMENT_NOT_ACTIONABLE: true,
  E_TIMEOUT: true,
  E_NAVIGATION: true,
  E_AUTH_FAILED: false,
  E_OPTION_NOT_FOUND: false,
  E_OPTION_AMBIGUOUS: false,
  E_OPTIONS_TIMEOUT: true,
  E_OPTIONS_EMPTY: true,
  E_DEPENDENT_RESET: true,
  E_TARGET_VALIDATION: false,
  E_ASSERTION_FAILED: false,
  E_CAPTCHA_DETECTED: false,
  E_HUMAN_TIMEOUT: false,
  E_DUPLICATE: false,
  E_QUOTA_EXCEEDED: false,
  E_CANCELLED: false,
  E_INTERNAL: true,
} as const satisfies Record<string, boolean>;

export type ErrorCode = keyof typeof ERROR_CODES;

export class EngineError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public extra: { targetMessage?: string; stepId?: string } = {},
  ) {
    super(message);
    this.name = "EngineError";
  }
  get retryable() {
    return ERROR_CODES[this.code];
  }
}

/** Any thrown value → EngineError with a code from the taxonomy and a Greek message. */
export function classify(err: unknown): EngineError {
  if (err instanceof EngineError) return err;
  const e = err as Error & { name?: string };
  const msg = String(e?.message ?? err);
  if (e?.name === "TimeoutError" || /Timeout \d+ms exceeded|timed out/i.test(msg)) {
    if (/waiting for (locator|getBy)/i.test(msg)) return new EngineError("E_LOCATOR_NOT_FOUND", "Το στοιχείο δεν βρέθηκε στη σελίδα μέσα στο χρονικό όριο.");
    return new EngineError("E_TIMEOUT", "Λήξη χρονικού ορίου.");
  }
  if (/net::ERR_|NS_ERROR_|Navigation failed|ERR_BLOCKED_BY_CLIENT/i.test(msg)) {
    const m = /net::ERR_[A-Z_]+/.exec(msg);
    return new EngineError("E_NAVIGATION", `Αποτυχία πλοήγησης${m ? ` (${m[0]})` : ""}.`);
  }
  if (/not (visible|enabled|editable|stable)|intercepts pointer events|element is outside of the viewport|detached from the DOM/i.test(msg)) {
    return new EngineError("E_ELEMENT_NOT_ACTIONABLE", "Το στοιχείο υπάρχει αλλά δεν είναι διαθέσιμο για ενέργεια (κρυφό, ανενεργό ή καλυμμένο).");
  }
  if (/strict mode violation/i.test(msg)) return new EngineError("E_LOCATOR_NOT_FOUND", "Ο επιλογέας ταιριάζει σε περισσότερα από ένα στοιχεία.");
  if (/Target (page|closed)|browser has been closed|Browser closed/i.test(msg)) return new EngineError("E_INTERNAL", "Ο browser έκλεισε απρόσμενα.");
  return new EngineError("E_INTERNAL", "Εσωτερικό σφάλμα της μηχανής εκτέλεσης.");
}
