// Modèles professionnels de pages de vente, par type de produit.
// Un modèle propose un ordre de sections et des contenus d'exemple en français.
// Règle impérative : appliquer un modèle ne remplit QUE les sections vides du
// produit — le contenu déjà saisi par le créateur n'est jamais écrasé.

import { emptyPageConfig, type PageConfig, type PageSectionKey } from "@/lib/page-config";

export type SalesTemplate = {
  id: string;
  name: string;
  description: string;
  sectionOrder: PageSectionKey[];
  content: Partial<Pick<PageConfig, "benefits" | "included" | "faq" | "testimonials" | "ctaLabel">>;
};

export const SALES_TEMPLATES: Record<string, SalesTemplate[]> = {
  file: [
    {
      id: "file-essentiel",
      name: "Essentiel",
      description: "Simple et direct : l'essentiel du produit, puis les questions fréquentes.",
      sectionOrder: ["benefits", "included", "faq", "testimonials"],
      content: {
        benefits: ["Un fichier prêt à l'emploi, téléchargeable immédiatement", "Un contenu clair, structuré et directement applicable"],
        included: ["1 fichier numérique en haute qualité", "Accès à vie au fichier"],
        faq: [
          { q: "Comment je reçois le fichier ?", a: "Le fichier est disponible immédiatement après votre commande." },
          { q: "Sur quels appareils puis-je l'utiliser ?", a: "Sur téléphone, tablette et ordinateur." },
        ],
        ctaLabel: "Télécharger maintenant",
      },
    },
    {
      id: "file-premium",
      name: "Premium",
      description: "Met en avant la preuve sociale et la valeur perçue du contenu.",
      sectionOrder: ["testimonials", "benefits", "included", "faq"],
      content: {
        benefits: ["Un contenu complet qui vous fait gagner un temps précieux", "Le résultat de plusieurs années d'expérience, condensé pour vous"],
        included: ["Le fichier principal", "Des bonus exclusifs offerts"],
        testimonials: [{ name: "Cliente satisfaite", text: "Exactement ce qu'il me fallait. Je recommande vivement." }],
        faq: [{ q: "Puis-je offrir ce produit ?", a: "Oui, vous pouvez l'offrir à un proche après votre achat." }],
        ctaLabel: "Obtenir mon exemplaire",
      },
    },
  ],
  formation: [
    {
      id: "formation-progression",
      name: "Progression",
      description: "Présente la transformation promise, puis le programme détaillé.",
      sectionOrder: ["benefits", "included", "testimonials", "faq"],
      content: {
        benefits: ["Maîtriser le sujet pas à pas, même en partant de zéro", "Des méthodes concrètes, applicables dès la première leçon"],
        included: ["Des modules vidéo accessibles à vie", "Des supports de cours téléchargeables", "Un accès sur téléphone et ordinateur"],
        testimonials: [{ name: "Ancien élève", text: "Une formation claire qui m'a permis de passer à l'action." }],
        faq: [
          { q: "Combien de temps dure la formation ?", a: "Vous avancez à votre rythme, l'accès est illimité." },
          { q: "Y a-t-il un accompagnement ?", a: "Oui, vous pouvez poser vos questions tout au long du parcours." },
        ],
        ctaLabel: "Rejoindre la formation",
      },
    },
    {
      id: "formation-expert",
      name: "Expert",
      description: "Rassure avec les témoignages avant de détailler le contenu.",
      sectionOrder: ["testimonials", "benefits", "included", "faq"],
      content: {
        benefits: ["Apprendre auprès d'un expert reconnu du domaine", "Éviter les erreurs qui coûtent du temps et de l'argent"],
        included: ["Le programme complet", "Des études de cas réelles"],
        testimonials: [{ name: "Élève accompagné", text: "Un accompagnement sérieux, des résultats visibles rapidement." }],
        faq: [{ q: "La formation convient-elle aux débutants ?", a: "Oui, chaque notion est expliquée simplement." }],
        ctaLabel: "Je m'inscris",
      },
    },
  ],
  service: [
    {
      id: "service-confiance",
      name: "Confiance",
      description: "Rassure d'abord avec les avis clients, puis détaille l'offre.",
      sectionOrder: ["testimonials", "benefits", "faq", "included"],
      content: {
        benefits: ["Un travail soigné, livré dans les délais convenus", "Un interlocuteur unique, disponible et à votre écoute"],
        included: ["Une prise en charge complète de votre demande", "Des ajustements jusqu'à votre satisfaction"],
        testimonials: [{ name: "Client fidèle", text: "Service rapide et professionnel, je referai appel à lui." }],
        faq: [
          { q: "Quel est le délai de réalisation ?", a: "Le délai est confirmé ensemble avant le début de la mission." },
          { q: "Comment se déroule la commande ?", a: "Vous commandez, nous échangeons sur vos besoins, puis je réalise la prestation." },
        ],
        ctaLabel: "Commander ce service",
      },
    },
    {
      id: "service-direct",
      name: "Direct",
      description: "Va à l'essentiel : bénéfices, contenu de l'offre, questions.",
      sectionOrder: ["benefits", "included", "faq", "testimonials"],
      content: {
        benefits: ["Un résultat professionnel sans vous soucier de la technique"],
        included: ["La prestation complète", "Une livraison dans les délais"],
        faq: [{ q: "Puis-je demander des modifications ?", a: "Oui, des retouches sont incluses dans l'offre." }],
        ctaLabel: "Réserver",
      },
    },
  ],
  coaching: [
    {
      id: "coaching-accompagnement",
      name: "Accompagnement",
      description: "Met en avant la relation humaine et les résultats obtenus.",
      sectionOrder: ["benefits", "testimonials", "included", "faq"],
      content: {
        benefits: ["Un accompagnement personnalisé, adapté à votre situation", "Un plan d'action clair pour atteindre votre objectif"],
        included: ["Des séances individuelles en visio ou en présentiel", "Un suivi entre les séances"],
        testimonials: [{ name: "Coaché accompagné", text: "Grâce à ce coaching, j'ai enfin débloqué ma situation." }],
        faq: [
          { q: "Combien de séances sont incluses ?", a: "Le nombre de séances est précisé dans l'offre et adaptable à vos besoins." },
          { q: "Comment réserver ma première séance ?", a: "Après votre commande, nous convenons ensemble du premier rendez-vous." },
        ],
        ctaLabel: "Réserver ma séance",
      },
    },
    {
      id: "coaching-resultats",
      name: "Résultats",
      description: "Ouvre sur les témoignages pour prouver l'efficacité de la méthode.",
      sectionOrder: ["testimonials", "benefits", "included", "faq"],
      content: {
        benefits: ["Des résultats mesurables, séance après séance", "Une méthode éprouvée auprès de nombreux clients"],
        included: ["Un bilan initial offert", "Un plan d'action personnalisé"],
        testimonials: [{ name: "Cliente satisfaite", text: "Des séances qui ont vraiment changé mon quotidien." }],
        faq: [{ q: "Le coaching se fait-il à distance ?", a: "Oui, les séances peuvent se tenir en ligne ou en présentiel." }],
        ctaLabel: "Commencer maintenant",
      },
    },
  ],
};

// Modèles proposés pour un type de produit donné (repli sur "file").
export function templatesFor(productType: string): SalesTemplate[] {
  return SALES_TEMPLATES[productType] ?? SALES_TEMPLATES["file"];
}

// Applique un modèle à la configuration actuelle SANS écraser le contenu existant :
// seules les sections vides reçoivent le contenu d'exemple du modèle.
export function applyTemplate(config: PageConfig, template: SalesTemplate): PageConfig {
  const next: PageConfig = {
    ...config,
    benefits: config.benefits.length > 0 ? config.benefits : [...(template.content.benefits ?? [])],
    included: config.included.length > 0 ? config.included : [...(template.content.included ?? [])],
    faq: config.faq.length > 0 ? config.faq : (template.content.faq ?? []).map((f) => ({ ...f })),
    testimonials: config.testimonials.length > 0 ? config.testimonials : (template.content.testimonials ?? []).map((t) => ({ ...t })),
    ctaLabel: config.ctaLabel || (template.content.ctaLabel ?? ""),
    sectionOrder: [...template.sectionOrder],
    template: template.id,
  };
  return next;
}

