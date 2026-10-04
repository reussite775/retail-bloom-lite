import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { teamQuery } from "@/lib/data";
import { createEmployee, deleteEmployee } from "@/lib/team.functions";

export const Route = createFileRoute("/_app/equipe")({
  head: () => ({
    meta: [
      { title: "Équipe & accès — Boutik" },
      { name: "description", content: "Ajoutez vos caissiers et vendeurs et gérez leurs accès." },
      { property: "og:title", content: "Équipe & accès — Boutik" },
      { property: "og:description", content: "Ajoutez vos caissiers et vendeurs et gérez leurs accès." },
    ],
  }),
  component: Team,
});

function Team() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery(teamQuery(session!.user.id));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const create = useServerFn(createEmployee);
  const del = useServerFn(deleteEmployee);

  const add = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => { toast.success("Employé ajouté"); setOpen(false); setForm({ name: "", email: "", password: "" }); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (e: Error) => toast.error(e.message.startsWith("[") ? "Vérifiez les informations saisies" : e.message),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => del({ data: { userId } }),
    onSuccess: () => { toast.success("Accès supprimé"); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Équipe & accès</h1>
          <p className="text-muted-foreground">Vos employés se connectent avec leur propre email et mot de passe.</p>
        </div>
        <Button onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Ajouter un employé</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4 text-primary" /> Administrateur</p>
          <p className="mt-1 text-sm text-muted-foreground">Accès total : tableau de bord, stocks, historique, crédits, paramètres, abonnement, équipe.</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 font-bold"><Users className="h-4 w-4 text-primary" /> Caissier / Vendeur</p>
          <p className="mt-1 text-sm text-muted-foreground">Caisse et carnet de crédits uniquement. Ne voit ni le chiffre d'affaires global, ni les bénéfices, ni les paramètres.</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <ul className="divide-y">
          <li className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="truncate font-semibold">{session!.user.email}</p><p className="text-sm text-muted-foreground">Vous</p></div>
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-accent-foreground">Administrateur</span>
          </li>
          {isLoading && <li className="p-6 text-center text-muted-foreground">Chargement…</li>}
          {data.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0"><p className="truncate font-semibold">{m.display_name || m.email}</p><p className="truncate text-sm text-muted-foreground">{m.email}</p></div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">Caissier</span>
                <Button size="icon" variant="ghost" aria-label="Supprimer" disabled={remove.isPending}
                  onClick={() => confirm(`Supprimer l'accès de ${m.display_name || m.email} ?`) && remove.mutate(m.user_id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvel employé (caissier / vendeur)</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            <div className="space-y-1.5"><Label>Nom</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Mot de passe (6 caractères min.)</Label><Input required minLength={6} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Communiquez ces identifiants à votre employé. Il pourra se connecter immédiatement.</p>
            <Button type="submit" className="w-full" disabled={add.isPending}>{add.isPending ? "Création…" : "Créer l'accès"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
