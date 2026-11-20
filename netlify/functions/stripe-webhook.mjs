// Order -> sheet sync for rudegirlz808.com
// Stripe calls this after every paid checkout (cart, payment links, preorders).
// It works out what was bought and tells the Google Sheet script, which lowers
// Qty in the Stock tab. The site reads the Stock tab, so it updates itself.
//
// Netlify settings it needs:
//   STRIPE_WEBHOOK_SECRET  – from the Stripe webhook (starts with whsec_)
//   STRIPE_SECRET_KEY      – already set for the cart (used to read line items)
//   SHEET_SCRIPT_URL       – the Apps Script web app URL
//   SHEET_SCRIPT_SECRET    – same secret that's in the Apps Script code

import crypto from "node:crypto";

// Site ids -> sheet names (same list as checkout.mjs)
const NAMES = {
  "pink-miller-sandal": "Pink Miller Sandal",
  "black-rhinestone-miller-sandal": "Black Rhinestone Miller Sandal",
  "black-patent-miller-sandal": "Black Patent Miller Sandal",
  "black-rhinestone-slide-sandal": "Black Rhinestone Slide Sandal",
  "brown-ines-slide-sandal": "Brown Ines Slide Sandal",
  "leopard-set": "Leopard Set",
  "baby-pink-biker-set": "Baby Pink Biker Set",
  "peach-set": "Peach Set",
  "black-dot-set": "Black Dot Set",
  "rose-set": "Rose Set",
  "black-gold-biker-set": "Black Gold Biker Set",
  "olive-gold-set": "Olive Gold Set",
  "coach-signature-tote": "Coach Signature Tote",
};

const titleCase = (id) => id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function verify(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2 && p[0] !== "v1"));
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = parts.t;
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// "black-patent-miller-sandal_size-6_preorder" -> { item, size, preorder }
function fromRef(ref) {
  const m = /^([a-z0-9-]+)_size-([A-Za-z0-9.-]+?)(_preorder)?$/.exec(ref);
  if (!m) return null;
  let size = m[2].replace(/-/g, " ");
  if (/^one size$/i.test(size)) size = "One size";
  return { item: NAMES[m[1]] || titleCase(m[1]), size, preorder: !!m[3] };
}

async function fromLineItems(sessionId, key) {
  if (!key) return [];
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=50&expand[]=data.price`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!r.ok) return [];
  const { data } = await r.json();
  const out = [];
  for (const li of data || []) {
    const desc = li.description || "";
    const pre = /preorder/i.test(desc);
    // Cart items are named "Item — Size X"
    let [item, size] = desc.split(/\s+—\s+Size\s+/i);
    size = size || (li.price && li.price.metadata && li.price.metadata.size) ||
      ((/Size\s+([A-Za-z0-9.]+)/i.exec((li.price && li.price.nickname) || "") || [])[1]) || "";
    const generic = /^(rudegirlz808 (item|payment)|preorder)$/i.test(item.trim());
    for (let i = 0; i < (li.quantity || 1); i++) out.push({ item: generic ? "" : item.trim(), size, preorder: pre });
  }
  return out;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  if (!verify(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) {
    return new Response("bad signature", { status: 400 });
  }
  const event = JSON.parse(raw);
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return new Response("ignored");
  }
  const s = event.data.object;
  if (s.payment_status !== "paid") return new Response("not paid yet");

  // 1) site cart / site buttons put the items in client_reference_id
  let items = (s.client_reference_id || "").split("__").map(fromRef).filter(Boolean);
  // 2) newer payment links put item + size in metadata
  if (!items.length && s.metadata && s.metadata.item) {
    items = [{ item: s.metadata.item, size: s.metadata.size || "", preorder: false }];
  }
  // 3) otherwise read the line items from Stripe
  if (!items.length) items = await fromLineItems(s.id, process.env.STRIPE_SECRET_KEY);
  if (!items.length) items = [{ item: "", size: "", preorder: s.amount_total === 2500 }];
  // A $25 payment with no item info is a preorder deposit
  if (s.amount_total === 2500) items = items.map((it) => ({ ...it, preorder: true }));

  const d = new Date(s.created * 1000);
  const hst = { timeZone: "Pacific/Honolulu" };
  const c = s.customer_details || {};
  const payload = {
    secret: process.env.SHEET_SCRIPT_SECRET,
    sessionId: s.id,
    name: c.name || (s.collected_information && s.collected_information.individual_name) || "customer",
    email: c.email || "",
    phone: c.phone || "",
    total: `$${((s.amount_total || 0) / 100).toFixed(2)}`,
    date: d.toLocaleDateString("en-US", { ...hst, month: "numeric", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { ...hst, hour: "numeric", minute: "2-digit" }),
    items,
  };

  try {
    const r = await fetch(process.env.SHEET_SCRIPT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const text = await r.text();
    console.log("sheet:", r.status, text.slice(0, 300));
    if (!r.ok) return new Response("sheet error", { status: 500 }); // Stripe will retry
  } catch (e) {
    console.error("sheet unreachable", e);
    return new Response("sheet unreachable", { status: 500 });
  }
  return new Response("done");
};

export const config = { path: "/api/stripe-webhook" };
