/**
 * Katalog unit Mitsubishi & helper normalisasi data kualifikasi.
 * File ini murni (tanpa dependency Node) sehingga aman di-import dari client.
 */

export const MITSUBISHI_UNITS = [
  "Xpander",
  "Xpander Cross",
  "Pajero Sport",
  "Xforce",
  "Destinator",
  "L300",
  "Triton",
  "Canter",
] as const;

/** Urutan penting: pola yang lebih spesifik harus di atas. */
const UNIT_PATTERNS: Array<[string, RegExp]> = [
  ["Xpander Cross", /\b(?:x[\s-]?pander|expander|xpdr)\s*-?\s*cross\b/i],
  ["Xpander", /\b(?:x[\s-]?pander|expander|xpdr)\b/i],
  ["Pajero Sport", /\b(?:pajero(?:\s*sport)?|pajsport|pajspor)\b/i],
  ["Xforce", /\bx[\s-]?force\b/i],
  ["Destinator", /\bdestinator\b/i],
  ["L300", /\bl[\s-]?300\b/i],
  ["Triton", /\b(?:triton|strada)\b/i],
  ["Canter", /\b(?:canter|fuso)\b/i],
  ["Outlander PHEV", /\boutlander\b/i],
  ["Eclipse Cross", /\beclipse(?:\s*cross)?\b/i],
];

/** Cari unit Mitsubishi pertama yang disebut di teks. */
export function detectUnit(text: string): string | null {
  for (const [canonical, re] of UNIT_PATTERNS) {
    if (re.test(text)) return canonical;
  }
  return null;
}

const HONORIFICS =
  /^(?:bapak|bpk|pak|ibu|bu|kak|kakak|mas|mbak|mba|bang|abang|sdr|saudara|saudari|ko|koh|ci|cik|tn|ny|nn|om|tante)\.?\s+/i;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Normalisasi nama: buang sapaan (Pak/Bu/Kak), maks 4 kata, Title Case. */
export function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/[^\p{L}\s.'-]/gu, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) s = s.replace(HONORIFICS, "");
  s = s.replace(/[.\s]+$/, "");
  if (!s || s.length < 2) return null;
  return titleCase(s.split(" ").slice(0, 4).join(" "));
}

/** Normalisasi domisili: buang prefix "kota/kab", Title Case. */
export function normalizeDomicile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/[^\p{L}\s.()-]/gu, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:kota|kabupaten|kab\.?|daerah|area|wilayah)\s+/i, "");
  if (!s || s.length < 3) return null;
  const known = detectCity(s);
  if (known) return known;
  return titleCase(s.split(" ").slice(0, 4).join(" "));
}

/** Normalisasi unit: map ke nama kanonik bila dikenal. */
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return detectUnit(s) ?? titleCase(s.replace(/^mitsubishi\s+/i, "").slice(0, 40));
}

/** Daftar kota/kabupaten umum untuk deteksi rule-based (lowercase -> label). */
const CITY_LIST = [
  "Jakarta Pusat", "Jakarta Utara", "Jakarta Barat", "Jakarta Selatan", "Jakarta Timur", "Jakarta",
  "Kepulauan Seribu", "Bogor", "Depok", "Tangerang Selatan", "Tangerang", "Bekasi", "Cikarang", "Cibubur",
  "Serpong", "BSD", "Bintaro", "Karawang", "Purwakarta", "Bandung Barat", "Bandung", "Cimahi", "Sumedang",
  "Garut", "Tasikmalaya", "Ciamis", "Banjar", "Cirebon", "Kuningan", "Majalengka", "Indramayu", "Subang",
  "Sukabumi", "Cianjur", "Serang", "Cilegon", "Pandeglang", "Lebak", "Semarang", "Solo", "Surakarta",
  "Yogyakarta", "Jogja", "Jogjakarta", "Sleman", "Bantul", "Kulon Progo", "Gunungkidul", "Magelang",
  "Salatiga", "Kudus", "Jepara", "Pati", "Demak", "Kendal", "Pekalongan", "Tegal", "Brebes",
  "Pemalang", "Purwokerto", "Banyumas", "Cilacap", "Kebumen", "Purworejo", "Wonosobo", "Temanggung",
  "Klaten", "Boyolali", "Sukoharjo", "Karanganyar", "Sragen", "Wonogiri", "Rembang", "Blora", "Grobogan",
  "Surabaya", "Sidoarjo", "Gresik", "Mojokerto", "Jombang", "Malang", "Pasuruan", "Probolinggo",
  "Lumajang", "Jember", "Banyuwangi", "Bondowoso", "Situbondo", "Kediri", "Blitar", "Tulungagung",
  "Trenggalek", "Madiun", "Ngawi", "Magetan", "Ponorogo", "Pacitan", "Nganjuk", "Bojonegoro", "Tuban",
  "Lamongan", "Madura", "Bangkalan", "Sampang", "Pamekasan", "Sumenep", "Denpasar", "Bali", "Badung",
  "Gianyar", "Tabanan", "Mataram", "Lombok", "Kupang", "Medan", "Binjai", "Deli Serdang", "Pematangsiantar",
  "Padang", "Bukittinggi", "Pekanbaru", "Batam", "Tanjungpinang", "Jambi", "Palembang", "Bengkulu",
  "Bandar Lampung", "Lampung", "Pangkalpinang", "Banda Aceh", "Aceh", "Pontianak", "Singkawang",
  "Banjarmasin", "Banjarbaru", "Palangkaraya", "Samarinda", "Balikpapan", "Bontang", "Tarakan",
  "Makassar", "Gowa", "Maros", "Parepare", "Manado", "Bitung", "Gorontalo", "Palu", "Kendari", "Ambon",
  "Ternate", "Jayapura", "Sorong", "Merauke",
];

const CITY_MATCHERS = CITY_LIST.map((label) => ({
  label,
  re: new RegExp(`\\b${label.toLowerCase().replace(/\s+/g, "\\s+")}\\b`, "i"),
}));

/** Cari nama kota/kabupaten yang dikenal di teks. */
export function detectCity(text: string): string | null {
  for (const { label, re } of CITY_MATCHERS) {
    if (re.test(text)) return label;
  }
  return null;
}
