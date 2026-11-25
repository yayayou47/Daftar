"""Parité serveur.py ↔ app/moteur.js : la fusion des réglages (fusionner_reglages / fusionnerReglages) donne le même
résultat des deux côtés, sur des cas tirés au hasard (graine fixe). Demande Node ; sauté s'il est absent."""
import copy
import json
import os
import random
import shutil
import subprocess
import sys
import unittest

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, RACINE)
import serveur  # noqa: E402

JS = r"""
const fs = require('fs'); global.window = {};
eval(fs.readFileSync(process.argv[1], 'utf8'));
const cas = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(cas.map(c => window.AppYaMoteur.fusionnerReglages(c.prm, c.base, c.corps))));
"""


def modifier(r, postes):
    """Un réglage modifié au hasard : ajout, retrait, déplacement, champ changé."""
    p = copy.deepcopy(postes)
    for _ in range(r.randint(1, 3)):
        choix = r.randrange(4)
        if choix == 0:
            n = "p%d" % r.randrange(1000)
            if n not in [x["id"] for x in p]:
                p.insert(r.randrange(len(p) + 1), {"id": n, "label": n.upper(), "couleur": "#112233", "mots": [n]})
        elif choix == 1 and len(p) > 2:
            p.pop(r.randrange(len(p)))
        elif choix == 2 and len(p) > 2:
            x = p.pop(r.randrange(len(p)))
            p.insert(r.randrange(len(p) + 1), x)
        elif p:
            x = r.choice(p)
            champ = r.choice(["label", "couleur", "mots"])
            x[champ] = (x[champ] + ["m%d" % r.randrange(9)]) if champ == "mots" else "%s%d" % (champ, r.randrange(9))
    return p


class Parite(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node absent")
    def test_meme_fusion(self):
        r = random.Random(20261125)
        base = {"postes": copy.deepcopy(serveur.POSTES_DEFAUT),
                "budgets": {"foyer": 100000, "loyer": 50000},
                "devises": [{"code": "XAF", "taux": 1}, {"code": "EUR", "taux": 655}]}
        cas = []
        for _ in range(300):
            eux = {"postes": modifier(r, base["postes"]), "budgets": dict(base["budgets"]), "devises": copy.deepcopy(base["devises"])}
            moi = {"postes": modifier(r, base["postes"]), "budgets": dict(base["budgets"]), "devises": copy.deepcopy(base["devises"])}
            if r.random() < .5:
                eux["budgets"]["sante"] = r.randrange(1, 9) * 1000
            if r.random() < .5:
                moi["budgets"].pop("foyer", None)
            if r.random() < .3:
                moi["devises"].append({"code": "USD", "taux": 592})
            if r.random() < .3:
                eux["devises"][1]["taux"] = 656
            cas.append({"prm": eux, "base": base, "corps": moi})
        sortie = subprocess.run(["node", "-e", JS, os.path.join(RACINE, "app", "moteur.js")],
                                input=json.dumps(cas), capture_output=True, text=True, check=True).stdout
        js = json.loads(sortie)
        for i, c in enumerate(cas):
            corps, conflits = serveur.fusionner_reglages(c["prm"], c["base"], c["corps"])
            self.assertEqual(js[i]["corps"], corps, "cas %d" % i)
            self.assertEqual(js[i]["conflits"], conflits, "cas %d" % i)


if __name__ == "__main__":
    unittest.main()
