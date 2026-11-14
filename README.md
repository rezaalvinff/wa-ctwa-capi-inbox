# Mitsubishi DIPO Lead & CAPI Hub

Inbox WhatsApp untuk tim CS/Sales dealer resmi Mitsubishi DIPO:

- **AI Chatbot kualifikasi**: membalas otomatis sebagai *Asisten Virtual Resmi Mitsubishi DIPO*, lalu menggali **nama**, **domisili**, dan **unit diminati** secara natural. Engine-nya Gemini 2.5 Flash dengan fallback rule-based.
- **Auto-tagging `cold` / `warm`**: lead otomatis menjadi `warm` begitu ketiga data terisi. Bot mengirim pesan konfirmasi lalu menyerahkan chat ke CS (`bot_active = false`).
- **Manual takeover**: CS bisa mengambil alih chat kapan saja, atau mengaktifkan bot kembali.
- **Atribusi Click-to-WhatsApp**: menangkap `ctwa_clid`, `ad_id`, dan `ad_headline` dari iklan Meta.
- **Meta CAPI real-time**: mengirim event `LeadSubmitted` begitu prospek CTWA menjadi warm; cron harian mengirim ulang yang gagal.

Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Supabase (PostgreSQL), `lucide-react`, Gemini API (`fetch`), dan modul `crypto` bawaan Node.

## Struktur

```
middleware.ts                       # Wajib login + pembatasan role (Admin / Agent)
app/
  page.tsx                          # Header, menu user, navigasi tab sesuai role
  login/page.tsx                    # Halaman login
  api/
    webhook/route.ts                # WhatsApp Cloud API: verifikasi + pesan masuk -> chatbot (after())
    messages/send/route.ts          # Balasan manual CS (sender_type 'cs')
    leads/route.ts                  # GET daftar lead + preview pesan terakhir
    leads/[id]/route.ts             # PATCH edit nama/domisili/unit + toggle bot_active
    leads/[id]/messages/route.ts    # GET detail lead + riwayat chat
    simulate/route.ts               # POST lead dummy CTWA/organik + balasan bot pertama
    simulate/reply/route.ts         # POST simulasi balasan pelanggan (multi-turn testing)
    capi/sync-warm/route.ts         # POST kirim ulang event LeadSubmitted yang Pending
    capi/warm-leads/route.ts        # GET prospek warm CTWA 7 hari + statistik (Tab 2)
    cron/capi-sync/route.ts         # GET dipanggil Vercel Cron (proteksi CRON_SECRET)
    config/route.ts                 # GET flag non-rahasia untuk UI (mock mode, engine AI)
    auth/login|logout|me            # Login (scrypt + cookie sesi), logout, user aktif
    users/route.ts, users/[id]      # Kelola user (Admin): list, tambah, wilayah, ubah role/status, reset password
    knowledge/, knowledge/upload, knowledge/[id]  # Knowledge base (Admin): list, tambah manual, upload file, edit, hapus
components/
  InboxTab.tsx                      # Tab 1: daftar prospek, roomchat, panel kualifikasi
  CapiSyncTab.tsx                   # Tab 2: statistik, tombol auto-send, tabel monitoring
  UsersTab.tsx                      # Tab Pengguna (Admin) + wilayah agent
  KnowledgeTab.tsx                  # Tab Knowledge Base (Admin): upload/tulis/edit materi
  ui.tsx                            # Badge, tag WARM/COLD, copy button, formatter
lib/
  chatbot.ts                        # Gemini structured output + fallback rule-based + simulator
  bot-engine.ts                     # Orkestrasi bot: ekstraksi -> update lead -> handoff -> kirim WA
  capi.ts                           # Filter eligible + kirim CAPI per lead + logging
  leads.ts                          # computeStatus (cold/warm), missing fields, auto-close 24 jam
  routing.ts                        # Pencocokan domisili -> wilayah agent + auto-assign
  notes.ts                          # Catatan sistem di roomchat (oper ke agent / Antrian Admin)
  knowledge.ts                      # Ekstraksi teks file, memuat materi aktif, pencarian untuk bot rule-based
  auth/access.ts                    # Aturan akses lead (Admin semua, Agent hanya miliknya)
  mitsubishi.ts                     # Katalog unit, deteksi kota, normalisasi
  whatsapp.ts                       # Kirim teks via WhatsApp Cloud API
  auth/session.ts                   # Token sesi HMAC (Web Crypto, aman di Edge middleware)
  auth/password.ts                  # Hash & verifikasi password (scrypt)
  auth/users.ts                     # Header identitas dari middleware, validasi email
  supabase.ts, phone.ts, config.ts, http.ts, types.ts
supabase/
  schema.sql                        # Instalasi BARU (v2)
  migration_v2_dipo.sql             # Upgrade database v1 -> v2 tanpa menghapus data
  migration_v3_auth.sql             # Tabel app_users (login) + pengirim pesan CS
  migration_v4_routing_kb.sql       # Wilayah agent, penugasan lead, auto-close 24 jam, knowledge base
  migration_v5_system_notes.sql     # sender_type 'system' untuk catatan oper di roomchat
vercel.json                         # Cron harian /api/cron/capi-sync
```

## Setup Database

| Kondisi | Jalankan di Supabase SQL Editor |
| --- | --- |
| Project baru | `supabase/schema.sql` |
| Sudah memakai v1 | `migration_v2_dipo.sql` → `migration_v3_auth.sql` → `migration_v4_routing_kb.sql` → `migration_v5_system_notes.sql` |
| Sudah memakai v2 | `migration_v3_auth.sql` → `migration_v4_routing_kb.sql` → `migration_v5_system_notes.sql` |
| Sudah memakai v3 (login sudah jalan) | `migration_v4_routing_kb.sql` → `migration_v5_system_notes.sql` |
| Sudah memakai v4 | `supabase/migration_v5_system_notes.sql` |

Kedua file aman dijalankan ulang. Migrasi v2 melakukan hal berikut:

- Menambah kolom `domicile`, `interested_unit`, `bot_active`, `capi_synced_at`, plus `wa_profile_name`, `is_simulated`, `warm_at` di `leads`, serta `sender_type` dan `send_error` di `messages`.
- Mengonversi status lama (`new/qualified/closing/junk`) menjadi `cold`/`warm` berdasarkan kelengkapan data. Karena v1 belum punya domisili dan unit, semua lead lama menjadi `cold`.
- Menyalin `customer_name` lama ke `wa_profile_name`, karena di v1 kolom itu berisi nama profil WhatsApp.
- Menandai semua pesan keluar v1 sebagai `sender_type = 'cs'`.
- Memasang trigger `leads_auto_tag` yang menghitung ulang `status` dan `warm_at` di setiap insert/update. Status tetap konsisten walau data diedit langsung di database.

## Login & Role

Semua halaman dan API wajib login, kecuali `/login`, `/api/webhook` (Meta) dan `/api/cron/capi-sync` (dilindungi `CRON_SECRET`).

| Fitur | Admin | Agent |
| --- | :---: | :---: |
| Inbox: baca & balas chat, ambil alih / aktifkan bot, edit nama/domisili/unit | ✅ semua lead | ✅ hanya lead yang dioper ke dirinya |
| Oper lead manual ke agent / kembalikan ke Antrian Admin | ✅ | – |
| Tombol simulasi (chat CTWA/organik, balasan customer) | ✅ | – |
| Tab Meta CAPI Sync + endpoint `/api/capi/*` | ✅ | – |
| Tab Knowledge Base + endpoint `/api/knowledge/*` | ✅ | – |
| Tab Pengguna: tambah user, atur wilayah agent, ubah role, reset password, nonaktifkan | ✅ | – |

**Admin pertama:**

1. Jalankan migrasi.
2. Isi `AUTH_SECRET`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` (minimal 8 karakter), lalu deploy.
3. Login dengan email & password tersebut. Akun Admin otomatis dibuat di tabel `app_users`.
4. Buat akun Agent dari tab **Pengguna**. Setelah tabel berisi user, `ADMIN_EMAIL`/`ADMIN_PASSWORD` tidak dipakai lagi. Variabel itu boleh dihapus dari env.

**Keamanan:**

- Password di-hash dengan scrypt (modul `crypto` bawaan Node), tidak pernah disimpan plain text.
- Sesi berupa cookie `httpOnly` + `SameSite=Lax` yang ditandatangani HMAC dan berlaku 12 jam.
- `middleware.ts` memeriksa role, status aktif, dan `session_version` user ke database di **setiap request**. Akibatnya, menonaktifkan user, mengubah role, atau reset password langsung membuat sesi lamanya tidak berlaku.
- Akses Agent ke fitur Admin ditolak di server (HTTP 403), bukan hanya disembunyikan di UI.
- Setelah 5 kali salah password, akun dikunci 15 menit. Reset password oleh Admin langsung membuka kunci.
- Admin tidak bisa menonaktifkan atau menurunkan role akunnya sendiri, dan sistem selalu menyisakan minimal 1 Admin aktif.
- Balasan manual mencatat CS pengirimnya (`messages.sent_by`, `sent_by_name`). Nama tersebut tampil di bubble chat sebagai *👤 CS · Nama*.

## Auto-routing Lead ke Agent (per wilayah)

Setiap Agent punya daftar **wilayah** yang diatur Admin di tab **Pengguna** (mis. Agent Jakarta: `Jakarta, Depok, Bekasi, Tangerang, Bogor`).

1. Chatbot mengumpulkan nama, domisili, dan unit. Begitu lengkap, lead menjadi **WARM**, bot mengirim pesan handoff, lalu nonaktif.
2. Domisili dicocokkan dengan wilayah setiap agent aktif (`lib/routing.ts`):
   - huruf besar/kecil dan awalan "Kota/Kabupaten/Kab." diabaikan;
   - wilayah cocok sebagai **kata utuh**: `Jakarta` mencakup `Jakarta Selatan`, `Bandung` mencakup `Kab. Bandung Barat`, tetapi tidak `Bandungan`;
   - bila beberapa agent cocok, wilayah paling spesifik menang (`Jakarta Selatan` > `Jakarta`); bila sama, dipilih agent dengan lead paling sedikit dalam 7 hari.
3. **Cocok:** lead dioper ke agent tersebut dan langsung muncul di inbox-nya. **Tidak cocok:** lead masuk **Antrian Admin** dan dibalas manual oleh Admin.
4. Admin bisa mengoper ulang secara manual dari panel **Penanganan** di roomchat. Kalau domisili dikoreksi dan lead belum punya agent, routing dicoba lagi.

Agent hanya melihat dan bisa membalas lead yang dioper ke dirinya (dicek di server: HTTP 403 untuk lead lain).

**Notifikasi oper:**

- Setiap perpindahan penanganan dicatat sebagai **catatan sistem** di timeline roomchat. Catatan ini tidak dikirim ke WhatsApp pelanggan dan tidak dihitung sebagai aktivitas untuk auto-close. Contohnya:
  - *📌 Lead dioper otomatis ke Agent Surabaya — domisili "Sidoarjo" cocok dengan wilayah "Sidoarjo".*
  - *📌 Tidak ada wilayah agent yang cocok dengan domisili "Makassar" — lead masuk Antrian Admin.*
  - *📌 Reza mengoper lead ke Agent Jakarta.* / *📌 Reza mengembalikan lead ke Antrian Admin.*
- Agent yang sedang membuka dashboard mendapat **pop-up "Lead baru untuk Anda"**, paling lambat 4 detik setelah lead dioper. Klik pop-up untuk langsung membuka roomchat.

## Auto-close Room Chat (24 jam)

- Setiap pesan (pelanggan, bot, admin, agent) memperbarui `leads.last_activity_at` lewat trigger database.
- Jika **24 jam tanpa aktivitas**, room otomatis **CLOSED**: input pesan dikunci dan API kirim pesan menolak (HTTP 409). Tidak perlu cron; status dihitung dari waktu aktivitas terakhir.
- Jika pelanggan mengirim chat baru, room **terbuka lagi otomatis** (lead tetap dipegang agent yang sama).
- Catatan: WhatsApp sendiri hanya mengizinkan pesan teks bebas dalam 24 jam sejak pesan terakhir **pelanggan**. Banner kuning tetap muncul bila jendela itu sudah lewat walau room masih open karena aktivitas CS.

## Knowledge Base Chatbot

Tab **Knowledge Base** (Admin) berisi materi yang dibaca bot di **setiap balasan**: harga OTR per wilayah, alamat dealer, jam buka, promo, spesifikasi, FAQ.

- **Upload file:** PDF (berbasis teks), Word `.docx`, Excel `.xlsx`, `.csv`, `.txt`, `.md`. Maksimal 4 MB per file, 10 file per upload. Teks diekstrak di server (`lib/knowledge.ts`); file aslinya tidak disimpan. PDF hasil scan/foto ditolak dengan pesan jelas.
- **Tulis manual:** untuk info singkat, mis. promo bulan ini.
- **Lihat/Edit:** koreksi teks hasil ekstraksi (mis. kolom tabel harga yang tertukar). **Aktif/nonaktif** tanpa menghapus.
- Tidak ada training ulang: perubahan langsung berlaku di balasan bot berikutnya.
- Batas total materi aktif: 150.000 karakter (~40 ribu token per balasan). Pemakaian tampil di bagian atas tab.
- **Dengan AI (Gemini):** seluruh materi aktif disisipkan ke instruksi sistem. Bot diminta hanya menjawab dari materi, memakai harga OTR sesuai domisili, selalu menambahkan catatan "harga dapat berubah", dan mengoper promo/kredit final ke Sales.
- **Tanpa API key (mode dummy):** bot rule-based mengutip baris materi yang paling relevan (mis. baris harga unit yang ditanyakan).
- Jika pertanyaan pelanggan datang di pesan yang sama dengan pesan yang melengkapi data, bot menjawab pertanyaan itu dulu, baru mengirim pesan handoff.

## Environment Variables

```bash
cp .env.example .env.local
```

| Variable | Wajib | Keterangan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase (service role hanya dipakai di server) |
| `WEBHOOK_VERIFY_TOKEN` | ✅ | Verify token webhook Meta |
| `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN` | jika `MOCK_MODE=false` | Kirim balasan bot & CS ke WhatsApp |
| `META_DATASET_ID`, `META_ACCESS_TOKEN` | untuk CAPI | Dataset & token Conversions API |
| `META_TEST_EVENT_CODE` | opsional | Event muncul di tab *Test events*; kosongkan di production |
| `GEMINI_API_KEY` | opsional | Kosong = chatbot rule-based |
| `GEMINI_MODEL` | opsional | Default `gemini-2.5-flash` |
| `CRON_SECRET` | disarankan | Proteksi `/api/cron/capi-sync` (Vercel mengirim `Authorization: Bearer <CRON_SECRET>` otomatis) |
| `WA_BUSINESS_ACCOUNT_ID` | opsional | Dikirim sebagai `user_data.whatsapp_business_account_id` |
| `META_APP_SECRET` | disarankan | Verifikasi signature `X-Hub-Signature-256` webhook |
| `AUTH_SECRET` | ✅ | Secret penandatangan cookie login, **minimal 32 karakter** (`openssl rand -base64 48`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | ✅ (sekali) | Akun Admin pertama, dibuat otomatis saat login pertama selama tabel `app_users` masih kosong |
| `PRIVACY_CONTACT` | disarankan | Email/nomor kontak untuk permintaan data di halaman `/privacy` |
| `MOCK_MODE` | – | `true` = tidak ada pesan yang dikirim ke WhatsApp (bot & CS hanya disimpan ke DB) |

## Menjalankan

```bash
npm install
```

```bash
npm run dev
```

### Testing tanpa WhatsApp (`MOCK_MODE=true`)

1. Login sebagai **Admin**. Di tab **Inbox & Chatbot**, klik **Simulasi Chat CTWA**. Lead dummy dibuat dan bot langsung menyapa serta menanyakan nama.
2. Klik **Simulasi Balasan Customer** berulang kali (jawaban otomatis sesuai data yang masih kurang), atau ketik sendiri di kolom *"ketik sebagai pelanggan"*.
3. Setelah nama, domisili, dan unit terkumpul, tag otomatis berubah menjadi **🔥 WARM**. Bot mengirim konfirmasi handoff dan beralih ke **Mode Manual CS**.
4. Begitu WARM, event `LeadSubmitted` langsung dikirim ke Meta CAPI (tanpa tombol), lalu lead dioper ke agent sesuai wilayah dengan catatan di roomchat. Isi `META_TEST_EVENT_CODE` agar event muncul di tab *Test events* Events Manager. Tanpa kredensial Meta, lead tampil *Pending Sync* di tab **Meta CAPI Sync**.

Lead simulasi (`is_simulated = true`) **tidak pernah** dikirimi pesan WhatsApp sungguhan, juga saat `MOCK_MODE=false`, karena nomor acaknya bisa milik orang lain. Simulasi balasan pelanggan hanya diizinkan untuk lead simulasi atau saat `MOCK_MODE=true`.

## Aturan Bot (hemat pesan WhatsApp)

- **Fokus 3 data:** bot selalu mengarahkan percakapan untuk mendapatkan **nama, domisili, dan unit** secepatnya.
- **Tidak pernah menyebut harga, OTR, DP, cicilan/angsuran, kredit, promo, stok, tukar tambah, atau test drive.** Jawabannya selalu: *"Untuk info … akan diinfokan langsung oleh tim Sales Consultant kami 🙏 Untuk itu kami butuh 3 info dulu ya: nama, domisili, dan unit Mitsubishi yang diminati."*, lalu bot menanyakan data yang masih kurang. Knowledge base hanya dipakai untuk info umum (lokasi & jam dealer, gambaran unit).
- **Maksimal 8 balasan bot per lead.** Kalau sampai balasan ke-8 data belum lengkap, bot menutup dengan pesan sopan, berhenti (`bot_active = false`), dan mencatat *"Bot berhenti setelah 8 balasan"* agar Admin melanjutkan.
- **Pesan "ok", "makasih", atau emoji saja tidak dibalas.** "ya" dan "iya betul" tetap dibalas karena bisa berupa konfirmasi nama.
- **Tanpa akun agent aktif,** lead WARM ditangani Admin dengan catatan *"Lead WARM — ditangani Admin"*.

## Dashboard

Menu ada di **sidebar kiri** (Inbox & Chatbot, Meta CAPI Sync, Knowledge Base, Pengguna). Sidebar bisa dilipat menjadi ikon saja, dan otomatis terlipat di layar < 1440px. Di mobile, menu pindah ke atas.

Tombol **Simulasi Chat CTWA/Organik** dan **Simulasi Balasan Customer** hanya muncul saat `MOCK_MODE=true`.

## Alur Chatbot

1. Pesan masuk (webhook / simulasi) disimpan sebagai `sender_type = 'customer'`.
2. Jika `bot_active = true`, `lib/bot-engine.ts` berjalan:
   - **Webhook**: respons `200 OK` dikirim lebih dulu, lalu bot berjalan via `after()` (Vercel `waitUntil`) dengan jeda 2,5 detik. Jika pelanggan mengirim beberapa pesan beruntun, hanya pesan terakhir yang dibalas, dan semua pesan tetap dibaca sebagai konteks. Webhook retry (duplikat `wa_message_id`) tidak memicu bot lagi.
   - Bot memanggil `generateBotReply()`. Dengan `GEMINI_API_KEY`, Gemini mengembalikan JSON `{ reply_message, extracted_name, extracted_domicile, extracted_unit }`. Jika key kosong atau Gemini error/timeout (15 detik), bot memakai rule-based.
   - Hanya data yang masih kosong yang diisi (nama dinormalisasi tanpa sapaan, unit ke nama baku).
   - Jika CS mengambil alih atau pesan baru masuk selama bot berpikir, balasan dibatalkan.
3. Jika ketiga data lengkap → `status = 'warm'`, `warm_at` diisi, bot mengirim pesan konfirmasi (Sales Consultant area domisili akan menghubungi), lalu `bot_active = false`.
4. Balasan disimpan sebagai `sender_type = 'bot'`. Jika `MOCK_MODE !== 'true'`, balasan dikirim ke WhatsApp. Error pengiriman disimpan di `messages.send_error` dan tampil merah di bubble chat.

Nama profil WhatsApp disimpan di `wa_profile_name` dan **tidak** otomatis menjadi `customer_name`. Nama prospek harus dikonfirmasi lewat chat; bot bertanya *"Apakah benar dengan X?"*.

Edit manual di panel kanan juga menghitung ulang status. Jika lead menjadi warm karena edit manual, bot dinonaktifkan (tanpa pesan otomatis).

## Meta CAPI Sync

**Otomatis real-time:** begitu lead menjadi WARM, event `LeadSubmitted` langsung dikirim ke Meta. Ini berlaku baik lead menjadi WARM lewat chatbot maupun lewat edit manual di panel kanan, tanpa menekan tombol apa pun (`sendLeadEventRealtime` di `lib/capi.ts`). Hasilnya tersimpan di `last_capi_response`.

Lead yang belum berhasil terkirim tetap berstatus **Pending**. Penyebabnya bisa kredensial Meta belum diisi atau Meta mengembalikan error. Lead Pending dikirim ulang otomatis oleh cron harian (`GET /api/cron/capi-sync`). Tombol **"Kirim Ulang yang Pending sekarang"** di Tab 2 hanya opsional, untuk mengirim ulang tanpa menunggu cron.

Semua jalur memakai syarat yang sama. Sebuah lead dikirim **hanya jika** memenuhi semua syarat berikut:

1. `status = 'warm'`
2. `source = 'meta_ads'`
3. `ctwa_clid` tidak null/kosong
4. `created_at` **atau** `last_customer_message_at` dalam 7 hari terakhir
5. `capi_sent_events` belum berisi `'LeadSubmitted'` (atau `'Lead'` dari versi lama)

Payload per lead (event dikirim satu per satu agar log per lead jelas, 5 paralel, maks. 500 per run):

```json
{
  "data": [{
    "event_name": "LeadSubmitted",
    "event_time": 1763000000,
    "event_id": "<lead_id>_LeadSubmitted",
    "action_source": "business_messaging",
    "messaging_channel": "whatsapp",
    "user_data": {
      "ctwa_clid": "ARAk...",
      "ph": ["<sha256 628xxx>"],
      "fn": ["<sha256 nama depan>"],
      "ln": ["<sha256 nama belakang>"]
    },
    "custom_data": { "content_name": "Xpander Cross", "content_category": "Bekasi" }
  }],
  "test_event_code": "TEST12345"
}
```

| Parameter | Isi |
| --- | --- |
| `event_name` | `LeadSubmitted` (prospek sudah tervalidasi / `warm`). Untuk `action_source: business_messaging`, Meta **menolak** `Lead` (error 2804066, *Messaging event invalid event type*) dan hanya menerima nama event business messaging seperti `LeadSubmitted` atau `Purchase`. |
| `event_time` | Unix timestamp (detik) saat lead menjadi warm (`warm_at`), atau waktu kirim bila `warm_at` sudah lewat 7 hari |
| `event_id` | `<lead_id>_LeadSubmitted`, unik per lead untuk deduplikasi di Events Manager |
| `action_source` / `messaging_channel` | `business_messaging` / `whatsapp` |
| `user_data.ctwa_clid` | Click ID iklan CTWA, kunci atribusi, **tidak di-hash** |
| `user_data.ph` | Nomor dinormalisasi ke `628xxx` lalu SHA-256 |
| `user_data.fn` / `ln` | Opsional. Dari `customer_name` (fallback `wa_profile_name`); sapaan Pak/Bu/Kak dan teks dalam kurung dibuang; huruf kecil, tanpa tanda baca/angka (aksen tetap UTF-8), lalu SHA-256. `fn` = kata pertama, `ln` = kata terakhir; `ln` tidak dikirim untuk nama satu kata dan inisial satu huruf diabaikan. |
| `custom_data` | Opsional: `content_name` = unit diminati, `content_category` = domisili |

- Jika sukses (HTTP 200): `'LeadSubmitted'` ditambahkan ke `capi_sent_events` dan `capi_synced_at` diisi. Sukses maupun gagal, response Meta (beserta payload request dan `name_source` asal `fn`/`ln`) disimpan di `last_capi_response`.
- `event_id` yang konsisten juga membuat Meta men-deduplikasi bila sync manual dan cron berjalan bersamaan.

Cron di `vercel.json` berjalan `0 2 * * *` (UTC) = **09:00 WIB** setiap hari. Jika mengubah jadwal, ubah juga `CRON_SCHEDULE`/`CRON_LABEL` di `lib/config.ts` agar label di UI sama.

## Keamanan nomor WhatsApp & Privacy Policy

- Webhook **hanya memproses** pesan untuk nomor `WA_PHONE_NUMBER_ID`. Pesan untuk nomor lain yang terhubung ke Meta App yang sama (mis. nomor Qiscus) diabaikan. Selalu isi `WA_PHONE_NUMBER_ID` sebelum menyambungkan webhook.
- Halaman publik `/privacy` (tanpa login) berisi kebijakan privasi & cara penghapusan data (`/privacy#hapus-data`). Gunakan sebagai **Privacy Policy URL** dan **User data deletion** URL saat publish Meta App. Isi `PRIVACY_CONTACT` agar kontak tampil.

## Deploy ke Vercel

1. Import repo, isi environment variables (termasuk `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`), lalu deploy.
2. Webhook Meta: `https://<domain>/api/webhook` (subscribe field **messages**).
3. Isi `CRON_SECRET` agar endpoint cron tidak bisa dipanggil orang lain.

> Pastikan `AUTH_SECRET` dan `CRON_SECRET` terisi di Vercel sebelum aplikasi dipakai tim.

## Pindah ke VPS

```bash
npm ci && npm run build && npm run start
```

Di VPS, `vercel.json` tidak berlaku. Jadwalkan cron sendiri, misalnya:

```bash
0 9 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/capi-sync
```
