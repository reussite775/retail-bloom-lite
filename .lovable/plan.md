# Évolution du studio de création GestiPro — diagnostic et plan progressif

## Diagnostic de l'existant

**Ce qui existe déjà (réutilisable tel quel) :**
- `src/components/digital-products.tsx` — CRUD complet : types de produit (fichier, formation, service, coaching), sections de formulaire, slug personnalisé, publication/brouillon, couverture et fichier privés.
- `src/components/rich-description.tsx` + `src/lib/rich-text.ts` — éditeur de description enrichie et sanitisation (réutilisable pour tout contenu riche futur).
- `src/routes/p.$productId.tsx` — page publique produit (couverture, badge type, prix, description, SEO/OG).
- `src/routes/boutique.$slug.tsx` — boutique publique du créateur.
- `src/lib/digital.functions.ts` — RPC publiques (`public_digital_product_v2`, `public_creator_store`) qui n'exposent que les colonnes sûres ; couvertures signées côté serveur.
- Table `digital_products` (RLS par boutique) et `creator_storefronts`.

**Limites actuelles :**
- Le formulaire est un dialogue simple, sans aperçu de la page de vente.
- La page publique n'affiche que couverture + description + prix : pas de sections (avantages, contenu inclus, témoignages, FAQ, bouton d'action).
- Aucun modèle adapté au type de produit, aucune personnalisation de l'ordre des sections.

## Risques

- **XSS** : les nouvelles sections affichent du contenu saisi par le créateur sur une page publique → réutiliser `sanitizeRichText` et n'autoriser que du texte/liens, jamais de HTML libre.
- **Rétrocompatibilité** : les produits existants n'auront aucune section configurée → le rendu actuel doit rester le rendu par défaut (aucune migration de données).
- **RPC publique** : exposer les sections au public exige une nouvelle version de la RPC (`public_digital_product_v3`), sans toucher à la v2 utilisée ailleurs.
- **Espace d'écran** : un panneau réglages + aperçu ne tient pas dans le dialogue actuel → prévoir une page studio dédiée plutôt qu'agrandir le dialogue à l'aveugle.

## Première intervention recommandée (périmètre 1)

1. **Base de données** : colonne `page_config` (JSONB, nullable) sur `digital_products` — sections : avantages (liste), contenu inclus (liste), FAQ (questions/réponses), témoignages, texte du bouton d'action. Aucune donnée existante modifiée.
2. **RPC** : `public_digital_product_v3` retournant aussi `page_config` (produits publiés uniquement) ; la v2 reste en place.
3. **Rendu modulaire** : composant `SalesPageSections` partagé entre l'aperçu du studio et la page publique `/p/...`, pour garantir que l'aperçu = la réalité. Sans `page_config`, la page garde son apparence actuelle.
4. **Studio deux panneaux** : nouvelle route `/studio/produits/$id` (réglages à gauche, aperçu en direct à droite, bascule mobile/ordinateur) ; le dialogue actuel reste pour la création rapide, avec un bouton « Ouvrir le studio ».

## Interventions suivantes (ordre proposé)

- **Périmètre 2** : modèles de page par type de produit (fichier, formation, service, coaching) pré-remplissant les sections.
- **Périmètre 3** : réordonnancement et masquage des sections, personnalisation des couleurs d'accent de la page.
- **Périmètre 4** : assistant IA de rédaction (via la passerelle IA Lovable, côté serveur) — uniquement quand le service sera réellement connecté.
- **Périmètre 5** : personnalisation de la boutique publique (en-tête, couleurs).

## Garanties

- Espace Commerçant physique, authentification, abonnements et BkaPay intouchés.
- Brouillons toujours privés ; anciens liens UUID et slugs conservés.
- Aucun faux paiement ni portefeuille.
