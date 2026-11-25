# Daftar

Suivi financier personnel, carnet du véhicule et carnet de la maison, en français et en francs CFA.
Dépenses, revenus, comptes (espèces, banque, mobile money), prêts aux proches, biens et patrimoine,
statistiques, export Excel. Fonctionne hors ligne. **Aucune donnée n'est incluse** : chacun commence
avec un carnet vide, et ses données restent chez lui.

**Démo** (trois années de données simulées, rien à installer) : https://yayayou47.github.io/Daftar/?demo

## Trois façons de l'utiliser

| Version | Où trouver | Où sont les données |
|---|---|---|
| **Lien web** (le plus simple) | https://yayayou47.github.io/Daftar/ : ouvrir dans Chrome, puis ⋮ › *Installer l'application* | dans l'appareil |
| **Android (APK)** | page [Releases](https://github.com/yayayou47/Daftar/releases) : `Daftar-X.Y.Z.apk` | dans le téléphone |
| **Ordinateur Ubuntu** | page [Releases](https://github.com/yayayou47/Daftar/releases) : `Daftar-ubuntu-X.Y.Z.zip`, décompresser puis `bash installer.sh` | `~/Daftar/donnees/carnet.json`, sauvegarde chaque jour |

Sur le téléphone, les données n'existent que dans l'appareil : utilisez régulièrement
**Données et réglages › Sauvegarde › Exporter mes données** et gardez le fichier en lieu sûr.
Ce fichier se réimporte sur un autre téléphone, ou se copie en `donnees/carnet.json` sur l'ordinateur.

La version ordinateur peut aussi servir un téléphone synchronisé (via Tailscale) : voir `LISEZMOI.txt`.

## Pour le développement

- `app/` : la page (`index.html`, `style.css` et six scripts chargés dans l'ordre : `noyau.js`, `vues.js`,
  `saisie.js`, `stats.js`, `reglages.js`, `demarrage.js`), le numéro de version (`version.js`, seul endroit où il
  est écrit), le moteur de la version autonome (`moteur.js`, mêmes règles que `serveur.py`), le service hors ligne
  (`sw.js`), le manifeste et les icônes.
- `serveur.py` : serveur local de la version ordinateur (Python 3.8+, bibliothèque standard).
- `outils/construire-web.sh` : construit la version autonome (lien web et APK).
- `tests/` : `python3 -m unittest discover -s tests` (bibliothèque standard ; Node pour les tests de la page et du
  moteur, sautés sans lui). API HTTP sur une copie temporaire, synchronisation, parité `serveur.py` ↔ `moteur.js`
  (toutes les opérations de la démo et des cas limites), fonctions de calcul de la page chargée sous Node avec un faux
  DOM et les données de démo (`tests/page.js`). Lancés par les deux workflows avant toute publication.
- Chaque envoi sur `main` met à jour le lien web ; chaque tag `vX.Y.Z` publie l'APK et le zip Ubuntu
  (`.github/workflows/`).

Le dossier `donnees/` n'est jamais versionné (`.gitignore`, contrôle `outils/verifier-depot.sh`).
Ce contrôle cherche aussi, dans le contenu des fichiers, une liste de mots interdits (noms de
personnes, de lieux…) gardée hors du dépôt : `outils/mots-interdits.txt` en local, secret
`DAFTAR_MOTS_INTERDITS` dans les workflows. `bash outils/installer-crochet.sh` le lance avant chaque commit.

Bibliothèques incluses : SheetJS 0.18.5 (`app/xlsx.full.min.js`) et pdf.js 3.11.174 (`app/pdf.min.js`,
`app/pdf.worker.min.js`), toutes deux sous licence Apache 2.0. L'OCR des relevés photographiés
utilise tesseract.js 5.1.1, téléchargé à la demande.

Journal des versions : `CHANGELOG.md`.

## Licence

Code de Daftar sous licence MIT (fichier `LICENSE`) : chacun peut l'utiliser, le modifier et le
redistribuer, en gardant la mention de licence ; il est fourni sans garantie.
