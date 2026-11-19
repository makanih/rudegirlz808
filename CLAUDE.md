# RudeGirlz808 site (rudegirlz808.com)

Owner: Makani. She runs the store from her phone. Keep replies short and plain.

## How it's set up
- `index.html` is the whole site. Netlify project "thriving-pasca-669838" deploys every push to `main` (live in ~1–2 min).
- `netlify/functions/checkout.mjs` – cart checkout (one Stripe session, one shipping charge). Prices live in its CATALOG too; keep them in sync with `PRODUCTS` in index.html.
- `netlify/functions/stock.mjs` – serves `/api/stock`, the live CSV of the **Stock** tab (gid 777) of the Google Sheet "Rude Girlz 808" (id `13vzmyvcsTSKhxAZFBd73HVm-Uyq_aC7XPfFkjJ_fD7I`). The sheet must stay "anyone with the link can view".

## Stock updates (sold, restocked, sold out)
- Change **Qty** in the Stock tab. That's it – the site reads it on every page load. Qty > 0 = available, 0/blank = sold out.
- Sheet item names must match site names (`&`/"and" ignored). Sizes must match the product's `allSizes` (sets: XS/S/M/L; sandals: numbers; bags: "One size").
- Also update the `sizes:` list in `PRODUCTS` when you're in the code anyway – it's the backup if the sheet can't be reached.
- Stripe: account RUDEGIRLZ808 (live). Sold-out items keep their payment links active with the same settings.

## Naming
- "Cheetah Set" on a Stripe link = "Leopard Set" on the site and sheet.
- "Black sparkly" = "Black Rhinestone" (always say rhinestone).
- Preorders: $25 deposit, Tory Burch sandals only, tracked in the "TB Inventory" tab.
