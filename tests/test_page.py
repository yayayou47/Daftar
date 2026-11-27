"""Fonctions de calcul de la page (app/index.html), chargée sous Node par tests/page.js avec les données de démo
(app/demo.js, graine fixe). Deux sortes de contrôles :
  - cas écrits à la main (saisie des montants, abréviations, reconnaissance des notes, collage d'une liste) ;
  - grandeurs RECALCULÉES ici en Python à partir des mêmes données (soldes, flux, médiane, patrimoine), sans passer
    par le code de la page.
Demande Node ; sauté s'il est absent."""
import json
import os
import shutil
import statistics
import subprocess
import unittest

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
JOUR = "2026-11-25"
_cache = {}


def page(*expressions, autonome=False):
    """Évalue des expressions JS dans la page chargée avec la démo ; rend leurs valeurs (NaN → "NaN").
    autonome : version téléphone / lien web (données dans l'appareil)."""
    sortie = subprocess.run(["node", os.path.join(RACINE, "tests", "page.js"), "demo", JOUR] + (["autonome"] if autonome else []),
                            input=json.dumps([{"expr": e} for e in expressions]), capture_output=True, text=True)
    if sortie.returncode:
        raise AssertionError("tests/page.js a échoué :\n" + sortie.stderr[-3000:])
    res = json.loads(sortie.stdout)
    for e, r in zip(expressions, res):
        if "erreur" in r:
            raise AssertionError("%s → erreur JS : %s" % (e, r["erreur"]))
    return [r["ok"] for r in res]


def demo():
    if "d" not in _cache:
        _cache["d"] = page("__D__")[0]
    return _cache["d"]


@unittest.skipUnless(shutil.which("node"), "Node absent")
class Saisie(unittest.TestCase):
    def test_montants_en_fcfa(self):
        self.assertEqual(page("[cfa('10'),cfa('2,5'),cfa('1 750'),cfa('0'),cfa('-5'),cfa('abc')]")[0],
                         [10, 3, 1750, "NaN", "NaN", "NaN"])

    def test_montants_en_milliers(self):
        r = page("SAISIE_K=true;[cfa('10'),cfa('2,5'),cfa('1750'),cfa('25000'),cfa('5 000'),cfa('1 937')]")[0]
        # 10 → 10 000 ; 2,5 → 2 500 ; 1750 → 1 750 000 ; ≥ 10 000 tel quel ; milliers séparés = montant complet
        self.assertEqual(r, [10000, 2500, 1750000, 25000, 5000, 1937])

    def test_soldes_signes(self):
        self.assertEqual(page("[montantSaisi('−244 000',true),montantSaisi('-5'),montantSaisi('12 500'),montantSaisi('0')]")[0],
                         [-244000, "NaN", 12500, 0])
        self.assertEqual(page("SAISIE_K=true;[montantSaisi('−244',true),montantSaisi('−244 000',true)]")[0], [-244000, -244000])

    def test_abreviations(self):
        self.assertEqual(page("[1234,-2500000,1500000000,12345,123456,1000].map(abr)")[0],
                         ["1,23 K", "−2,5 M", "1,5 Md", "12,3 K", "123 K", "1 K"])


@unittest.skipUnless(shutil.which("node"), "Node absent")
class Reconnaissance(unittest.TestCase):
    def op(self, libelle):
        return page("guessOp(%s)" % json.dumps(libelle))[0]

    def test_retrait_et_virements(self):
        self.assertEqual({k: self.op("retrait 50000 banque")[k] for k in ("nature", "compte", "vers")},
                         {"nature": "virement", "compte": "banque", "vers": "especes"})
        self.assertEqual({k: self.op("épargne")[k] for k in ("nature", "compte", "vers")},
                         {"nature": "virement", "compte": "banque", "vers": "epargne"})
        self.assertEqual({k: self.op("banque > mobile")[k] for k in ("nature", "compte", "vers")},
                         {"nature": "virement", "compte": "banque", "vers": "mobile"})

    def test_prets_revenus_biens_evenements(self):
        self.assertEqual((self.op("remb Ali")["nature"], self.op("remb Ali")["personne"]), ("remboursement", "Ali"))
        self.assertEqual((self.op("prêt à Ali")["nature"], self.op("prêt à Ali")["personne"]), ("pret", "Ali"))
        s = self.op("salaire")
        self.assertEqual((s["nature"], s["cat_revenu"]), ("revenu", "salaire"))
        c = self.op("ciment villa")
        self.assertEqual((c["nature"], c["bien"], c["cat_maison"]), ("investissement", "villa", "materiaux"))
        self.assertEqual(self.op("mariage dot")["evenement"], "mariage-awa")

    def test_vehicule(self):
        v = self.op("vidange huile corolla")
        self.assertEqual((v["categorie"], v["vehicule"], v["cat_vehicule"]), ("voiture", "corolla", "entretien"))

    def test_engins_toujours_reconnus(self):
        """Le correctif des postes partagés ne doit rien retirer : engin cité, mot fort, poste dédié (Voiture)."""
        attendu = {"gasoil groupe": ("foyer", "groupe", "carburant"), "vidange huile moto": ("transport", "yamaha", "entretien"),
                   "assurance corolla": ("voiture", "corolla", "service"), "lavage": ("voiture", "corolla", None),
                   "carburant": ("voiture", "corolla", "carburant")}
        for lib, (cat, veh, catv) in attendu.items():
            with self.subTest(libelle=lib):
                o = self.op(lib)
                self.assertEqual((o["categorie"], o.get("vehicule")), (cat, veh))
                if catv:
                    self.assertEqual(o["cat_vehicule"], catv)

    def test_pieces_et_nom_de_l_engin(self):
        """Pièces d'un engin et nom propre de l'engin : la note va à l'engin, avant l'ordre des postes (2026-11-25)."""
        attendu = {"Nettoyage filtre huile boîte": ("voiture", "corolla"),   # « huile » du Foyer ne l'emporte pas
                   "vidange huile": ("voiture", "corolla"),                  # poste dédié, pas le groupe du Foyer
                   "Réparation Corolla": ("voiture", "corolla"),             # cité par son nom, même sans mot fort
                   "Dépannage démarreur": ("voiture", "corolla")}
        for lib, (cat, veh) in attendu.items():
            with self.subTest(libelle=lib):
                o = self.op(lib)
                self.assertEqual((o["categorie"], o.get("vehicule")), (cat, veh))
        # mot-clé d'un bien qui n'est pas un engin : la pièce d'engin l'emporte, pas sans elle
        r = page("BIEN.villa.mots.push('pompe');[guessOp('Réparation pompe boîte'),guessOp('pompe villa')].map(g=>[g.nature,g.vehicule||g.bien])")[0]
        self.assertEqual(r, [["depense", "corolla"], ["investissement", "villa"]])

    def test_type_seul_ne_fait_pas_une_depense_d_engin(self):
        """« taxi moto » est un transport payé, pas une dépense de la moto ; « bougies » d'éclairage restent hors engin."""
        for lib in ("taxi moto", "moto taxi", "achat bougies"):
            with self.subTest(libelle=lib):
                self.assertEqual(self.op(lib).get("vehicule", ""), "")

    def test_depense_courante_sans_engin(self):
        """Engin lié à un poste PARTAGÉ (groupe électrogène → Foyer, moto → Transport) : seulement s'il est cité ou qu'un
        mot fort est écrit (corrigé le 2026-11-25 : « riz » devenait une dépense du groupe, « taxi » de la moto)."""
        self.assertEqual(self.op("riz").get("vehicule", ""), "")
        self.assertEqual(self.op("taxi").get("vehicule", ""), "")

    def test_interets_d_epargne(self):
        """« intérêts épargne » : un revenu sur le compte épargne, pas un virement vers l'épargne (corrigé le 2026-11-25)."""
        o = self.op("intérêts épargne")
        self.assertEqual((o["nature"], o["compte"]), ("revenu", "epargne"))
        o = self.op("intérêts banque")
        self.assertEqual((o["nature"], o["compte"]), ("revenu", "banque"))
        self.assertEqual(self.op("intérêts")["compte"], "epargne")      # sans compte cité : le compte épargne à taux
        # deux comptes épargne à taux : celui dont le solde est le plus élevé
        r = page("setComptes(TOUS.concat([{id:'livret2',nom:'Livret 2',type:'epargne',mots:[],taux:2,periode:12,"
                 "releves:[{date:'2026-11-01',solde:99000000}]}]));guessOp('intérêts').compte")[0]
        self.assertEqual(r, "livret2")

    def test_type_d_engin_cite(self):
        """Engin cité par son type quand il est le seul de ce type (corrigé le 2026-11-25 : « essence moto » allait à la voiture)."""
        self.assertEqual(self.op("essence moto")["vehicule"], "yamaha")


@unittest.skipUnless(shutil.which("node"), "Node absent")
class Collage(unittest.TestCase):
    def test_liste(self):
        lignes = page("parseList(%s,'especes').map(o=>[o.date,o.montant,o.libelle,o.nature,o.categorie||'',o.km||0,o.quantite||0])" % json.dumps(
            "10000 riz le 02/11/26\n5000 pain\nretrait 50000 banque\n35,7L 25000 essence corolla 110882km\n3000 savon novembre"))[0]
        self.assertEqual(lignes, [
            ["2026-11-02", 10000, "riz", "depense", "foyer", 0, 0],
            ["2026-11-02", 5000, "pain", "depense", "foyer", 0, 0],            # la date vaut pour les lignes suivantes
            ["2026-11-02", 50000, "retrait banque", "virement", "", 0, 0],
            ["2026-11-02", 25000, "essence corolla", "depense", "voiture", 110882, 35.7],
            ["2026-11-02", 3000, "savon", "depense", "foyer", 0, 0],           # nom de mois final ignoré
        ])

    def test_compteur_entre_parentheses_d_un_engin(self):
        """Ancienne forme du carnet : « (110882) » reste un kilométrage quand la ligne concerne un engin."""
        self.assertEqual(page("parseList('25000 essence corolla (110882)','especes')[0].km")[0], 110882)
        self.assertEqual(page("parseList('2000 taxi 12000km','especes')[0].km")[0], 12000)   # « km » écrit : compteur

    def test_cumul_entre_parentheses_hors_vehicule(self):
        """« (12000) » sur une ligne sans engin est un cumul à ignorer, pas un kilométrage (corrigé le 2026-11-25)."""
        self.assertEqual(page("parseList('2000 taxi (12000)','especes')[0].km||0")[0], 0)


@unittest.skipUnless(shutil.which("node"), "Node absent")
class Formulaire(unittest.TestCase):
    """Champs du véhicule dans « Une opération » (majChamps), selon le poste et le libellé."""

    def champs(self, libelle, poste):
        return page("touched={};$('fNat').value='depense';$('fCat').value=%s;$('fLib').value=%s;majChamps();"
                    "[$('wVeh').hidden,$('wVehSel').hidden,$('fVeh').value]" % (json.dumps(poste), json.dumps(libelle)))[0]

    def test_poste_partage_sans_engin_par_defaut(self):
        # Foyer est partagé avec le groupe électrogène : liste visible, « aucun engin » choisi
        self.assertEqual(self.champs("riz", "foyer"), [False, False, ""])

    def test_poste_partage_engin_cite(self):
        self.assertEqual(self.champs("gasoil groupe", "foyer"), [False, False, "groupe"])

    def test_poste_dedie(self):
        hidden, sel_cachee, veh = self.champs("lavage", "voiture")
        self.assertFalse(hidden)
        self.assertEqual(veh, "corolla")

    def test_poste_sans_engin(self):
        self.assertTrue(self.champs("médicaments", "sante")[0])


@unittest.skipUnless(shutil.which("node"), "Node absent")
class AlerteEcarts(unittest.TestCase):
    """Alerte « Écarts de relevés » des Statistiques : sorties et entrées non notées séparées, période analysée seulement."""
    TEXTE = "render();$('statsAlertes').innerHTML.replace(/<[^>]+>/g,'\\n').split('\\n').filter(x=>/^ — Épargne :/.test(x)).join('')"

    def test_tout_l_historique(self):
        # la démo a deux écarts d'arrondi sur l'épargne (+1 et −1) : ils ne s'annulent plus en « 0 FCFA »
        t = page("statsMode='tout';view='stats';" + self.TEXTE)[0]
        self.assertIn("sorties non notées −1 FCFA", t)
        self.assertIn("entrées non notées +1 FCFA", t)
        self.assertIn("2 écarts", t)

    def test_periode_sans_ecart(self):
        self.assertEqual(page("statsMode='mois';view='stats';" + self.TEXTE)[0], "")


@unittest.skipUnless(shutil.which("node"), "Node absent")
class RappelSauvegarde(unittest.TestCase):
    """Bandeau « Pensez à sauvegarder » (version autonome seulement)."""
    ETAT = "(()=>{majRappelSauvegarde();return $('savBandeau').hidden})()"

    def test_jamais_sauvegarde(self):
        self.assertEqual(page(self.ETAT, autonome=True), [False])

    def test_sauvegarde_recente(self):
        self.assertEqual(page("lsSet('daftar-sauvegarde-faite',new Date().toISOString());" + self.ETAT, autonome=True), [True])

    def test_sauvegarde_ancienne_avec_saisies_depuis(self):
        vieux = "lsSet('daftar-sauvegarde-faite',new Date(Date.now()-10*864e5).toISOString());all[0].maj=new Date().toISOString();"
        self.assertEqual(page(vieux + self.ETAT, autonome=True), [False])
        # « Dans 3 jours » : silence
        self.assertEqual(page(vieux + "lsSet('daftar-sauvegarde-plus-tard',new Date(Date.now()+3*864e5).toISOString());" + self.ETAT,
                              autonome=True), [True])

    def test_sauvegarde_ancienne_sans_saisie_depuis(self):
        # rien de nouveau depuis le dernier export (2026-11-25 > toutes les saisies de la démo) : pas de rappel
        self.assertEqual(page("lsSet('daftar-sauvegarde-faite','2026-11-26T00:00:00Z');" + self.ETAT, autonome=True), [True])

    def test_ordinateur(self):
        self.assertEqual(page(self.ETAT), [True])


@unittest.skipUnless(shutil.which("node"), "Node absent")
class Calculs(unittest.TestCase):
    """Grandeurs de la page recalculées en Python sur les mêmes données."""

    SENS = {"depense": -1, "revenu": 1, "pret": -1, "remboursement": 1, "investissement": -1}

    def effet(self, o, cid):
        if o["nature"] == "depense" and o.get("tiers") == cid and o["compte"] != cid:
            return o["montant"]
        if o["nature"] == "virement":
            return (o["montant"] if o.get("vers") == cid else 0) - (o["montant"] if o["compte"] == cid else 0)
        return self.SENS[o["nature"]] * o["montant"] if o["compte"] == cid else 0

    def test_soldes_des_comptes(self):
        d = demo()
        calc = {}
        for c in d["parametres"]["comptes"]:
            rel = sorted(c.get("releves") or [], key=lambda r: r["date"])
            last = rel[-1] if rel else None
            s = last["solde"] if last else 0
            s += sum(self.effet(o, c["id"]) for o in d["operations"] if not last or o["date"] > last["date"])
            calc[c["id"]] = s
        js = page("Object.fromEntries(COMPTES.map(c=>[c.id,etatCompte(c).solde]))")[0]
        self.assertEqual(js, calc)
        self.assertTrue(all(v >= 0 for v in calc.values()), "la démo promet des soldes positifs : %r" % calc)

    def test_flux_et_mediane_d_un_mois(self):
        d = demo()
        ops = [o for o in d["operations"] if o["date"].startswith("2026-09")]
        courantes = [o for o in ops if o["nature"] == "depense" and not o.get("evenement")]
        jours = [0] * 30
        for o in courantes:
            jours[int(o["date"][8:10]) - 1] += o["montant"]
        js_med, js_flux = page("medianeJours(monthItems(2026,8),30)", "flux(monthItems(2026,8))")
        self.assertEqual(js_med, statistics.median(jours))
        self.assertEqual(js_flux["dep"], sum(o["montant"] for o in courantes))
        self.assertEqual(js_flux["exc"], sum(o["montant"] for o in ops if o["nature"] == "depense" and o.get("evenement")))
        self.assertEqual(js_flux["inv"], sum(o["montant"] for o in ops if o["nature"] == "investissement"))
        self.assertEqual(js_flux["pre"], sum(o["montant"] for o in ops if o["nature"] == "pret"))
        self.assertEqual(js_flux["ent"] + js_flux["entX"],
                         sum(o["montant"] for o in ops if o["nature"] in ("revenu", "remboursement")))
        self.assertEqual(js_flux["net"], js_flux["ent"] + js_flux["entX"] - js_flux["dep"] - js_flux["exc"] - js_flux["inv"] - js_flux["pre"])

    def test_part_ponctuelle_d_un_revenu(self):
        # « dont ponctuel » : le premier salaire de septembre 2026 reçoit une part ponctuelle (rappel) de 100 000
        sal = "all.find(e=>e.nature==='revenu'&&catRev(e)==='salaire'&&e.date.startsWith('2026-09'))"
        avant, tag0 = page("flux(monthItems(2026,8))", "opTag(%s)" % sal)
        mod = "(()=>{const e=%s;e.ponctuel=100000;e.cat_ponctuel='mission';return 1})()" % sal
        _, apres, ep, filtres, tag, cour = page(mod, "flux(monthItems(2026,8))", "epargneMois(2026,8,monthItems(2026,8),0,false).rev",
                                                "[filtreOk(%s,'x:'),filtreOk(%s,'r:mission'),filtreOk(%s,'r:salaire')]" % (sal, sal, sal),
                                                "opTag(%s)" % sal, "revCourMois(2026,8).salaire")
        self.assertEqual(apres["ent"], avant["ent"] - 100000)
        self.assertEqual(apres["entX"], avant["entX"] + 100000)
        self.assertEqual(apres["net"], avant["net"])   # le solde compte le virement entier
        self.assertEqual(ep, sum(page("monthItems(2026,8).filter(e=>e.nature==='revenu'&&!estExc(e)).reduce((s,e)=>s+e.montant,0)")) - 100000)
        self.assertEqual(filtres, [True, True, True])
        self.assertNotIn("dont", tag0)
        self.assertIn("dont 100 000", tag.replace("\u202f", " ").replace("\xa0", " "))
        self.assertGreater(cour, 0)
        # sans effet sur un revenu déjà exceptionnel (rattaché à un événement)
        exc = page(mod, "(()=>{const e=%s;e.evenement='x';return [partPonct(e),revExc(e)===e.montant]})()" % sal)[1]
        self.assertEqual(exc, [0, True])

    def test_foyer_pour_qui(self):
        # reconnaissance du prénom, règle par défaut (poste Foyer = commun), partage à parts égales
        # « pour » du poste : Foyer → commun du foyer 1 ; Repas → moi ; Santé (sans réglage) → personne en particulier
        g, deux, defaut, moi, poste, choisi = page("guessOp('15000 pharmacie adam')", "guessOp('rentrée adam zara').pour",
                                                   "pourDe({nature:'depense',categorie:'foyer'})", "pourDe({nature:'depense',categorie:'repas'})",
                                                   "pourDe({nature:'depense',categorie:'sante'})", "pourDe({nature:'depense',categorie:'sante',pour:['moi']})")
        self.assertEqual((g["categorie"], g["pour"]), ("sante", ["adam"]))
        self.assertEqual(deux, ["adam", "zara"])
        self.assertEqual(defaut, ["foyer1"])
        self.assertEqual(moi, ["moi"])
        self.assertEqual(poste, [])
        self.assertEqual(choisi, ["moi"])
        d = demo()
        ops = [o for o in d["operations"] if o["date"].startswith("2026") and o["nature"] == "depense" and o["date"] >= d["parametres"]["debut_suivi"]]
        parts = page("(()=>{const r=partsPour(yearItems(2026).filter(e=>!DEBUT_SUIVI||e.date>=DEBUT_SUIVI));return Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v.tot)]))})()")[0]
        attendu = {}
        for o in ops:
            regle = {x["id"]: x.get("pour", "") for x in d["parametres"]["postes"]}.get(o["categorie"], "")
            p = o.get("pour") or {"foyer": ["foyer1"], "moi": ["moi"]}.get(regle, ["_hors"])
            for k in p:
                attendu[k] = attendu.get(k, 0) + o["montant"] / len(p)
        self.assertEqual(parts, {k: round(v) for k, v in attendu.items()})
        self.assertEqual(sum(parts.values()), sum(o["montant"] for o in ops))

    def test_patrimoine(self):
        p, liq, biens = page("patrimoine()", "MES().reduce((s,c)=>s+etatCompte(c).solde,0)", "BIENS.map(b=>etatBien(b).valeur)")
        self.assertEqual(p["liq"], liq)
        self.assertEqual(p["biens"], sum(biens))
        d = demo()
        prete, rendu = {}, {}
        for o in d["operations"]:
            if o["nature"] == "pret":
                prete[o["personne"].lower()] = prete.get(o["personne"].lower(), 0) + o["montant"]
            elif o["nature"] == "remboursement":
                rendu[o["personne"].lower()] = rendu.get(o["personne"].lower(), 0) + o["montant"]
        self.assertEqual(p["cre"], sum(max(0, v - rendu.get(k, 0)) for k, v in prete.items()))
        self.assertEqual(p["net"], p["liq"] + p["biens"] + p["cre"])

    def test_niveaux_des_jours(self):
        s = page("seuilsJour()")[0]
        self.assertAlmostEqual(s["bas"], s["min"] + (s["max"] - s["min"]) / 3)
        self.assertAlmostEqual(s["haut"], s["min"] + 2 * (s["max"] - s["min"]) / 3)
        self.assertTrue(s["bas"] <= s["milieu"] <= s["haut"])


if __name__ == "__main__":
    unittest.main()
