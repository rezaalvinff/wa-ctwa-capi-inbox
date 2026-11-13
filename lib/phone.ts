import { createHash } from "crypto";

/**
 * Normalisasi nomor telepon Indonesia ke format 62xxxxxxxxxx.
 * - hapus semua karakter non-angka
 * - awalan 0 (mis. 0812...) -> 62812...
 * - awalan 8 (mis. 812...)  -> 62812...
 */
export function normalizePhone(raw: string): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = "62" + digits.replace(/^0+/, "");
  } else if (digits.startsWith("8")) {
    digits = "62" + digits;
  }
  return digits;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function hashPhone(raw: string): string {
  return sha256Hex(normalizePhone(raw));
}
