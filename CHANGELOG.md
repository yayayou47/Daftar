# Journal des versions de Daftar

Les versions sont numérotées `X.Y.Z` (le nom de série, « Ousnou », figure à côté). Le numéro de la version courante
est écrit à un seul endroit : `app/version.js`. Chaque version publiée a son tag `vX.Y.Z` et sa page dans
[Releases](https://github.com/yayayou47/Daftar/releases) (APK Android et zip Ubuntu).

## 1.4.18 — 2026-11-27

- Téléphone : barre du bas (Mes finances, Saisir, Mes biens) 20 % moins haute (71 → 56 px).

- Réglages en listes : postes, comptes, biens, événements, projets et types de revenus se lisent une ligne par
  élément ; « Modifier » ouvre ses champs, « Enregistrer » ou « Annuler » le referme. Libellés : le poste s'affiche,
  « Modifier » propose la liste.
- Menu ≡ : « Événements et projets » (les événements et les projets dans le même onglet) et « Types de revenus » à
  part. Un projet (budget, échéance, note) se rattache à une maison ou à tout autre bien (terrain, engin…) ; son
  avancement s'affiche dans Mes biens.
- Repères de vidange : dans Mes biens › Engins, sous le tableau des vidanges, pour l'engin affiché (« Modifier les
  repères de vidange ») ; l'onglet des réglages disparaît.

## 1.4.17 — 2026-11-27

- Téléphone : le bouton Saisir est un rectangle arrondi DANS la barre du bas (bleu du logo, contour or), et non plus un
  rond qui dépasse.

## 1.4.16 — 2026-11-27

- Téléphone : bouton Saisir de la barre du bas agrandi, rond, cerclé d'or, au-dessus de la barre.
- Mes biens : plus de « Modifier » sur chaque carte ; on modifie par « Modifier les biens ».

## 1.4.15 — 2026-11-27

- Barre des rubriques : Mes finances à gauche, Saisir au milieu, **Mes biens** à droite. Mes biens présente tous les
  biens (engins, maisons, autres biens) : toucher un bien ouvre son carnet (Engins, Maison) ou le Patrimoine ;
  « Modifier » mène à sa ligne dans Comptes et biens ; « + Ajouter un engin », « + Ajouter un bien ». Barre
  Tous | Engins | Maison dans la rubrique. « House » devient « Maison ».

- Revenu en deux parts : « Dont ponctuel » dans Une opération (revenu d'un type courant, hors événement). Un seul
  virement (salaire + rappel, prime + bonus) reste une seule opération du montant reçu, pour le solde et le
  rapprochement avec le relevé ; la part ponctuelle est comptée dans l'exceptionnel, le reste dans les revenus courants
  (taux d'épargne, revenus attendus). Journal (« dont … »), confirmation et export Excel (colonne « Dont ponctuel »).

## 1.4.14 — 2026-11-25

- La ligne du haut (logo, synchronisation, devise, jour / nuit, ≡) reste figée en haut de l'écran pendant le
  défilement, sur téléphone comme sur ordinateur (elle s'effaçait en descendant et revenait mal en remontant) ; sur
  ordinateur, la barre des rubriques est figée juste dessous.

## 1.4.13 — 2026-11-25

- En-tête : logo, synchronisation, devise, bouton jour / nuit (par défaut, le mode du navigateur) et menu ≡ ; toucher
  le logo ramène à l'accueil (Mes finances, vue Mois, mois en cours).
- Menu ≡ : la liste des réglages seule (icône, nom, description), sans le formulaire de saisie ; un réglage s'ouvre
  seul avec « ‹ Réglages » pour revenir ; l'export Excel y est rangé (groupe « Fichiers »).
- Une opération : Date | Montant, Nature | Payé avec, Poste | Versé au compte de sur une même ligne, aussi sur petit
  téléphone ; Événement sur toute la largeur.
- Téléphone : barre des rubriques (Saisir, Mes finances, Engins, House) en bas de l'écran, cachée pendant le
  défilement et de retour dès qu'on s'arrête.
- Téléphone : la ligne du haut reste collée en haut de l'écran ; elle s'efface quand on descend et réapparaît dès
  qu'on remonte.

## 1.4.12 — 2026-11-25

- Reconnaissance des notes : les pièces d'un engin (filtre, boîte, radiateur, démarreur, injecteur, frein…) et le nom
  propre de l'engin désignent l'engin, avant l'ordre des postes et avant les mots-clés des biens (« filtre huile
  boîte », « réparation pompe boîte ») ; sans engin nommé, c'est l'engin d'un poste réservé aux engins qui est choisi.
  Le type seul (« moto ») ne fait plus d'une note une dépense d'engin : « taxi moto » reste un transport.
- Statistiques : l'alerte « Écarts de relevés » ne compte que les écarts de la période analysée et sépare les sorties
  et les entrées non notées (avant : « 0 FCFA (2 écarts) » quand deux écarts s'annulaient).

## 1.4.11 — 2026-11-25

**Fiabilité**
- Synchronisation téléphone ↔ ordinateur : un réglage fait sur le téléphone n'applique que ce qui a changé (fusion
  élément par élément) et ne remplace plus les listes entières ; un poste ou un compte ajouté entre-temps sur
  l'ordinateur est gardé. Les dates de modification du téléphone sont recalées sur l'horloge de l'ordinateur.
- Reconnaissance des notes : un engin lié à un poste partagé (groupe électrogène et Foyer, moto et Transport) ne prend
  plus toutes les dépenses de ce poste ; « essence moto » va à la moto ; un nombre entre parenthèses n'est plus lu
  comme un compteur hors des lignes d'engin ; « intérêts » est un revenu sur le compte épargne qui les produit, et
  non un virement vers l'épargne.
- Formulaire : choix « — aucun engin — » pour une dépense d'un poste partagé.
- Messages d'erreur identiques sur l'ordinateur et dans la version autonome.
- Les erreurs sans conséquence ne sont plus avalées en silence (notées dans la console) ; un réglage hors ligne qui
  ne peut pas être rejoué sur le téléphone est signalé.

**Nouveau**
- Rappel de sauvegarde sur le téléphone : bandeau quand le dernier export a plus de 7 jours et que des saisies ont
  été faites depuis.
- Petit téléphone : « Une opération » sur une colonne, rubrique « Réglages » abrégée.
- Accessibilité : montants abrégés lus en entier par les lecteurs d'écran ; troisième couleur des graphiques plus
  contrastée.

**Développement**
- `app/index.html` découpé en `style.css` et six scripts (`noyau.js`, `vues.js`, `saisie.js`, `stats.js`,
  `reglages.js`, `demarrage.js`), sans étape de construction.
- Numéro de version à un seul endroit (`app/version.js`) : page, service hors ligne (nom du cache), serveur,
  publication ; le tag doit correspondre.
- Tests automatiques (`python3 -m unittest discover -s tests`), lancés avant chaque publication : API, synchronisation,
  parité `serveur.py` ↔ `moteur.js`, calculs de la page, parcours complet dans Chrome sans interface.
- Contrôle des données personnelles dans le contenu des fichiers (liste de mots gardée hors du dépôt) et crochet
  avant chaque commit.
- `CHANGELOG.md` (ce fichier) ; mode d'emploi réorganisé en Premiers pas, Usage quotidien et Avancé.

## 1.4.10 — 2026-11-20
- Cartes « Dépenses par semaine » et « Dépenses par mois » plus compactes, montants abrégés.

## 1.4.9 — 2026-11-19
- Taux d'épargne réel du mois en cours en attente tant que les revenus habituels ne sont pas arrivés.
- Filtrer un journal (poste, compte, personne, bien, mois) amène directement au journal.
- Engins : pourcentages dans la barre de vidange, comparaison avec l'année précédente, consommation colorée, date
  estimée de la prochaine vidange, coût par km hors carburant.
- Icônes colorées sur toutes les cases d'indicateurs ; Patrimoine : barre de répartition, disponible, épargne,
  intérêts attendus.
- Bas de page : Licence, À propos, Démo.
- Vues Mois et Année réordonnées ; dépenses par semaine et par mois en barres horizontales.
- Montants abrégés (K, M) dans les cartes, réglage pour tout afficher.

## 1.4.8 — 2026-11-18
- Nouveau logo (D monogramme, livre en registre, barres dorées), icône adaptative Android.
- Indicateurs : jours sans dépense, plus grosse journée, mois d'autonomie, non saisi.
- Statistiques : médiane, taux d'épargne réel et prévisionnel, postes en hausse et en baisse, alertes regroupées,
  bilan de la période, graphique des cumuls fusionné.
- Case « Exceptionnel » avec les deux montants (dépensé · reçu).

## 1.4.7 — 2026-11-18
- Passage au nouveau jour sans recharger la page.

## 1.4.6 — 2026-11-17
- Rubriques ouvertes en haut de page ; clavier Daftar avec 1 2 3 en haut.
- Vue Mois : médiane des dépenses par jour ; taux d'épargne du mois, réel et prévisionnel.
- Indicateurs limités à la période suivie ; taux d'épargne de l'année.

## 1.4.5 — 2026-11-17
- Bouton de synchronisation stable pendant les vérifications automatiques ; délai de 20 s au lieu d'une attente sans fin.

## 1.4.4 — 2026-11-16
- En-tête mobile sur une ligne, barre des rubriques figée, bouton retour qui ramène à l'écran précédent.

## 1.4.3 — 2026-11-16
- Ouverture immédiate sur le téléphone (page servie du cache, nouvelle version proposée par un bandeau).

## 1.4.2 — 2026-11-16
- Comptes et biens en deux sections ; corbeille des comptes, rétablissables pendant 30 jours.

## 1.4.1 — 2026-11-16
- Avance sur un compte de tiers comptée comme dette ou mise en sourdine.

## 1.4.0 — 2026-11-16
- Comptes gérés pour des tiers et import de leur historique ; soldes négatifs ; clavier Daftar des montants.

## 1.3.0 à 1.3.3 — 2026-11-15
- Montants saisis en FCFA par défaut (option « en milliers » par appareil).
- Réglages et reclassements hors ligne sur le téléphone synchronisé.
- Bouton « Saisir » en tête des rubriques.

## 1.2.0 à 1.2.2 — 2026-11-14
- Nouvelle identité visuelle (monogramme D).
- « Noter le solde » hors ligne sur le téléphone synchronisé.

## 1.1.0 à 1.1.3 — 2026-11-14
- L'application s'appelle désormais Daftar (dépôt, commande `daftar`, installation dans `~/Daftar`).

## 1.0.0 à 1.0.3 — 2026-11-14
- Première version publiée : suivi financier, engins et maison ; version autonome (lien web, APK) et version
  ordinateur ; événements et revenus ponctuels ; opérations programmées ; lecture des relevés bancaires (PDF, photo) ;
  plusieurs engins et maisons ; démo de trois ans ; annuler et retour en arrière ; licence MIT.
