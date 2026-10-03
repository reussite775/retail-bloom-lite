import { money } from "./format";

export type Shop = { shop_name: string; slogan: string; contact: string; address: string; logo_url: string };
export type Receipt = {
  number: string;
  date: Date;
  lines: { name: string; qty: number; price: number }[];
  total: number;
  payment: string;
  customer?: string;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const dateStr = (d: Date) => d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export function printReceipt(shop: Shop, r: Receipt) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  const rows = r.lines
    .map((l) => `<tr><td>${esc(l.name)}<br><small>${l.qty} × ${money(l.price)}</small></td><td class="r">${money(l.qty * l.price)}</td></tr>`)
    .join("");
  w.document.write(`<!doctype html><html><head><title>Reçu ${r.number}</title><style>
@page{size:80mm auto;margin:4mm}body{font-family:monospace;width:72mm;margin:0 auto;font-size:12px;color:#000}
.c{text-align:center}.r{text-align:right;white-space:nowrap;vertical-align:top}hr{border:0;border-top:1px dashed #000}
table{width:100%;border-collapse:collapse}td{padding:2px 0}img{max-width:30mm;max-height:20mm}h2{margin:4px 0}
</style></head><body>
<div class="c">${shop.logo_url ? `<img src="${shop.logo_url}">` : ""}<h2>${esc(shop.shop_name)}</h2>
${shop.slogan ? `<div><i>${esc(shop.slogan)}</i></div>` : ""}${shop.address ? `<div>${esc(shop.address)}</div>` : ""}${shop.contact ? `<div>${esc(shop.contact)}</div>` : ""}</div>
<hr><div>Reçu n° ${r.number}<br>${dateStr(r.date)}</div><hr>
<table>${rows}</table><hr>
<table><tr><td><b>TOTAL</b></td><td class="r"><b>${money(r.total)}</b></td></tr>
<tr><td>Paiement</td><td class="r">${esc(r.payment)}</td></tr>${r.customer ? `<tr><td>Client</td><td class="r">${esc(r.customer)}</td></tr>` : ""}</table>
<hr><div class="c">Merci de votre visite !</div>
<script>window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
}

function loadImg(src: string) {
  return new Promise<HTMLImageElement | null>((res) => {
    if (!src) return res(null);
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

export async function receiptBlob(shop: Shop, r: Receipt): Promise<Blob> {
  const W = 576, pad = 32, lh = 30;
  const logo = await loadImg(shop.logo_url);
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const ops: ((y: number) => number)[] = [];
  const text = (t: string, align: "left" | "center" | "right" = "left", font = "22px monospace") =>
    ops.push((y) => { ctx.font = font; ctx.textAlign = align; ctx.fillText(t, align === "center" ? W / 2 : align === "right" ? W - pad : pad, y + 22); return y + lh; });
  const pair = (a: string, b: string, font = "22px monospace") =>
    ops.push((y) => { ctx.font = font; ctx.textAlign = "left"; ctx.fillText(a.slice(0, 28), pad, y + 22); ctx.textAlign = "right"; ctx.fillText(b, W - pad, y + 22); return y + lh; });
  const sep = () => ops.push((y) => { ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(pad, y + 12); ctx.lineTo(W - pad, y + 12); ctx.stroke(); return y + 24; });

  if (logo) {
    const h = 100, w = (logo.width / logo.height) * h;
    ops.push((y) => { ctx.drawImage(logo, (W - w) / 2, y, w, h); return y + h + 10; });
  }
  text(shop.shop_name, "center", "bold 30px monospace");
  if (shop.slogan) text(shop.slogan, "center", "italic 20px monospace");
  if (shop.address) text(shop.address, "center", "20px monospace");
  if (shop.contact) text(shop.contact, "center", "20px monospace");
  sep();
  text(`Reçu n° ${r.number}`);
  text(dateStr(r.date));
  sep();
  for (const l of r.lines) {
    text(l.name.slice(0, 36));
    pair(`  ${l.qty} × ${money(l.price)}`, money(l.qty * l.price), "20px monospace");
  }
  sep();
  pair("TOTAL", money(r.total), "bold 26px monospace");
  pair("Paiement", r.payment);
  if (r.customer) pair("Client", r.customer);
  sep();
  text("Merci de votre visite !", "center");

  const y = pad + ops.length * lh + (logo ? 110 : 0) + 40;
  c.width = W; c.height = y;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, y);
  ctx.fillStyle = "#000"; ctx.strokeStyle = "#000";
  let cy = pad;
  for (const op of ops) cy = op(cy);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

export async function shareReceipt(shop: Shop, r: Receipt) {
  const blob = await receiptBlob(shop, r);
  const file = new File([blob], `recu-${r.number}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: `Reçu ${shop.shop_name}` }); return; } catch { /* fallback */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
