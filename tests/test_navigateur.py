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
addEventListener('load',()=>setTimeout(async()=>{const vu=[],diag=[];
  const etat=q=>diag.push(q+' : '+JSON.stringify({ready:typeof ready!=='undefined'&&ready,ops:typeof all!=='undefined'?all.length:-1,biens:typeof BIENS!=='undefined'?BIENS.length:-1,foyers:typeof FOYERS!=='undefined'?FOYERS.length:-1,evts:typeof EVTS!=='undefined'?EVTS.length:-1,view}));const pause=()=>new Promise(r=>setTimeout(r,150));
  try{
    // machine lente : la démo (3 ans simulés) peut mettre plusieurs secondes à se générer ; on attend les données
    // (opérations, puis réglages : biens et foyers peuvent arriver après les opérations — vu sur GitHub le 28/11)
    etat('début');for(let i=0;i<400&&!(typeof ready!=='undefined'&&ready&&all.length&&BIENS.length&&FOYERS.length);i++)await pause();etat('après attente');
    for(const [rub,vues] of [['aFin',['vMois','vAn','vPat','vStats']],['aBiens',['aVeh','aMai','bHub']]]){
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
    // Foyer : bouton à côté de la période ; il garde le mois (vue Mois) ou l'année (vue Année) ; un second appui revient
    document.getElementById('aFin').click();await pause();document.getElementById('vMois').click();await pause();
    document.getElementById('foyBtn').click();await pause();if(view==='foyer'&&foyMode==='mois')vu.push('foyMois');
    document.getElementById('foyBtn').click();await pause();document.getElementById('vAn').click();await pause();
    document.getElementById('foyBtn').click();await pause();if(view==='foyer'&&foyMode==='annee')vu.push('foyAn');
    if(document.querySelectorAll('#foyBody .foyhero .stat').length===4)vu.push('foyInd');
    // Foyer actif : Mois / Année gardent le Foyer, seule la période change
    document.getElementById('vMois').click();await pause();const fm=view==='foyer'&&foyMode==='mois';
    document.getElementById('vAn').click();await pause();if(fm&&view==='foyer'&&foyMode==='annee')vu.push('foyReste');
    document.getElementById('foyBtn').click();await pause();
    // tableau par mois (vue Année) : replié par défaut ; déplié, titres et première colonne figés
    {document.getElementById('vAn').click();await pause();const w=document.getElementById('yearTblWrap'),avant=w.hidden;
     document.getElementById('yearTblBtn').click();await pause();const th=document.querySelector('#yearTbl thead th'),td=document.querySelector('#yearTbl tbody td');
     if(avant&&!w.hidden&&th&&getComputedStyle(th).position==='sticky'&&td&&getComputedStyle(td).position==='sticky')vu.push('tableau');
     document.getElementById('yearTblBtn').click();await pause()}
    // balayage (téléphone) : vers la gauche = période suivante, vers la droite = précédente
    {document.getElementById('vMois').click();await pause();const m0=cur.y*12+cur.m,el=document.getElementById('resumePanel');
     const geste=async(x0,x1)=>{const T=x=>new Touch({identifier:1,target:el,clientX:x,clientY:300});
       el.dispatchEvent(new TouchEvent('touchstart',{touches:[T(x0)],changedTouches:[T(x0)],bubbles:true}));
       el.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[T(x1)],bubbles:true}));await pause()};
     await geste(300,100);const m1=cur.y*12+cur.m;await geste(100,300);const m2=cur.y*12+cur.m;
     if(m1===m0+1&&m2===m0)vu.push('balayage')}
    // projet : « + Dépense » ouvre Une opération en investissement dans le bien du projet
    {const pj=BIENS.find(x=>x.projet&&x.projet.budget);if(pj){depenseProjet(pj.id);await pause();if($('fNat').value==='investissement'&&$('fBien').value===pj.id)vu.push('pjdep');resetForm()}}
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
    document.getElementById('fDate').value='2024-01-15';document.getElementById('aSaisir').click();await pause();vu.push('aSaisir');
    // Saisir remet la date du jour (et non la dernière date saisie ou modifiée)
    if(document.getElementById('fDate').value===today)vu.push('dateJour');
    // ordinateur aussi : barre des rubriques en bas de l'écran
    if(getComputedStyle(document.querySelector('nav.apptabs')).position==='fixed')vu.push('barreBas');
    // champ « Pour » : Moi | Foyer 1… ; le foyer ouvre son menu : Tous (commun) ou des membres cochés
    if(FOYERS.length&&MEMBRES().length){const F=FOYERS[0],m=F.membres[0];
      document.getElementById('fLib').value='pain';document.getElementById('fLib').dispatchEvent(new Event('input'));await pause();
      // le foyer est déjà choisi (poste Foyer) : le toucher le décocherait ; le menu s'ouvre par son propre bouton
      if(foyerDe(pourEffectif())!==F.id){document.querySelector('#fPour [data-p="'+F.id+'"]').click();await pause()}
      if(document.getElementById('pourList').hidden){document.querySelector('#fPour .pourBtn').click();await pause()}
      const tous=JSON.stringify(pourEffectif())===JSON.stringify([F.id]);
      const c=document.querySelector('#fPour [data-m="'+m.id+'"]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));await pause();
      if(tous&&JSON.stringify(pourEffectif())===JSON.stringify([m.id])&&!document.querySelector('#fPour [data-p="'+m.id+'"]'))vu.push('pour');
      // « Tous les enfants » : tous les enfants du foyer, parts égales
      const te=document.querySelector('#fPour [data-enfants]');if(te){te.checked=true;te.dispatchEvent(new Event('change',{bubbles:true}));await pause();
        const E=F.membres.filter(x=>x.role==='enfant').map(x=>x.id);if(JSON.stringify(pourEffectif())===JSON.stringify(E))vu.push('enfants')}
      // toucher « Moi » une deuxième fois le décoche : dépense faite ailleurs
      document.querySelector('#fPour [data-p="moi"]').click();await pause();const m1=JSON.stringify(pourEffectif());
      document.querySelector('#fPour [data-p="moi"]').click();await pause();if(m1==='["moi"]'&&JSON.stringify(pourEffectif())==='["aucun"]'&&!document.querySelector('#fPour [aria-pressed="true"]'))vu.push('decoche');
      resetForm();
      // dépense générale (voiture) : boutons Moi et foyer affichés, aucun coché ; on peut cocher
      document.getElementById('fLib').value='lavage voiture';document.getElementById('fLib').dispatchEvent(new Event('input'));await pause();
      const bm=document.querySelector('#fPour [data-p="moi"]');if(bm&&!document.querySelector('#fPour [aria-pressed="true"]')){bm.click();await pause();
        if(JSON.stringify(pourEffectif())==='["moi"]')vu.push('pourReplie')}resetForm()}
    // logo : retour à l'accueil (Mes finances, vue Mois)
    document.getElementById('aVeh').click();await pause();document.getElementById('logoAccueil').click();await pause();
    if(view==='mois'&&vueFin==='mois')vu.push('logoAccueil');
    const ok=typeof ready!=='undefined'&&ready&&all.length>0;
    etat('fin');document.title='BILAN '+JSON.stringify({ok,n:all.length,vu,err:__err,diag})}
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
                                     "--user-data-dir=" + profil, "--window-size=1200,900", "--virtual-time-budget=150000", "--dump-dom",
                                     "http://localhost:%d/%s" % (self.port, chemin)], capture_output=True, text=True, timeout=400).stdout
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
        b_diag = b.get("diag")
        for etape in ("menu", "export", "theme", "tOne", "tSav", "bHub", "hub", "hubmod", "vidange", "fiches", "tRev", "foyMois", "foyAn", "balayage", "tFoy", "pour", "pourReplie", "foyReste", "enfants", "pjdep", "foyInd", "tableau", "decoche", "dateJour", "barreBas"):
            self.assertIn(etape, b["vu"], "étape manquante : %s ; état de la page : %r" % (etape, b_diag))

    def test_ordinateur(self):
        self.verifier(self.bilan("index.html"))

    def test_demo(self):
        self.verifier(self.bilan("index.html?demo"))


if __name__ == "__main__":
    unittest.main()
