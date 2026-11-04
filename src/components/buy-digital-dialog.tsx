import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { startDigitalOrder } from "@/lib/digital-orders.functions";

export function BuyDigitalDialog({ open, onOpenChange, product, title, price }: {
  open: boolean; onOpenChange: (v: boolean) => void; product: string; title: string; price: number;
}) {
  const start = useServerFn(startDigitalOrder);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await start({ data: { product, name, phone, email } });
      window.location.href = r.paymentUrl;
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Le paiement n'a pas pu démarrer.";
      try { const parsed = JSON.parse(msg); if (Array.isArray(parsed) && parsed[0]?.message) msg = parsed[0].message; } catch { /* message lisible */ }
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Finaliser l'achat</DialogTitle>
          <DialogDescription>{title} · <span className="font-semibold text-primary">{money(price)}</span></DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="buyer-name">Nom complet</Label>
            <Input id="buyer-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buyer-phone">Téléphone (WhatsApp)</Label>
            <Input id="buyer-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+229 01 00 00 00 00" autoComplete="tel" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buyer-email">E-mail (facultatif)</Label>
            <Input id="buyer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" />
          </div>
          {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {busy ? "Redirection vers BkaPay…" : `Payer ${money(price)}`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Vous serez redirigé vers BkaPay. Après le paiement, une page de suivi confirme votre achat.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}