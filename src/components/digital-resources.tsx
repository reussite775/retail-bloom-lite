import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, FileUp, Link2, Pencil, RefreshCw, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { FORMAT_LABELS, formatSize, reorderUpdates, resourceFormat, resourcePath, validateLink, validateUpload } from "@/lib/digital-content";

export type Resource = Tables<"digital_resources">;

// Files live in the private "digital-files" bucket under <shop>/<product>/; RLS restricts rows and files to the shop.
export const contentKey = (productId: string) => ["digital_content", productId];

async function removeFiles(paths: (string | null | undefined)[]) {
  const list = paths.filter(Boolean) as string[];
  if (list.length) await supabase.storage.from("digital-files").remove(list);
}

export function ResourceList({ shopId, productId, lessonId, resources, title }: { shopId: string; productId: string; lessonId: string | null; resources: Resource[]; title: string }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: contentKey(productId) });
  const [adding, setAdding] = useState<null | "file" | "link">(null);
  const [draft, setDraft] = useState({ name: "", description: "", url: "", role: "main" as "main" | "bonus" });
  const [file, setFile] = useState<File | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", description: "", url: "", role: "main" as "main" | "bonus" });
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<Resource | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const base = { organization_id: shopId, product_id: productId, lesson_id: lessonId, role: draft.role, description: draft.description.trim().slice(0, 1000), position: resources.length };
      if (adding === "link") {
        const err = validateLink(draft.url); if (err) throw new Error(err);
        const { error } = await supabase.from("digital_resources").insert({ ...base, kind: "link", url: draft.url.trim(), name: (draft.name.trim() || draft.url.trim()).slice(0, 200) });
        if (error) throw error;
        return;
      }
      if (!file) throw new Error("Choisissez un fichier");
      const err = validateUpload(file); if (err) throw new Error(err);
      const path = resourcePath(shopId, productId, file.name);
      const up = await supabase.storage.from("digital-files").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (up.error) throw new Error("Téléversement impossible : " + up.error.message);
      const { error } = await supabase.from("digital_resources").insert({ ...base, kind: "file", file_path: path, file_name: file.name.slice(0, 200), mime_type: file.type || null, size_bytes: file.size, name: (draft.name.trim() || file.name).slice(0, 200) });
      if (error) { await removeFiles([path]); throw error; }
    },
    onSuccess: () => { setAdding(null); setFile(null); setDraft({ name: "", description: "", url: "", role: "main" }); refresh(); toast.success("Ressource ajoutée"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (r: Resource) => {
      const patch: Partial<Resource> = { name: edit.name.trim().slice(0, 200), description: edit.description.trim().slice(0, 1000), role: edit.role };
      if (!patch.name) throw new Error("Le nom est requis");
      if (r.kind === "link") { const err = validateLink(edit.url); if (err) throw new Error(err); patch.url = edit.url.trim(); }
      const { error } = await supabase.from("digital_resources").update(patch).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { setEditId(null); refresh(); toast.success("Ressource modifiée"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const replace = useMutation({
    mutationFn: async ({ r, f }: { r: Resource; f: File }) => {
      const err = validateUpload(f); if (err) throw new Error(err);
      const path = resourcePath(shopId, productId, f.name);
      const up = await supabase.storage.from("digital-files").upload(path, f, { contentType: f.type || "application/octet-stream" });
      if (up.error) throw new Error("Téléversement impossible : " + up.error.message);
      const { error } = await supabase.from("digital_resources").update({ file_path: path, file_name: f.name.slice(0, 200), mime_type: f.type || null, size_bytes: f.size }).eq("id", r.id);
      if (error) { await removeFiles([path]); throw error; }
      await removeFiles([r.file_path]); // old file no longer referenced
    },
    onSuccess: () => { refresh(); toast.success("Fichier remplacé"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (r: Resource) => {
      const { error } = await supabase.from("digital_resources").delete().eq("id", r.id);
      if (error) throw error;
      await removeFiles([r.file_path]);
    },
    onSuccess: () => { refresh(); toast.success("Ressource supprimée"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      for (const u of reorderUpdates(resources, index, dir)) {
        const { error } = await supabase.from("digital_resources").update({ position: u.position }).eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const open = async (r: Resource) => {
    if (r.kind === "link" && r.url) { window.open(r.url, "_blank", "noopener"); return; }
    if (!r.file_path) return;
    const { data, error } = await supabase.storage.from("digital-files").createSignedUrl(r.file_path, 60);
    if (error || !data) { toast.error("Fichier inaccessible"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const busy = add.isPending || replace.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">{title} ({resources.length})</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" aria-label="Ajouter un fichier" onClick={() => setAdding(adding === "file" ? null : "file")}><FileUp className="h-4 w-4" /> Fichier</Button>
          <Button size="sm" variant="outline" aria-label="Ajouter un lien" onClick={() => setAdding(adding === "link" ? null : "link")}><Link2 className="h-4 w-4" /> Lien</Button>
        </div>
      </div>

      {adding && (
        <form className="space-y-2 rounded-lg border bg-muted/40 p-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          {adding === "file"
            ? <div className="space-y-1"><Label htmlFor={`res-file-${lessonId ?? "p"}`}>Fichier (PDF, document, image, vidéo, ZIP — 50 Mo max)</Label><Input id={`res-file-${lessonId ?? "p"}`} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            : <div className="space-y-1"><Label htmlFor={`res-url-${lessonId ?? "p"}`}>Adresse du lien (YouTube, Vimeo, Drive…)</Label><Input id={`res-url-${lessonId ?? "p"}`} placeholder="https://" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></div>}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor={`res-name-${lessonId ?? "p"}`}>Nom</Label><Input id={`res-name-${lessonId ?? "p"}`} maxLength={200} placeholder="Nom affiché" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor={`res-role-${lessonId ?? "p"}`}>Rôle</Label>
              <select id={`res-role-${lessonId ?? "p"}`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as "main" | "bonus" })}><option value="main">Ressource principale</option><option value="bonus">Bonus</option></select>
            </div>
          </div>
          <div className="space-y-1"><Label htmlFor={`res-desc-${lessonId ?? "p"}`}>Description (facultative)</Label><Input id={`res-desc-${lessonId ?? "p"}`} maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}>{add.isPending ? "Envoi…" : "Ajouter la ressource"}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>Annuler</Button></div>
        </form>
      )}

      <input ref={replaceInput} type="file" className="hidden" aria-label="Fichier de remplacement" onChange={(e) => { const f = e.target.files?.[0]; if (f && replaceTarget) replace.mutate({ r: replaceTarget, f }); e.target.value = ""; }} />

      {resources.length === 0 && !adding && <p className="text-sm text-muted-foreground">Aucune ressource.</p>}
      <ul className="space-y-2">
        {resources.map((r, i) => {
          const fmt = resourceFormat(r);
          return (
            <li key={r.id} className="rounded-lg border bg-background p-2.5" data-testid="resource-item">
              {editId === r.id ? (
                <div className="space-y-2">
                  <Input aria-label="Nom de la ressource" maxLength={200} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  {r.kind === "link" && <Input aria-label="Adresse du lien" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} />}
                  <Input aria-label="Description de la ressource" maxLength={1000} placeholder="Description (facultative)" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                  <select aria-label="Rôle de la ressource" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as "main" | "bonus" })}><option value="main">Ressource principale</option><option value="bonus">Bonus</option></select>
                  <div className="flex gap-2"><Button size="sm" onClick={() => update.mutate(r)} disabled={update.isPending}><Check className="h-4 w-4" /> Enregistrer</Button><Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /> Annuler</Button></div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => open(r)} className="flex max-w-full items-center gap-1 truncate text-left text-sm font-semibold hover:text-primary">{r.name}<ExternalLink className="h-3 w-3 shrink-0" /></button>
                    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span>{FORMAT_LABELS[fmt]}</span>{r.size_bytes != null && <span>{formatSize(r.size_bytes)}</span>}
                      <span className={r.role === "bonus" ? "font-semibold text-primary" : ""}>{r.role === "bonus" ? "Bonus" : "Principale"}</span>
                    </p>
                    {r.description && <p className="truncate text-xs text-muted-foreground">{r.description}</p>}
                  </div>
                  <div className="flex shrink-0">
                    <Button size="icon" variant="ghost" aria-label={`Monter ${r.name}`} disabled={i === 0 || move.isPending} onClick={() => move.mutate({ index: i, dir: -1 })}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Descendre ${r.name}`} disabled={i === resources.length - 1 || move.isPending} onClick={() => move.mutate({ index: i, dir: 1 })}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Modifier ${r.name}`} onClick={() => { setEditId(r.id); setEdit({ name: r.name, description: r.description, url: r.url ?? "", role: (r.role as "main" | "bonus") ?? "main" }); }}><Pencil className="h-4 w-4" /></Button>
                    {r.kind === "file" && <Button size="icon" variant="ghost" aria-label={`Remplacer ${r.name}`} disabled={replace.isPending} onClick={() => { setReplaceTarget(r); replaceInput.current?.click(); }}><RefreshCw className="h-4 w-4" /></Button>}
                    <Button size="icon" variant="ghost" aria-label={`Supprimer ${r.name}`} onClick={() => confirm(`Supprimer la ressource « ${r.name} » ?`) && remove.mutate(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { removeFiles };
