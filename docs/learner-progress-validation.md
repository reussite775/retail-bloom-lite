# Lot 3.2 — Suivi individuel des apprenants

## Implémentation dans le projet principal, non publiée

- Nouvelles tables `digital_learner_lessons` et `digital_learner_courses`, appliquées et présence vérifiée en base.
- Clés uniques client/formation/leçon et client/formation : suivi partagé entre appareils et commandes du même client pour une formation.
- Historique par leçon : première consultation, dernière consultation, statut de validation et date de dernière validation. Annuler une validation conserve son historique ; revalider actualise sa date.
- Dernière leçon et dates de consultation de la formation, écrites dans la même transaction que la consultation.
- Fonction `record_learner_activity` réservée au service serveur : compte existant, achat payé possédé par rattachement ou e-mail vérifié, formation et boutique identiques, leçon publiée.
- Aucun accès direct des visiteurs ou comptes clients aux nouvelles tables ; aucun droit d’exécution client sur cette fonction. Les fonctions applicatives vérifient l’identité et la propriété avant lecture/écriture.
- Contraintes de même formation/boutique pour les références aux leçons et la reprise.
- Les anciennes tables `digital_lesson_progress` et `digital_learning_state` et leurs données restent intactes. Elles ne sont plus utilisées pour le suivi individuel ; aucun historique anonyme n’est attribué automatiquement à un compte.

## Fichiers réellement ajoutés ou modifiés

- Ajoutés : `src/lib/learner-progress.ts`, `src/lib/learner-progress.server.ts`, deux fichiers de tests de progression et migrations 0034/0035.
- Modifié : `src/lib/learner.functions.ts` (lecture du suivi individuel dans formation et bibliothèque ; mutations authentifiées de consultation/validation).
- Modifiés : `src/routes/apprendre.$product.tsx` et `src/routes/mes-achats.tsx` (compteur, pourcentage, statut, reprise, états des modules, validation/annulation, actualisation sans recharger).
- Types de la base régénérés automatiquement. BkaPay, abonnements, espace physique, comptes et commandes inchangés.

## Tests automatisés exécutés

50 tests réussis dans six fichiers, dont 19 nouveaux tests de progression.

- Premier affichage : 0/3, 0 %, Non commencée ; première consultation : En cours.
- Une validation : 1/3, 33 % ; toutes les leçons : 100 %, Terminée.
- Calcul des modules ; exclusion des leçons gratuites non publiées, verrouillées et anciennes validations sans leçon accessible.
- Reprise à la dernière leçon accessible, repli sur une leçon non terminée si nécessaire.
- Adaptateur en mémoire : première/dernière consultations, relecture par un nouveau client, validation idempotente, annulation et conservation de l’historique.
- Refus autre client, commande impayée, autre boutique, leçon non publiée ; erreurs d’enregistrement non masquées.
- Régressions de propriété, téléchargement et cache des achats.

Ces tests utilisent des données en mémoire : ils ne prouvent pas un achat réel ni une écriture réelle de progression en production.

## Vérifications réellement effectuées dans l’aperçu

Navigateur neuf à 1280×1800 et téléphone 390×844, sans connexion :

- Bibliothèque vide affichée, lien de connexion présent, aucune erreur JavaScript ni débordement horizontal.
- Appels aux vraies fonctions de consultation et validation refusés sans session ; aucune ligne créée.
- Formation inexistante : écran Contenu indisponible.
- Captures des écrans téléphone examinées.

Les contraintes, tables, privilèges et présence des migrations ont été vérifiés par lectures de la base. Il ne s’agit pas d’une validation par achat réel.

## Validation réelle encore bloquée

La base réelle contient **0 commande, dont 0 payée**, et aucune formation publiée n’a été trouvée. Aucun faux achat ou compte n’a été créé.

Ne sont donc pas validés en conditions réelles : écriture et relecture d’une progression d’acheteur, quitter/revenir, second appareil, fin complète, comparaison entre deux acheteurs et affichage d’une formation remplie sur téléphone. La persistance est implémentée en base mais son parcours complet reste à valider ; le lot n’est pas déclaré entièrement validé.

Méthode sûre : créer un aperçu avec base indépendante, confirmer explicitement son isolation avant toute donnée fictive, y préparer deux comptes clients, une commande payée de test et une formation avec leçons publiées/non publiées, puis exécuter les neuf scénarios du brief avec relecture de la base et deux sessions indépendantes. Ne pas utiliser la base principale comme remplacement.

Aucune publication effectuée.