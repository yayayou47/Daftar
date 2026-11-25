/* Appelle les fonctions de app/moteur.js sous Node, pour les comparer à celles de serveur.py (tests/test_parite_moteur.py).
   Entrée (stdin) : {"demo": "AAAA-MM-JJ"?, "appels": [{"fn": "nettoyer", "args": [...]}, …]}
   Un argument {"$carnet": true} est remplacé par une copie neuve du carnet de démo ; {"$carnet": "partage"} par le carnet
   lui-même (fonctions qui ne le modifient pas : bien plus rapide).
   Sortie : {"demo": carnet de démo, "res": [{"ok": résultat, "apres": premier argument après l'appel} | {"erreur": message}]} */
'use strict';
const fs = require('fs'), path = require('path');
global.window = {};
for (const f of ['moteur.js', 'demo.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8'));
const M = window.AppYaMoteur, copie = x => JSON.parse(JSON.stringify(x));
const entree = JSON.parse(fs.readFileSync(0, 'utf8'));
const demo = entree.demo ? window.AppYaDemo.generer(entree.demo) : null;
const res = (entree.appels || []).map(a => {
  const args = a.args.map(x => (x && x.$carnet === 'partage' ? demo : x && x.$carnet ? copie(demo) : copie(x)));
  try {
    const ok = M[a.fn](...args);
    return {ok: ok === undefined ? null : ok, apres: args[0] === undefined ? null : args[0]};
  } catch (e) { return {erreur: String(e && e.message || e)}; }
});
process.stdout.write(JSON.stringify({demo, res}));
