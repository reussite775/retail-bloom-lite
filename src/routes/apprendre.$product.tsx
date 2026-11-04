import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Circle, Download, ExternalLink, FileText, Gift, Library, ListTree, Lock, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCourse, getLesson, setLessonDone } from "@/lib/learner.functions";
import { progressStats, resumeLesson, savePurchase, videoEmbedUrl } from "@/lib/learner-access";
import { FORMAT_LABELS, formatSize, resourceFormat } from "@/lib/digital-content";
import { PRODUCT_TYPE_LABELS } from "@/components/sales-page-view";

export const Route = createFileRoute("/apprendre/$product")({
  validateSearch: (s: Record<string, unknown>) => ({
    o: typeof s["o"] === "string" ? s["o"] : undefined,
    t: typeof s["t"] === "string" ? s["t"] : undefined,
    l: typeof s["l"] === "string" ? s["l"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Mon espace apprenant — GestiPro" },
      { name: "description", content: "Accédez à vos formations et contenus numériques achetés." },
      { property: "og:title", content: "Mon espace apprenant — GestiPro" },
      { property: "og:description", content: "Formations et contenus numériques sur GestiPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  ssr: false,
  component: LearnerPage,
});

type Delivered = { id: string; kind: string; role: string; name: string; description: string; file_name: string | null; mime_type: string | null; size_bytes: number | null; url: string | null; downloadUrl: string | null };

function LearnerPage() {
  const { product } = Route.useParams();
  const { o, t, l } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const fetchCourse = useServerFn(getCourse);
  const fetchLesson = useServerFn(getLesson);
  const markDone = useServerFn(setLessonDone);
  const [showPlan, setShowPlan] = useState(false);

  const course = useQuery({ queryKey: ["learn", product, o, t], queryFn: () => fetchCourse({ data: { product, o, t } }) });
  const c = course.data;
  const completed = new Set(c?.completed ?? []);
  const ordered = c?.lessons ?? [];
  const currentId = l && ordered.some((x) => x.id === l) ? l : c ? resumeLesson(ordered, c.lastLessonId, completed) : null;
  const current = ordered.find((x) => x.id === currentId) ?? null;

  useEffect(() => { if (c?.purchased && o && t) savePurchase({ id: o, t }); }, [c?.purchased, o, t]);

  const lesson = useQuery({
    queryKey: ["learn-lesson", product, currentId, o, t],
    queryFn: () => fetchLesson({ data: { product, lesson: currentId!, o, t } }),
    enabled: !!current?.open,
  });

  const toggle = useMutation({
    mutationFn: (done: boolean) => markDone({ data: { product, lesson: currentId!, o: o!, t: t!, done } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["learn", product, o, t] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const go = (id: string) => { navigate({ search: (s) => ({ ...s, l: id }) }); setShowPlan(false); window.scrollTo({ top: 0 }); };

  if (course.isLoading) return <Shell><p className="p-6 text-center text-muted-foreground">Chargement…</p></Shell>;
  if (course.isError) return <Shell><Notice title="Impossible de charger le contenu" text="Vérifiez votre connexion puis réessayez." action={<Button onClick={() => course.refetch()}>Réessayer</Button>} /></Shell>;
  if (!c) return <Shell><Notice title="Contenu indisponible" text="Ce lien n'est pas valide ou ce produit n'est plus proposé. Utilisez le lien reçu après votre paiement." /></Shell>;

  const isCourse = c.product.type === "formation";
  const stats = progressStats(ordered, completed);
  const idx = ordered.findIndex((x) => x.id === currentId);
  const prev = ordered.slice(0, Math.max(idx, 0)).reverse().find((x) => x.open);
  const next = ordered.slice(idx + 1).find((x) => x.open);

  const plan = (
    <nav aria-label="Programme de la formation" className="space-y-3">
      {c.modules.map((m, mi) => {
        const ls = ordered.filter((x) => x.module_id === m.id);
        if (!ls.length) return null;
        const mDone = ls.every((x) => completed.has(x.id));
        return (
          <div key={m.id}>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-primary">{c.purchased && mDone && <CheckCircle2 className="h-3.5 w-3.5" />}Module {mi + 1} · {m.title}</p>
            <ol className="mt-1 space-y-0.5">
              {ls.map((x) => (
                <li key={x.id}>
                  <button type="button" disabled={!x.open} onClick={() => go(x.id)} data-testid="plan-lesson"
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${x.id === currentId ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"} disabled:cursor-not-allowed disabled:opacity-60`}>
                    {!x.open ? <Lock className="h-3.5 w-3.5 shrink-0" aria-label="Verrouillée" /> : completed.has(x.id) ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Terminée" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Non terminée" />}
                    <span className="min-w-0 flex-1 truncate">{x.title}</span>
                    {x.is_free && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">Gratuite</span>}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </nav>
  );

  return (
    <Shell>
      <header className="rounded-2xl border bg-card p-4 sm:p-6">
        <div className="flex gap-4">
          {c.product.coverUrl && <img src={c.product.coverUrl} alt="" className="hidden h-20 w-32 shrink-0 rounded-lg object-cover sm:block" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase text-primary">{PRODUCT_TYPE_LABELS[c.product.type] ?? "Produit numérique"}{c.product.shopName && ` · ${c.product.shopName}`}</p>
            <h1 className="break-words text-2xl font-extrabold">{c.product.title}</h1>
            {c.purchased && c.buyerName && <p className="text-sm text-muted-foreground">Bonjour {c.buyerName}</p>}
          </div>
        </div>
        {isCourse && c.purchased && (
          <div className="mt-4" data-testid="progress">
            <div className="flex justify-between text-xs text-muted-foreground"><span>{stats.done}/{stats.total} leçons terminées · {stats.modulesDone}/{stats.modulesTotal} modules</span><span className="font-semibold text-primary">{stats.percent} %</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${stats.percent}%` }} /></div>
          </div>
        )}
        {!c.purchased && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm">
            <span>Aperçu gratuit : seules les leçons gratuites sont accessibles.</span>
            <Button asChild size="sm"><Link to="/p/$productId" params={{ productId: c.product.slug ?? c.product.id }}>Acheter pour tout débloquer</Link></Button>
          </div>
        )}
      </header>

      {isCourse ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-2xl border bg-card p-3 lg:sticky lg:top-4 lg:self-start">
            <button type="button" className="flex w-full items-center justify-between text-sm font-bold lg:hidden" onClick={() => setShowPlan(!showPlan)} aria-expanded={showPlan}>
              <span className="flex items-center gap-2"><ListTree className="h-4 w-4 text-primary" /> Programme</span><span className="text-xs text-muted-foreground">{showPlan ? "Masquer" : "Afficher"}</span>
            </button>
            <div className={`${showPlan ? "mt-3 block" : "hidden"} lg:block`}>{c.modules.length ? plan : <p className="text-sm text-muted-foreground">Le programme n'est pas encore disponible.</p>}</div>
          </aside>
          <main className="min-w-0 space-y-4">
            {!current ? (
              <Notice title={ordered.length ? "Aucune leçon accessible" : "Aucune leçon pour l'instant"} text={ordered.length ? "Achetez la formation pour accéder aux leçons." : "Le créateur n'a pas encore publié de leçon."} />
            ) : !current.open ? (
              <Notice title="Leçon réservée aux acheteurs" text="Achetez la formation pour accéder à cette leçon." />
            ) : lesson.isLoading ? (
              <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">Chargement de la leçon…</p>
            ) : !lesson.data?.ok ? (
              <Notice title={lesson.data?.reason === "locked" ? "Leçon réservée aux acheteurs" : "Leçon indisponible"} text="Cette leçon ne peut pas être affichée." />
            ) : (
              <article className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" data-testid="lesson-view">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="break-words text-xl font-extrabold">{lesson.data.lesson.title}</h2>
                  {lesson.data.lesson.is_free && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Gratuite</span>}
                </div>
                <LessonMedia resources={lesson.data.resources} />
                {lesson.data.lesson.content && <div className="prose prose-sm max-w-none break-words sm:prose-base [&_a]:text-primary [&_a]:underline [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: lesson.data.lesson.content }} />}
                <ResourceLinks resources={lesson.data.resources.filter((r) => !isMedia(r))} title="Documents et ressources" />
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  {c.purchased && (
                    <Button variant={completed.has(current.id) ? "outline" : "default"} disabled={toggle.isPending} onClick={() => toggle.mutate(!completed.has(current.id))}>
                      <CheckCircle2 className="h-4 w-4" /> {completed.has(current.id) ? "Terminée — annuler" : "Marquer comme terminée"}
                    </Button>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button variant="ghost" disabled={!prev} onClick={() => prev && go(prev.id)} aria-label="Leçon précédente"><ChevronLeft className="h-4 w-4" /> Précédente</Button>
                    <Button variant="ghost" disabled={!next} onClick={() => next && go(next.id)} aria-label="Leçon suivante">Suivante <ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              </article>
            )}
            {c.purchased && (c.downloads.length > 0 || c.mainFile) && <Downloads c={c} />}
          </main>
        </div>
      ) : (
        <main className="space-y-4">
          {c.product.description && <div className="prose prose-sm max-w-none rounded-2xl border bg-card p-4 sm:p-6 [&_a]:text-primary" dangerouslySetInnerHTML={{ __html: c.product.description }} />}
          {c.purchased ? (
            c.downloads.length || c.mainFile ? <Downloads c={c} /> : <Notice title="Aucun fichier à télécharger" text={c.product.type === "file" ? "Le créateur n'a pas encore ajouté de fichier." : "Le vendeur vous contactera pour organiser votre prestation. Retrouvez ses coordonnées sur votre page de commande."} />
          ) : <Notice title="Contenu réservé aux acheteurs" text="Achetez ce produit pour accéder aux fichiers." />}
        </main>
      )}
    </Shell>
  );
}

const isMedia = (r: Delivered) => {
  const f = resourceFormat(r);
  return (r.kind === "link" && !!videoEmbedUrl(r.url)) || (r.kind === "file" && (f === "video" || f === "image" || f === "audio"));
};

function LessonMedia({ resources }: { resources: Delivered[] }) {
  const media = resources.filter(isMedia);
  if (!media.length) return null;
  return (
    <div className="space-y-3">
      {media.map((r) => {
        const f = resourceFormat(r);
        const embed = r.kind === "link" ? videoEmbedUrl(r.url) : null;
        return (
          <figure key={r.id} className="space-y-1">
            {embed ? <div className="aspect-video overflow-hidden rounded-xl bg-muted"><iframe src={embed} title={r.name} className="h-full w-full" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" /></div>
              : f === "video" && r.url ? <video src={r.url} controls preload="metadata" className="w-full rounded-xl bg-muted" />
              : f === "audio" && r.url ? <audio src={r.url} controls className="w-full" />
              : r.url ? <img src={r.url} alt={r.name} className="max-h-[480px] w-full rounded-xl object-contain" /> : null}
            <figcaption className="text-xs text-muted-foreground">{r.name}{r.description && ` — ${r.description}`}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function ResourceLinks({ resources, title }: { resources: Delivered[]; title: string }) {
  if (!resources.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-primary">{title}</h3>
      <ul className="space-y-2">
        {resources.map((r) => {
          const href = r.kind === "link" ? r.url : r.downloadUrl ?? r.url;
          return (
            <li key={r.id}>
              <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary/50" data-testid="learner-resource">
                {r.kind === "link" ? <ExternalLink className="h-5 w-5 shrink-0 text-primary" /> : r.role === "bonus" ? <Gift className="h-5 w-5 shrink-0 text-primary" /> : <FileText className="h-5 w-5 shrink-0 text-primary" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">{FORMAT_LABELS[resourceFormat(r)]}{r.size_bytes != null && ` · ${formatSize(r.size_bytes)}`}{r.role === "bonus" && " · Bonus"}{r.description && ` · ${r.description}`}</span>
                </span>
                {r.kind === "file" ? <Download className="h-4 w-4 shrink-0" /> : <PlayCircle className="h-4 w-4 shrink-0 opacity-0" />}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Downloads({ c }: { c: { downloads: Delivered[]; mainFile: { name: string; url: string | null } | null } }) {
  const main = c.downloads.filter((r) => r.role !== "bonus");
  const bonus = c.downloads.filter((r) => r.role === "bonus");
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" data-testid="downloads">
      <h2 className="flex items-center gap-2 text-lg font-extrabold"><Download className="h-5 w-5 text-primary" /> Vos téléchargements</h2>
      {c.mainFile?.url && (
        <Button asChild size="lg" className="w-full sm:w-auto"><a href={c.mainFile.url}><Download className="h-4 w-4" /> Télécharger {c.mainFile.name}</a></Button>
      )}
      <ResourceLinks resources={main} title="Ressources" />
      <ResourceLinks resources={bonus} title="Bonus" />
      <p className="text-xs text-muted-foreground">Les liens de téléchargement sont valables 1 heure. Rechargez la page pour en obtenir de nouveaux.</p>
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40 px-3 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between text-sm">
          <Link to="/mes-achats" className="flex items-center gap-1.5 font-semibold text-primary hover:underline"><Library className="h-4 w-4" /> Mes achats</Link>
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><BookOpen className="h-3.5 w-3.5" /> GestiPro</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Notice({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-8 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" />
      <h2 className="text-lg font-extrabold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}
