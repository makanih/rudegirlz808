// Cart checkout for rudegirlz808.com
// Takes the items in the customer's bag and makes ONE Stripe checkout,
// so they only pay shipping once.
//
// Needs one setting in Netlify: STRIPE_SECRET_KEY (a Stripe restricted key
// with "Checkout Sessions: Write" permission).
//
// Prices live HERE (not on the web page) so nobody can change them in their browser.
// When you change a price on the site, change it here too (amount is in cents: $80 = 8000).

const CATALOG = {
  "pink-miller-sandal":             { name: "Pink Miller Sandal",            cents: 8100 },
  "black-rhinestone-miller-sandal": { name: "Black Rhinestone Miller Sandal", cents: 9000 },
  "black-patent-miller-sandal":     { name: "Black Patent Miller Sandal",    cents: 9000 },
  "black-rhinestone-slide-sandal":  { name: "Black Rhinestone Slide Sandal", cents: 9000 },
  "brown-ines-slide-sandal":        { name: "Brown Ines Slide Sandal",       cents: 9000 },
  "leopard-set":                    { name: "Leopard Set",                   cents: 8000 },
  "baby-pink-biker-set":            { name: "Baby Pink Biker Set",           cents: 8000 },
  "peach-set":                      { name: "Peach Set",                     cents: 8000 },
  "black-dot-set":                  { name: "Black Dot Set",                 cents: 8000 },
  "rose-set":                       { name: "Rose Set",                      cents: 8000 },
  "black-gold-biker-set":           { name: "Black & Gold Biker Set",        cents: 8000 },
  "olive-gold-set":                 { name: "Olive & Gold Set",              cents: 8000 },
  "coach-signature-tote":           { name: "Coach Signature Tote",          cents: 7500 },
};

// The same $10.99 flat shipping rate your payment links use — charged once per order.
const SHIPPING_RATE = "shr_1Ubar3BKeJpHexfIpVEY6kt0";
const SITE = "https://rudegirlz808.com";

// Live stock from the sheet's Stock tab (same source as /api/stock)
const STOCK_CSV = "https://docs.google.com/spreadsheets/d/13vzmyvcsTSKhxAZFBd73HVm-Uyq_aC7XPfFkjJ_fD7I/export?format=csv&gid=777";
const norm = (s) => String(s || "").toLowerCase().replace(/&/g, " ").replace(/\band\b/g, " ").replace(/[^a-z0-9]/g, "");
const sizeKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.]/g, "");

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Returns a lookup of "name|size" -> qty, or null if the sheet can't be read
async function loadStock() {
  try {
    const r = await fetch(STOCK_CSV, { redirect: "follow" });
    const text = await r.text();
    if (!r.ok || !/^\s*"?item"?\s*,/i.test(text)) return null;
    const map = {};
    for (const [item, , , size, qty] of parseCsv(text).slice(1)) {
      if (!item) continue;
      const k = `${norm(item)}|${sizeKey(size)}`;
      map[k] = (map[k] || 0) + (Number(qty) || 0);
    }
    return map;
  } catch { return null; }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  const key = process.env.STRIPE_SECRET_KEY;
  // The site asks this first: the bag only turns on once the Stripe key is set.
  if (req.method === "GET") return json({ ready: !!key });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!key) return json({ error: "not_configured" }, 503);

  let items;
  try { items = (await req.json()).items; } catch { return json({ error: "Bad request" }, 400); }
  if (!Array.isArray(items) || !items.length || items.length > 20) return json({ error: "Your bag is empty" }, 400);

  const form = new URLSearchParams();
  const summary = [];
  const stock = await loadStock(); // if the sheet can't be read, don't block the sale
  const wanted = {};
  let n = 0;
  for (const it of items) {
    const p = CATALOG[it && it.id];
    const size = String((it && it.size) || "").replace(/[^A-Za-z0-9 .\/-]/g, "").slice(0, 12);
    if (!p || !size) return json({ error: "Something in your bag isn't available anymore" }, 400);
    if (stock) {
      const k = `${norm(p.name)}|${sizeKey(size)}`;
      wanted[k] = (wanted[k] || 0) + 1;
      if ((stock[k] || 0) < wanted[k]) {
        return json({ error: `Sorry, ${p.name} size ${size} just sold out. Please remove it from your bag.` }, 409);
      }
    }
    const label = size.toLowerCase() === "one size" ? p.name : `${p.name} — Size ${size}`;
    form.append(`line_items[${n}][price_data][currency]`, "usd");
    form.append(`line_items[${n}][price_data][unit_amount]`, String(p.cents));
    form.append(`line_items[${n}][price_data][tax_behavior]`, "exclusive");
    form.append(`line_items[${n}][price_data][product_data][name]`, label);
    form.append(`line_items[${n}][quantity]`, "1");
    summary.push(`${it.id}_size-${size.replace(/[^A-Za-z0-9]/g, "-")}`);
    n++;
  }

  form.append("mode", "payment");
  form.append("success_url", `${SITE}/?order=success`);
  form.append("cancel_url", `${SITE}/?bag=open`);
  form.append("shipping_options[0][shipping_rate]", SHIPPING_RATE);
  form.append("shipping_address_collection[allowed_countries][0]", "US");
  form.append("billing_address_collection", "required");
  form.append("phone_number_collection[enabled]", "true");
  form.append("automatic_tax[enabled]", "true");
  form.append("client_reference_id", summary.join("__").slice(0, 200));
  form.append("metadata[items]", summary.join(", ").slice(0, 500));
  form.append("payment_intent_data[metadata][items]", summary.join(", ").slice(0, 500));

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = await r.json();
  if (!r.ok || !data.url) {
    console.error("Stripe error", data && data.error);
    return json({ error: "Checkout couldn't start. Please try again." }, 502);
  }
  return json({ url: data.url });
};

export const config = { path: "/api/checkout" };
