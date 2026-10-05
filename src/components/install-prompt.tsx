import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "gestipro-install-dismissed";
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
    if (standalone || localStorage.getItem(KEY)) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setShow(true);
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  const close = () => { localStorage.setItem(KEY, "1"); setShow(false); };
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    close();
  };

  if (!show) return null;
  return (
    <div className="relative flex items-start gap-4 rounded-2xl border border-primary/30 bg-primary-soft p-4 shadow-sm">
      <img src="/icon-192.png" alt="GestiPro" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-1 pr-6">
        <p className="font-display font-bold">Ajoutez GestiPro à votre écran d'accueil</p>
        <p className="text-sm text-muted-foreground">
          {evt ? "Ouvrez votre boutique en un geste, comme une vraie application, même sans connexion."
            : ios ? <>Touchez <Share className="inline h-4 w-4" /> Partager, puis « Sur l'écran d'accueil ».</>
            : "Dans le menu de votre navigateur (⋮), choisissez « Ajouter à l'écran d'accueil » ou « Installer l'application »."}
        </p>
        {evt && <Button size="sm" className="mt-2" onClick={install}><Download className="h-4 w-4" /> Ajouter l'application</Button>}
      </div>
      <button onClick={close} aria-label="Fermer" className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}
