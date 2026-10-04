type Order = { id: string; created_at: string; customer_name: string; customer_phone: string; items: string; amount: number; delivery_zone: string; delivery_fee: number; order_items: unknown };
type Shop = { name?: string; shop_name?: string; slogan?: string; contact?: string; address?: string } | null | undefined;

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} FCFA`;

export function buildOrderReceipt(o: Order, shop: Shop) {
  const name = shop?.shop_name || shop?.name || "Ma boutique";
  const total = Number(o.amount) + Number(o.delivery_fee);
  const lines = [
    `*${name.toUpperCase()}*`,
    shop?.slogan ? `_${shop.slogan}_` : "",
    "",
    `🧾 *Reçu de commande* N° ${o.id.slice(0, 8).toUpperCase()}`,
    `Date : ${new Date(o.created_at).toLocaleDateString("fr-FR")}`,
    `Client : ${o.customer_name}`,
    "",
    "*Articles*",
    ...o.items.split(/,\s*| — /).filter(Boolean).map((i) => `• ${i}`),
    "",
    `Sous-total articles : ${fcfa(Number(o.amount))}`,
    `Livraison${o.delivery_zone ? ` (${o.delivery_zone})` : ""} : ${fcfa(Number(o.delivery_fee))}`,
    `*TOTAL À PAYER : ${fcfa(total)}*`,
    "",
    shop?.contact ? `📞 ${shop.contact}` : "",
    shop?.address ? `📍 ${shop.address}` : "",
    "Merci pour votre confiance ! 🙏",
  ];
  return lines.filter((l, i, a) => l !== "" || (a[i - 1] ?? "") !== "").join("\n").trim();
}

export function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

type QuickOrder = { id: string; customer_name: string; items: string; amount: number; delivery_fee: number; delivery_zone: string };
export type OrderMsgKind = "confirm" | "delivering" | "deposit";
export const ORDER_MSG_LABELS: Record<OrderMsgKind, string> = { confirm: "Confirmer la commande", delivering: "Livraison en route", deposit: "Rappel d'acompte" };

export function buildOrderMessage(kind: OrderMsgKind, o: QuickOrder, shop: Shop) {
  const name = shop?.shop_name || shop?.name || "notre boutique";
  const ref = o.id.slice(0, 8).toUpperCase();
  const total = fcfa(Number(o.amount) + Number(o.delivery_fee));
  const sign = `\n\n${name}${shop?.contact ? ` · ${shop.contact}` : ""}`;
  if (kind === "confirm") return `Bonjour ${o.customer_name}, merci pour votre commande N° ${ref} chez *${name}* ✅\nArticles : ${o.items}\nTotal à payer : *${total}*${o.delivery_zone ? ` (livraison ${o.delivery_zone} incluse)` : ""}.\nNous vous tiendrons informé(e) de la livraison.${sign}`;
  if (kind === "delivering") return `Bonjour ${o.customer_name}, bonne nouvelle 🚚 Votre commande N° ${ref} est en route${o.delivery_zone ? ` vers ${o.delivery_zone}` : ""} !\nMerci de garder votre téléphone à portée et de prévoir *${total}* à la réception.${sign}`;
  return `Bonjour ${o.customer_name}, votre commande N° ${ref} (${o.items}) est réservée chez *${name}*.\nPour lancer sa préparation, merci de verser l'acompte convenu. Total de la commande : *${total}*.\nN'hésitez pas à nous écrire pour toute question.${sign}`;
}

export function buildDebtReminder(customer: string, owed: number, shop: Shop) {
  const name = shop?.shop_name || shop?.name || "notre boutique";
  return `Bonjour ${customer},\n\nNous vous rappelons qu'il reste un solde de *${fcfa(owed)}* à régler auprès de *${name}*.\nMerci de bien vouloir effectuer ce paiement dans les meilleurs délais, en totalité ou en partie. Sans nouvelles de votre part, nous serons contraints de suspendre les ventes à crédit.\n\nMerci de votre compréhension.${shop?.contact ? `\n📞 ${shop.contact}` : ""}`;
}
