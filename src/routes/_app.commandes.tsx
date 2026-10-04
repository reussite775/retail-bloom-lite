import { isNetworkError, queueOp } from "@/lib/offline";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Copy, Crown, MessageCircle, Plus, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { membershipQuery, productsQuery, profileQuery, zonesQuery } from "@/lib/data";
import { buildOrderMessage, buildOrderReceipt, ORDER_MSG_LABELS, waLink, type OrderMsgKind } from "@/lib/order-receipt";
import { hasPremium } from "@/lib/plans";
import type { TablesUpdate } from "@/integrations/supabase/types";
type Patch = TablesUpdate<"online_orders">;

export const Route = createFileRoute("/_app/commandes")({
  head: () => ({
    meta: [
      { title: "Commandes en ligne & livreurs — Boutik" },
      { name: "description", content: "Gérez vos commandes WhatsApp, TikTok et Instagram et suivez l'argent encaissé par vos livreurs." },
      { property: "og:title", content: "Commandes en ligne & livreurs — Boutik" },
      { property: "og:description", content: "Commandes digitales et suivi Cash Delivery des livreurs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Orders,
});

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const CHANNELS = { whatsapp: "WhatsApp", tiktok: "TikTok", instagram: "Instagram" } as const;
const STATUS = {
  awaiting_deposit: { label: "En attente d'acompte", cls: "bg-warning/25 text-warning-foreground" },
  ready: { label: "Prêt à livrer", cls: "bg-primary-soft text-accent-foreground" },
  delivering: { label: "En cours de livraison", cls: "bg-secondary text-secondary-foreground" },
  delivered: { label: "Livré", cls: "bg-primary text-primary-foreground" },
  cancelled: { label: "Annulé", cls: "bg-muted text-muted-foreground line-through" },
} as const;
type Status = keyof typeof STATUS;
type Channel = keyof typeof CHANNELS;

const orderSchema = z.object({
  customer_name: z.string().trim().min(1, "Nom du client obligatoire").max(100),
  customer_phone: z.string().trim().max(30),
  channel: z.enum(["whatsapp", "tiktok", "instagram"]),
  items: z.string().trim().min(1, "Ajoutez au moins un article").max(500),
  amount: z.coerce.number().positive("Montant invalide").max(100000000),
});

const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";

function Orders() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const qc = useQueryClient();
  const member = useQuery(membershipQuery(uid));
  const shopId = member.data?.shopId ?? uid;
  const isAdmin = member.data?.isAdmin ?? false;
  const { data: p } = useQuery(profileQuery(shopId));
  const premium = hasPremium(p);

  const orders = useQuery({
    queryKey: ["online_orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("online_orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const couriers = useQuery({
    queryKey: ["couriers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("couriers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["online_orders"] }); qc.invalidateQueries({ queryKey: ["couriers"] }); qc.invalidateQueries({ queryKey: ["products"] }); };
  const onError = (e: Error) => toast.error(e.message);

  const [form, setForm] = useState({ customer_name: "", customer_phone: "", channel: "whatsapp" as Channel, items: "", amount: "", zone: "" });
  const [showForm, setShowForm] = useState(false);
  const products = useQuery(productsQuery);
  const zones = useQuery(zonesQuery);
  const zone = zones.data?.find((z) => z.id === form.zone);
  const fee = zone ? Number(zone.fee) : 0;
  const [lines, setLines] = useState<{ product_id: string; quantity: number }[]>([]);
  const [pick, setPick] = useState({ product_id: "", quantity: "1" });
  const pname = (id: string) => products.data?.find((x) => x.id === id)?.name ?? "?";
  const addLine = () => {
    const q = Math.floor(Number(pick.quantity));
    if (!pick.product_id || !(q > 0)) { toast.error("Choisissez un produit et une quantité"); return; }
    const next = [...lines.filter((l) => l.product_id !== pick.product_id), { product_id: pick.product_id, quantity: (lines.find((l) => l.product_id === pick.product_id)?.quantity ?? 0) + q }];
    setLines(next);
    const total = next.reduce((a, l) => a + l.quantity * Number(products.data?.find((x) => x.id === l.product_id)?.sale_price ?? 0), 0);
    setForm((f) => ({ ...f, amount: String(total) }));
    setPick({ product_id: "", quantity: "1" });
  };
  const [filter, setFilter] = useState<Status | "all">("all");

  const addOrder = useMutation({
    mutationFn: async () => {
      const auto = lines.map((l) => `${l.quantity} × ${pname(l.product_id)}`).join(", ");
      const r = orderSchema.safeParse({ ...form, items: [auto, form.items.trim()].filter(Boolean).join(" — ") });
      if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Champs invalides");
      const row = { ...r.data, order_items: lines, delivery_zone: zone?.name ?? "", delivery_fee: fee };
      if (!navigator.onLine) { queueOp("order_insert", row, "Commande"); return true; }
      const { error } = await supabase.from("online_orders").insert(row);
      if (error && isNetworkError(error)) { queueOp("order_insert", row, "Commande"); return true; }
      if (error) throw error;
      return false;
    },
    onSuccess: (queued) => { toast.success(queued === true ? "Hors ligne : commande enregistrée sur l'appareil, envoi au retour du réseau" : "Commande ajoutée"); setForm({ customer_name: "", customer_phone: "", channel: "whatsapp", items: "", amount: "", zone: "" }); setLines([]); setShowForm(false); refresh(); },
    onError,
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Patch }) => {
      const { error } = await supabase.from("online_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError,
  });

  const [courier, setCourier] = useState({ name: "", phone: "" });
  const addCourier = useMutation({
    mutationFn: async () => {
      const name = courier.name.trim();
      if (!name || name.length > 100) throw new Error("Nom du livreur invalide");
      const { error } = await supabase.from("couriers").insert({ name, phone: courier.phone.trim().slice(0, 30) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Livreur ajouté"); setCourier({ name: "", phone: "" }); refresh(); },
    onError,
  });

  const remit = useMutation({
    mutationFn: async (courierId: string) => {
      const { error } = await supabase.from("online_orders").update({ remitted_at: new Date().toISOString() })
        .eq("courier_id", courierId).eq("status", "delivered").is("remitted_at", null);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Reversement enregistré"); refresh(); },
    onError,
  });

  const list = orders.data ?? [];
  const shown = filter === "all" ? list : list.filter((o) => o.status === filter);
  const courierStats = useMemo(() => (couriers.data ?? []).map((c) => {
    const mine = list.filter((o) => o.courier_id === c.id);
    const due = mine.filter((o) => o.status === "delivered" && !o.remitted_at).reduce((a, o) => a + Number(o.cash_collected), 0);
    const remitted = mine.filter((o) => o.remitted_at).reduce((a, o) => a + Number(o.cash_collected), 0);
    return { ...c, active: mine.filter((o) => o.status === "delivering").length, delivered: mine.filter((o) => o.status === "delivered").length, due, remitted };
  }), [couriers.data, list]);
  const totalDue = courierStats.reduce((a, c) => a + c.due, 0);

  if (p && !premium) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary"><Crown className="h-7 w-7" /></div>
        <h1 className="mt-4 text-2xl font-bold">Module réservé à Premium</h1>
        <p className="mt-2 text-muted-foreground">La gestion des commandes en ligne et le suivi des livreurs font partie de l'offre Premium.</p>
        {isAdmin && <Button asChild className="mt-6"><Link to="/abonnement">Passer à Premium</Link></Button>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Commandes en ligne</h1>
          <p className="text-muted-foreground">WhatsApp, TikTok, Instagram — et l'argent encaissé par vos livreurs.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> Nouvelle commande</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Commandes à traiter" value={String(list.filter((o) => o.status === "awaiting_deposit" || o.status === "ready").length)} />
        <Stat label="En livraison" value={String(list.filter((o) => o.status === "delivering").length)} />
        <Stat label="À reverser par les livreurs" value={fcfa(totalDue)} />
      </div>

      {showForm && (
        <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <Input placeholder="Nom du client" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          <Input placeholder="Téléphone (facultatif)" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
          <select className={selectCls + " h-10"} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })}>
            {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <Input type="number" placeholder="Montant des articles (FCFA)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className={selectCls + " h-10"} value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>
            <option value="">— Zone de livraison (sans frais) —</option>
            {(zones.data ?? []).map((z) => <option key={z.id} value={z.id}>{z.name} — {fcfa(Number(z.fee))}</option>)}
          </select>
          <div className="flex items-center justify-end rounded-md bg-muted px-3 text-sm">
            Total client : <strong className="ml-1">{fcfa((Number(form.amount) || 0) + fee)}</strong>
          </div>
          {isAdmin && (zones.data ?? []).length === 0 && <p className="text-xs text-muted-foreground sm:col-span-2">Ajoutez vos zones et tarifs de livraison dans <Link to="/parametres" className="text-primary underline">Paramètres</Link>.</p>}
          <div className="space-y-2 sm:col-span-2">
            <div className="text-sm font-medium">Articles du stock (retirés du stock à la livraison)</div>
            <div className="flex flex-wrap gap-2">
              <select className={selectCls + " h-10 flex-1"} value={pick.product_id} onChange={(e) => setPick({ ...pick, product_id: e.target.value })}>
                <option value="">— Choisir un produit —</option>
                {(products.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.stock} en stock)</option>)}
              </select>
              <Input type="number" min={1} className="w-24" value={pick.quantity} onChange={(e) => setPick({ ...pick, quantity: e.target.value })} />
              <Button type="button" variant="outline" onClick={addLine}>Ajouter</Button>
            </div>
            {lines.map((l) => (
              <div key={l.product_id} className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-sm">
                <span>{l.quantity} × {pname(l.product_id)}</span>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setLines(lines.filter((x) => x.product_id !== l.product_id))}>Retirer</button>
              </div>
            ))}
          </div>
          <Input className="sm:col-span-2" placeholder="Autres articles ou précisions (facultatif)" value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} />
          <Button className="sm:col-span-2" disabled={addOrder.isPending} onClick={() => addOrder.mutate()}>Enregistrer la commande</Button>
        </div>
      )}

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Commandes</TabsTrigger>
          <TabsTrigger value="couriers">Livreurs / Cash Delivery</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["all", ...Object.keys(STATUS)] as (Status | "all")[]).map((s) => (
              <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
                {s === "all" ? "Toutes" : STATUS[s].label}
              </Button>
            ))}
          </div>
          {shown.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">Aucune commande pour l'instant.</p>}
          {shown.map((o) => (
            <div key={o.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{o.customer_name} <span className="text-sm font-normal text-muted-foreground">· {CHANNELS[o.channel as Channel]}{o.customer_phone ? ` · ${o.customer_phone}` : ""}</span></div>
                  <div className="text-sm text-muted-foreground">{o.items}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-bold">{fcfa(Number(o.amount) + Number(o.delivery_fee))}</div>
                  {Number(o.delivery_fee) > 0 && <div className="text-xs text-muted-foreground">dont livraison {o.delivery_zone} {fcfa(Number(o.delivery_fee))}</div>}
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[o.status as Status].cls}`}>{STATUS[o.status as Status].label}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select className={selectCls} value={o.status} onChange={(e) => {
                  const status = e.target.value as Status;
                  const patch: Patch = { status };
                  if (status === "delivered" && o.courier_id && Number(o.cash_collected) === 0) patch.cash_collected = Number(o.amount) + Number(o.delivery_fee);
                  updateOrder.mutate({ id: o.id, patch });
                }}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select className={selectCls} value={o.courier_id ?? ""} onChange={(e) => updateOrder.mutate({ id: o.id, patch: { courier_id: e.target.value || null } })}>
                  <option value="">— Aucun livreur —</option>
                  {(couriers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {o.courier_id && (
                  <label className="flex items-center gap-1">
                    Encaissé :
                    <Input type="number" className="h-9 w-32" defaultValue={Number(o.cash_collected)} disabled={!!o.remitted_at}
                      onBlur={(e) => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== Number(o.cash_collected)) updateOrder.mutate({ id: o.id, patch: { cash_collected: v } }); }} />
                  </label>
                )}
                {o.customer_phone && (["confirm", "delivering", "deposit"] as OrderMsgKind[]).map((k) => (
                  <Button key={k} size="sm" variant="secondary" asChild>
                    <a href={waLink(o.customer_phone, buildOrderMessage(k, o, p))} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> {ORDER_MSG_LABELS[k]}</a>
                  </Button>
                ))}
                <Button size="sm" asChild>
                  <a href={waLink(o.customer_phone, buildOrderReceipt(o, p))} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Partager sur WhatsApp</a>
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try { await navigator.clipboard.writeText(buildOrderReceipt(o, p)); toast.success("Reçu copié"); } catch { toast.error("Copie impossible"); }
                }}><Copy className="h-4 w-4" /> Copier le reçu</Button>
                {o.remitted_at && <span className="text-xs font-medium text-primary">Reversé le {new Date(o.remitted_at).toLocaleDateString("fr-FR")}</span>}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="couriers" className="space-y-3">
          <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
            <Input className="max-w-xs" placeholder="Nom du livreur" value={courier.name} onChange={(e) => setCourier({ ...courier, name: e.target.value })} />
            <Input className="max-w-xs" placeholder="Téléphone" value={courier.phone} onChange={(e) => setCourier({ ...courier, phone: e.target.value })} />
            <Button disabled={addCourier.isPending} onClick={() => addCourier.mutate()}><Truck className="h-4 w-4" /> Ajouter un livreur</Button>
          </div>
          {courierStats.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">Aucun livreur enregistré.</p>}
          {courierStats.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div>
                <div className="font-semibold">{c.name} {c.phone && <span className="text-sm font-normal text-muted-foreground">· {c.phone}</span>}</div>
                <div className="text-sm text-muted-foreground">{c.active} en cours · {c.delivered} livrée(s) · déjà reversé {fcfa(c.remitted)}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">À reverser</div>
                  <div className="font-display text-lg font-bold">{fcfa(c.due)}</div>
                </div>
                <Button size="sm" variant="outline" disabled={c.due === 0 || remit.isPending} onClick={() => remit.mutate(c.id)}><Wallet className="h-4 w-4" /> Marquer reversé</Button>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-extrabold">{value}</div>
    </div>
  );
}
