"""La vraie page dans Chrome sans interface : chargement des scripts dans l'ordre, puis passage par toutes les vues
(Mois, Année, Patrimoine, Statistiques, Mes biens, Engins, Maison) et tous les onglets de Données et réglages, en relevant toute
erreur JavaScript. Deux modes : ordinateur (serveur.py sur une copie, données de démo) et démo autonome (?demo).
Sauté si Chrome ou Node est absent."""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CHROME = next((c for c in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser") if shutil.which(c)), None)

# injecté en tête de la copie de index.html : relève les erreurs, puis parcourt les vues et écrit le bilan dans le titre
ESSAI = r"""<script>
delete window.EventSource;   // « un seul onglet » : connexion permanente qui empêche Chrome sans interface de finir
window.__err=[];addEventListener('error',e=>__err.push((e.filename||'').split('/').pop()+':'+e.lineno+' '+e.message));
addEventListener('unhandledrejection',e=>__err.push('promesse : '+(e.reason&&e.reason.message||e.reason)));
addEventListener('load',()=>setTimeout(async()=>{const vu=[];const pause=()=>new Promise(r=>setTimeout(r,150));
  try{
    for(const [rub,vues] of [['aFin',['vMois','vAn','vPat','vStats','vFoy']],['aBiens',['aVeh','aMai','bHub']]]){
      document.getElementById(rub).click();await pause();vu.push(rub);
      for(const v of vues){document.getElementById(v).click();await pause();vu.push(v)}}
    // Mes biens : un engin s'ouvre dans Engins ; « Modifier les biens » mène à Comptes et biens (pas de « Modifier » par carte)
    // (machine lente : attendre que les données, donc les biens, soient chargées)
    for(let i=0;i<60&&!(ready&&BIENS.length);i++)await pause();document.getElementById('bHub').click();await pause();
    // machine lente : un rendu tardif peut remplacer la page ; on réessaie quelques fois
    for(let k=0;k<20;k++){document.getElementById('bHub').click();await pause();const go=document.querySelector('#hubList [data-hv]');
      if(!go)continue;const id=go.dataset.hv;go.click();await pause();await pause();if(view==='vehicule'&&VEH().id===id){vu.push('hub');break}}
    document.getElementById('aBiens').click();await pause();
    if(!document.querySelector('#hubList .hubmod')){document.getElementById('hubGerer').click();await pause();
      if(view==='donnees'&&!document.getElementById('cbBox').hidden)vu.push('hubmod')}
    // repères de vidange : dans Engins, pour l'engin affiché
    document.getElementById('aVeh').click();await pause();document.getElementById('vidModif').click();await pause();
    if(!document.getElementById('vidPanel').hidden&&document.getElementById('sInt').value)vu.push('vidange');
    // réglages en listes : « Modifier » ouvre un élément, « Annuler » le referme
    document.getElementById('aDon').click();await pause();document.getElementById('tEvt').click();await pause();
    {const f=document.querySelectorAll('#evtList .fiche,#pjList .fiche');const m=f[0]&&f[0].querySelector('.fmod');
     if(f.length>=2&&m){m.click();await pause();const ouvert=document.querySelector('#evtList .fiche.edit');
       if(ouvert){ouvert.querySelector('.fno').click();await pause();if(!document.querySelector('#evtList .fiche.edit'))vu.push('fiches')}}}
    document.getElementById('aDon').click();await pause();
    // menu ≡ : aucun panneau visible ; export Excel ouvert depuis le menu
    const S=document.getElementById('saisie');
    if(S.classList.contains('regmenu')&&tabs.every(([,p])=>getComputedStyle(document.getElementById(p)).display==='none'))vu.push('menu');
    document.getElementById('exportBtn').click();await pause();if(!document.getElementById('exportMenu').hidden)vu.push('export');
    document.getElementById('exportBtn').click();await pause();
    // mode jour / nuit : le bouton bascule, et revenir au mode du navigateur efface le choix
    const t0=sombre();document.getElementById('themeBtn').click();await pause();const t1=sombre();
    document.getElementById('themeBtn').click();await pause();if(t1!==t0&&sombre()===t0&&localStorage.getItem('daftar-theme')===null)vu.push('theme');
    for(const [t] of tabs){document.getElementById('aDon').click();await pause();document.getElementById(t).click();await pause();
      if(S.classList.contains('regpage')&&getComputedStyle(document.getElementById(tabs.find(x=>x[0]===t)[1])).display!=='none')vu.push(t)}
    document.getElementById('aSaisir').click();await pause();vu.push('aSaisir');
    // logo : retour à l'accueil (Mes finances, vue Mois)
    document.getElementById('aVeh').click();await pause();document.getElementById('logoAccueil').click();await pause();
    if(view==='mois'&&vueFin==='mois')vu.push('logoAccueil');
    const ok=typeof ready!=='undefined'&&ready&&all.length>0;
    document.title='BILAN '+JSON.stringify({ok,n:all.length,vu,err:__err})}
  catch(e){document.title='BILAN '+JSON.stringify({ok:false,exception:e.message,vu,err:__err})}},1500));
</script>
"""


def port_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@unittest.skipUnless(CHROME and shutil.which("node"), "Chrome ou Node absent")
class Navigateur(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dossier = tempfile.mkdtemp(prefix="daftar-nav-")
        shutil.copy(os.path.join(RACINE, "serveur.py"), cls.dossier)
        shutil.copytree(os.path.join(RACINE, "app"), os.path.join(cls.dossier, "app"))
        page = os.path.join(cls.dossier, "app", "index.html")
        with open(page, encoding="utf-8") as f:
            html = f.read()
        with open(page, "w", encoding="utf-8") as f:
            f.write(html.replace("<head>\n", "<head>\n" + ESSAI, 1))
        # carnet de démo (graine fixe) comme données de l'ordinateur
        demo = subprocess.run(["node", os.path.join(RACINE, "tests", "moteur_node.js")], input=json.dumps({"demo": "2026-11-25"}),
                              capture_output=True, text=True, check=True).stdout
        os.makedirs(os.path.join(cls.dossier, "donnees"))
        with open(os.path.join(cls.dossier, "donnees", "carnet.json"), "w", encoding="utf-8") as f:
            json.dump(json.loads(demo)["demo"], f)
        cls.port = port_libre()
        cls.proc = subprocess.Popen([sys.executable, os.path.join(cls.dossier, "serveur.py"), "--sans-navigateur", "--port", str(cls.port)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=dict(os.environ, HOME=cls.dossier))
        for _ in range(100):
            try:
                urllib.request.urlopen("http://127.0.0.1:%d/api/info" % cls.port, timeout=1)
                break
            except OSError:
                time.sleep(.1)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(5)
        shutil.rmtree(cls.dossier, ignore_errors=True)

    def bilan(self, chemin):
        profil = tempfile.mkdtemp(prefix="daftar-chrome-")
        try:
            sortie = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                                     "--user-data-dir=" + profil, "--window-size=1200,900", "--virtual-time-budget=60000", "--dump-dom",
                                     "http://localhost:%d/%s" % (self.port, chemin)], capture_output=True, text=True, timeout=240).stdout
        finally:
            shutil.rmtree(profil, ignore_errors=True)
        m = re.search(r"<title>BILAN (.*?)</title>", sortie, re.S)
        self.assertIsNotNone(m, "la page n'a pas terminé le parcours (titre : %r)" % re.findall(r"<title>(.*?)</title>", sortie)[:1])
        return json.loads(m.group(1).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"'))

    def verifier(self, b):
        self.assertEqual(b.get("err"), [], "erreurs JavaScript : %r" % b.get("err"))
        self.assertTrue(b.get("ok"), "données non chargées : %r" % b)
        self.assertIn("vStats", b["vu"])
        self.assertIn("aSaisir", b["vu"])
        self.assertIn("logoAccueil", b["vu"], "le logo ne ramène pas à l'accueil")
        for etape in ("menu", "export", "theme", "tOne", "tSav", "bHub", "hub", "hubmod", "vidange", "fiches", "tRev", "vFoy", "tFoy"):
            self.assertIn(etape, b["vu"], "étape manquante : " + etape)

    def test_ordinateur(self):
        self.verifier(self.bilan("index.html"))

    def test_demo(self):
        self.verifier(self.bilan("index.html?demo"))


if __name__ == "__main__":
    unittest.main()
