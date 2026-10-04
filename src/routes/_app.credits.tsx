import { isNetworkError, queueOp } from "@/lib/offline";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HandCoins, Phone, Plus, Search } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { customersQuery } from "@/lib/data";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_app/credits")({
  head: () => ({
    meta: [
      { title: "Carnet de crédits — Boutik" },
      { name: "description", content: "Suivez les dettes de vos clients et enregistrez les remboursements." },
      { property: "og:title", content: "Carnet de crédits — Boutik" },
      { property: "og:description", content: "Suivez les dettes de vos clients et enregistrez les remboursements." },
    ],
  }),
  component: Credits,
});

const dt = (s: string) => new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

function Credits() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery(customersQuery);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", items: "", amount: "" });
  const addDebt = useMutation({
    mutationFn: async () => {
      const v = z.object({
        name: z.string().trim().min(1, "Indiquez le nom du client").max(100),
        phone: z.string().trim().max(30).regex(/^[+\d\s-]*$/, "Téléphone invalide"),
        items: z.string().trim().min(1, "Indiquez les articles concernés").max(500),
        amount: z.coerce.number().positive("Montant invalide").max(100_000_000),
      }).parse(form);
      const args = { _name: v.name, _phone: v.phone, _items: v.items, _amount: v.amount };
      if (!navigator.onLine) { queueOp("manual_debt", args, "Dette", v.amount); return { ...v, queued: true }; }
      const { error } = await supabase.rpc("add_manual_debt", args);
      if (error && isNetworkError(error)) { queueOp("manual_debt", args, "Dette", v.amount); return { ...v, queued: true }; }
      if (error) throw error;
      return { ...v, queued: false };
    },
    onSuccess: (v) => {
      toast.success(v.queued ? `Hors ligne : dette de ${money(v.amount)} pour ${v.name} enregistrée sur l'appareil, envoi au retour du réseau` : `Dette de ${money(v.amount)} ajoutée pour ${v.name}`);
      setAddOpen(false); setForm({ name: "", phone: "", items: "", amount: "" });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e instanceof z.ZodError ? (e.issues[0]?.message ?? "Formulaire invalide") : e.message),
  });
  const sel = data.find((c) => c.id === selId) ?? null;

  const pay = useMutation({
    mutationFn: async () => {
      const n = Number(amount);
      if (!sel || !n || n <= 0) throw new Error("Montant invalide");
      const args = { _customer_id: sel.id, _amount: n };
      if (!navigator.onLine) { queueOp("debt_payment", args, "Remboursement", n); return { n, queued: true }; }
      const { error } = await supabase.rpc("record_payment", args);
      if (error && isNetworkError(error)) { queueOp("debt_payment", args, "Remboursement", n); return { n, queued: true }; }
      if (error) throw error;
      return { n, queued: false };
    },
    onSuccess: ({ n, queued }) => { toast.success(queued ? `Hors ligne : remboursement de ${money(n)} enregistré sur l'appareil` : `Remboursement de ${money(n)} enregistré`); setAmount(""); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = data
    .filter((c) => showAll || c.owed > 0)
    .filter((c) => (c.name + c.phone).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.owed - a.owed);
  const totalOwed = data.reduce((s, c) => s + Math.max(0, c.owed), 0);

  const history = sel
    ? [
        ...sel.sales.map((s) => ({ id: s.id, date: s.created_at, label: `Achat à crédit · ${s.items_count} article${s.items_count > 1 ? "s" : ""}`, amount: Number(s.total), kind: "sale" as const })),
        ...sel.payments.map((p) => ({ id: p.id, date: p.created_at, label: "Remboursement", amount: Number(p.amount), kind: "pay" as const })),
      ].sort((a, b) => b.date.localeCompare(a.date))
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Carnet de crédits</h1>
          <p className="text-muted-foreground">Total dû par vos clients : <span className="font-semibold text-destructive tabular">{money(totalOwed)}</span></p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Ajouter une dette</Button>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nom ou téléphone…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Afficher aussi les clients sans dette
      </label>

      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? <p className="p-8 text-center text-muted-foreground">Chargement…</p> : list.length === 0 ? (
          <p className="p-10 text-center text-muted-foreground">Aucune dette en cours. Les ventes à crédit se font depuis la caisse.</p>
        ) : (
          <div className="divide-y">
            {list.map((c) => (
              <button key={c.id} onClick={() => setSelId(c.id)} className="flex w-full items-center gap-4 p-4 text-left hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground"><Phone className="h-3 w-3" /> {c.phone || "—"}</p>
                </div>
                <div className="text-right">
                  <p className={`font-display text-lg font-extrabold tabular ${c.owed > 0 ? "text-destructive" : "text-primary"}`}>{money(c.owed)}</p>
                  <p className="text-xs text-muted-foreground">{c.owed > 0 ? "à payer" : "soldé"}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouvelle dette</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); addDebt.mutate(); }}>
            <div className="space-y-1"><Label htmlFor="d-name">Nom et prénom du client</Label>
              <Input id="d-name" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="space-y-1"><Label htmlFor="d-phone">Téléphone</Label>
              <Input id="d-phone" type="tel" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="d-items">Articles concernés</Label>
              <textarea id="d-items" maxLength={500} rows={3} required className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Ex. : 2 sacs de riz, 1 bidon d'huile" value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="d-amount">Montant total (FCFA)</Label>
              <Input id="d-amount" type="number" min="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Si un client avec ce téléphone existe déjà, la dette s'ajoute à son compte.</p>
            <Button type="submit" className="w-full" disabled={addDebt.isPending}>Enregistrer la dette</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sel} onOpenChange={(o) => { if (!o) { setSelId(null); setAmount(""); } }}>
        <DialogContent className="max-w-lg">
          {sel && (
            <>
              <DialogHeader><DialogTitle>{sel.name}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">{sel.phone || "Pas de téléphone"}</p>
              <div className="rounded-xl bg-muted p-4">
                <p className="text-sm text-muted-foreground">Reste à payer</p>
                <p className="font-display text-3xl font-extrabold tabular">{money(sel.owed)}</p>
              </div>
              {sel.owed > 0 && (
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); pay.mutate(); }}>
                  <Label htmlFor="amt">Enregistrer un remboursement</Label>
                  <div className="flex gap-2">
                    <Input id="amt" type="number" min="1" max={sel.owed} placeholder="Montant" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    <Button type="button" variant="outline" onClick={() => setAmount(String(sel.owed))}>Tout</Button>
                    <Button type="submit" disabled={pay.isPending}><HandCoins className="h-4 w-4" /> Valider</Button>
                  </div>
                </form>
              )}
              <div>
                <p className="mb-2 font-semibold">Historique</p>
                <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                  {history.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Aucune opération.</p>}
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between p-3 text-sm">
                      <div><p className="font-medium">{h.label}</p><p className="text-xs text-muted-foreground">{dt(h.date)}</p></div>
                      <span className={`font-semibold tabular ${h.kind === "sale" ? "text-destructive" : "text-primary"}`}>{h.kind === "sale" ? "+" : "−"}{money(h.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
