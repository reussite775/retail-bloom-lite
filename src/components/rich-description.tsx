import { useEffect, useRef } from "react";
import { Bold, Heading2, Link2, List, Pilcrow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Éditeur de description enrichie minimal : titres, paragraphes, gras, listes, liens.
export function RichDescription({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };

  const addLink = () => {
    const url = window.prompt("Adresse du lien (https://…)");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast.error("Le lien doit commencer par https://"); return; }
    exec("createLink", url);
  };

  const tools = [
    { icon: Heading2, label: "Titre", run: () => exec("formatBlock", "h2") },
    { icon: Pilcrow, label: "Paragraphe", run: () => exec("formatBlock", "p") },
    { icon: Bold, label: "Gras", run: () => exec("bold") },
    { icon: List, label: "Liste", run: () => exec("insertUnorderedList") },
    { icon: Link2, label: "Lien", run: addLink },
  ];

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex flex-wrap gap-1 border-b bg-muted/50 p-1.5">
        {tools.map((t) => (
          <Button key={t.label} type="button" size="sm" variant="ghost" aria-label={t.label} title={t.label} onClick={t.run} className="h-8 px-2">
            <t.icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Description"
        data-placeholder="Décrivez votre produit : contenu, bénéfices, pour qui…"
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        className="min-h-[140px] px-3 py-2 text-sm outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-primary [&_a]:underline [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-1"
      />
    </div>
  );
}
