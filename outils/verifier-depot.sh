#!/bin/bash
# Garde-fou : aucune donnée personnelle ne doit être suivie par git.
#  1) aucun fichier de données ou de signature (donnees/, carnet*.json, sauvegardes, .jks) ;
#  2) aucun mot interdit (noms de personnes, de lieux, de banques…) dans le CONTENU des fichiers suivis,
#     tels qu'ils seront enregistrés (index de git : ce qui part au prochain commit).
# La liste des mots interdits n'est pas publiée : un mot (ou une expression) par ligne, « # » = commentaire,
# dans outils/mots-interdits.txt (ignoré par git) ou dans la variable DAFTAR_MOTS_INTERDITS (secret GitHub
# du même nom pour les workflows ; mots séparés par des retours à la ligne ou des virgules).
# Comparaison sans casse ni accents, sur des mots entiers. Sans liste : avertissement, contrôle 1 seulement.
# Lancé par les workflows et par le crochet pre-commit (bash outils/installer-crochet.sh).
set -e
cd "$(dirname "$0")/.."
if git ls-files | grep -E '^donnees/|(^|/)carnet[^/]*\.json$|(^|/)appya-[0-9].*\.json$|\.jks$|\.keystore$'; then
  echo "ERREUR : des fichiers de données ou de signature sont suivis par git (voir ci-dessus)." >&2; exit 1
fi
# version : un seul endroit (app/version.js) ; package.json doit suivre
NUM="$(sed -n "s/.*numero: '\([^']*\)'.*/\1/p" app/version.js)"
PKG="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json)"
if [ -z "$NUM" ] || [ "$NUM" != "$PKG" ]; then
  echo "ERREUR : version $NUM (app/version.js) ≠ $PKG (package.json) : mettre package.json au même numéro." >&2; exit 1
fi
python3 -I - <<'PY'
import os, re, subprocess, sys, unicodedata

def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c))

brut = ""
if os.path.isfile("outils/mots-interdits.txt"):
    brut = open("outils/mots-interdits.txt", encoding="utf-8").read()
brut += "\n" + os.environ.get("DAFTAR_MOTS_INTERDITS", "")
mots = []
for ligne in brut.splitlines():
    for mot in norm(ligne.split("#", 1)[0]).split(","):
        mot = mot.strip()
        if mot and mot not in mots:
            mots.append(mot)
if not mots:
    print("Attention : aucune liste de mots interdits (outils/mots-interdits.txt ou DAFTAR_MOTS_INTERDITS) ;"
          " seul le contrôle des fichiers a été fait.", file=sys.stderr)
    print("Dépôt propre : aucun fichier de données suivi.")
    sys.exit(0)
motif = re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(m).replace(r"\ ", r"\s+") for m in mots) + r")(?![a-z0-9])")

# fichiers de l'index (contenu qui partira au prochain commit) ; binaires et bibliothèques tierces (*.min.js, package-lock) ignorés
liste = subprocess.run(["git", "ls-files", "-s", "-z"], capture_output=True, check=True).stdout.split(b"\0")
trouves = 0
for e in liste:
    if not e:
        continue
    meta, chemin = e.split(b"\t", 1)
    chemin = chemin.decode("utf-8", "replace")
    if chemin == "outils/mots-interdits.txt":
        print(f"ERREUR : {chemin} est suivi par git : il doit rester hors du dépôt.", file=sys.stderr)
        trouves += 1
        continue
    if chemin.endswith(".min.js") or chemin == "package-lock.json":
        continue
    contenu = subprocess.run(["git", "cat-file", "blob", meta.split()[1].decode()], capture_output=True, check=True).stdout
    if b"\0" in contenu[:8000]:
        continue
    for n, ligne in enumerate(contenu.decode("utf-8", "replace").splitlines(), 1):
        for m in motif.finditer(norm(ligne)):
            print(f"{chemin}:{n} : mot interdit « {m.group(1)} »", file=sys.stderr)
            trouves += 1
if trouves:
    print(f"ERREUR : {trouves} donnée(s) personnelle(s) dans les fichiers suivis (voir ci-dessus).", file=sys.stderr)
    sys.exit(1)
print(f"Dépôt propre : aucun fichier de données, aucun des {len(mots)} mots interdits.")
PY
