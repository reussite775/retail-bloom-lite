# Validation ciblée des achats — 5 novembre 2026

## Corrections nécessaires
- Les réponses de cours/leçons/bibliothèque/suivi étaient incluses dans le cache hors ligne commerçant. Les exclure et filtrer les anciennes entrées à la restauration ; les nouvelles lectures nécessitent une requête en ligne. Aucun changement aux caches produits/ventes/crédits physiques.
- La récupération de mot de passe client perdait sa destination et redirigeait vers `/dashboard`. Conserver `client=1` dans le lien officiel et revenir vers `/mes-achats`. Test reproduit en échec avant correction, réussi après, uniquement avec fournisseur simulé.

## Tests automatisés
32 tests sur cinq fichiers réussis. Données en mémoire uniquement, aucune insertion dans la base.
- Révocation du même lien de téléchargement après ajout d'un propriétaire dans le scénario simulé.
- Refus visiteurs/autre compte, accès propriétaire, commandes impayées refusées.
- Contrôle des vidéos liées à une leçon, refus des leçons non publiées.
- Relais de téléchargement sans redirection ni URL de stockage visible ; lien interne 30 secondes ; réponses non mises en cache.
- Simulation de deux appareils avec le même propriétaire et destination client après réinitialisation.

## Vérifications dans le navigateur de l'aperçu
- Bibliothèque sans connexion : connexion proposée.
- Mot de passe oublié sans adresse : validation affichée, aucun e-mail envoyé.
- Page de récupération sans session : formulaire de changement de mot de passe absent.
- Quatre accès fichiers/ressources inexistants sans connexion ou avec faux jeton : HTTP 403, `no-store`.
- Effacement du cookie de téléchargement : HTTP 204, cookie supprimé ; origine étrangère : HTTP 403.

## Inspection des accès
Cours, leçons, progression, fichiers principaux et ressources stockées : paiement, produit/boutique et propriétaire contrôlés côté serveur. Le suivi conserve les informations de commande via le secret, pas le droit au contenu après rattachement. La lecture directe du stockage reste réservée à la boutique propriétaire selon les règles actuelles, pas aux clients visiteurs.

## Limites non validées réellement
La base contient 0 commande et 0 rattachement. Aucun achat réel, aucun propriétaire sur deux appareils réels et aucune réception d'e-mail de récupération testés. Aucune commande ni compte créés ; aucune publication.

Les liens externes YouTube/Vimeo/autres peuvent continuer à fonctionner chez leur hébergeur une fois connus : GestiPro contrôle leur divulgation initiale, pas leur accès externe. Les anciens liens directs déjà émis restent valides jusqu'à expiration ; les fichiers déjà copiés ne sont pas révocables.

## Méthode de test sans toucher à la production
Ouvrir une version d'essai dont la base indépendante est confirmée vide et dont les secrets/tâches BkaPay sont absents. Y créer uniquement des comptes, un fichier et une commande de test clairement identifiés, sans paiement ni API BkaPay. Ouvrir deux contextes navigateur indépendants pour le propriétaire, un troisième pour un autre client ; tester le même lien avant/après rattachement et après déconnexion. Avec une adresse de test accessible, recevoir réellement l'e-mail officiel, réinitialiser le mot de passe puis vérifier la bibliothèque. Ce scénario reste à exécuter : l'aperçu principal partage la vraie base et ne suffit pas à isoler les données.