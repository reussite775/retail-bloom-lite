import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpen, Check, Eye, EyeOff, Lock, Pencil, Plus, Save, Trash2, Unlock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { RichDescription } from "./rich-description";
import { ResourceList, contentKey, removeFiles, type Resource } from "./digital-resources";
import { sanitizeRichText } from "@/lib/rich-text";
import { FORMAT_LABELS, byPosition, programSummary, reorderUpdates, resourceFormat } from "@/lib/digital-content";

export type Module = Tables<"digital_modules">;
export type Lesson = Tables<"digital_lessons">;

type LessonForm = { title: string; content: string; is_free: boolean; is_published: boolean };
const formOf = (l: Lesson): LessonForm => ({ title: l.title, content: l.content, is_free: l.is_free, is_published: l.is_published });

export function CourseBuilder({ shopId, productId, modules, lessons, resources, onDirtyChange }: {
  shopId: string; productId: string; modules: Module[]; lessons: Lesson[]; resources: Resource[]; onDirtyChange: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: contentKey(productId) });
  const mods = [...modules].sort(byPosition);
  const lessonsOf = (mid: string) => lessons.filter((l) => l.module_id === mid).sort(byPosition);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = lessons.find((l) => l.id === selectedId) ?? null;
  const [form, setForm] = useState<LessonForm | null>(null);
  const dirty = !!(selected && form && JSON.stringify(form) !== JSON.stringify(formOf(selected)));
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  const [newModule, setNewModule] = useState("");
  const [newLesson, setNewLesson] = useState<Record<string, string>>({});
  const [editModule, setEditModule] = useState<{ id: string; title: string; description: string } | null>(null);

  const selectLesson = (l: Lesson) => {
    if (dirty && !confirm("Des modifications de la leçon ne sont pas enregistrées. Les abandonner ?")) return;
    setSelectedId(l.id); setForm(formOf(l));
  };

  const useRun = <T,>(fn: (v: T) => Promise<void>, ok?: string) => useMutation({
    mutationFn: fn,
    onSuccess: () => { refresh(); if (ok) toast.success(ok); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addModule = useRun(async () => {
    const title = newModule.trim(); if (!title) throw new Error("Donnez un titre au module");
    const { error } = await supabase.from("digital_modules").insert({ organization_id: shopId, product_id: productId, title: title.slice(0, 200), position: mods.length });
    if (error) throw error;
    setNewModule("");
  }, "Module ajouté");

  const saveModule = useRun(async () => {
    if (!editModule) return;
    const title = editModule.title.trim(); if (!title) throw new Error("Le titre est requis");
    const { error } = await supabase.from("digital_modules").update({ title: title.slice(0, 200), description: editModule.description.trim().slice(0, 2000) }).eq("id", editModule.id);
    if (error) throw error;
    setEditModule(null);
  }, "Module modifié");

  const deleteModule = useRun(async (m: Module) => {
    const lessonIds = lessonsOf(m.id).map((l) => l.id);
    const files = resources.filter((r) => r.lesson_id && lessonIds.includes(r.lesson_id)).map((r) => r.file_path);
    const { error } = await supabase.from("digital_modules").delete().eq("id", m.id);
    if (error) throw error;
    await removeFiles(files); // lessons and their resources are removed with the module
    if (selectedId && lessonIds.includes(selectedId)) { setSelectedId(null); setForm(null); }
  }, "Module supprimé");

  const moveModule = useRun(async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
    for (const u of reorderUpdates(mods, index, dir)) {
      const { error } = await supabase.from("digital_modules").update({ position: u.position }).eq("id", u.id);
      if (error) throw error;
    }
  });

  const addLesson = useRun(async (m: Module) => {
    const title = (newLesson[m.id] ?? "").trim(); if (!title) throw new Error("Donnez un titre à la leçon");
    const { error } = await supabase.from("digital_lessons").insert({ organization_id: shopId, product_id: productId, module_id: m.id, title: title.slice(0, 200), position: lessonsOf(m.id).length });
    if (error) throw error;
    setNewLesson({ ...newLesson, [m.id]: "" });
  }, "Leçon ajoutée");

  const moveLesson = useRun(async ({ list, index, dir }: { list: Lesson[]; index: number; dir: -1 | 1 }) => {
    for (const u of reorderUpdates(list, index, dir)) {
      const { error } = await supabase.from("digital_lessons").update({ position: u.position }).eq("id", u.id);
      if (error) throw error;
    }
  });

  const deleteLesson = useRun(async (l: Lesson) => {
    const files = resources.filter((r) => r.lesson_id === l.id).map((r) => r.file_path);
    const { error } = await supabase.from("digital_lessons").delete().eq("id", l.id);
    if (error) throw error;
    await removeFiles(files);
    if (selectedId === l.id) { setSelectedId(null); setForm(null); }
  }, "Leçon supprimée");

  const saveLesson = useMutation({
    mutationFn: async () => {
      if (!selected || !form) return;
      const title = form.title.trim(); if (!title) throw new Error("Le titre est requis");
      const content = sanitizeRichText(DOMPurify.sanitize(form.content, { USE_PROFILES: { html: true } }));
      const { error } = await supabase.from("digital_lessons").update({ title: title.slice(0, 200), content, is_free: form.is_free, is_published: form.is_published }).eq("id", selected.id);
      if (error) throw error;
      return { ...form, title: title.slice(0, 200), content };
    },
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: contentKey(productId) });
      if (saved) setForm(saved);
      toast.success("Leçon enregistrée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* Plan de la formation */}
      <div className="space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addModule.mutate(undefined); }}>
          <Input aria-label="Titre du nouveau module" maxLength={200} placeholder="Titre du nouveau module" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
          <Button type="submit" disabled={!newModule.trim() || addModule.isPending}><Plus className="h-4 w-4" /> Module</Button>
        </form>
        {mods.length === 0 && <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Aucun module. Commencez par créer le premier module de votre formation.</p>}
        {mods.map((m, mi) => {
          const ls = lessonsOf(m.id);
          return (
            <section key={m.id} className="rounded-xl border bg-card p-3" data-testid="module">
              {editModule?.id === m.id ? (
                <div className="space-y-2">
                  <Input aria-label="Titre du module" maxLength={200} value={editModule.title} onChange={(e) => setEditModule({ ...editModule, title: e.target.value })} />
                  <Textarea aria-label="Description du module" rows={2} maxLength={2000} placeholder="Description du module (facultative)" value={editModule.description} onChange={(e) => setEditModule({ ...editModule, description: e.target.value })} />
                  <div className="flex gap-2"><Button size="sm" onClick={() => saveModule.mutate(undefined)} disabled={saveModule.isPending}><Check className="h-4 w-4" /> Enregistrer</Button><Button size="sm" variant="ghost" onClick={() => setEditModule(null)}><X className="h-4 w-4" /> Annuler</Button></div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase text-primary">Module {mi + 1}</p>
                    <h3 className="break-words font-bold">{m.title}</h3>
                    {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                  </div>
                  <div className="flex shrink-0">
                    <Button size="icon" variant="ghost" aria-label={`Monter le module ${m.title}`} disabled={mi === 0 || moveModule.isPending} onClick={() => moveModule.mutate({ index: mi, dir: -1 })}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Descendre le module ${m.title}`} disabled={mi === mods.length - 1 || moveModule.isPending} onClick={() => moveModule.mutate({ index: mi, dir: 1 })}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Modifier le module ${m.title}`} onClick={() => setEditModule({ id: m.id, title: m.title, description: m.description })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Supprimer le module ${m.title}`} onClick={() => confirm(`Supprimer le module « ${m.title} », ses ${ls.length} leçon(s) et leurs ressources ?`) && deleteModule.mutate(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              )}
              <ol className="mt-2 space-y-1">
                {ls.map((l, li) => (
                  <li key={l.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${selectedId === l.id ? "border-primary bg-primary/5" : "bg-background"}`} data-testid="lesson">
                    <button type="button" onClick={() => selectLesson(l)} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm">
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate">{l.title}</span>
                      {l.is_free ? <Unlock className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Gratuite" /> : <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Réservée" />}
                      {!l.is_published && <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Non publiée" />}
                    </button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Monter la leçon ${l.title}`} disabled={li === 0 || moveLesson.isPending} onClick={() => moveLesson.mutate({ list: ls, index: li, dir: -1 })}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Descendre la leçon ${l.title}`} disabled={li === ls.length - 1 || moveLesson.isPending} onClick={() => moveLesson.mutate({ list: ls, index: li, dir: 1 })}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Supprimer la leçon ${l.title}`} onClick={() => confirm(`Supprimer la leçon « ${l.title} » et ses ressources ?`) && deleteLesson.mutate(l)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </li>
                ))}
              </ol>
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); addLesson.mutate(m); }}>
                <Input aria-label={`Nouvelle leçon dans ${m.title}`} className="h-8" maxLength={200} placeholder="Titre de la nouvelle leçon" value={newLesson[m.id] ?? ""} onChange={(e) => setNewLesson({ ...newLesson, [m.id]: e.target.value })} />
                <Button type="submit" size="sm" variant="outline" disabled={!(newLesson[m.id] ?? "").trim() || addLesson.isPending}><Plus className="h-4 w-4" /> Leçon</Button>
              </form>
            </section>
          );
        })}
      </div>

      {/* Éditeur de leçon */}
      <div className="space-y-4">
        {!selected || !form ? (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Sélectionnez une leçon pour modifier son contenu et ses ressources.</p>
        ) : (
          <>
            <section className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Leçon</h3>
                <Button size="sm" onClick={() => saveLesson.mutate()} disabled={!dirty || saveLesson.isPending}><Save className="h-4 w-4" /> {saveLesson.isPending ? "Enregistrement…" : dirty ? "Enregistrer la leçon" : "Enregistrée"}</Button>
              </div>
              <div className="space-y-1.5"><Label htmlFor="lesson-title">Titre</Label><Input id="lesson-title" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={form.is_free} onClick={() => setForm({ ...form, is_free: !form.is_free })} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${form.is_free ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>{form.is_free ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{form.is_free ? "Gratuite (aperçu)" : "Réservée aux acheteurs"}</button>
                <button type="button" aria-pressed={form.is_published} onClick={() => setForm({ ...form, is_published: !form.is_published })} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${form.is_published ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>{form.is_published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{form.is_published ? "Leçon publiée" : "Non publiée"}</button>
              </div>
              <div className="space-y-1.5"><Label>Contenu (titres, paragraphes, listes, liens)</Label><RichDescription value={form.content} onChange={(html) => setForm({ ...form, content: html })} /></div>
              {dirty && <p className="text-xs text-destructive">Modifications non enregistrées.</p>}
            </section>
            <section className="rounded-xl border bg-card p-4">
              <ResourceList shopId={shopId} productId={productId} lessonId={selected.id} resources={resources.filter((r) => r.lesson_id === selected.id).sort(byPosition)} title="Vidéos, documents et liens de la leçon" />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export function CoursePreview({ title, isCourse, modules, lessons, resources }: { title: string; isCourse: boolean; modules: Module[]; lessons: Lesson[]; resources: Resource[] }) {
  const mods = [...modules].sort(byPosition);
  const productRes = resources.filter((r) => !r.lesson_id).sort(byPosition);
  const s = programSummary(isCourse ? modules : [], isCourse ? lessons : [], resources);
  const resLine = (r: Resource) => (
    <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-sm">
      <span className="font-medium">{r.name}</span>
      <span className="text-xs text-muted-foreground">{FORMAT_LABELS[resourceFormat(r)]}{r.role === "bonus" ? " · Bonus" : ""}</span>
    </li>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-4 rounded-xl border bg-card p-4 sm:p-6" data-testid="course-preview">
      <div>
        <p className="text-xs font-semibold uppercase text-primary">Aperçu créateur — non visible par les acheteurs</p>
        <h2 className="break-words text-2xl font-extrabold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isCourse && <>{s.modules} module{s.modules > 1 ? "s" : ""} · {s.lessons} leçon{s.lessons > 1 ? "s" : ""} · {s.free} gratuite{s.free > 1 ? "s" : ""} · </>}
          {s.resources} ressource{s.resources > 1 ? "s" : ""}
        </p>
      </div>
      {isCourse && mods.map((m, mi) => {
        const ls = lessons.filter((l) => l.module_id === m.id).sort(byPosition);
        return (
          <section key={m.id} className="rounded-lg border p-3">
            <h3 className="font-bold">Module {mi + 1} · {m.title}</h3>
            {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
            <ol className="mt-2 space-y-2">
              {ls.map((l, li) => {
                const rs = resources.filter((r) => r.lesson_id === l.id).sort(byPosition);
                return (
                  <li key={l.id} className="rounded-md bg-muted/50 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{mi + 1}.{li + 1} {l.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${l.is_free ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{l.is_free ? "Gratuite" : "Réservée aux acheteurs"}</span>
                      {!l.is_published && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Non publiée</span>}
                    </div>
                    {l.content && <div className="prose prose-sm mt-1 max-w-none text-sm [&_a]:text-primary" dangerouslySetInnerHTML={{ __html: sanitizeRichText(l.content) }} />}
                    {rs.length > 0 && <ul className="mt-1 space-y-0.5 border-l-2 border-primary/30 pl-2">{rs.map(resLine)}</ul>}
                  </li>
                );
              })}
              {ls.length === 0 && <li className="text-sm text-muted-foreground">Aucune leçon.</li>}
            </ol>
          </section>
        );
      })}
      {isCourse && mods.length === 0 && <p className="text-sm text-muted-foreground">Aucun module pour l'instant.</p>}
      <section>
        <h3 className="font-bold">Ressources du produit</h3>
        {productRes.length ? <ul className="mt-1 space-y-1">{productRes.map(resLine)}</ul> : <p className="text-sm text-muted-foreground">Aucune ressource.</p>}
      </section>
    </div>
  );
}
