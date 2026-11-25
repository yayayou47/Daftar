#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Daftar — suivi financier et carnet du véhicule, serveur local.

Un seul journal d'opérations : dépenses, revenus, virements entre comptes,
prêts accordés et remboursements, investissements dans les biens.

Lance une petite application web sur http://localhost:8780 et enregistre
les données dans donnees/carnet.json (sauvegarde automatique chaque jour
dans donnees/sauvegardes/).

Utilisation :
    python3 serveur.py                  # localhost uniquement, ouvre le navigateur
    python3 serveur.py --reseau         # accessible aussi depuis le téléphone (même Wi-Fi), avec clé d'accès
    python3 serveur.py --port 9000      # autre port
    python3 serveur.py --sans-navigateur

Aucune dépendance : bibliothèque standard Python 3.8+.
"""
import argparse
import datetime as dt
import hmac
import ipaddress
import json
import os
import queue
import re
import secrets
import shutil
import signal
import socket
import sys
import threading
import time
import uuid
import webbrowser
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse



def lire_version():
    """Numéro et nom de la version, lus dans app/version.js (seul endroit où ils sont écrits)."""
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "app", "version.js"), encoding="utf-8") as f:
            t = f.read()
        return (re.search(r"numero:\s*'([^']+)'", t).group(1), re.search(r"nom:\s*'([^']*)'", t).group(1))
    except (OSError, AttributeError):
        return ("?", "")


VERSION, VERSION_NOM = lire_version()
RACINE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(RACINE, "app")
DONNEES = os.path.join(RACINE, "donnees")
FICHIER = os.path.join(DONNEES, "carnet.json")
SAUVEGARDES = os.path.join(DONNEES, "sauvegardes")
GARDER_SAUVEGARDES = 60

APP_ID = "appya"

# Postes par défaut (l'ordre compte : le premier poste dont un mot-clé apparaît dans le libellé l'emporte).
# Modifiables depuis l'application : onglet « Postes et libellés ».
POSTES_DEFAUT = [   # mêmes valeurs que POSTES_DEFAUT dans app/moteur.js (version autonome)
    {"id": "foyer", "label": "Foyer, vivres", "couleur": "#2f6fa8",
     "mots": ["riz", "huile", "savon", "sucre", "farine", "alimentaire", "vivres", "lait", "pain", "viande", "poisson",
              "légumes", "marché", "famille"]},
    {"id": "loyer", "label": "Loyer, logement", "couleur": "#c58b2a", "mots": ["loyer", "contribution", "logement"]},
    {"id": "aides", "label": "Aides et dons", "couleur": "#c0533a",
     "mots": ["aide", "aumône", "aumone", "prestation", "baptême", "mariage", "funéraire", "don"]},
    {"id": "enfants", "label": "Enfants, école", "couleur": "#2e8a57", "mots": ["scolarité", "école", "fourniture", "enfant"]},
    {"id": "sante", "label": "Santé", "couleur": "#d9772f",
     "mots": ["médic", "soin", "examen", "pharmacie", "hôpital", "analyse", "clinique"]},
    {"id": "voiture", "label": "Voiture", "couleur": "#6b7b90",
     "mots": ["carburant", "essence", "gasoil", "assurance", "fiche technique", "amende", "vidange",
              "lavage", "garage", "pneu", "mécan", "voiture"]},
    {"id": "tel", "label": "Téléphone, internet", "couleur": "#2f97ad", "mots": ["crédit", "forfait", "internet", "téléphone"]},
    {"id": "transport", "label": "Transport", "couleur": "#8a9a2e", "mots": ["transport", "taxi", "moto", "clando", "bus"]},
    {"id": "repas", "label": "Repas, boissons", "couleur": "#9363b0",
     "mots": ["dej", "déj", "diner", "dîner", "café", "jus", "boisson", "repas"]},
    {"id": "perso", "label": "Perso", "couleur": "#cc5f86", "mots": ["vêtement", "chaussure", "parfum", "coiff", "cadeau"]},
    {"id": "autre", "label": "Autre", "couleur": "#9a968c", "mots": []},
]
RE_ID = re.compile(r"^[a-z0-9_-]{1,40}$")
RE_COULEUR = re.compile(r"^#[0-9a-fA-F]{6}$")


def ids_postes(d):
    return {x["id"] for x in d.get("parametres", {}).get("postes", [])} or {x["id"] for x in POSTES_DEFAUT}


# ---------------------------------------------------------------- modèle : journal d'opérations
# Chaque ligne est une opération de montant positif ; sa « nature » dit dans quel sens l'argent va.
#   depense         sort de « compte »                       (dépense courante, classée par poste)
#   revenu          entre sur « compte »                      (salaire, prime, intérêts…)
#   virement        sort de « compte », entre sur « vers »   (retrait = compte → espèces ; épargne)
#   pret            sort de « compte », ouvre une créance sur « personne »
#   remboursement   entre sur « compte », réduit la créance de « personne »
#   investissement  sort de « compte », s'ajoute au coût du « bien » (construction, entretien)
NATURES = ("depense", "revenu", "virement", "pret", "remboursement", "investissement")
TYPES_COMPTE = ("especes", "courant", "epargne", "carte", "mobile", "tiers")
# « tiers » : compte géré pour quelqu'un d'autre (personne ou personne morale), gardé à part de vos comptes ;
# ses opérations ne comptent pas dans vos dépenses ni vos revenus
TYPES_BIEN = ("actif", "passif")  # actif : prend de la valeur (terrain) ; passif : en perd (voiture)
COMPTES_DEFAUT = [{"id": "especes", "nom": "Espèces", "type": "especes",
                   "mots": ["espèces", "especes", "cash", "liquide"], "releves": []}]


# ---------------------------------------------------------------- courant / exceptionnel (2026-11-14)
# Types de revenus : « courant » (salaire, intérêts…) ou ponctuel (mission, atelier, jury…). Une opération (dépense ou
# revenu) peut être rattachée à un événement (mariage, baptême, voyage…) : elle devient exceptionnelle. Les soldes des
# comptes comptent tout ; seules les statistiques séparent le courant de l'exceptionnel.
# MÊMES VALEURS que REVENUS_DEFAUT et TYPES_EVENEMENT dans app/moteur.js.
REVENUS_DEFAUT = [
    {"id": "salaire", "label": "Salaire", "courant": True, "mots": ["salaire", "paie", "traitement", "salary"]},
    {"id": "prime", "label": "Primes et indemnités", "courant": True, "mots": ["prime", "indemnité", "indemnite"]},
    {"id": "interets", "label": "Intérêts", "courant": True, "mots": ["intérêt", "interet", "intérêts", "interets"]},
    {"id": "mission", "label": "Frais de mission", "courant": False, "mots": ["frais de mission", "mission", "perdiem", "per diem"]},
    {"id": "atelier", "label": "Ateliers, séminaires", "courant": False, "mots": ["atelier", "séminaire", "seminaire", "colloque", "formation"]},
    {"id": "consultance", "label": "Consultance, expertise", "courant": False, "mots": ["consultance", "consultant", "expertise", "consultation"]},
    {"id": "enseignement", "label": "Enseignement, vacations", "courant": False, "mots": ["vacation", "cours", "enseignement", "heures complémentaires"]},
    {"id": "jury", "label": "Jury, soutenance, correction", "courant": False, "mots": ["jury", "soutenance", "correction", "surveillance"]},
    {"id": "autre", "label": "Autre revenu", "courant": False, "mots": []},
]
TYPES_EVENEMENT = ("mariage", "bapteme", "circoncision", "funerailles", "fete", "voyage-tourisme", "voyage-mission",
                   "voyage-vacances", "sante", "projet", "autre")


# Opérations programmées (frais fixes, abonnements, intérêts) : rien n'est enregistré seul ; la page propose chaque
# échéance passée à confirmer. Une opération confirmée porte prog (id) et prog_date (échéance) ; une échéance
# ignorée est notée dans « ignorees ». mode « interets » : montant = solde du compte × taux du compte.
PERIODES_PROG = (1, 2, 3, 6, 12)


def ids_revenus(d):
    return {x["id"] for x in d.get("parametres", {}).get("revenus", [])} or {x["id"] for x in REVENUS_DEFAUT}


def ids_de(d, cle):
    return {x["id"] for x in d.get("parametres", {}).get(cle, [])}


# ---------------------------------------------------------------- v3 : carnet du véhicule intégré
# Une dépense ou un investissement lié à un véhicule (un bien marqué « vehicule ») peut porter
# km (compteur), quantite + unite (L ou u) et une catégorie véhicule. Les repères de vidange
# sont stockés dans le bien : vidange = {intervalle, dernier, prochain} (km).
CAT_VEHICULE = ("carburant", "entretien", "reparation", "service", "achat", "investissement", "autre")
VIDANGE_DEFAUT = {"intervalle": 3000, "dernier": 0, "prochain": 0}
ENGINS = ("voiture", "moto", "bus", "camion", "groupe", "autre")   # type d'un bien « vehicule » (rubrique My Car, plusieurs engins possibles)


# ---------------------------------------------------------------- v4 : carnet de la maison
# Un bien marqué « maison » (terrain, construction) : ses investissements portent cat_maison ; le bien porte
# projet = {budget (CFA, 0 = non fixé), echeance (AAAA-MM-JJ ou ""), note}.
CAT_MAISON = ("terrain", "administratif", "arrosage", "eau", "maconnerie", "materiaux", "electricite", "main-oeuvre", "autre")
MOTS_CAT_MAISON = [   # ordre significatif : le premier qui correspond l'emporte (« arrosage et trou » = arrosage)
    ("terrain", ["achat terrain", "bornage", "lotissement"]),
    ("administratif", ["titre foncier", "permis", "notaire", "mairie", "cadastre", "dossier", "timbre"]),
    ("main-oeuvre", ["main d", "main-d", "ouvrier", "gardien", "manoeuvre", "manœuvre", "tâcheron", "tacheron"]),   # avant maçonnerie : « main-d'œuvre maçon »
    ("arrosage", ["arrosage", "arroser"]),
    ("eau", ["pompe", "forage", "puits", "citerne", "robinet", "eau"]),
    ("maconnerie", ["fondation", "maçon", "macon", "brique", "parpaing", "béton", "beton", "dalle", "mur", "trou", "fouille"]),
    ("materiaux", ["ciment", "sable", "gravier", "fer ", "tôle", "tole", "bois", "planche", "matériau", "materiau"]),
    ("electricite", ["électric", "electric", "câble", "cable", "solaire", "panneau"]),
]


def deviner_cat_maison(libelle):
    lib = (libelle or "").lower()
    for cat, mots in MOTS_CAT_MAISON:
        if any(m in lib for m in mots):
            return cat
    return "autre"


def ids_maisons(d):
    return [b["id"] for b in d.get("parametres", {}).get("biens", []) if b.get("maison")]


# ---------------------------------------------------------------- v5 : synchronisation (téléphone hors ligne)
# Chaque écriture reçoit un numéro de révision croissant (d["rev"]) : une opération porte rev (rang de sa
# dernière écriture sur l'ordinateur) et maj (horodatage de sa dernière modification, fixé par l'appareil qui
# l'a modifiée). Une suppression laisse une trace dans d["supprimees"] ({id, maj, rev}) pour ne pas
# « ressusciter » depuis un autre appareil. Un appareil demande « tout ce qui a changé depuis la révision N » :
# rev (ordre d'arrivée sur l'ordinateur) sert de curseur, maj (dernière modification) départage les conflits.
def horodatage():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def marquer(d, o, maj=None):
    d["rev"] = int(d.get("rev", 0)) + 1
    o["rev"] = d["rev"]
    o["maj"] = maj or horodatage()
    return o


def marquer_parametres(d):
    d["rev"] = int(d.get("rev", 0)) + 1
    d.setdefault("parametres", {})["rev"] = d["rev"]


def vidange_auto(d, o):
    """Une vidange d'huile du véhicule, avec un kilométrage plus récent que le repère, le met à jour
    (utilisé pour les saisies arrivant du téléphone, qui ne peut pas modifier les réglages hors ligne)."""
    lib = (o.get("libelle") or "").lower()
    if not (o.get("vehicule") and o.get("km") and "vidange" in lib and "boîte" not in lib and "boite" not in lib):
        return False
    for b in d.get("parametres", {}).get("biens", []):
        if b.get("id") == o["vehicule"]:
            vd = b.setdefault("vidange", dict(VIDANGE_DEFAUT))
            if o["km"] > (vd.get("dernier") or 0):
                vd["dernier"] = int(o["km"])
                vd["prochain"] = int(o["km"]) + int(vd.get("intervalle") or 3000)
                return True
    return False


RE_MAJ = re.compile(r"^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$")
RE_HEURE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


ABSENT = object()


def _cle_liste(*listes):
    """Clé d'identité des éléments d'une liste de réglages (« id », ou « code » pour les devises), sinon None :
    la liste est alors traitée comme une seule valeur (relevés d'un compte, mots-clés…)."""
    elems = [x for l in listes if isinstance(l, list) for x in l]
    for k in ("id", "code"):
        if elems and all(isinstance(x, dict) and isinstance(x.get(k), str) for x in elems):
            return k
    return None


def fusion3(base, moi, eux, conflits, chemin=""):
    """Fusion à trois voies : « moi » = réglage fait sur le téléphone à partir de « base » ; « eux » = état actuel de
    l'ordinateur. Seul ce que le téléphone a changé par rapport à base est appliqué ; le reste garde la valeur de
    l'ordinateur. Changé des deux côtés différemment : le téléphone l'emporte (son changement arrive en dernier) et le
    chemin est noté dans conflits. ABSENT = clé ou élément inexistant. Même règle que fusion3 dans moteur.js."""
    if moi == base:
        return eux
    if eux == base or eux == moi:
        return moi
    if isinstance(moi, dict) and isinstance(eux, dict):
        b = base if isinstance(base, dict) else {}
        out = {}
        for k in list(eux) + [k for k in moi if k not in eux]:
            v = fusion3(b.get(k, ABSENT), moi.get(k, ABSENT), eux.get(k, ABSENT), conflits, chemin + "/" + str(k))
            if v is not ABSENT:
                out[k] = v
        return out
    cle = _cle_liste(base if isinstance(base, list) else [], moi, eux) if isinstance(moi, list) and isinstance(eux, list) else None
    if cle:
        b = {x[cle]: x for x in base} if isinstance(base, list) else {}
        m = {x[cle]: x for x in moi}
        e = {x[cle]: x for x in eux}
        communs_b = [k for k in b if k in m]
        if [x[cle] for x in moi if x[cle] in b] != communs_b:
            # le téléphone a changé l'ordre (postes) : son ordre, avec les ajouts de l'ordinateur après leur voisin
            ordre, autre = [x[cle] for x in moi], [x[cle] for x in eux]
        else:
            ordre, autre = [x[cle] for x in eux], [x[cle] for x in moi]
        for i, k in enumerate(autre):
            if k not in ordre:
                prec = next((autre[j] for j in range(i - 1, -1, -1) if autre[j] in ordre), None)
                ordre.insert(ordre.index(prec) + 1 if prec is not None else 0, k)
        out = []
        for k in ordre:
            v = fusion3(b.get(k, ABSENT), m.get(k, ABSENT), e.get(k, ABSENT), conflits, chemin + "/" + k)
            if v is not ABSENT:
                out.append(v)
        return out
    conflits.append(chemin or "/")
    return moi


def fusionner_reglages(prm, base, corps):
    """Réglage fait sur le téléphone (corps, à partir de base) recalé sur les réglages actuels de l'ordinateur (prm) :
    chaque section présente dans corps ET dans base est fusionnée (fusion3) ; les autres clés passent telles quelles.
    Rend (corps fusionné, liste des chemins changés des deux côtés)."""
    out, conflits = dict(corps), []
    for k in SECTIONS_REGLAGES:
        if k in corps and k in base:
            v = fusion3(base[k], corps[k], prm.get(k, ABSENT), conflits, k)
            if v is ABSENT:
                out.pop(k)
            else:
                out[k] = v
    return out, conflits


def decalage_horloge(horloge):
    """Avance de l'horloge de l'ordinateur sur celle du téléphone (heure envoyée par le téléphone au moment de la
    synchronisation), si elle dépasse une minute ; sinon 0."""
    try:
        t = dt.datetime.fromisoformat(str(horloge).replace("Z", "+00:00"))
        if t.tzinfo is None:
            return dt.timedelta(0)
        ecart = dt.datetime.now(dt.timezone.utc) - t
    except (TypeError, ValueError):
        return dt.timedelta(0)
    return ecart if abs(ecart) > dt.timedelta(minutes=1) else dt.timedelta(0)


def recaler_maj(maj, ecart):
    """Date de modification du téléphone ramenée à l'horloge de l'ordinateur."""
    if not ecart:
        return maj
    try:
        t = dt.datetime.fromisoformat(maj.replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return maj
    return (t + ecart).astimezone(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def synchroniser(d, corps):
    """Applique les changements d'un appareil puis renvoie tout ce qui a changé depuis sa révision.
    Règle : la modification la plus récente (maj) l'emporte ; une ligne refusée par la validation est
    signalée, jamais perdue (elle reste sur l'appareil). Les dates maj du téléphone sont recalées sur l'horloge de
    l'ordinateur (« horloge » = heure du téléphone à l'envoi). Un réglage porte « base » (état des sections touchées
    vu par le téléphone) : il est fusionné avec les réglages actuels (fusionner_reglages) au lieu de les remplacer."""
    if not isinstance(corps, dict):
        raise ValueError("Corps de requête invalide.")
    try:
        depuis = int(corps.get("depuis") or 0)
    except (TypeError, ValueError):
        raise ValueError("Révision invalide.")
    ops = d.setdefault("operations", [])
    index = {o.get("id"): o for o in ops}
    tombes = {t["id"]: t for t in d.setdefault("supprimees", [])}
    conflits, rejets, a_renvoyer = [], [], set()
    ecart = decalage_horloge(corps.get("horloge"))
    params_modifies = False
    for ch in (corps.get("changements") or [])[:5000]:
        cid, maj = str(ch.get("id", "")), str(ch.get("maj", ""))
        if not re.match(r"^[\w-]{1,40}$", cid) or not RE_MAJ.match(maj):
            rejets.append({"id": cid, "erreur": "Changement mal formé."})
            continue
        maj = recaler_maj(maj, ecart)
        if ch.get("type") == "params":
            # réglages faits sur le téléphone (même hors ligne) : appliqués ici dans l'ordre de saisie
            corps_p = ch.get("corps")
            if not isinstance(corps_p, dict) or corps_p.get("restaurer") is not None:
                rejets.append({"id": cid, "erreur": "Réglage mal formé."})
                continue
            if isinstance(ch.get("base"), dict):
                corps_p, doubles = fusionner_reglages(d.get("parametres", {}), ch["base"], corps_p)
                if doubles:
                    conflits.append({"id": cid, "libelle": "réglages",
                                     "motif": "modifiés aussi sur l'ordinateur (%s) : version du téléphone gardée pour ces éléments"
                                              % ", ".join(doubles[:5])})
            try:
                regler(d, corps_p, "réglages faits sur le téléphone")
            except ValueError as e:
                rejets.append({"id": cid, "erreur": str(e)})
            continue
        if ch.get("type") == "releve":
            # solde noté (ou retiré, solde null) sur le téléphone hors ligne : {compte, date, solde}
            try:
                params_modifies = appliquer_releve(d, ch) or params_modifies
            except ValueError as e:
                rejets.append({"id": cid, "erreur": str(e)})
            continue
        ex = index.get(cid)
        if ch.get("type") == "del":
            if ex is None:
                continue
            if ex.get("maj", "") > maj:
                conflits.append({"id": cid, "libelle": ex.get("libelle"), "motif": "modifiée sur l'ordinateur après la suppression : conservée"})
                a_renvoyer.add(cid)
                continue
            ops.remove(ex)
            del index[cid]
            t = marquer(d, {"id": cid}, maj)
            d["supprimees"] = [x for x in d["supprimees"] if x["id"] != cid] + [t]
            tombes[cid] = t
        elif ch.get("type") == "set":
            t = tombes.get(cid)
            if t and t.get("maj", "") >= maj:
                conflits.append({"id": cid, "libelle": (ch.get("doc") or {}).get("libelle"), "motif": "supprimée sur l'ordinateur : non recréée"})
                continue
            if ex and ex.get("maj", "") > maj:
                conflits.append({"id": cid, "libelle": ex.get("libelle"), "motif": "modifiée plus récemment sur l'ordinateur : version de l'ordinateur gardée"})
                a_renvoyer.add(cid)
                continue
            try:
                propre = nettoyer(ch.get("doc") or {}, d)
            except ValueError as e:
                rejets.append({"id": cid, "erreur": str(e)})
                continue
            nouv = marquer(d, {"id": cid, **propre}, maj)
            if ex is not None:
                ops[ops.index(ex)] = nouv
            else:
                ops.append(nouv)
            index[cid] = nouv
            if t:
                d["supprimees"] = [x for x in d["supprimees"] if x["id"] != cid]
                tombes.pop(cid, None)
            params_modifies = vidange_auto(d, nouv) or params_modifies
        else:
            rejets.append({"id": cid, "erreur": "Type de changement inconnu."})
    if params_modifies:
        marquer_parametres(d)
    prm = d.get("parametres", {})
    return {"rev": d.get("rev", 0),
            "operations": [o for o in ops if o.get("rev", 0) > depuis or o.get("id") in a_renvoyer],
            "supprimees": [t for t in d.get("supprimees", []) if t.get("rev", 0) > depuis],
            "parametres": prm, "version": d.get("version"), "conflits": conflits, "rejets": rejets}


def appliquer_releve(d, ch):
    """Note (ou retire, si solde est null) le solde d'un compte à une date. Validé comme dans nettoyer_comptes()."""
    date = str(ch.get("date", ""))
    if not RE_DATE.match(date):
        raise ValueError("Date de relevé invalide.")
    for c in d.get("parametres", {}).get("comptes", []):
        if c.get("id") == ch.get("compte"):
            rel = [r for r in c.get("releves") or [] if r.get("date") != date]
            if ch.get("solde") is not None:
                r = {"date": date, "solde": montant_signe(ch.get("solde"), "Solde du relevé de %s" % c.get("nom"))}
                if RE_HEURE.match(str(ch.get("heure") or "")):
                    r["heure"] = ch["heure"]
                rel.append(r)
            c["releves"] = sorted(rel, key=lambda r: r["date"])
            return True
    raise ValueError("Compte introuvable sur l'ordinateur (supprimé ?).")


def ids_vehicules(d):
    return [b["id"] for b in d.get("parametres", {}).get("biens", []) if b.get("vehicule")]


def montant_positif(v, quoi="Montant", zero=False):
    try:
        m = float(v)
    except (TypeError, ValueError):
        raise ValueError("%s invalide." % quoi)
    if m != m or m in (float("inf"), float("-inf")) or m < 0 or (m == 0 and not zero):
        raise ValueError("%s invalide : il doit être positif." % quoi)
    return int(m) if m.is_integer() else round(m, 2)


def montant_signe(v, quoi="Solde"):
    """Solde noté : peut être négatif (découvert, compte d'un tiers avancé de votre poche)."""
    try:
        m = float(v)
    except (TypeError, ValueError):
        raise ValueError("%s invalide." % quoi)
    if m != m or m in (float("inf"), float("-inf")):
        raise ValueError("%s invalide." % quoi)
    return int(m) if m.is_integer() else round(m, 2)


DELAI_CORBEILLE = 30   # jours pendant lesquels un compte supprimé peut être rétabli


def purger_corbeille(d, aujourdhui=None):
    """Efface pour de bon les comptes supprimés depuis plus de DELAI_CORBEILLE jours, avec leurs opérations
    (compte ou destination du virement) ; les dépenses qui y étaient versées perdent seulement ce lien.
    Chaque opération effacée laisse sa trace dans d["supprimees"] (synchronisation du téléphone). Rend True si modifié."""
    jour = aujourdhui or dt.date.today()
    prm = d.get("parametres", {})
    perimes = set()
    for c in prm.get("comptes", []):
        try:
            if c.get("supprime") and (jour - dt.date.fromisoformat(c["supprime"])).days > DELAI_CORBEILLE:
                perimes.add(c["id"])
        except ValueError:
            pass
    if not perimes:
        return False
    garde = []
    for o in d.get("operations", []):
        if o.get("compte") in perimes or o.get("vers") in perimes:
            d["supprimees"] = [t for t in d.setdefault("supprimees", []) if t["id"] != o.get("id")] + [marquer(d, {"id": o.get("id")})]
            continue
        if o.get("tiers") in perimes:
            o.pop("tiers")
            marquer(d, o)
        garde.append(o)
    d["operations"] = garde
    prm["comptes"] = [c for c in prm.get("comptes", []) if c["id"] not in perimes]
    prm["programmees"] = [p for p in prm.get("programmees", []) or [] if p.get("compte") not in perimes]
    marquer_parametres(d)
    return True


def ids_tiers(d):
    return {c.get("id") for c in d.get("parametres", {}).get("comptes", []) if c.get("type") == "tiers"}


def texte(v, n):
    return " ".join(str(v or "").split())[:n]


RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
VERROU = threading.Lock()


# ---------------------------------------------------------------- accès réseau
# En mode --reseau, les appareils autres que cet ordinateur doivent présenter la clé
# de donnees/.cle : une fois via le lien  http://IP:PORT/?cle=…  (ou le formulaire),
# puis par un cookie. Cet ordinateur (127.0.0.1) n'a jamais besoin de clé.
FICHIER_CLE = os.path.join(DONNEES, ".cle")
RE_CLE = re.compile(r"^[a-z0-9]{10,64}$")
ALPHABET_CLE = "abcdefghjkmnpqrstuvwxyz23456789"  # sans 0/o, 1/l/i : se recopie sans erreur
RESEAU = False
CLE = ""


def cle_reseau():
    """Lit la clé d'accès réseau, ou en crée une (12 caractères, environ 59 bits)."""
    try:
        with open(FICHIER_CLE, "r", encoding="utf-8") as f:
            c = f.read().strip()
        if RE_CLE.match(c):
            return c
    except OSError:
        pass
    c = "".join(secrets.choice(ALPHABET_CLE) for _ in range(12))
    os.makedirs(DONNEES, exist_ok=True)
    with open(FICHIER_CLE, "w", encoding="utf-8") as f:
        f.write(c + "\n")
    try:
        os.chmod(FICHIER_CLE, 0o600)
    except OSError:  # NTFS/exFAT
        pass
    return c


def hote_autorise(host):
    """Protection contre le « DNS rebinding » : un site malveillant qui fait pointer son
    propre nom de domaine vers 127.0.0.1 envoie Host: son-domaine. On n'accepte que
    localhost, une adresse IP ou le nom de cette machine."""
    if not host:
        return True
    h = host.strip().lower()
    if h.startswith("["):  # IPv6 : [::1]:8780
        h = h[1:h.find("]")] if "]" in h else h[1:]
    elif h.count(":") == 1:
        h = h.rsplit(":", 1)[0]
    try:
        ipaddress.ip_address(h)
        return True
    except ValueError:
        pass
    nom = socket.gethostname().lower()
    # noms Tailscale (MagicDNS, « *.ts.net ») : le domaine appartient à Tailscale et ne pointe que vers
    # les appareils de votre réseau privé ; un site extérieur ne peut pas s'en servir pour viser Daftar
    if h.endswith(".ts.net"):
        return True
    return h in ("localhost", nom, nom + ".local")


PAGE_CLE = """<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Daftar</title>
<style>:root{color-scheme:light dark}body{font-family:system-ui,sans-serif;font-size:105%%;max-width:26em;margin:12vh auto;padding:0 17px;line-height:1.5}
input,button{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid #8888}input{width:100%%;box-sizing:border-box;margin:8px 0}
button{background:#1f4e79;color:#fff;border:0;font-weight:600}.err{color:#c0533a}</style></head><body>
<h1>Daftar</h1><p>Accès protégé. Sur l'ordinateur, tapez <code>daftar etat</code> :
ouvrez le lien affiché, ou recopiez ici la clé (après <code>?cle=</code>).</p>%s
<form method="get" action="/"><input name="cle" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="clé d'accès" required>
<button type="submit">Ouvrir le carnet</button></form></body></html>"""


# ---------------------------------------------------------------- stockage
def lire():
    if not os.path.exists(FICHIER):
        return {"version": 5, "rev": 1, "operations": [], "supprimees": [],
                "parametres": {"rev": 1, "budgets": {}, "postes": json.loads(json.dumps(POSTES_DEFAUT)),
                               "comptes": json.loads(json.dumps(COMPTES_DEFAUT)), "biens": []}}
    with open(FICHIER, "r", encoding="utf-8") as f:
        return json.load(f)


def sauvegarde_du_jour():
    """Copie carnet.json une fois par jour avant la première modification."""
    if not os.path.exists(FICHIER):
        return
    os.makedirs(SAUVEGARDES, exist_ok=True)
    cible = os.path.join(SAUVEGARDES, "carnet-%s.json" % dt.date.today().isoformat())
    if not os.path.exists(cible):
        shutil.copyfile(FICHIER, cible)  # pas de copie des droits : compatible exFAT/NTFS
        anciennes = sorted(f for f in os.listdir(SAUVEGARDES) if re.match(r"^carnet-\d{4}-\d{2}-\d{2}\.json$", f))
        for f in anciennes[:-GARDER_SAUVEGARDES]:
            os.remove(os.path.join(SAUVEGARDES, f))


# Copie miroir : le dossier d'où Daftar a été installé (ex. un second disque) reçoit, dans son
# donnees/, une copie à jour de carnet.json et des sauvegardes. Ce dossier se copie tel quel sur un autre
# ordinateur : « bash installer.sh » y reprend les données. Le chemin est écrit par l'installateur dans
# donnees/.miroir ; disque absent (non monté) = copie sautée, refaite à l'écriture suivante.
FICHIER_MIROIR = os.path.join(DONNEES, ".miroir")


def dossier_miroir():
    try:
        with open(FICHIER_MIROIR, encoding="utf-8") as f:
            chemin = f.readline().strip()
    except OSError:
        return None
    if not chemin or not os.path.isdir(chemin) or os.path.realpath(chemin) == os.path.realpath(DONNEES):
        return None
    return chemin


def copier_miroir():
    m = dossier_miroir()
    if not m or not os.path.exists(FICHIER):
        return
    try:
        tmp = os.path.join(m, "carnet.json.tmp")
        shutil.copyfile(FICHIER, tmp)  # copyfile : pas de droits copiés, compatible FAT/exFAT/NTFS
        os.replace(tmp, os.path.join(m, "carnet.json"))
        if os.path.isdir(SAUVEGARDES):
            ms = os.path.join(m, "sauvegardes")
            os.makedirs(ms, exist_ok=True)
            ici = set(f for f in os.listdir(SAUVEGARDES) if f.endswith(".json"))
            for f in sorted(ici):
                if not os.path.exists(os.path.join(ms, f)):
                    shutil.copyfile(os.path.join(SAUVEGARDES, f), os.path.join(ms, f))
            for f in os.listdir(ms):   # sauvegardes quotidiennes élaguées ici : élaguées aussi là-bas
                if re.match(r"^carnet-\d{4}-\d{2}-\d{2}\.json$", f) and f not in ici:
                    os.remove(os.path.join(ms, f))
    except OSError as e:
        print("  Copie miroir impossible vers %s : %s" % (m, e), file=sys.stderr)


def ecrire(donnees):
    os.makedirs(DONNEES, exist_ok=True)
    sauvegarde_du_jour()
    tmp = FICHIER + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, indent=1)
    os.replace(tmp, FICHIER)  # écriture atomique
    copier_miroir()


def nettoyer(doc, d):
    """Valide et normalise une opération reçue du navigateur (seul point de validation)."""
    if not isinstance(doc, dict):
        raise ValueError("Corps de requête invalide.")
    date = str(doc.get("date", ""))
    if not RE_DATE.match(date):
        raise ValueError("Date invalide (format attendu AAAA-MM-JJ).")
    montant = montant_positif(doc.get("montant"))
    libelle = texte(doc.get("libelle"), 200)
    if not libelle:
        raise ValueError("Le libellé est obligatoire.")
    nature = doc.get("nature") or "depense"
    if nature not in NATURES:
        raise ValueError("Nature d'opération inconnue : %s" % nature)
    comptes = ids_de(d, "comptes") or {"especes"}
    compte = doc.get("compte") or "especes"
    if compte not in comptes:
        raise ValueError("Compte inconnu : %s" % compte)
    out = {"date": date, "montant": montant, "libelle": libelle, "nature": nature, "compte": compte}
    if nature == "depense":
        out["categorie"] = doc.get("categorie") if doc.get("categorie") in ids_postes(d) else "autre"
    elif nature == "virement":
        vers = doc.get("vers")
        if vers not in comptes:
            raise ValueError("Compte de destination du virement inconnu : %s" % vers)
        if vers == compte:
            raise ValueError("Un virement doit aller d'un compte à un autre.")
        out["vers"] = vers
    elif nature in ("pret", "remboursement"):
        personne = texte(doc.get("personne"), 60)
        if not personne:
            raise ValueError("Indiquez la personne concernée par le prêt.")
        out["personne"] = personne
        ech = str(doc.get("echeance") or "")
        if nature == "pret" and ech:
            if not RE_DATE.match(ech):
                raise ValueError("Échéance invalide (format attendu AAAA-MM-JJ).")
            out["echeance"] = ech
    elif nature == "investissement":
        if doc.get("bien") not in ids_de(d, "biens"):
            raise ValueError("Choisissez le bien concerné par l'investissement.")
        out["bien"] = doc["bien"]
    if nature == "revenu":
        out["cat_revenu"] = doc.get("cat_revenu") if doc.get("cat_revenu") in ids_revenus(d) else "autre"
    if nature == "depense" and doc.get("tiers"):
        # votre dépense versée au compte d'un tiers (votre part à la maison familiale) : elle l'alimente aussi
        if doc["tiers"] not in ids_tiers(d) or doc["tiers"] == compte:
            raise ValueError("Compte du tiers inconnu : %s" % doc["tiers"])
        out["tiers"] = doc["tiers"]
    if nature in ("depense", "revenu") and doc.get("evenement"):
        if doc["evenement"] not in ids_de(d, "evenements"):
            raise ValueError("Événement inconnu : %s" % doc["evenement"])
        out["evenement"] = doc["evenement"]
    if doc.get("prog") and doc["prog"] in ids_de(d, "programmees") and RE_DATE.match(str(doc.get("prog_date") or "")):
        out["prog"], out["prog_date"] = doc["prog"], doc["prog_date"]
    if nature == "investissement" and out.get("bien") in ids_maisons(d):
        out["cat_maison"] = doc.get("cat_maison") if doc.get("cat_maison") in CAT_MAISON else deviner_cat_maison(libelle)
    if nature in ("depense", "investissement") and doc.get("vehicule"):
        if doc["vehicule"] not in ids_vehicules(d):
            raise ValueError("Véhicule inconnu : %s" % doc["vehicule"])
        out["vehicule"] = doc["vehicule"]
        out["cat_vehicule"] = doc.get("cat_vehicule") if doc.get("cat_vehicule") in CAT_VEHICULE else "autre"
        for champ, quoi in (("km", "Kilométrage"), ("quantite", "Quantité")):
            if doc.get(champ) not in (None, "", 0):
                out[champ] = montant_positif(doc.get(champ), quoi)
        if "quantite" in out:
            out["unite"] = doc.get("unite") if doc.get("unite") in ("L", "u") else ("L" if out["cat_vehicule"] == "carburant" else "u")
    out["cree"] = str(doc.get("cree") or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    rem = texte(doc.get("remarque"), 300)
    if rem:
        out["remarque"] = rem
    return out


RE_DEVISE = re.compile(r"^[A-Z]{3}$")


def nettoyer_devises(liste):
    """Parités d'affichage : 1 unité de la devise = « taux » francs CFA (XAF, toujours 1)."""
    out, vus = [], set()
    for x in liste or []:
        code = str(x.get("code", "")).strip().upper()
        if not RE_DEVISE.match(code):
            raise ValueError("Code de devise invalide : %s (3 lettres, par exemple USD)." % code)
        if code in vus:
            raise ValueError("Devise en double : %s" % code)
        vus.add(code)
        if code == "XAF":
            taux = 1
        else:
            try:
                taux = float(x.get("taux"))
            except (TypeError, ValueError):
                raise ValueError("Parité invalide pour %s." % code)
            if not (0 < taux < 1e9):
                raise ValueError("Parité invalide pour %s : elle doit être positive." % code)
            taux = round(taux, 6)
        dv = {"code": code, "nom": texte(x.get("nom"), 40) or code, "symbole": texte(x.get("symbole"), 6) or code, "taux": taux}
        maj = str(x.get("maj") or "")
        if maj:
            if not RE_DATE.match(maj):
                raise ValueError("Date de parité invalide pour %s." % code)
            dv["maj"] = maj
        out.append(dv)
    if "XAF" not in vus:
        out.insert(0, {"code": "XAF", "nom": "Franc CFA", "symbole": "FCFA", "taux": 1})
    return out


def nettoyer_mots(liste):
    mots = []
    for m in (liste or [])[:300]:
        m = texte(m, 80)
        if m and m.lower() not in [k.lower() for k in mots]:
            mots.append(m)
    return mots


def nettoyer_revenus(liste):
    out, vus, noms = [], set(), set()
    for x in liste or []:
        rid, label = str(x.get("id", "")).strip(), texte(x.get("label"), 60)
        if not RE_ID.match(rid):
            raise ValueError("Identifiant de type de revenu invalide : %s" % rid)
        if not label:
            raise ValueError("Chaque type de revenu doit avoir un nom.")
        if rid in vus or label.lower() in noms:
            raise ValueError("Deux types de revenus portent le même nom : %s" % label)
        vus.add(rid); noms.add(label.lower())
        out.append({"id": rid, "label": label, "courant": bool(x.get("courant")),
                    "mots": nettoyer_mots(x.get("mots")) if rid != "autre" else []})
    if "autre" not in vus:
        out.append(dict(REVENUS_DEFAUT[-1]))
    return [x for x in out if x["id"] != "autre"] + [x for x in out if x["id"] == "autre"]


def nettoyer_evenements(liste, d):
    out, vus = [], set()
    for x in liste or []:
        eid, nom = str(x.get("id", "")).strip(), texte(x.get("nom"), 60)
        if not RE_ID.match(eid):
            raise ValueError("Identifiant d'événement invalide : %s" % eid)
        if not nom or eid in vus:
            raise ValueError("Chaque événement doit avoir un nom unique.")
        vus.add(eid)
        ev = {"id": eid, "nom": nom, "type": x.get("type") if x.get("type") in TYPES_EVENEMENT else "autre",
              "budget": montant_positif(x.get("budget") or 0, "Budget de %s" % nom, zero=True),
              "mots": nettoyer_mots(x.get("mots")), "note": texte(x.get("note"), 300)}
        for k in ("debut", "fin"):
            v = str(x.get(k) or "")
            if v and not RE_DATE.match(v):
                raise ValueError("Date invalide pour %s." % nom)
            ev[k] = v
        if ev["debut"] and ev["fin"] and ev["fin"] < ev["debut"]:
            raise ValueError("%s : la fin précède le début." % nom)
        out.append(ev)
    manquants = {o.get("evenement") for o in d.get("operations", []) if o.get("evenement")} - vus
    if manquants:
        raise ValueError("Impossible de supprimer un événement qui a des opérations : %s" % ", ".join(sorted(manquants)))
    return out


def nettoyer_programmees(liste, d):
    out, vus = [], set()
    comptes = {c["id"]: c for c in d.get("parametres", {}).get("comptes", [])} or {"especes": {}}
    for x in liste or []:
        pid, lib = str(x.get("id", "")).strip(), texte(x.get("libelle"), 200)
        if not RE_ID.match(pid):
            raise ValueError("Identifiant d'opération programmée invalide : %s" % pid)
        if not lib or pid in vus:
            raise ValueError("Chaque opération programmée doit avoir un libellé unique.")
        vus.add(pid)
        nature = x.get("nature") if x.get("nature") in ("depense", "revenu") else "depense"
        mode = "interets" if x.get("mode") == "interets" else "fixe"
        compte = x.get("compte") if x.get("compte") in comptes else None
        if not compte:
            raise ValueError("%s : compte inconnu." % lib)
        if mode == "interets" and comptes[compte].get("taux") in (None, ""):
            raise ValueError("%s : le compte %s n'a pas de taux d'intérêt (Comptes et biens)." % (lib, comptes[compte].get("nom", compte)))
        try:
            periode, jour = int(x.get("periode") or 1), int(x.get("jour") or 1)
        except (TypeError, ValueError):
            raise ValueError("%s : périodicité ou jour invalide." % lib)
        if periode not in PERIODES_PROG or not 1 <= jour <= 31:
            raise ValueError("%s : périodicité ou jour invalide." % lib)
        debut, fin = str(x.get("debut") or ""), str(x.get("fin") or "")
        if not RE_DATE.match(debut) or (fin and not RE_DATE.match(fin)):
            raise ValueError("%s : date de début (obligatoire) ou de fin invalide." % lib)
        p = {"id": pid, "libelle": lib, "nature": nature, "mode": mode, "compte": compte, "periode": periode, "jour": jour,
             "debut": debut, "fin": fin, "actif": x.get("actif") is not False,
             "montant": montant_positif(x.get("montant") or 0, "Montant de %s" % lib, zero=(mode == "interets")),
             "ignorees": sorted({str(v) for v in (x.get("ignorees") or []) if RE_DATE.match(str(v))})[-60:]}
        if nature == "depense":
            p["categorie"] = x.get("categorie") if x.get("categorie") in ids_postes(d) else "autre"
        else:
            p["cat_revenu"] = x.get("cat_revenu") if x.get("cat_revenu") in ids_revenus(d) else ("interets" if mode == "interets" else "autre")
        out.append(p)
    return out


def nettoyer_comptes(liste, d):
    comptes, vus, noms = [], set(), set()
    for x in liste or []:
        cid = str(x.get("id", "")).strip()
        nom = texte(x.get("nom"), 60)
        if not RE_ID.match(cid):
            raise ValueError("Identifiant de compte invalide : %s" % cid)
        if not nom:
            raise ValueError("Chaque compte doit avoir un nom.")
        if cid in vus or nom.lower() in noms:
            raise ValueError("Deux comptes portent le même nom : %s" % nom)
        vus.add(cid); noms.add(nom.lower())
        typ = x.get("type") if x.get("type") in TYPES_COMPTE else "courant"
        rel = {}
        for r in x.get("releves") or []:
            if not RE_DATE.match(str(r.get("date", ""))):
                raise ValueError("Date de relevé invalide pour %s." % nom)
            rel[r["date"]] = {"date": r["date"], "solde": montant_signe(r.get("solde"), "Solde du relevé de %s" % nom)}
            if RE_HEURE.match(str(r.get("heure") or "")):
                rel[r["date"]]["heure"] = r["heure"]   # heure où le solde a été noté (soldes du jour)
        c = {"id": cid, "nom": nom, "type": typ, "mots": nettoyer_mots(x.get("mots")),
             "releves": [rel[k] for k in sorted(rel)]}
        coul = str(x.get("couleur") or "")
        if RE_COULEUR.match(coul):
            c["couleur"] = coul
        if x.get("taux") not in (None, ""):
            c["taux"] = montant_positif(x.get("taux"), "Taux d'intérêt de %s" % nom, zero=True)
            c["periode"] = int(montant_positif(x.get("periode") or 12, "Période des intérêts"))
        if cid != "especes" and RE_DATE.match(str(x.get("supprime") or "")):
            c["supprime"] = x["supprime"]   # compte supprimé ce jour-là : masqué, rétablissable 30 jours (purger_corbeille)
        if typ == "tiers":
            c["titulaire"] = texte(x.get("titulaire"), 60) or nom
            c["morale"] = bool(x.get("morale"))          # personne morale (association, famille, entreprise…)
            c["moi"] = nettoyer_mots(x.get("moi"))       # vos noms dans les notes de ce compte (« prt Ali » = votre part)
            c["contrib"] = nettoyer_mots(x.get("contrib"))   # libellés de vos dépenses versées à ce compte
            if x.get("sourdine"):
                c["sourdine"] = True   # solde négatif (avance) gardé dans le compte mais pas compté dans le patrimoine
        comptes.append(c)
    if "especes" not in vus:
        comptes.insert(0, json.loads(json.dumps(COMPTES_DEFAUT[0])))
    ops = d.get("operations", [])
    utilises = {o.get("compte") for o in ops} | {o.get("vers") for o in ops} | {o.get("tiers") for o in ops}
    manquants = (utilises - {None}) - {c["id"] for c in comptes}
    if manquants:
        raise ValueError("Impossible de supprimer un compte qui a des opérations : %s" % ", ".join(sorted(manquants)))
    return comptes


def nettoyer_biens(liste, d):
    biens, vus = [], set()
    postes = ids_postes(d)
    for x in liste or []:
        bid = str(x.get("id", "")).strip()
        nom = texte(x.get("nom"), 60)
        if not RE_ID.match(bid):
            raise ValueError("Identifiant de bien invalide : %s" % bid)
        if not nom or bid in vus:
            raise ValueError("Chaque bien doit avoir un nom unique.")
        vus.add(bid)
        da = str(x.get("date_achat") or "")
        if da and not RE_DATE.match(da):
            raise ValueError("Date d'achat invalide pour %s." % nom)
        est = {}
        for e in x.get("estimations") or []:
            if not RE_DATE.match(str(e.get("date", ""))):
                raise ValueError("Date d'estimation invalide pour %s." % nom)
            est[e["date"]] = montant_positif(e.get("valeur"), "Valeur estimée de %s" % nom, zero=True)
        biens.append({"id": bid, "nom": nom, "type": x.get("type") if x.get("type") in TYPES_BIEN else "actif",
                      "date_achat": da, "prix_achat": montant_positif(x.get("prix_achat") or 0, "Prix d'achat de %s" % nom, zero=True),
                      "poste": x.get("poste") if x.get("poste") in postes else "",
                      "mots": nettoyer_mots(x.get("mots")),
                      "estimations": [{"date": k, "valeur": est[k]} for k in sorted(est)]})
        if x.get("vehicule"):
            vg = x.get("vidange") or {}
            def km(k, defaut=0):
                try:
                    return max(0, int(float(vg.get(k) or defaut)))
                except (TypeError, ValueError):
                    raise ValueError("Repère de vidange invalide pour %s." % nom)
            biens[-1]["vehicule"] = True
            biens[-1]["engin"] = x.get("engin") if x.get("engin") in ENGINS else "voiture"
            biens[-1]["vidange"] = {"intervalle": km("intervalle", 3000) or 3000, "dernier": km("dernier"), "prochain": km("prochain")}
        if x.get("maison"):
            pj = x.get("projet") or {}
            ech = str(pj.get("echeance") or "")
            if ech and not RE_DATE.match(ech):
                raise ValueError("Échéance du projet invalide pour %s." % nom)
            biens[-1]["maison"] = True
            biens[-1]["projet"] = {"budget": montant_positif(pj.get("budget") or 0, "Budget du projet", zero=True),
                                   "echeance": ech, "note": texte(pj.get("note"), 300)}
    manquants = ({o.get("bien") for o in d.get("operations", []) if o.get("nature") == "investissement"}
                 | {o.get("vehicule") for o in d.get("operations", []) if o.get("vehicule")}) - vus
    if manquants:
        raise ValueError("Impossible de supprimer un bien qui a des investissements : %s" % ", ".join(sorted(manquants)))
    return biens


# ---------------------------------------------------------------- réglages et retour en arrière
# Chaque changement de réglages garde l'état d'AVANT dans d["historique"] (20 derniers), avec les opérations qu'il a
# reclassées. {"restaurer": i} revient à l'état d'avant le changement i ; {"origine": true} remet les réglages
# d'origine (postes, types de revenus, budgets, parités) sans toucher aux opérations, comptes, biens, événements
# et opérations programmées. Restaurer est lui-même un changement : on peut donc l'annuler.
SECTIONS_REGLAGES = ("postes", "budgets", "revenus", "evenements", "programmees", "comptes", "biens", "devises")
NOMS_SECTIONS = {"postes": "postes", "budgets": "budgets", "revenus": "types de revenus", "evenements": "événements",
                 "programmees": "opérations programmées", "comptes": "comptes", "biens": "biens", "devises": "parités"}
GARDER_HISTORIQUE = 20


def regler(d, corps, resume=None):
    if corps.get("origine"):
        return regler(d, {"postes": json.loads(json.dumps(POSTES_DEFAUT)), "budgets": {},
                          "revenus": json.loads(json.dumps(REVENUS_DEFAUT)), "devises": None}, "retour aux réglages d'origine")
    if corps.get("restaurer") is not None:
        h = d.get("historique") or []
        try:
            e = h[int(corps["restaurer"])]
        except (TypeError, ValueError, IndexError):
            raise ValueError("Point de restauration introuvable.")
        snap = e.get("parametres") or {}
        defauts = {"postes": POSTES_DEFAUT, "budgets": {}, "revenus": REVENUS_DEFAUT, "evenements": [], "programmees": [],
                   "comptes": COMPTES_DEFAUT, "biens": [], "devises": None}
        c2 = {k: json.loads(json.dumps(snap[k] if k in snap else defauts[k])) for k in SECTIONS_REGLAGES}
        c2["retablir"] = e.get("ops") or {}
        return regler(d, c2, "retour en arrière")
    prm = d.setdefault("parametres", {})
    avant = json.loads(json.dumps({k: v for k, v in prm.items() if k != "rev"}))
    modifs = {}   # opérations reclassées par ce changement : {id: {champ: ancienne valeur}}, pour pouvoir revenir en arrière
    def noter(x, champ):
        modifs.setdefault(x.get("id"), {}).setdefault(champ, x.get(champ))
    if "postes" in corps:
        postes, vus, noms = [], set(), set()
        for x in corps.get("postes") or []:
            pid = str(x.get("id", "")).strip()
            label = str(x.get("label", "")).strip()[:60]
            if not RE_ID.match(pid):
                raise ValueError("Identifiant de poste invalide : %s" % pid)
            if not label:
                raise ValueError("Chaque poste doit avoir un nom.")
            if pid in vus or label.lower() in noms:
                raise ValueError("Deux postes portent le même nom : %s" % label)
            vus.add(pid); noms.add(label.lower())
            coul = str(x.get("couleur", "#9a968c"))
            postes.append({"id": pid, "label": label,
                           "couleur": coul if RE_COULEUR.match(coul) else "#9a968c",
                           "mots": nettoyer_mots(x.get("mots")) if pid != "autre" else []})
        if "autre" not in vus:
            postes.append(dict(POSTES_DEFAUT[-1]))
        else:  # « Autre » reste toujours en dernier
            postes = [x for x in postes if x["id"] != "autre"] + [x for x in postes if x["id"] == "autre"]
        prm["postes"] = postes
    ids = ids_postes(d)
    # déplacement des lignes des postes supprimés : {"ancien": "nouveau"}
    deplacer = {str(k): str(v) for k, v in (corps.get("deplacer") or {}).items()}
    n = 0
    for x in d["operations"]:
        if x.get("nature") != "depense":
            continue
        c = x.get("categorie")
        cible = deplacer.get(c, c)
        if cible not in ids:
            cible = "autre"
        if cible != c:
            noter(x, "categorie")
            x["categorie"] = cible
            marquer(d, x)
            n += 1
    if "budgets" in corps:
        budgets = {}
        for k, v in (corps.get("budgets") or {}).items():
            if k not in ids:
                continue
            try:
                v = int(round(float(v)))
            except (TypeError, ValueError):
                raise ValueError("Budget invalide pour %s." % k)
            if v > 0:
                budgets[k] = v
        prm["budgets"] = budgets
    else:
        prm["budgets"] = {k: v for k, v in (prm.get("budgets") or {}).items() if k in ids}
    if "revenus" in corps:
        prm["revenus"] = nettoyer_revenus(corps.get("revenus"))
        rids = ids_revenus(d)
        for x in d["operations"]:   # type de revenu supprimé : ses lignes vont dans « Autre revenu »
            if x.get("nature") == "revenu" and x.get("cat_revenu") and x["cat_revenu"] not in rids:
                noter(x, "cat_revenu")
                x["cat_revenu"] = "autre"
                marquer(d, x)
                n += 1
    if "evenements" in corps:
        prm["evenements"] = nettoyer_evenements(corps.get("evenements"), d)
    if "programmees" in corps:
        prm["programmees"] = nettoyer_programmees(corps.get("programmees"), d)
    if "comptes" in corps:
        prm["comptes"] = nettoyer_comptes(corps.get("comptes"), d)
    if "biens" in corps:
        prm["biens"] = nettoyer_biens(corps.get("biens"), d)
    if "devises" in corps:
        if corps["devises"] is None:   # parités par défaut de l'application
            prm.pop("devises", None)
        else:
            prm["devises"] = nettoyer_devises(corps.get("devises"))
    for b in prm.get("biens", []):  # un poste supprimé ne reste pas lié à un bien
        if b.get("poste") and b["poste"] not in ids:
            b["poste"] = ""
    # retour en arrière : les lignes reclassées par le changement annulé retrouvent leur poste / type de revenu
    for oid, vals in (corps.get("retablir") or {}).items():
        x = next((o for o in d["operations"] if o.get("id") == oid), None)
        if not x:
            continue
        if x.get("nature") == "depense" and vals.get("categorie") in ids_postes(d) and x.get("categorie") != vals["categorie"]:
            x["categorie"] = vals["categorie"]
            marquer(d, x)
        if x.get("nature") == "revenu" and "cat_revenu" in vals and (vals["cat_revenu"] in ids_revenus(d) or not vals["cat_revenu"]):
            x["cat_revenu"] = vals["cat_revenu"] or "autre"
            marquer(d, x)
    marquer_parametres(d)
    h = d.setdefault("historique", [])
    h.append({"date": horodatage(), "resume": resume or ", ".join(NOMS_SECTIONS[k] for k in SECTIONS_REGLAGES if k in corps) or "réglages",
              "parametres": avant, "ops": modifs})
    del h[:-GARDER_HISTORIQUE]
    return {"parametres": prm, "deplacees": n}


# ---------------------------------------------------------------- HTTP
# ---------------------------------------------------------------- onglets ouverts sur l'ordinateur
# Chaque onglet Daftar de l'ordinateur garde une connexion /api/onglet ouverte (flux d'événements). Le lanceur
# « appya » demande /api/onglets/rappel : s'il y a déjà un onglet, celui-ci se signale (notification, titre)
# au lieu qu'un nouvel onglet soit ouvert. Les téléphones ne s'inscrivent pas (client non local).
ONGLETS = {}                      # identifiant de connexion -> {"file": queue.Queue, "notif": bool}
VERROU_ONGLETS = threading.Lock()


def etat_onglets():
    with VERROU_ONGLETS:
        return {"ouverts": len(ONGLETS), "notif": any(o["notif"] for o in ONGLETS.values())}


class Gestionnaire(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json", ".js": "text/javascript"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP, **kw)

    def log_message(self, fmt, *args):  # journal discret
        if "/api/" in (self.path or ""):
            sys.stderr.write("  %s %s\n" % (self.command, self.path))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        corps = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def _corps(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            raise ValueError("Requête trop volumineuse.")
        return json.loads(self.rfile.read(n) or b"{}")

    def _origine_ok(self):
        # refuse les requêtes d'écriture venant d'un autre site ouvert dans le navigateur
        o = self.headers.get("Origin")
        if not o:
            return True
        h = urlparse(o).netloc
        return h == self.headers.get("Host")

    def _client_local(self):
        try:
            return ipaddress.ip_address(self.client_address[0]).is_loopback
        except ValueError:
            return False

    def _page_cle(self, erreur=False):
        corps = (PAGE_CLE % ('<p class="err">Clé incorrecte.</p>' if erreur else "")).encode("utf-8")
        self.send_response(401)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def _controle(self):
        """Contrôle d'accès commun à toutes les requêtes. Retourne False si une réponse
        de refus (ou de redirection) a déjà été envoyée."""
        if not hote_autorise(self.headers.get("Host")):
            self._json(403, {"erreur": "Nom d'hôte refusé."})
            return False
        if not RESEAU or self._client_local():
            return True
        u = urlparse(self.path)
        donnee = parse_qs(u.query).get("cle", [""])[0].strip().lower()
        if donnee:
            if hmac.compare_digest(donnee.encode(), CLE.encode()):
                # la clé passe dans un cookie et disparaît de la barre d'adresse
                self.send_response(303)
                self.send_header("Location", u.path or "/")
                self.send_header("Set-Cookie", "cle=%s; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax" % CLE)
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                time.sleep(1)  # freine les essais au hasard
                self._page_cle(erreur=True)
            return False
        c = SimpleCookie()
        try:
            c.load(self.headers.get("Cookie") or "")
        except Exception:  # noqa — cookie mal formé : traité comme absent
            pass
        if "cle" in c and hmac.compare_digest(c["cle"].value.encode(), CLE.encode()):
            return True
        if u.path.startswith("/api/"):
            self._json(401, {"erreur": "Accès protégé : ouvrez le lien avec la clé "
                                       "(tapez daftar etat sur l'ordinateur)."})
        else:
            self._page_cle()
        return False

    def do_HEAD(self):
        if self._controle():
            super().do_HEAD()

    def do_GET(self):
        if not self._controle():
            return
        p = urlparse(self.path).path
        if p == "/api/donnees":
            with VERROU:
                d = lire()
            return self._json(200, d)
        if p == "/api/info":
            return self._json(200, {"version": VERSION, "nom": VERSION_NOM, "fichier": FICHIER, "sauvegardes": SAUVEGARDES, "app": APP_ID,
                                    "reseau": RESEAU})
        if p == "/api/onglet" and self._client_local():
            q = parse_qs(urlparse(self.path).query)
            return self._flux_onglet(q.get("id", [""])[0][:40] or uuid.uuid4().hex, q.get("notif", [""])[0] == "granted")
        if p == "/api/onglets" and self._client_local():
            return self._json(200, etat_onglets())
        if p.startswith("/api/"):
            return self._json(404, {"erreur": "Adresse inconnue."})
        return super().do_GET()

    def _flux_onglet(self, cle, notif):
        """Flux d'événements (text/event-stream) tenu ouvert tant que l'onglet est ouvert."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.end_headers()
        moi = {"file": queue.Queue(), "notif": notif}
        file = moi["file"]
        with VERROU_ONGLETS:
            ONGLETS[cle] = moi   # une reconnexion du même onglet remplace l'ancienne entrée
        try:
            self.wfile.write(b"retry: 1000\n\n")
            self.wfile.flush()
            while True:
                try:
                    evt = file.get(timeout=5)
                    self.wfile.write(("event: %s\ndata: {}\n\n" % evt).encode())
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")   # détecte un onglet fermé
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with VERROU_ONGLETS:
                if ONGLETS.get(cle) is moi:
                    del ONGLETS[cle]
            self.close_connection = True

    def _ecriture(self, action):
        if not self._origine_ok():
            return self._json(403, {"erreur": "Origine refusée."})
        try:
            with VERROU:
                d = lire()
                purger_corbeille(d)
                res = action(d)
                ecrire(d)
            return self._json(200, res)
        except KeyError:
            return self._json(404, {"erreur": "Ligne introuvable (déjà supprimée ?)."})
        except ValueError as e:
            return self._json(400, {"erreur": str(e)})
        except Exception as e:  # noqa
            return self._json(500, {"erreur": "Erreur du serveur : %s" % e})

    def do_POST(self):
        if not self._controle():
            return
        p = urlparse(self.path).path
        if p == "/api/operations":
            try:
                corps = self._corps()
            except ValueError as e:
                return self._json(400, {"erreur": str(e)})
            lignes = corps if isinstance(corps, list) else [corps]

            def ajouter(d):  # un lot est tout ou rien : la validation précède tout ajout
                nouv = [{"id": uuid.uuid4().hex[:12], **nettoyer(doc, d)} for doc in lignes]
                for o in nouv:
                    marquer(d, o)
                d["operations"].extend(nouv)
                return nouv if isinstance(corps, list) else nouv[0]
            return self._ecriture(ajouter)
        if p == "/api/onglets/ferme" and self._client_local():   # envoyé par l'onglet qui se ferme
            n = int(self.headers.get("Content-Length") or 0)
            cle = self.rfile.read(min(n, 100)).decode("utf-8", "replace").strip()
            with VERROU_ONGLETS:
                ONGLETS.pop(cle, None)
            return self._json(200, etat_onglets())
        if p == "/api/onglets/rappel" and self._client_local():
            if not self._origine_ok():
                return self._json(403, {"erreur": "Origine refusée."})
            with VERROU_ONGLETS:
                for o in ONGLETS.values():
                    o["file"].put("rappel")
            return self._json(200, etat_onglets())
        if p == "/api/sync":
            try:
                corps = self._corps()
            except ValueError as e:
                return self._json(400, {"erreur": str(e)})
            return self._ecriture(lambda d: synchroniser(d, corps))
        if p == "/api/reclasser":
            # {"changements": [{"id": ..., "categorie": ...}, ...]} — dépenses seulement, appliqué en une fois
            try:
                corps = self._corps()
            except ValueError as e:
                return self._json(400, {"erreur": str(e)})

            def reclasser(d):
                ids = ids_postes(d)
                voulu = {}
                for c in (corps.get("changements") or []):
                    if c.get("categorie") not in ids:
                        raise ValueError("Poste inconnu : %s" % c.get("categorie"))
                    voulu[str(c.get("id"))] = c["categorie"]
                n = 0
                for x in d["operations"]:
                    if x.get("id") in voulu and x.get("nature") == "depense" and x.get("categorie") != voulu[x["id"]]:
                        x["categorie"] = voulu[x["id"]]
                        marquer(d, x)
                        n += 1
                return {"modifiees": n}
            return self._ecriture(reclasser)
        return self._json(404, {"erreur": "Adresse inconnue."})

    def do_PUT(self):
        if not self._controle():
            return
        p = urlparse(self.path).path
        try:
            corps = self._corps()
        except ValueError as e:
            return self._json(400, {"erreur": str(e)})
        m = re.match(r"^/api/operations/([\w-]+)$", p)
        if m:
            ident = m.group(1)

            def remplacer(d):
                for i, x in enumerate(d["operations"]):
                    if x.get("id") == ident:
                        d["operations"][i] = marquer(d, {"id": ident, **nettoyer(corps, d)})
                        return d["operations"][i]
                raise KeyError(ident)
            return self._ecriture(remplacer)
        if p == "/api/parametres":
            return self._ecriture(lambda d: regler(d, corps))
        return self._json(404, {"erreur": "Adresse inconnue."})

    def do_DELETE(self):
        if not self._controle():
            return
        p = urlparse(self.path).path
        m = re.match(r"^/api/operations/([\w-]+)$", p)
        if not m:
            return self._json(404, {"erreur": "Adresse inconnue."})
        ident = m.group(1)

        def supprimer(d):
            avant = len(d["operations"])
            d["operations"] = [x for x in d["operations"] if x.get("id") != ident]
            if len(d["operations"]) == avant:
                raise KeyError(ident)
            d["supprimees"] = [t for t in d.setdefault("supprimees", []) if t["id"] != ident] + [marquer(d, {"id": ident})]
            return {"supprime": ident}
        return self._ecriture(supprimer)


# ---------------------------------------------------------------- démarrage
def deja_lance(port):
    import urllib.request
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/api/info" % port, timeout=1) as r:
            return json.load(r).get("app") == APP_ID
    except Exception:
        return False


def ip_locale():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return None
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser(description="Daftar — serveur local")
    ap.add_argument("--port", type=int, default=8780)
    ap.add_argument("--reseau", action="store_true", help="accessible depuis les autres appareils du même réseau")
    ap.add_argument("--sans-navigateur", action="store_true")
    a = ap.parse_args()

    if sys.version_info < (3, 8):
        sys.exit("Python 3.8 ou plus récent est nécessaire.")

    if deja_lance(a.port):
        url = "http://localhost:%d" % a.port
        print("Le carnet tourne déjà : %s" % url)
        if not a.sans_navigateur:
            webbrowser.open(url)
        return

    # Daftar ne lit que le format 5 : les conversions des anciens formats (v1 à v4) et la reprise de l'ancien
    # Carnet du véhicule ont été retirées le 2026-11-14, une fois toutes les données converties.
    d = lire()
    if d.get("version") != 5 or not isinstance(d.get("operations"), list):
        sys.exit("Format de données non reconnu (version %s) dans %s : Daftar %s ne lit que le format 5."
                 % (d.get("version"), FICHIER, VERSION_NOM + " " + VERSION))

    with VERROU:
        if purger_corbeille(d):   # comptes supprimés depuis plus de 30 jours : effacés pour de bon
            ecrire(d)
        copier_miroir()   # au démarrage : rattrape les écritures faites pendant que le disque miroir était absent

    global RESEAU, CLE
    if a.reseau:
        RESEAU, CLE = True, cle_reseau()  # créée avant l'ouverture du port : les scripts la lisent ensuite

    hote = "0.0.0.0" if a.reseau else "127.0.0.1"
    serveur = None
    for port in range(a.port, a.port + 10):
        try:
            serveur = ThreadingHTTPServer((hote, port), Gestionnaire)
            break
        except OSError:
            continue
    if not serveur:
        sys.exit("Aucun port libre entre %d et %d." % (a.port, a.port + 9))
    port = serveur.server_address[1]
    url = "http://localhost:%d" % port

    print("")
    print("  Daftar %s %s" % (VERSION_NOM, VERSION))
    print("  Ouvert sur        : %s" % url)
    if a.reseau:
        ip = ip_locale()
        if ip:
            print("  Depuis le téléphone (même Wi-Fi) : http://%s:%d/?cle=%s" % (ip, port, CLE))
        print("  (clé d'accès dans %s ; les autres appareils ne voient rien sans elle)" % FICHIER_CLE)
    print("  Données           : %s" % FICHIER)
    print("  Copie miroir      : %s" % (os.path.join(dossier_miroir(), "carnet.json") if dossier_miroir() else "aucune"))
    print("  Pour arrêter      : Ctrl+C (ou : daftar arreter)")
    print("")

    # mémorise l'adresse réelle pour le lanceur (utile si le port 8780 était pris)
    try:
        os.makedirs(DONNEES, exist_ok=True)
        with open(os.path.join(DONNEES, ".adresse"), "w") as f:
            f.write(url + "\n")
    except OSError:
        pass

    # arrêt propre quand systemd envoie SIGTERM
    def _arret(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, _arret)

    if not a.sans_navigateur:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt de Daftar.")
    finally:
        serveur.server_close()


if __name__ == "__main__":
    main()
