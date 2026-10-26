// Greek-specific input formats (docs/05 §1): afm-gr, iban, phone-gr, amka.

/** ΑΦΜ: 9 digits, check digit = (Σ dᵢ·2^(8-i)) mod 11 mod 10. */
export function afmGr(v: string): boolean {
  if (!/^\d{9}$/.test(v) || v === "000000000") return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(v[i]) * 2 ** (8 - i);
  return (sum % 11) % 10 === Number(v[8]);
}

/** IBAN (ISO 13616) — mod 97; GR IBAN must be 27 characters. */
export function iban(v: string): boolean {
  const s = v.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith("GR") && s.length !== 27) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const d = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const c of d) rem = (rem * 10 + Number(c)) % 97;
  }
  return rem === 1;
}

/** Greek phone: 10 digits starting 2 (landline) or 69 (mobile), optional +30 / 0030. */
export function phoneGr(v: string): boolean {
  const s = v.replace(/[\s\-().]/g, "").replace(/^(\+30|0030)/, "");
  return /^(2\d{9}|69\d{8})$/.test(s);
}

/** ΑΜΚΑ: 11 digits, first six a date DDMMYY, Luhn check. */
export function amka(v: string): boolean {
  if (!/^\d{11}$/.test(v)) return false;
  const dd = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let d = Number(v[10 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export const FORMATS: Record<string, (v: string) => boolean> = {
  "afm-gr": afmGr,
  iban,
  "phone-gr": phoneGr,
  amka,
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
};
