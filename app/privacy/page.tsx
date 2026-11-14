import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — Mitsubishi DIPO WhatsApp",
  description: "Kebijakan privasi layanan chat WhatsApp Mitsubishi DIPO.",
};

// Dibaca saat request agar kontak bisa diubah lewat env tanpa build ulang.
export const dynamic = "force-dynamic";

const UPDATED_AT = "14 November 2026";

export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT?.trim();
  const contactText = contact || "nomor WhatsApp resmi Mitsubishi DIPO yang Anda hubungi";

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-10 text-slate-800">
      <article className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">Kebijakan Privasi</h1>
          <p className="text-sm text-slate-500">Layanan chat WhatsApp Mitsubishi DIPO · Terakhir diperbarui {UPDATED_AT}</p>
          <p className="text-sm text-slate-500">
            <i>Privacy Policy for the Mitsubishi DIPO WhatsApp chat service. An English summary is provided at the end.</i>
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">1. Data yang kami kumpulkan</h2>
          <p>Saat Anda menghubungi kami melalui WhatsApp, kami memproses:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Nomor WhatsApp dan nama profil WhatsApp Anda.</li>
            <li>Isi percakapan, termasuk nama, domisili (kota/kabupaten), dan unit kendaraan yang Anda minati.</li>
            <li>Informasi iklan bila Anda menghubungi kami dari iklan Meta (Facebook/Instagram), seperti ID klik iklan.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">2. Cara kami menggunakan data</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Membalas pertanyaan Anda, termasuk melalui asisten virtual (chatbot) otomatis.</li>
            <li>Meneruskan permintaan Anda kepada Sales Consultant Mitsubishi DIPO di wilayah domisili Anda.</li>
            <li>
              Mengukur efektivitas iklan melalui Meta Conversions API. Nomor telepon dan nama dikirim dalam bentuk ter-hash
              (SHA-256), bukan teks asli.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">3. Pihak yang menerima data</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Meta Platforms (WhatsApp Business Platform dan Conversions API).</li>
            <li>Penyedia layanan teknologi kami untuk hosting dan database, serta penyedia AI untuk chatbot bila diaktifkan.</li>
            <li>Tim internal Mitsubishi DIPO (Admin dan Sales Consultant) yang menangani permintaan Anda.</li>
          </ul>
          <p>Kami tidak menjual data pribadi Anda.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">4. Penyimpanan dan keamanan</h2>
          <p>
            Data disimpan pada layanan cloud dengan akses terbatas bagi petugas yang berwenang, dan disimpan selama diperlukan untuk
            melayani permintaan Anda atau sesuai kewajiban hukum yang berlaku.
          </p>
        </section>

        <section id="hapus-data" className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">5. Hak Anda dan permintaan penghapusan data</h2>
          <p>
            Anda dapat meminta salinan, koreksi, atau penghapusan data Anda kapan saja. Kirim permintaan melalui{" "}
            <b>{contactText}</b> dengan menyebutkan nomor WhatsApp Anda. Kami akan memproses penghapusan data percakapan dan data
            prospek Anda dalam waktu paling lambat 30 hari.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">6. Perubahan kebijakan</h2>
          <p>Kebijakan ini dapat diperbarui sewaktu-waktu. Versi terbaru selalu tersedia di halaman ini.</p>
        </section>

        <section className="space-y-2 border-t border-slate-200 pt-6 text-sm text-slate-600">
          <h2 className="font-semibold text-slate-800">English summary</h2>
          <p>
            When you message Mitsubishi DIPO on WhatsApp we process your WhatsApp number, profile name, conversation content
            (including name, city and vehicle of interest) and, if you came from a Meta ad, the ad click ID. We use it to reply to
            you (including via an automated assistant), to route you to a sales consultant in your area, and to measure ad
            performance through the Meta Conversions API using hashed (SHA-256) phone number and name. Data is shared only with Meta,
            our hosting/database and AI service providers, and authorised DIPO staff, and is never sold. To request access,
            correction or deletion of your data, contact us via {contactText}; deletion requests are completed within 30 days.
          </p>
        </section>
      </article>
    </main>
  );
}
