"""API HTTP de serveur.py, sur une COPIE de l'application dans un dossier temporaire (jamais sur les vraies données) :
lecture, ajout, lot tout-ou-rien, modification, suppression, réglages, reclassement, synchronisation, sécurité
(Host, Origin), sauvegarde du jour et écriture atomique."""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def port_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dossier = tempfile.mkdtemp(prefix="daftar-test-")
        shutil.copy(os.path.join(RACINE, "serveur.py"), cls.dossier)
        shutil.copytree(os.path.join(RACINE, "app"), os.path.join(cls.dossier, "app"))
        os.makedirs(os.path.join(cls.dossier, "donnees"))
        cls.port = port_libre()
        cls.url = "http://127.0.0.1:%d" % cls.port
        env = dict(os.environ, HOME=cls.dossier)   # aucune trace dans le vrai dossier personnel
        cls.proc = subprocess.Popen([sys.executable, os.path.join(cls.dossier, "serveur.py"), "--sans-navigateur", "--port", str(cls.port)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env=env)
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.url + "/api/info", timeout=1)
                break
            except OSError:
                time.sleep(.1)
        else:
            cls.proc.kill()
            raise RuntimeError("le serveur de test ne démarre pas : " + cls.proc.stderr.read().decode()[-2000:])

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(5)
        cls.proc.stderr.close()
        shutil.rmtree(cls.dossier, ignore_errors=True)

    def req(self, methode, chemin, corps=None, origine=True, entetes=None):
        h = {"Content-Type": "application/json"}
        if origine:
            h["Origin"] = self.url
        h.update(entetes or {})
        r = urllib.request.Request(self.url + chemin, method=methode, headers=h,
                                   data=None if corps is None else json.dumps(corps).encode())
        try:
            with urllib.request.urlopen(r, timeout=5) as rep:
                return rep.status, json.loads(rep.read() or b"null")
        except urllib.error.HTTPError as e:
            texte = e.read()
            try:
                return e.code, json.loads(texte)
            except ValueError:
                return e.code, texte.decode("utf-8", "replace")

    def op(self, **k):
        base = {"date": "2026-11-20", "montant": 1500, "libelle": "pain", "nature": "depense", "compte": "especes", "categorie": "foyer"}
        base.update(k)
        return base

    def donnees(self):
        return self.req("GET", "/api/donnees")[1]

    def fichier(self):
        with open(os.path.join(self.dossier, "donnees", "carnet.json"), encoding="utf-8") as f:
            return json.load(f)

    # --- lecture et écriture des opérations ---
    def test_info_et_carnet_vide(self):
        code, info = self.req("GET", "/api/info")
        self.assertEqual((code, info["app"]), (200, "appya"))
        d = self.donnees()
        self.assertEqual(d["version"], 5)
        self.assertEqual(d["parametres"]["postes"][-1]["id"], "autre")

    def test_ajout_modification_suppression(self):
        code, o = self.req("POST", "/api/operations", self.op(libelle="baguette"))
        self.assertEqual(code, 200)
        self.assertIn(o["id"], [x["id"] for x in self.fichier()["operations"]])
        code, o2 = self.req("PUT", "/api/operations/" + o["id"], self.op(libelle="baguette", montant=2000))
        self.assertEqual((code, o2["montant"]), (200, 2000))
        self.assertEqual(self.req("DELETE", "/api/operations/" + o["id"])[0], 200)
        self.assertNotIn(o["id"], [x["id"] for x in self.fichier()["operations"]])
        self.assertIn(o["id"], [t["id"] for t in self.fichier()["supprimees"]])
        self.assertEqual(self.req("DELETE", "/api/operations/" + o["id"])[0], 404)
        self.assertEqual(self.req("PUT", "/api/operations/inconnue", self.op())[0], 404)

    def test_lot_tout_ou_rien(self):
        avant = len(self.donnees()["operations"])
        code, rep = self.req("POST", "/api/operations", [self.op(libelle="a"), self.op(libelle="b", montant=0)])
        self.assertEqual(code, 400)
        self.assertIn("erreur", rep)
        self.assertEqual(len(self.donnees()["operations"]), avant)
        code, rep = self.req("POST", "/api/operations", [self.op(libelle="a"), self.op(libelle="b")])
        self.assertEqual((code, len(rep)), (200, 2))
        self.assertEqual(len(self.donnees()["operations"]), avant + 2)

    def test_refus_d_une_operation_invalide(self):
        for mauvais in (self.op(montant=-1), self.op(date="hier"), self.op(nature="vol"), self.op(compte="inconnu"), self.op(libelle="")):
            with self.subTest(op=mauvais):
                code, rep = self.req("POST", "/api/operations", mauvais)
                self.assertEqual(code, 400)
                self.assertTrue(rep["erreur"])

    # --- réglages ---
    def test_reglages_et_reclassement(self):
        prm = self.donnees()["parametres"]
        postes = prm["postes"][:-1] + [{"id": "sport", "label": "Sport", "couleur": "#123456", "mots": ["foot"]}] + prm["postes"][-1:]
        self.assertEqual(self.req("PUT", "/api/parametres", {"postes": postes, "budgets": {"sport": 20000}})[0], 200)
        prm = self.donnees()["parametres"]
        self.assertIn("sport", [p["id"] for p in prm["postes"]])
        self.assertEqual(prm["postes"][-1]["id"], "autre")
        self.assertEqual(prm["budgets"], {"sport": 20000})
        o = self.req("POST", "/api/operations", self.op(libelle="ballon"))[1]
        code, rep = self.req("POST", "/api/reclasser", {"changements": [{"id": o["id"], "categorie": "sport"}]})
        self.assertEqual((code, rep["modifiees"]), (200, 1))
        self.assertEqual(self.req("POST", "/api/reclasser", {"changements": [{"id": o["id"], "categorie": "inconnu"}]})[0], 400)
        # poste supprimé : ses lignes vont dans « Autre »
        self.req("PUT", "/api/parametres", {"postes": [p for p in self.donnees()["parametres"]["postes"] if p["id"] != "sport"]})
        self.assertEqual(next(x for x in self.donnees()["operations"] if x["id"] == o["id"])["categorie"], "autre")

    def test_compte_utilise_non_supprimable(self):
        prm = self.donnees()["parametres"]
        comptes = prm["comptes"] + [{"id": "coffre", "nom": "Coffre", "type": "epargne", "mots": [], "releves": []}]
        self.assertEqual(self.req("PUT", "/api/parametres", {"comptes": comptes})[0], 200)
        self.req("POST", "/api/operations", self.op(compte="coffre"))
        code, rep = self.req("PUT", "/api/parametres", {"comptes": prm["comptes"]})
        self.assertEqual(code, 400)
        self.assertIn("coffre", [c["id"] for c in self.donnees()["parametres"]["comptes"]])

    # --- synchronisation ---
    def test_synchronisation(self):
        rev = self.donnees()["rev"]
        code, r = self.req("POST", "/api/sync", {"depuis": rev, "changements": [
            {"type": "set", "id": "ttel1", "maj": "2026-11-20T10:00:00.000Z", "doc": self.op(libelle="du téléphone")},
            {"type": "set", "id": "ttel2", "maj": "2026-11-20T10:00:00.000Z", "doc": self.op(montant=0)},
            {"type": "inconnu", "id": "ttel3", "maj": "2026-11-20T10:00:00.000Z"}]})
        self.assertEqual(code, 200)
        self.assertEqual(sorted(x["id"] for x in r["rejets"]), ["ttel2", "ttel3"])
        self.assertIn("ttel1", [o["id"] for o in r["operations"]])
        self.assertGreater(r["rev"], rev)
        # suppression venue du téléphone
        code, r = self.req("POST", "/api/sync", {"depuis": r["rev"], "changements": [
            {"type": "del", "id": "ttel1", "maj": "2099-01-01T00:00:00.000Z"}]})
        self.assertIn("ttel1", [t["id"] for t in r["supprimees"]])

    # --- sécurité ---
    def test_origine_etrangere_refusee(self):
        avant = len(self.donnees()["operations"])
        code, _ = self.req("POST", "/api/operations", self.op(), origine=False, entetes={"Origin": "http://evil.example"})
        self.assertEqual(code, 403)
        self.assertEqual(len(self.donnees()["operations"]), avant)

    def test_hote_etranger_refuse(self):
        # DNS rebinding : un nom de domaine quelconque pointant vers 127.0.0.1 ne doit rien obtenir
        code, _ = self.req("GET", "/api/donnees", entetes={"Host": "evil.example"})
        self.assertIn(code, (400, 403))
        code, _ = self.req("GET", "/api/donnees", entetes={"Host": "machine.ts.net.evil.example"})
        self.assertIn(code, (400, 403))

    def test_corps_trop_gros_ou_illisible(self):
        r = urllib.request.Request(self.url + "/api/operations", method="POST", data=b"{pas du json",
                                   headers={"Content-Type": "application/json", "Origin": self.url})
        with self.assertRaises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(r, timeout=5)
        self.assertEqual(e.exception.code, 400)
        e.exception.close()

    def test_corps_de_mauvaise_forme(self):
        # 2026-11-27 : une liste envoyée à /api/reclasser donnait une erreur 500 ; tout corps mal formé est refusé (400)
        avant = self.fichier()
        for methode, chemin, corps in [("POST", "/api/reclasser", [{"id": "x", "categorie": "foyer"}]),
                                       ("POST", "/api/reclasser", {"changements": ["x"]}),
                                       ("POST", "/api/reclasser", {"changements": {"id": "x"}}),
                                       ("PUT", "/api/parametres", [{"postes": []}]),
                                       ("POST", "/api/sync", ["x"]),
                                       ("POST", "/api/operations", ["pas un objet"]),
                                       ("POST", "/api/operations", 42),
                                       ("PUT", "/api/operations/abc", "texte")]:
            with self.subTest(chemin=chemin, corps=corps):
                code, rep = self.req(methode, chemin, corps)
                self.assertEqual(code, 400, rep)
                self.assertIn("erreur", rep)
        self.assertEqual(self.fichier(), avant)
        # les formes correctes passent toujours : un objet, un lot d'objets
        self.assertEqual(self.req("POST", "/api/reclasser", {"changements": []})[0], 200)
        code, lot = self.req("POST", "/api/operations", [self.op(), self.op(libelle="lait")])
        self.assertEqual((code, len(lot)), (200, 2))

    # --- fichiers ---
    def test_sauvegarde_et_ecriture_atomique(self):
        self.req("POST", "/api/operations", self.op(libelle="déclenche une sauvegarde"))
        dossier = os.path.join(self.dossier, "donnees")
        self.assertFalse([f for f in os.listdir(dossier) if f.endswith(".tmp")], "fichier temporaire laissé")
        sauv = os.path.join(dossier, "sauvegardes")
        self.assertTrue(os.path.isdir(sauv) and os.listdir(sauv), "aucune sauvegarde du jour")
        self.assertTrue(self.fichier()["operations"])   # fichier complet et lisible


if __name__ == "__main__":
    unittest.main()
