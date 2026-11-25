/* Daftar — un seul onglet sur l'ordinateur, bouton retour, démarrage (dernier chargé : il lance l'affichage).
   Un des six scripts de la page (app/index.html), chargés DANS L'ORDRE : noyau, vues, saisie, stats, reglages,
   demarrage. Scripts classiques (pas de modules) : leurs déclarations de premier niveau sont communes. Un script ne
   doit donc, en s'exécutant, appeler que ce qui est déclaré dans lui-même ou dans les précédents ; le démarrage
   (premier affichage) est dans demarrage.js, chargé en dernier. */
/* ================= un seul onglet sur l'ordinateur =================
   Chaque onglet de l'ordinateur tient ouvert /api/onglet. Quand on clique sur l'icône Daftar alors qu'un onglet
   existe déjà, le lanceur n'en ouvre pas d'autre : il demande un « rappel », et l'onglet se signale
   (notification dont le clic ramène à l'onglet, sinon titre clignotant). Le téléphone n'est pas concerné. */
if(!MODE_SYNC&&!MODE_AUTONOME&&'EventSource' in window&&/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)){
  const ID_ONGLET=Math.random().toString(36).slice(2,12);
  const permis=()=>('Notification' in window)?Notification.permission:'denied';
  let flux=null,clign=null,titre='';
  const brancher=()=>{if(flux)flux.close();flux=new EventSource(`/api/onglet?id=${ID_ONGLET}&notif=${permis()}`);flux.addEventListener('rappel',rappel)};
  function rappel(){
    if(permis()==='granted'){try{const n=new Notification('Daftar est déjà ouvert',{body:'Cliquez ici pour revenir à cet onglet.',icon:'daftar-192.png',tag:'appya-rappel'});
      n.onclick=()=>{window.focus();n.close()}}catch(e){note('notification',e)}}
    else if(permis()==='default')$('ongletBandeau').hidden=false;
    if(!document.hidden||clign)return;   // titre clignotant jusqu'au retour sur l'onglet
    titre=document.title;let k=0;clign=setInterval(()=>{document.title=(k++%2)?titre:'● Daftar est ouvert ici'},900);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&clign){clearInterval(clign);clign=null;document.title=titre}});
  $('ongletAutoriser').onclick=async()=>{try{await Notification.requestPermission()}catch(e){note('autorisation des notifications',e)}$('ongletBandeau').hidden=true;brancher()};
  $('ongletFermer').onclick=()=>{$('ongletBandeau').hidden=true};
  window.addEventListener('pagehide',()=>{try{navigator.sendBeacon('/api/onglets/ferme',ID_ONGLET)}catch(e){/* page en fermeture : le serveur le verra au prochain ping */}});
  brancher();
}

/* ================= démarrage ================= */
/* téléphone (même seuil que style.css) : la barre des rubriques (en bas) se cache pendant le défilement et revient dès
   qu'on s'arrête (sauf si le focus clavier est dedans). La ligne du haut, elle, reste figée (style.css) ; sa hauteur
   (--hh) place la barre des rubriques juste dessous sur ordinateur et règle les défilements automatiques. */
(()=>{const nav=document.querySelector('nav.apptabs'),hd=document.querySelector('main.wrap>header'),tel=matchMedia('(max-width:567px)');
  const hauteur=()=>document.documentElement.style.setProperty('--hh',hd.offsetHeight+'px');hauteur();
  if(window.ResizeObserver)new ResizeObserver(hauteur).observe(hd);else addEventListener('resize',hauteur);
  let t=null,y=scrollY;
  addEventListener('scroll',()=>{if(!tel.matches)return;const d=scrollY-y;y=scrollY;
    if(Math.abs(d)>2&&!nav.contains(document.activeElement))nav.classList.add('cachee');
    clearTimeout(t);t=setTimeout(()=>nav.classList.remove('cachee'),350)},{passive:true})})();
navPret=true;
render();charger().then(()=>{if(MODE_SYNC)synchroniser();majRappelSauvegarde()});
if(MODE_SYNC||MODE_AUTONOME){
  if('serviceWorker' in navigator&&window.isSecureContext&&!window.Capacitor&&!MODE_DEMO){navigator.serviceWorker.register('sw.js').catch(e=>note('service hors ligne non installé : Daftar ne s\'ouvrira pas sans réseau',e));
    // la page s'ouvre depuis le cache ; le service prévient quand une version plus récente vient d'être téléchargée
    navigator.serviceWorker.addEventListener('message',ev=>{if(ev.data&&ev.data.type==='daftar-maj')$('majBandeau').hidden=false});
    setTimeout(()=>{const c=navigator.serviceWorker.controller;if(c)c.postMessage('daftar-maj?')},3000);
    $('majRecharger').onclick=()=>{if(BROUILLONS.some(([,d])=>d())&&!confirm('Des modifications ne sont pas enregistrées. Recharger quand même ?'))return;location.reload()};
    $('majPlusTard').onclick=()=>{$('majBandeau').hidden=true}}
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(e=>note('stockage persistant',e));   // éviter que le navigateur efface les données du téléphone
}
if(MODE_SYNC){
  setInterval(()=>synchroniser(),120000);addEventListener('online',()=>synchroniser());majSync();
}
$('footVer').textContent='Daftar '+VERSION_APP;
req('GET','/api/info').then(i=>{$('footFile').innerHTML=MODE_AUTONOME?`Données : <b>${esc(i.fichier)}</b> · copies de sécurité : <b>${esc(i.sauvegardes)}</b>`:`Fichier de données : <code>${esc(i.fichier)}</code> · sauvegarde automatique chaque jour dans <code>${esc(i.sauvegardes)}</code>`}).catch(e=>note('informations du pied de page',e));
// bas de page : Licence, À propos, Démo (ou « Quitter la démo » dans la démo)
if(MODE_DEMO){$('footDemo').href='./';$('footDemo').querySelector('span').textContent='Quitter la démo'}
$('footLic').onclick=()=>$('dlgLic').showModal();
$('footApropos').onclick=()=>{$('apVer').textContent='Daftar '+VERSION_APP;
  $('apMode').textContent=MODE_DEMO?'Vous êtes dans la démonstration : trois ans de données simulées, rangées à part de vos données.':MODE_SYNC?'Version du téléphone : vos données sont gardées dans le téléphone et synchronisées avec votre ordinateur.':MODE_AUTONOME?'Version autonome : vos données restent dans cet appareil (navigateur ou application Android).':'Version de l\'ordinateur : vos données restent sur cet ordinateur, dans le fichier indiqué en bas de page.';
  $('dlgApropos').showModal()};
['dlgLic','dlgApropos'].forEach(i=>$(i).addEventListener('click',ev=>{if(ev.target.closest('[data-fermer]')||ev.target===$(i))$(i).close()}));
if(MODE_DEMO)$('footTxt').textContent='Daftar · version de démonstration · données simulées, rangées à part de vos données.';
/* démo : le bouton « précédent » (navigateur, téléphone) ne fait pas sortir de la démo ; seul « Quitter la démo » en sort */
if(MODE_DEMO&&window.history&&history.pushState){
  let sortie=false;
  history.replaceState({appyaDemo:1},'');history.pushState({appyaDemo:2},'');
  window.addEventListener('popstate',()=>{
    if(sortie){location.replace('./');return}
    history.pushState({appyaDemo:2},'');
    status('Vous êtes dans la démo : touchez « Quitter la démo » pour en sortir.');
    $('demoBandeau').scrollIntoView({behavior:doux(),block:'center'});
  });
  $('demoQuitter').addEventListener('click',ev=>{ev.preventDefault();sortie=true;history.back()});
}
else if(MODE_AUTONOME)$('footTxt').textContent='Daftar · suivi financier, engins et maison · version autonome : vos données restent dans cet appareil.';
$('themeBtn').onclick=()=>{basculerTheme();render()};
if(window.matchMedia){const mq=matchMedia('(prefers-color-scheme: dark)');const f=()=>{majThemeBtn();render()};mq.addEventListener?mq.addEventListener('change',f):mq.addListener(f)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ready&&!editId){if(MODE_SYNC)synchroniser();else charger(true).then(majRappelSauvegarde)}});
