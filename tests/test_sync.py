"""Synchronisation téléphone ↔ ordinateur : fusion des réglages faits hors ligne et recalage de l'horloge.
Lancer : python3 -m unittest discover -s tests"""
import copy
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import serveur  # noqa: E402


def carnet():
    d = {"version": 5, "rev": 1, "operations": [], "supprimees": [],
         "parametres": {"postes": copy.deepcopy(serveur.POSTES_DEFAUT), "budgets": {},
                        "comptes": copy.deepcopy(serveur.COMPTES_DEFAUT), "biens": []}}
    return d


def ids(liste):
    return [x["id"] for x in liste]


def heure(decalage_min=0):
    t = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=decalage_min)
    return t.isoformat(timespec="milliseconds").replace("+00:00", "Z")


class FusionReglages(unittest.TestCase):
    def test_ajouts_des_deux_cotes_gardes(self):
        d = carnet()
        base = copy.deepcopy(d["parametres"]["postes"])
        # ordinateur : ajoute un poste « cadeaux »
        pc = base[:-1] + [{"id": "cadeaux", "label": "Cadeaux", "couleur": "#123456", "mots": []}, base[-1]]
        serveur.regler(d, {"postes": pc})
        # téléphone (hors ligne, à partir de base) : ajoute « sport »
        tel = base[:-1] + [{"id": "sport", "label": "Sport", "couleur": "#654321", "mots": []}, base[-1]]
        r = serveur.synchroniser(d, {"depuis": 0, "horloge": heure(), "changements": [
            {"type": "params", "id": "p1", "maj": heure(), "corps": {"postes": tel}, "base": {"postes": base}}]})
        postes = ids(d["parametres"]["postes"])
        self.assertIn("cadeaux", postes)
        self.assertIn("sport", postes)
        self.assertEqual(postes[-1], "autre")
        self.assertEqual(r["rejets"], [])
        self.assertEqual(r["conflits"], [])

    def test_sans_base_comportement_ancien(self):
        d = carnet()
        base = copy.deepcopy(d["parametres"]["postes"])
        serveur.regler(d, {"postes": base[:-1] + [{"id": "cadeaux", "label": "Cadeaux", "mots": []}, base[-1]]})
        serveur.synchroniser(d, {"depuis": 0, "changements": [
            {"type": "params", "id": "p1", "maj": heure(), "corps": {"postes": base}}]})
        self.assertNotIn("cadeaux", ids(d["parametres"]["postes"]))

    def test_champ_change_seulement_par_le_telephone(self):
        d = carnet()
        base = copy.deepcopy(d["parametres"]["postes"])
        p0 = base[0]["id"]
        pc = copy.deepcopy(base); pc[0]["mots"] = pc[0]["mots"] + ["boulangerie"]
        serveur.regler(d, {"postes": pc})
        tel = copy.deepcopy(base); tel[0]["couleur"] = "#000000"
        r = serveur.synchroniser(d, {"depuis": 0, "changements": [
            {"type": "params", "id": "p1", "maj": heure(), "corps": {"postes": tel}, "base": {"postes": base}}]})
        poste = next(x for x in d["parametres"]["postes"] if x["id"] == p0)
        self.assertEqual(poste["couleur"], "#000000")       # changé par le téléphone
        self.assertIn("boulangerie", poste["mots"])         # changé par l'ordinateur, gardé
        self.assertEqual(r["conflits"], [])

    def test_meme_champ_des_deux_cotes(self):
        d = carnet()
        base = copy.deepcopy(d["parametres"]["postes"])
        p0 = base[0]["id"]
        pc = copy.deepcopy(base); pc[0]["label"] = "Nom ordinateur"
        serveur.regler(d, {"postes": pc})
        tel = copy.deepcopy(base); tel[0]["label"] = "Nom téléphone"
        r = serveur.synchroniser(d, {"depuis": 0, "changements": [
            {"type": "params", "id": "p1", "maj": heure(), "corps": {"postes": tel}, "base": {"postes": base}}]})
        self.assertEqual(next(x for x in d["parametres"]["postes"] if x["id"] == p0)["label"], "Nom téléphone")
        self.assertEqual(len(r["conflits"]), 1)
        self.assertIn("label", r["conflits"][0]["motif"])

    def test_suppression_par_le_telephone(self):
        d = carnet()
        base = copy.deepcopy(d["parametres"]["postes"])
        retire = base[1]["id"]
        serveur.regler(d, {"postes": base[:-1] + [{"id": "cadeaux", "label": "Cadeaux", "mots": []}, base[-1]]})
        tel = [x for x in base if x["id"] != retire]
        serveur.synchroniser(d, {"depuis": 0, "changements": [
            {"type": "params", "id": "p1", "maj": heure(), "corps": {"postes": tel}, "base": {"postes": base}}]})
        postes = ids(d["parametres"]["postes"])
        self.assertNotIn(retire, postes)
        self.assertIn("cadeaux", postes)

    def test_ordre_change_par_le_telephone(self):
        d = carnet()
        base = copy.deepcopy(d["parametres"]["postes"])
        serveur.regler(d, {"postes": base[:-1] + [{"id": "cadeaux", "label": "Cadeaux", "mots": []}, base[-1]]})
        tel = [base[1], base[0]] + base[2:]
        serveur.synchroniser(d, {"depuis": 0, "changements": [
            {"type": "params", "id": "p1", "maj": heure(), "corps": {"postes": tel}, "base": {"postes": base}}]})
        postes = ids(d["parametres"]["postes"])
        self.assertEqual(postes[:2], [base[1]["id"], base[0]["id"]])
        self.assertIn("cadeaux", postes)
        self.assertEqual(postes[-1], "autre")

    def test_budget_et_releves(self):
        d = carnet()
        d["parametres"]["comptes"].append({"id": "banque", "nom": "Banque", "type": "courant", "mots": [], "releves": []})
        base = copy.deepcopy(d["parametres"])
        p0 = base["postes"][0]["id"]
        # ordinateur : un solde noté sur la banque et un budget
        serveur.regler(d, {"budgets": {p0: 50000}})
        d["parametres"]["comptes"][-1]["releves"] = [{"date": "2026-11-20", "solde": 100000}]
        # téléphone : renomme la banque à partir de l'ancien état (sans relevé)
        tel = copy.deepcopy(base["comptes"]); tel[-1]["nom"] = "Ma banque"
        serveur.synchroniser(d, {"depuis": 0, "changements": [
            {"type": "params", "id": "p1", "maj": heure(), "corps": {"comptes": tel}, "base": {"comptes": base["comptes"]}}]})
        c = d["parametres"]["comptes"][-1]
        self.assertEqual(c["nom"], "Ma banque")
        self.assertEqual(c["releves"], [{"date": "2026-11-20", "solde": 100000}])
        self.assertEqual(d["parametres"]["budgets"], {p0: 50000})


class Horloge(unittest.TestCase):
    def test_telephone_en_retard(self):
        """Téléphone en retard de 2 h : sa modification, faite APRÈS celle de l'ordinateur, doit l'emporter."""
        d = carnet()
        op = serveur.marquer(d, {"id": "o1", **serveur.nettoyer(
            {"date": "2026-11-20", "montant": 1000, "libelle": "pain", "nature": "depense", "categorie": "autre"}, d)})
        d["operations"].append(op)
        retard = -120
        r = serveur.synchroniser(d, {"depuis": 0, "horloge": heure(retard), "changements": [
            {"type": "set", "id": "o1", "maj": heure(retard),
             "doc": {"date": "2026-11-20", "montant": 1500, "libelle": "pain", "nature": "depense", "categorie": "autre"}}]})
        self.assertEqual(r["conflits"], [])
        self.assertEqual(d["operations"][0]["montant"], 1500)
        self.assertGreaterEqual(d["operations"][0]["maj"], op["maj"])

    def test_sans_horloge_inchange(self):
        self.assertEqual(serveur.decalage_horloge(None), dt.timedelta(0))
        self.assertEqual(serveur.decalage_horloge(heure(0)), dt.timedelta(0))
        self.assertEqual(serveur.recaler_maj("2026-11-20T10:00:00.000Z", dt.timedelta(hours=2)), "2026-11-20T12:00:00.000Z")


if __name__ == "__main__":
    unittest.main()
