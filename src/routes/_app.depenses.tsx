import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { expensesQuery } from "@/lib/data";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_app/depenses")({
  head: () => ({
    meta: [
      { title: "Dépenses — Boutik" },
      { name: "description", content: "Notez les dépenses de la boutique et suivez votre bénéfice net." },
      { property: "og:title", content: "Dépenses — Boutik" },
      { property: "og:description", content: "Notez les dépenses de la boutique et suivez votre bénéfice net." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Expenses,
});

const CATEGORIES = ["Loyer", "Électricité / Eau", "Salaires", "Transport", "Achat marchandises", "Autre"];
const today = () => new Date().toISOString().slice(0, 10);

function Expenses() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery(expensesQuery);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthProfit = useQuery({
    queryKey: ["sales", "month-profit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("profit").gte("created_at", monthStart.toISOString());
      if (error) throw error;
      return data.reduce((a, s) => a + Number(s.profit), 0);
    },
  });
  const [f, setF] = useState({ label: "", category: "Autre", amount: "", spent_on: today() });

  const add = useMutation({
    mutationFn: async () => {
      const amount = Number(f.amount);
      if (!f.label.trim()) throw new Error("Indiquez un libellé");
      if (!(amount > 0)) throw new Error("Montant invalide");
      const { error } = await supabase.from("expenses").insert({ label: f.label.trim().slice(0, 120), category: f.category, amount, spent_on: f.spent_on });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Dépense enregistrée"); setF({ label: "", category: "Autre", amount: "", spent_on: today() }); qc.invalidateQueries({ queryKey: ["expenses"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("expenses").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Dépense supprimée"); qc.invalidateQueries({ queryKey: ["expenses"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const monthKey = today().slice(0, 7);
  const monthTotal = data.filter((e) => e.spent_on.startsWith(monthKey)).reduce((a, e) => a + Number(e.amount), 0);
  const gross = monthProfit.data ?? 0;
  const net = gross - monthTotal;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold">Dépenses</h1>
        <p className="text-muted-foreground">Loyer, salaires, transport… pour connaître votre vrai bénéfice.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Bénéfice sur ventes (ce mois)" value={money(gross)} icon={TrendingUp} />
        <Stat label="Dépenses (ce mois)" value={money(monthTotal)} icon={Wallet} />
        <Stat label="Bénéfice net (ce mois)" value={money(net)} icon={net >= 0 ? TrendingUp : TrendingDown} strong negative={net < 0} />
      </div>
      <form className="grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-[2fr_1.3fr_1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <div className="space-y-1"><Label>Libellé</Label><Input value={f.label} maxLength={120} placeholder="Ex : loyer d'octobre" onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div className="space-y-1"><Label>Catégorie</Label>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select></div>
        <div className="space-y-1"><Label>Montant</Label><Input type="number" min="1" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={f.spent_on} onChange={(e) => setF({ ...f, spent_on: e.target.value })} /></div>
        <Button type="submit" disabled={add.isPending}><Plus className="h-4 w-4" /> Ajouter</Button>
      </form>
      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading && <p className="p-8 text-center text-muted-foreground">Chargement…</p>}
        {!isLoading && data.length === 0 && <p className="p-8 text-center text-muted-foreground">Aucune dépense enregistrée.</p>}
        <ul className="divide-y">
          {data.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{e.label}</p>
                <p className="text-sm text-muted-foreground">{e.category} · {new Date(e.spent_on).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-semibold tabular">{money(e.amount)}</span>
                <Button size="icon" variant="ghost" aria-label="Supprimer" onClick={() => { if (confirm("Supprimer cette dépense ?")) del.mutate(e.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, strong, negative }: { label: string; value: string; icon: typeof Wallet; strong?: boolean; negative?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${strong ? (negative ? "border-destructive bg-destructive/10" : "border-primary bg-primary text-primary-foreground") : "bg-card"}`}>
      <div className="flex items-center justify-between"><p className={`text-sm font-medium ${strong ? "" : "text-muted-foreground"}`}>{label}</p><Icon className="h-5 w-5 opacity-80" /></div>
      <p className="mt-3 font-display text-2xl font-extrabold tabular">{value}</p>
    </div>
  );
}
