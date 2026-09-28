# TRASTAR — E-commerce Sparepart Motor (Prototype)

Prototype front-end untuk toko online sparepart & aksesoris motor bernama **TRASTAR**.

## Tentang project ini

- Single-file app: seluruh UI (React + Tailwind) ada di `index.html`, React & ReactDOM dimuat lewat CDN — tidak perlu proses build (`npm install` / `npm run build`) sama sekali.
- Routing memakai hash-based router kustom (`#/shop`, `#/product/:slug`, dst), sehingga tetap berfungsi penuh di static hosting seperti Vercel/Netlify/GitHub Pages.
- Data produk masih dummy/statis (ada di dalam `index.html`), cart & order tersimpan di `localStorage` browser (tidak ada backend/database sungguhan).
- Alur yang bisa dicoba: Home → Shop → Product Detail → Add to Cart → Cart → Checkout → Payment (simulasi VA/QRIS/E-Wallet) → Thank You → My Order.

## Menjalankan secara lokal

Karena tidak ada proses build, cukup buka filenya langsung di browser:

```bash
open index.html      # macOS
# atau
start index.html     # Windows
```

Atau jalankan local server sederhana (disarankan, supaya localStorage & routing lebih stabil):

```bash
npx serve .
```

## Deploy ke Vercel

Lihat instruksi lengkap di percakapan/README project, intinya:

1. Push repo ini ke GitHub.
2. Import repo di [vercel.com](https://vercel.com) → Add New Project.
3. Framework Preset: pilih **Other** (Vercel akan otomatis serve `index.html` sebagai static site, tidak perlu build command).
4. Deploy.

## Struktur

```
.
├── index.html   # seluruh aplikasi (HTML + CSS + JS/React)
└── README.md
```
