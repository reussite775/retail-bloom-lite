// TEMPORARY — BkaPay 500 FCFA test block, visible to super admin only. Delete after the test.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isTestPaymentAllowed, startTestCheckout } from "@/lib/payments-test.functions";

export function BkapayTestBlock() {
  const check = useServerFn(isTestPaymentAllowed);
  const start = useServerFn(startTestCheckout);
  const { data } = useQuery({ queryKey: ["bkapay-test-allowed"], queryFn: () => check(), staleTime: Infinity });
  const pay = useMutation({
    mutationFn: () => start(),
    onSuccess: (r) => { window.location.href = r.paymentUrl; },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data?.allowed) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-dashed bg-muted p-6">
      <p className="font-bold">Test BkaPay (visible uniquement par vous)</p>
      <p className="text-sm text-muted-foreground">Standard · 14 jours · 500 FCFA. Activation uniquement après confirmation officielle de BkaPay.</p>
      <Button className="h-12 w-full" disabled={pay.isPending} onClick={() => pay.mutate()}>
        {pay.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Payer 500 FCFA (test)"}
      </Button>
    </div>
  );
}
