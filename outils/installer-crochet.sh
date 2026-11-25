#!/bin/bash
# Installe le crochet git « pre-commit » qui lance outils/verifier-depot.sh avant chaque commit :
# un commit contenant un fichier de données ou un mot interdit est refusé.
set -e
cd "$(dirname "$0")/.."
# Le disque P_O (vfat) ne garde pas le bit exécutable, que git exige pour un crochet : dans ce cas les crochets
# vont dans ~/.local/share/daftar/crochets (core.hooksPath, réglage local de ce dépôt seulement).
dossier="$(git rev-parse --git-path hooks)"
touch "$dossier/.essai-x" && chmod +x "$dossier/.essai-x" 2>/dev/null || true
if [ ! -x "$dossier/.essai-x" ]; then
  dossier="$HOME/.local/share/daftar/crochets"; mkdir -p "$dossier"
  git config core.hooksPath "$dossier"
fi
rm -f "$(git rev-parse --git-path hooks)/.essai-x"
crochet="$dossier/pre-commit"
cat > "$crochet" <<'SH'
#!/bin/bash
# installé par outils/installer-crochet.sh
exec bash "$(git rev-parse --show-toplevel)/outils/verifier-depot.sh"
SH
chmod +x "$crochet"
echo "Crochet installé : $crochet"
[ -f outils/mots-interdits.txt ] || echo "À faire : créer outils/mots-interdits.txt (un mot ou une expression par ligne)."
