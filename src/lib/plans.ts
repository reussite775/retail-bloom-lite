export type PlanId = "standard" | "premium";
export type Billing = "month" | "quarter";

export const PLANS: Record<PlanId, { name: string; prices: Record<Billing, number>; perks: string[]; extraTitle?: string }> = {
  standard: {
    name: "Standard",
    prices: { month: 3000, quarter: 5000 },
    perks: ["Caisse rapide", "Gestion des stocks", "Carnet de crédits", "Reçus personnalisés", "Historique des ventes"],
  },
  premium: {
    name: "Premium",
    prices: { month: 5000, quarter: 12000 },
    extraTitle: "Tout le contenu Standard, plus :",
    perks: ["Gestion multi-utilisateurs (caissiers)", "Alertes de stock avancées", "Rapports statistiques détaillés"],
  },
};
export const BILLING_LABEL: Record<Billing, string> = { month: "1 mois", quarter: "3 mois" };
export const BILLING_MONTHS: Record<Billing, number> = { month: 1, quarter: 3 };

/** Premium features are available during the free trial or with an active Premium plan. */
export function hasPremium(o: { plan?: string | null; trial_ends_at: string; subscription_active: boolean; subscription_ends_at: string | null } | null | undefined) {
  if (!o) return false;
  const now = Date.now();
  const active = o.subscription_active && (!o.subscription_ends_at || new Date(o.subscription_ends_at).getTime() > now);
  if (active) return o.plan === "premium";
  return new Date(o.trial_ends_at).getTime() > now;
}
