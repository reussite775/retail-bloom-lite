# Récupération sécurisée des achats clients

- Mot de passe perdu : utiliser « Mot de passe oublié » sur `/auth?client=1`, puis le lien officiel reçu par e-mail. Le rattachement reste au même identifiant de compte, aucun nouveau rattachement n'est nécessaire.
- Changement d'adresse avec accès au compte : demander un changement d'e-mail authentifié via le fournisseur d'identité, avec confirmation des adresses selon ses réglages. Ne jamais transférer une commande simplement sur présentation du lien secret ou d'une nouvelle adresse.
- Perte d'accès à l'adresse et au compte : récupération manuelle uniquement après vérification indépendante de l'identité et du justificatif de paiement officiel. Aucun transfert automatique, aucune modification de rattachement via lien secret. La procédure automatisée de changement d'adresse n'est pas disponible dans cette version.

## Limites à communiquer avant mise en production

- Les anciens liens directs de stockage déjà émis ne sont pas révocables individuellement ici : ils restent utilisables jusqu'à leur expiration (ancien délai maximal : une heure). Aucun nouveau lien direct n'est transmis par les parcours acheteurs modifiés.
- Un fichier déjà téléchargé, une vidéo externe ou un contenu déjà copié ne peuvent pas être repris au destinataire. Les contrôles portent sur les nouveaux accès à GestiPro.
- La base principale ne contient aucune commande : les essais réels du propriétaire sur deux appareils et du lien révoqué attendent une commande réelle autorisée. Aucun achat artificiel ne doit être créé dans cette base.