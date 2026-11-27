"""Parité serveur.py ↔ app/moteur.js : mêmes entrées, mêmes résultats (y compris les messages d'erreur).
Couvre les constantes partagées, le carnet vide, nettoyer (toutes les opérations de la démo + cas limites), regler,
reclasser et purger_corbeille. Demande Node ; sauté s'il est absent.
Rappel (CLAUDE.md) : toute règle changée dans l'un se reporte dans l'autre ; ce test le vérifie."""
import copy
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, RACINE)
import serveur  # noqa: E402

JOUR = "2026-11-25"
CARNET = {"$carnet": True}         # copie neuve du carnet de démo
PARTAGE = {"$carnet": "partage"}    # le même carnet (fonctions qui ne le modifient pas)


def node(appels):
    sortie = subprocess.run(["node", os.path.join(RACINE, "tests", "moteur_node.js")],
                            input=json.dumps({"demo": JOUR, "appels": appels}), capture_output=True, text=True, check=True).stdout
    return json.loads(sortie)


def sans_volatil(x):
    """Retire ce qui dépend de l'heure (maj, horodatage de l'historique) ; rev reste comparé."""
    if isinstance(x, dict):
        return {k: sans_volatil(v) for k, v in x.items() if k not in ("maj",)}
    if isinstance(x, list):
        return [sans_volatil(v) for v in x]
    return x


def sans_dates_historique(d):
    d = copy.deepcopy(d)
    for h in d.get("historique") or []:
        h.pop("date", None)
    return d


def py(fn, *args):
    try:
        ok = fn(*args)
        return {"ok": ok, "apres": args[0] if args else None}
    except (ValueError, KeyError) as e:
        return {"erreur": str(e.args[0]) if e.args else str(e)}


@unittest.skipUnless(shutil.which("node"), "Node absent")
class Parite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.demo = node([])["demo"]

    def comparer(self, appels, appels_py, quoi):
        js = node(appels)["res"]
        for i, (a, p) in enumerate(zip(js, appels_py)):
            with self.subTest(quoi=quoi, cas=i, entree=json.dumps(appels[i]["args"][-1], ensure_ascii=False)[:200]):
                self.assertEqual("erreur" in a, "erreur" in p, "l'un refuse, l'autre accepte : JS %r / Python %r"
                                 % (a.get("erreur"), p.get("erreur")))
                if "erreur" in a:
                    self.assertEqual(a["erreur"], p["erreur"])
                else:
                    self.assertEqual(sans_volatil(a["ok"]), sans_volatil(json.loads(json.dumps(p["ok"]))))
                    self.assertEqual(sans_volatil(sans_dates_historique(a["apres"])),
                                     sans_volatil(sans_dates_historique(json.loads(json.dumps(p["apres"])))))

    def test_constantes(self):
        js = node([])
        sortie = subprocess.run(["node", "-e", "global.window={};eval(require('fs').readFileSync(process.argv[1],'utf8'));"
                                 "const M=window.AppYaMoteur;process.stdout.write(JSON.stringify({p:M.POSTES_DEFAUT,c:M.COMPTES_DEFAUT,"
                                 "r:M.REVENUS_DEFAUT,t:M.TYPES_EVENEMENT,d:M.DELAI_CORBEILLE,v:M.vide()}))",
                                 os.path.join(RACINE, "app", "moteur.js")], capture_output=True, text=True, check=True).stdout
        m = json.loads(sortie)
        self.assertTrue(js["demo"]["operations"])
        self.assertEqual(m["p"], serveur.POSTES_DEFAUT)
        self.assertEqual(m["c"], serveur.COMPTES_DEFAUT)
        self.assertEqual(m["r"], serveur.REVENUS_DEFAUT)
        self.assertEqual(m["t"], list(serveur.TYPES_EVENEMENT))
        self.assertEqual(m["d"], serveur.DELAI_CORBEILLE)
        with tempfile.TemporaryDirectory() as t:
            ancien, serveur.FICHIER = serveur.FICHIER, os.path.join(t, "absent.json")
            try:
                self.assertEqual(m["v"], serveur.lire())
            finally:
                serveur.FICHIER = ancien

    def test_nettoyer_operations_de_la_demo(self):
        docs = [{k: v for k, v in o.items() if k not in ("id", "rev", "maj")} for o in self.demo["operations"]]
        appels = [{"fn": "nettoyer", "args": [doc, PARTAGE]} for doc in docs]
        js = node(appels)["res"]
        for i, doc in enumerate(docs):
            p = py(serveur.nettoyer, doc, self.demo)   # nettoyer ne modifie pas le carnet
            with self.subTest(cas=i, libelle=doc.get("libelle")):
                self.assertNotIn("erreur", js[i])
                self.assertNotIn("erreur", p)
                self.assertEqual(js[i]["ok"], json.loads(json.dumps(p["ok"])))

    def test_nettoyer_cas_limites(self):
        base = {"date": "2026-11-20", "montant": 1500, "libelle": "pain", "nature": "depense", "compte": "especes", "categorie": "foyer",
                "cree": "2026-11-20T08:00:00Z"}   # sans cree, chaque côté prend l'heure du moment
        variantes = [
            {}, {"montant": 0}, {"montant": -5}, {"montant": "abc"}, {"montant": "1500"}, {"montant": 1500.5}, {"montant": 1e13},
            {"date": "2026-13-01"}, {"date": "20/11/2026"}, {"date": ""}, {"libelle": ""}, {"libelle": "  pain   chaud  "},
            {"libelle": "x" * 500}, {"nature": "vol"}, {"compte": "inconnu"}, {"categorie": "inconnu"},
            {"nature": "virement", "vers": "banque"}, {"nature": "virement", "vers": "especes"}, {"nature": "virement", "vers": ""},
            {"nature": "pret", "personne": "Ali", "echeance": "2026-12-31"}, {"nature": "pret", "personne": ""},
            {"nature": "remboursement", "personne": "Ali"}, {"nature": "investissement", "bien": "villa", "cat_maison": "materiaux"},
            {"nature": "investissement", "bien": ""}, {"nature": "investissement", "bien": "inconnu"},
            {"nature": "revenu", "compte": "banque", "cat_revenu": "salaire"}, {"nature": "revenu", "cat_revenu": "inconnu"},
            {"categorie": "voiture", "vehicule": "corolla", "cat_vehicule": "carburant", "km": 120000, "quantite": 30.5},
            {"categorie": "voiture", "vehicule": "corolla", "km": -3}, {"vehicule": "inconnu"},
            {"evenement": "mariage-awa"}, {"evenement": "inconnu"}, {"remarque": "note"}, {"tiers": "banque"},
            {"nature": "revenu", "cat_revenu": "salaire", "ponctuel": 500, "cat_ponctuel": "mission"},
            {"nature": "revenu", "cat_revenu": "salaire", "ponctuel": "500,5"}, {"nature": "revenu", "ponctuel": 1500},
            {"nature": "revenu", "ponctuel": -3}, {"nature": "revenu", "ponctuel": "abc"}, {"nature": "revenu", "ponctuel": 0},
            {"nature": "revenu", "ponctuel": 200, "cat_ponctuel": "inconnu"}, {"ponctuel": 200, "cat_ponctuel": "mission"},
            {"prog": "frais-banque", "prog_date": "2026-11-30"}, {"cree": "2026-11-20T08:00:00Z"}, {"cree": "n'importe quoi"},
        ]
        docs = [{**base, **v} for v in variantes]
        appels = [{"fn": "nettoyer", "args": [doc, PARTAGE]} for doc in docs]
        js = node(appels)["res"]
        for i, doc in enumerate(docs):
            p = py(serveur.nettoyer, doc, self.demo)
            with self.subTest(variante=variantes[i]):
                self.assertEqual("erreur" in js[i], "erreur" in p, "JS %r / Python %r" % (js[i], p))
                if "erreur" in p:
                    self.assertEqual(js[i]["erreur"], p["erreur"])
                else:
                    self.assertEqual(js[i]["ok"], json.loads(json.dumps(p["ok"])))

    def test_regler(self):
        prm = self.demo["parametres"]
        postes = copy.deepcopy(prm["postes"])
        corps = [
            {"postes": postes[:-1] + [{"id": "sport", "label": "Sport", "couleur": "#123456", "mots": ["foot", "sport"]}] + postes[-1:]},
            {"postes": [p for p in postes if p["id"] != "repas"], "deplacer": {"repas": "foyer"}},
            {"postes": [p for p in postes if p["id"] != "repas"]},
            {"postes": [{**postes[0], "label": postes[1]["label"]}] + postes[1:]},
            {"postes": [{**postes[0], "id": "mauvais id !"}] + postes[1:]},
            {"budgets": {"foyer": 150000, "inconnu": 5, "loyer": 0}},
            {"budgets": {"foyer": "abc"}},
            {"comptes": prm["comptes"] + [{"id": "coffre", "nom": "Coffre", "type": "epargne", "mots": [], "releves": [{"date": "2026-11-01", "solde": 5000}]}]},
            {"comptes": [c for c in prm["comptes"] if c["id"] != "mobile"]},
            {"comptes": prm["comptes"] + [{"id": "frere", "nom": "Compte du frère", "type": "tiers", "titulaire": "Frère", "moi": ["ali"],
                                           "contrib": ["contribution"], "releves": [{"date": "2026-11-01", "solde": -244000}]}]},
            {"biens": [b for b in prm["biens"] if b["id"] != "villa"]},
            {"biens": prm["biens"] + [{"id": "champ", "nom": "Champ", "type": "actif", "date_achat": "2025-01-01", "prix_achat": 800000,
                                       "poste": "", "mots": ["champ"], "estimations": [{"date": "2026-01-01", "valeur": 900000}]}]},
            {"devises": [{"code": "XAF", "taux": 1}, {"code": "EUR", "taux": 655}, {"code": "usd", "taux": "592,13"}]},
            {"devises": [{"code": "EURO", "taux": 655}]},
            {"revenus": [{"id": "salaire", "label": "Salaire", "courant": True, "mots": ["salaire"]}]},
            {"evenements": prm["evenements"][:1]},
            {"programmees": prm["programmees"] + [{"id": "interets", "libelle": "Intérêts", "nature": "revenu", "mode": "interets",
                                                   "compte": "epargne", "cat_revenu": "interets", "periode": 6, "jour": 31, "debut": "2026-01-01"}]},
            {"origine": True},
        ]
        appels = [{"fn": "regler", "args": [CARNET, c]} for c in corps]
        attendu = [py(serveur.regler, copy.deepcopy(self.demo), copy.deepcopy(c)) for c in corps]
        self.comparer(appels, attendu, "regler")

    def test_reclasser(self):
        ops = self.demo["operations"]
        dep = [o["id"] for o in ops if o["nature"] == "depense"][:5]
        rev = [o["id"] for o in ops if o["nature"] == "revenu"][:1]
        corps = [{"changements": [{"id": i, "categorie": "aides"} for i in dep + rev]},
                 {"changements": [{"id": dep[0], "categorie": "inconnu"}]},
                 {"changements": []}]
        appels = [{"fn": "reclasser", "args": [CARNET, c]} for c in corps]

        def reclasser_py(d, corps):
            # même corps que la route POST /api/reclasser de serveur.py (fonction locale au gestionnaire)
            ids = serveur.ids_postes(d)
            voulu = {}
            for c in (corps.get("changements") or []):
                if c.get("categorie") not in ids:
                    raise ValueError("Poste inconnu : %s" % c.get("categorie"))
                voulu[str(c.get("id"))] = c["categorie"]
            n = 0
            for x in d["operations"]:
                if x.get("id") in voulu and x.get("nature") == "depense" and x.get("categorie") != voulu[x["id"]]:
                    x["categorie"] = voulu[x["id"]]
                    serveur.marquer(d, x)
                    n += 1
            return {"modifiees": n}
        self.comparer(appels, [py(reclasser_py, copy.deepcopy(self.demo), c) for c in corps], "reclasser")

    def test_purger_corbeille(self):
        d = copy.deepcopy(self.demo)
        for c in d["parametres"]["comptes"]:
            if c["id"] == "mobile":
                c["supprime"] = "2026-10-01"      # plus de 30 jours avant JOUR : effacé
            if c["id"] == "epargne":
                c["supprime"] = "2026-11-10"      # moins de 30 jours : gardé
        js = node([{"fn": "purgerCorbeille", "args": [d, JOUR]}])["res"][0]
        p = py(serveur.purger_corbeille, copy.deepcopy(d), dt.date.fromisoformat(JOUR))
        self.assertTrue(p["ok"])
        self.assertEqual(js["ok"], p["ok"])
        self.assertEqual(sans_volatil(js["apres"]), sans_volatil(json.loads(json.dumps(p["apres"]))))
        self.assertNotIn("mobile", [c["id"] for c in p["apres"]["parametres"]["comptes"]])
        self.assertIn("epargne", [c["id"] for c in p["apres"]["parametres"]["comptes"]])


if __name__ == "__main__":
    unittest.main()
