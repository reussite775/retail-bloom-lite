import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { movementInput } from "@/lib/physical-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
const names: Record<string,string> = { initial: "Stock initial", in: "Entrée", out: "Sortie", adjustment: "Ajustement", loss: "Perte", damage: "Casse / endommagé", sale: "Vente", return: "Retour", inventory: "Inventaire", order: "Commande" };
export function CatalogMovements({ product, variants, shop, onClose }: { product: Tables<"products">; variants: Tables<"product_variants">[]; shop: string; onClose: () => void }) {
  const qc = useQueryClient();
  const all = variants.filter((v) => v.product_id === product.id);
  const [variant, setVariant] = useState("");
  const [kind,setKind] = useState("in");
  const [qty,setQty] = useState("");
  const [reason,setReason] = useState("");
  const [page,setPage] = useState(0);
  const history = useQuery({ queryKey: ["stock-movements",shop,product.id,page], queryFn: async () => {
    const { data,error } = await supabase.from("stock_movements").select("*").eq("organization_id",shop).eq("product_id",product.id).order("created_at",{ ascending: false }).range(page*30,page*30+29);
    if (error) throw error; return data;
  }});
  const save = useMutation({ mutationFn: async () => {
    if (!navigator.onLine) throw new Error("Une connexion est nécessaire pour valider le mouvement");
    const { quantity, reason: cleanReason } = movementInput(kind, qty, reason, all.length > 0, variant);
    // Generated RPC types omit PostgreSQL nullable parameters; keep the actual null on the wire.
    const { error } = await supabase.rpc("record_stock_movement", { _product: product.id, _variant: (variant || null) as unknown as string, _kind: kind, _quantity: quantity, _reason: cleanReason });
    if (error) throw error;
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["catalog-options",shop] }); qc.invalidateQueries({ queryKey: ["stock-movements",shop,product.id] }); setQty(""); setReason(""); setPage(0); toast.success("Mouvement enregistré"); }, onError: (e:Error) => toast.error(e.message) });
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined}>
    <DialogHeader><DialogTitle>Stock — {product.name}</DialogTitle></DialogHeader>
    <form className="space-y-3 border-b pb-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      {all.length > 0 && <div className="space-y-1.5"><Label htmlFor="movement-variant">Variante</Label><select id="movement-variant" required value={variant} onChange={(e) => setVariant(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Choisir une variante</option>{all.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.stock} {product.unit}</option>)}</select></div>}
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="movement-kind">Opération</Label><select id="movement-kind" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>{['in','out','adjustment','loss','damage'].map((k) => <option key={k} value={k}>{names[k]}</option>)}</select></div><div className="space-y-1.5"><Label htmlFor="movement-qty">{kind === 'adjustment' ? 'Stock final' : 'Quantité'}</Label><Input id="movement-qty" type="number" required min={kind === 'adjustment' ? 0 : 1} step="1" value={qty} onChange={(e) => setQty(e.target.value)} /></div></div>
      <div className="space-y-1.5"><Label htmlFor="movement-reason">Motif</Label><Input id="movement-reason" required value={reason} onChange={(e) => setReason(e.target.value)} /></div><Button type="submit" disabled={save.isPending}><ArrowDownUp className="h-4 w-4" />{save.isPending ? "Enregistrement…" : "Valider le mouvement"}</Button>
    </form>
    <h3 className="font-semibold">Historique des mouvements</h3>
    {history.isError ? <div role="alert" className="text-sm text-destructive">Impossible de charger l’historique.<Button variant="link" onClick={() => history.refetch()}>Réessayer</Button></div> : history.isLoading ? <p className="text-muted-foreground">Chargement…</p> : <div className="divide-y">{history.data?.map((m) => <div key={m.id} className="flex gap-4 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{names[m.kind] ?? m.kind} · {m.item_name}</p><p className="break-words text-sm text-muted-foreground">{m.reason || 'Sans motif'}</p><p className="break-all text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString('fr-FR')} · Utilisateur {m.user_id ?? 'Système'}</p></div><div className="shrink-0 text-right"><b className={m.quantity < 0 ? "text-destructive" : "text-primary"}>{m.quantity > 0 ? '+' : ''}{m.quantity}</b><p className="text-xs text-muted-foreground">Stock : {m.stock_after}</p></div></div>)}{!history.data?.length && <p className="py-5 text-center text-muted-foreground">Aucun mouvement enregistré</p>}</div>}
    <div className="flex justify-between"><Button variant="outline" disabled={!page} onClick={() => setPage(page-1)}>Précédent</Button><Button variant="outline" disabled={history.data?.length !== 30} onClick={() => setPage(page+1)}>Suivant</Button></div>
  </DialogContent></Dialog>;
}
