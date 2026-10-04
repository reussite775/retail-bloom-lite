import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMemo } from "react";
import { Lightbulb, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { profileQuery } from "@/lib/data";
import { hasPremium } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/_app/assistant")({
  head: () => ({
    meta: [
      { title: "Conseiller IA — Boutik" },
      { name: "description", content: "Posez vos questions sur vos ventes, stocks et dépenses et recevez des conseils personnalisés." },
      { property: "og:title", content: "Conseiller IA — Boutik" },
      { property: "og:description", content: "Un conseiller commercial qui analyse les données de votre boutique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

const SUGGESTIONS = [
  "Quels produits dois-je réapprovisionner cette semaine ?",
  "Quels sont mes produits les plus rentables ce mois-ci ?",
  "Comment ont évolué mes ventes sur les 30 derniers jours ?",
  "Où puis-je réduire mes dépenses ?",
];

function AssistantPage() {
  const { session } = useAuth();
  const { data: org } = useQuery(profileQuery(session!.user.id));
  const history = useQuery({
    queryKey: ["assistant-history", session!.user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assistant_messages").select("message").order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => r.message as unknown as UIMessage);
    },
    staleTime: Infinity,
  });

  if (org && !hasPremium(org)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center">
        <Lightbulb className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 text-2xl font-extrabold">Conseiller IA</h1>
        <p className="mt-2 text-muted-foreground">Posez vos questions sur vos ventes, stocks et dépenses et recevez des conseils personnalisés. Disponible avec l'offre Premium.</p>
        <Button asChild className="mt-5"><Link to="/abonnement">Passer à Premium</Link></Button>
      </div>
    );
  }
  if (history.isLoading || !org) return <p className="text-muted-foreground">Chargement…</p>;
  if (history.isError) return <p className="text-destructive">Impossible de charger la conversation.</p>;
  return <Chat initial={history.data ?? []} userId={session!.user.id} />;
}

function Chat({ initial, userId }: { initial: UIMessage[]; userId: string }) {
  const qc = useQueryClient();
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/assistant",
    headers: async (): Promise<Record<string, string>> => {
      const { data } = await supabase.auth.getSession();
      return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    },
  }), []);
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: `assistant-${userId}`,
    messages: initial,
    transport,
    onError: (e) => {
      let msg = e.message;
      try { msg = JSON.parse(e.message).error ?? msg; } catch { /* plain text */ }
      toast.error(msg || "Erreur réseau, réessayez.");
    },
  });
  const busy = status === "submitted" || status === "streaming";

  const reset = async () => {
    if (!confirm("Effacer toute la conversation ?")) return;
    const { error } = await supabase.from("assistant_messages").delete().eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    setMessages([]);
    qc.setQueryData(["assistant-history", userId], []);
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-11rem)] max-w-3xl flex-col md:h-[calc(100dvh-5rem)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Lightbulb className="h-6 w-6 text-primary" /> Conseiller IA</h1>
          <p className="text-sm text-muted-foreground">Analyse vos ventes, stocks et dépenses des 90 derniers jours.</p>
        </div>
        {messages.length > 0 && <Button variant="outline" size="sm" onClick={reset} disabled={busy}><RotateCcw className="h-4 w-4" /> Nouvelle conversation</Button>}
      </div>

      <Conversation className="flex-1 rounded-xl border bg-card">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState icon={<Lightbulb className="h-8 w-8 text-primary" />} title="Que voulez-vous savoir ?" description="Choisissez une question ou écrivez la vôtre.">
              <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => sendMessage({ text: s })} className="rounded-lg border bg-background p-3 text-left text-sm hover:bg-muted">{s}</button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent className={m.role === "user" ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground" : ""}>
                  {m.parts.map((p, i) => p.type === "text" ? (
                    m.role === "assistant" ? <MessageResponse key={i}>{p.text}</MessageResponse> : <p key={i} className="whitespace-pre-wrap">{p.text}</p>
                  ) : null)}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && <Shimmer className="text-sm">Analyse de vos données…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput className="mt-3" onSubmit={({ text }) => { if (text?.trim() && !busy) sendMessage({ text }); }}>
        <PromptInputTextarea autoFocus placeholder="Ex. : Quel produit me rapporte le plus ?" />
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit status={status} onClick={busy ? (e) => { e.preventDefault(); stop(); } : undefined} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
