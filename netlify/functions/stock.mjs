// Live stock for rudegirlz808.com
// Reads the "Stock" tab of the "Rude Girlz 808" Google Sheet and hands it to the
// web page. Change a Qty in the sheet and the site shows it on the next page load.
//
// Rules the page follows: a size with Qty above 0 shows as available;
// Qty 0 or blank shows as sold out. Item names must match the site's names
// (an "&" or "and" doesn't matter, e.g. "Olive Gold Set" = "Olive & Gold Set").
//
// The sheet must stay shared as "Anyone with the link can view".

const SHEET_ID = "13vzmyvcsTSKhxAZFBd73HVm-Uyq_aC7XPfFkjJ_fD7I";
const STOCK_TAB_GID = "777"; // the "Stock" tab
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${STOCK_TAB_GID}`;

export default async () => {
  try {
    const r = await fetch(URL, { redirect: "follow" });
    const text = await r.text();
    // If Google sends back a sign-in page instead of the sheet, don't pass it on.
    if (!r.ok || !/^\s*"?item"?\s*,/i.test(text)) {
      return new Response("", { status: 502 });
    }
    return new Response(text, {
      headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return new Response("", { status: 502 });
  }
};

export const config = { path: "/api/stock" };
