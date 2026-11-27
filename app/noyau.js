/* Daftar — référentiels, outils, données, stockage local et synchronisation du téléphone, calculs, reconnaissance des notes.
   Un des six scripts de la page (app/index.html), chargés DANS L'ORDRE : noyau, vues, saisie, stats, reglages,
   demarrage. Scripts classiques (pas de modules) : leurs déclarations de premier niveau sont communes. Un script ne
   doit donc, en s'exécutant, appeler que ce qui est déclaré dans lui-même ou dans les précédents ; le démarrage
   (premier affichage) est dans demarrage.js, chargé en dernier. */
/* erreur sans conséquence pour les données (stockage du navigateur refusé, notification, historique…) : notée dans la
   console au lieu d'être avalée en silence (revue du 2026-11-25 : plus aucun catch vide sans raison écrite) */
function note(quoi,e){try{console.warn('[Daftar] '+quoi+' :',e&&e.message||e)}catch(_){}}
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){note('lecture du réglage '+k,e);return null}};
/* réglage propre à l'appareil : si le navigateur refuse le stockage (navigation privée…), on le dit une fois */
const lsSet=(k,v)=>{try{localStorage.setItem(k,v);return true}catch(e){note('réglage non mémorisé ('+k+')',e);
  if(!lsSet.dit){lsSet.dit=1;setTimeout(()=>status('Ce réglage ne sera pas retenu sur cet appareil : le navigateur refuse de le mémoriser.',true),0)}return false}};
/* ================= référentiels : postes, comptes, biens (chargés depuis parametres) ================= */
let CATS=[{id:'autre',label:'Autre',couleur:'#9a968c',mots:[]}], CAT={autre:CATS[0]};
function setPostes(p){
  if(Array.isArray(p)&&p.length)CATS=p.map(x=>({id:x.id,label:x.label,couleur:x.couleur||'#9a968c',mots:Array.isArray(x.mots)?x.mots:[]}));
  if(!CATS.some(c=>c.id==='autre'))CATS.push({id:'autre',label:'Autre',couleur:'#9a968c',mots:[]});
  CAT=Object.fromEntries(CATS.map(c=>[c.id,c]));
}
const ESPECES={id:'especes',nom:'Espèces',type:'especes',mots:['espèces','especes','cash','liquide'],releves:[]};
let COMPTES=[ESPECES], TOUS=[ESPECES], CORB=[], CPT={especes:ESPECES};
const DELAI_CORB=30;   // jours pour rétablir un compte supprimé (DELAI_CORBEILLE dans serveur.py et moteur.js)
function setComptes(c){
  if(Array.isArray(c)&&c.length)COMPTES=c.map(x=>({id:x.id,nom:x.nom,type:x.type||'courant',mots:Array.isArray(x.mots)?x.mots:[],releves:Array.isArray(x.releves)?x.releves:[],taux:x.taux,periode:x.periode,couleur:x.couleur||'',titulaire:x.titulaire||'',morale:!!x.morale,moi:Array.isArray(x.moi)?x.moi:[],contrib:Array.isArray(x.contrib)?x.contrib:[],sourdine:!!x.sourdine,supprime:x.supprime||''}));
  if(!COMPTES.some(c=>c.id==='especes'))COMPTES.unshift({...ESPECES});
  // compte supprimé (supprime = date) : masqué partout avec ses opérations, rétablissable DELAI_CORBEILLE jours
  TOUS=COMPTES;CORB=TOUS.filter(c=>c.supprime);COMPTES=TOUS.filter(c=>!c.supprime);
  CPT=Object.fromEntries(TOUS.map(c=>[c.id,c]));
}
/* comptes gérés pour des tiers (personne ou personne morale) : gardés à part de vos comptes ; leurs opérations ne comptent
   ni dans vos dépenses ni dans vos revenus. perso(e) = opération faite sur un de VOS comptes */
const estTiers=id=>(CPT[id]||{}).type==='tiers';
const MES=()=>COMPTES.filter(c=>c.type!=='tiers'),TIERS=()=>COMPTES.filter(c=>c.type==='tiers');
const perso=e=>!estTiers(e.compte);
const allP=()=>all.filter(perso);
let BIENS=[], BIEN={};
function setBiens(b){
  BIENS=(Array.isArray(b)?b:[]).map(x=>({id:x.id,nom:x.nom,type:x.type==='passif'?'passif':'actif',date_achat:x.date_achat||'',prix_achat:+x.prix_achat||0,poste:x.poste||'',mots:Array.isArray(x.mots)?x.mots:[],estimations:Array.isArray(x.estimations)?x.estimations:[],vehicule:!!x.vehicule,engin:x.engin||'voiture',vidange:x.vidange||null,maison:!!x.maison,projet:x.projet||null}));
  BIEN=Object.fromEntries(BIENS.map(b=>[b.id,b]));
}
/* Courant / exceptionnel : types de revenus (courants ou ponctuels) et événements (mariage, voyage…) ; une dépense ou un
   revenu rattaché à un événement, ou un revenu d'un type ponctuel, est EXCEPTIONNEL. Les soldes comptent tout. */
let REVENUS=[], REV={};
function setRevenus(r){
  const def=(window.AppYaMoteur&&window.AppYaMoteur.REVENUS_DEFAUT)||[];
  REVENUS=(Array.isArray(r)&&r.length?r:def).map(x=>({id:x.id,label:x.label,courant:!!x.courant,mots:Array.isArray(x.mots)?x.mots:[]}));
  if(!REVENUS.some(x=>x.id==='autre'))REVENUS.push({id:'autre',label:'Autre revenu',courant:false,mots:[]});
  REV=Object.fromEntries(REVENUS.map(x=>[x.id,x]));
}
setRevenus();
let EVTS=[], EVT={};
function setEvenements(l){
  EVTS=(Array.isArray(l)?l:[]).map(x=>({id:x.id,nom:x.nom,type:x.type||'autre',debut:x.debut||'',fin:x.fin||'',budget:+x.budget||0,mots:Array.isArray(x.mots)?x.mots:[],note:x.note||''}));
  EVT=Object.fromEntries(EVTS.map(x=>[x.id,x]));
}
/* Foyers (2026-11-27, demande de l'utilisateur) : un ou plusieurs foyers, chacun avec ses membres (épouse, enfants…).
   Une dépense porte « pour » = [foyer] (commune) ou [membres] (part égale de chacun) ; sans « pour », une dépense du poste
   Foyer va au commun du premier foyer, les autres sont pour soi (« Moi »). Le poste dit QUOI, « pour » dit POUR QUI. */
let FOYERS=[],FOYER={},MEMBRE={};
const ROLES={epouse:'Épouse',enfant:'Enfant',autre:'Autre membre'};
function setFoyers(l){FOYERS=(Array.isArray(l)?l:[]).map(f=>({id:f.id,nom:f.nom,membres:(Array.isArray(f.membres)?f.membres:[]).map(m=>({id:m.id,nom:m.nom,role:m.role||'autre',naissance:m.naissance||'',mots:Array.isArray(m.mots)?m.mots:[],foyer:f.id}))}));
  FOYER=Object.fromEntries(FOYERS.map(f=>[f.id,f]));MEMBRE=Object.fromEntries(FOYERS.flatMap(f=>f.membres).map(m=>[m.id,m]))}
const MEMBRES=()=>FOYERS.flatMap(f=>f.membres);
// pour qui : liste enregistrée, sinon la règle par défaut (poste Foyer → commun du premier foyer ; sinon [] = Moi)
function pourDe(e){if(e.nature!=='depense')return [];const p=(e.pour||[]).filter(x=>FOYER[x]||MEMBRE[x]);if(p.length)return p;
  return e.categorie==='foyer'&&FOYERS.length?[FOYERS[0].id]:[]}
const nomPour=id=>FOYER[id]?FOYER[id].nom+' (commun)':MEMBRE[id]?MEMBRE[id].nom:id;
const textePour=e=>{const p=pourDe(e);return p.length?p.map(nomPour).join(', '):'Moi'};
// membres cités dans une note (prénom ou mot-clé du membre) : « pharmacie adam » → Adam
function guessPour(lib){const L=normTxt(lib);return MEMBRES().filter(m=>[m.nom,...m.mots].some(k=>{const n=normTxt(k);return n&&hasWord(L,n)})).map(m=>m.id)}
let PROGS=[];
function setProgrammees(l){PROGS=(Array.isArray(l)?l:[]).map(x=>({...x,ignorees:Array.isArray(x.ignorees)?x.ignorees:[],actif:x.actif!==false,periode:+x.periode||1,jour:+x.jour||1,montant:+x.montant||0}))}
const PERIODES={1:'chaque mois',2:'tous les 2 mois',3:'chaque trimestre',6:'chaque semestre',12:'chaque année'};
const TYPES_EVT={mariage:'Mariage',bapteme:'Baptême',circoncision:'Circoncision',funerailles:'Funérailles',fete:'Fête','voyage-tourisme':'Voyage (tourisme)','voyage-mission':'Voyage (mission)','voyage-vacances':'Voyage (vacances)',sante:'Santé',projet:'Projet',autre:'Autre'};
/* Nature d'une opération : s = sens sur le compte (+1 entrée, −1 sortie, 0 virement) */
const VERSION_APP=DAFTAR_VERSION.nom+' '+DAFTAR_VERSION.numero;   // nom et numéro : app/version.js (seul endroit)
const NAT={depense:{l:'Dépense',s:-1},revenu:{l:'Revenu',s:1},virement:{l:'Virement',s:0},pret:{l:'Prêt accordé',s:-1},remboursement:{l:'Remboursement reçu',s:1},investissement:{l:'Investissement',s:-1}};
const TYPES_CPT={especes:'Espèces',courant:'Compte courant',epargne:'Épargne',carte:'Carte prépayée',mobile:'Mobile money',tiers:"Compte d'un tiers"};
const MOTS_REVENU=['salaire','salary','prime','revenu','interet','honoraire','indemnite','bourse','vacation','perdiem','per diem','prodes','frais de mission','consultance','jury','soutenance','seminaire','atelier'];

/* ================= outils ================= */
const sombre=()=>{const t=document.documentElement.getAttribute('data-theme');return t?t==='dark':!!(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)};
/* mode jour / nuit (2026-11-25) : par défaut celui du navigateur ; le bouton de l'en-tête bascule et le choix est retenu sur
   l'appareil (daftar-theme) ; rebasculer vers le mode du navigateur efface le choix (on suit de nouveau le navigateur) */
const themeNavigateur=()=>window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
function appliquerTheme(){const t=lsGet('daftar-theme');
  if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);else document.documentElement.removeAttribute('data-theme');majThemeBtn()}
function majThemeBtn(){const b=document.getElementById('themeBtn');if(!b)return;const s=sombre();b.setAttribute('aria-pressed',s);
  b.title=s?'Mode nuit (toucher pour le mode jour)':'Mode jour (toucher pour le mode nuit)';b.querySelector('use').setAttribute('href',s?'#i-lune':'#i-soleil')}
function basculerTheme(){const voulu=sombre()?'light':'dark';
  if(voulu===themeNavigateur()){try{localStorage.removeItem('daftar-theme')}catch(e){note('thème',e)}}else lsSet('daftar-theme',voulu);appliquerTheme()}
appliquerTheme();
/* Les couleurs de poste sont choisies sur fond clair ; en mode sombre on les éclaircit de 35 % vers le blanc. */
function eclaircir(h,f){const m=/^#([0-9a-f]{6})$/i.exec(h);if(!m)return h;const n=parseInt(m[1],16);return '#'+[16,8,0].map(s=>{const v=(n>>s)&255;return Math.round(v+(255-v)*f).toString(16).padStart(2,'0')}).join('')}
const color=id=>{const c=((CAT[id]||CAT.autre||{}).couleur)||'#9a968c';return sombre()?eclaircir(c,.35):c};
const normTxt=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
function wordPos(L,k){let i=L.indexOf(k);while(i>=0){if(i===0||!/[a-z0-9]/.test(L[i-1]))return i;i=L.indexOf(k,i+1)}return -1}
const hasWord=(L,k)=>wordPos(L,k)>=0;
/* Poste d'une dépense : 1) libellé associé exactement à un poste ; 2) sinon le premier poste dont un mot-clé apparaît en début de mot */
function guessCat(lib,list=CATS){
  const L=normTxt(lib);if(!L)return 'autre';
  for(const c of list)if(c.mots.some(m=>normTxt(m)===L))return c.id;
  for(const c of list){if(c.id==='autre')continue;if(c.mots.some(m=>{const k=normTxt(m);return k&&hasWord(L,k)}))return c.id}
  return 'autre';
}
const $=id=>document.getElementById(id);
const doux=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dmy=s=>s?`${s.slice(8)}/${s.slice(5,7)}/${s.slice(2,4)}`:'';
/* Devises d'affichage : taux = francs CFA pour 1 unité. Les données restent en francs CFA. */
const DEVISES_DEFAUT=[{code:'XAF',nom:'Franc CFA',symbole:'FCFA',taux:1},{code:'EUR',nom:'Euro',symbole:'€',taux:655,maj:'2026-11-12'},
  {code:'USD',nom:'Dollar américain',symbole:'$',taux:592.13,maj:'2026-11-12'},{code:'CNY',nom:'Yuan chinois',symbole:'¥',taux:88.67,maj:'2026-11-12'}];
let DEVISES=DEVISES_DEFAUT, DEV=DEVISES[0];
/* Formatage rapide : chaque toLocaleString(…, options) crée un nouveau formateur (≈ 80 µs pour un nombre, 190 µs pour une
   date, des centaines de fois par vue). On garde un formateur par jeu d'options ; résultat identique (même Intl). */
(()=>{const cache=new Map(),f=(K,o)=>{const k=K.name+JSON.stringify(o||{});let x=cache.get(k);if(!x){x=new K('fr-FR',o);cache.set(k,x)}return x};
  const nTL=Number.prototype.toLocaleString,dTL=Date.prototype.toLocaleDateString;
  Number.prototype.toLocaleString=function(loc,o){return loc==='fr-FR'?f(Intl.NumberFormat,o).format(this):nTL.call(this,loc,o)};
  Date.prototype.toLocaleDateString=function(loc,o){return loc==='fr-FR'&&o&&!isNaN(this)?f(Intl.DateTimeFormat,o).format(this):dTL.call(this,loc,o)}})();
const fmtC=n=>Math.round(n).toLocaleString('fr-FR');   // toujours en francs CFA (aides de saisie)
const fmt=n=>{const v=n/DEV.taux;if(DEV.taux===1)return fmtC(v);const d=Math.abs(v)<1000?2:0;return v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d})};
const U=()=>DEV.symbole;
const fmt1=n=>(Math.round(n*10)/10).toLocaleString('fr-FR',{maximumFractionDigits:1});
const part=x=>x>0&&x<.05?'< 0,1':fmt1(x);  // part en % : un petit solde n'affiche pas « 0 % »
const sgn=n=>(n>0?'+':n<0?'−':'')+fmt(Math.abs(n));
/* Montants du Patrimoine (patrimoine net, comptes, biens, prêts) : masqués à chaque ouverture et quand l'application
   passe en arrière-plan ; le bouton 👁 (visible dans la vue Patrimoine) les affiche. Les autres vues ne sont jamais
   masquées (demande du 2026-11-13) : fmtM ne masque que si la vue affichée est le Patrimoine. */
let masque=true;
const MASQUE='•••••',masquer=()=>masque&&view==='patrimoine';
const fmtM=n=>masquer()?MASQUE:fmt(n),sgnM=n=>masquer()?MASQUE:sgn(n),fmtAxeM=v=>masquer()?'':fmtAxe(v);
const pct=x=>(x>0?'+':x<0?'−':'')+fmt1(Math.abs(x*100))+' %';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MOIS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
/* Saisie des montants. Par défaut : le vrai montant en francs CFA (10000 = 10 000 FCFA).
   Option (Données et réglages › Saisie, propre à chaque appareil) : en milliers, 10 → 10 000 CFA,
   2,65 → 2 650 ; dans ce mode, un nombre de 10 000 ou plus reste un montant complet (25000 → 25 000). */
var navCle='',navRetour=false,navPret=false,menuReglages=false;   // menuReglages : Données et réglages montre son MENU (≡), pas une page   // bouton retour (voir « bouton retour ») ; var : lisibles dès le premier affichage
let saisieSeule=false;   // vrai quand Données et réglages a été ouvert par le bouton « Saisir »
let SAISIE_K=lsGet('daftar-saisie-milliers')==='1';
const num=s=>parseFloat(String(s).replace(',','.').replace(/[\s  ]/g,''));
/* un nombre écrit avec ses milliers séparés (« 5 000 ») est toujours un montant complet, même en saisie en milliers */
const groupeMilliers=s=>/\d[\s\u00a0\u202f]\d{3}(?!\d)/.test(String(s));
function cfa(s){const v=num(s);if(!isFinite(v)||v<=0)return NaN;return Math.round(SAISIE_K&&v<10000&&!groupeMilliers(s)?v*1000:v)}
/* soldes, prix, valeurs et budgets : même unité de saisie, zéro accepté (en milliers : toujours × 1000) */
function montantSaisi(s,signe){const v=num(String(s).replace('−','-'));if(!isFinite(v)||(v<0&&!signe))return NaN;return Math.round(SAISIE_K&&!groupeMilliers(s)?v*1000:v)}   // signe : solde noté, peut être négatif
/* montant enregistré → texte dans un champ de saisie, dans l'unité choisie */
const versSaisie=m=>SAISIE_K?(m/1000>=10000?String(Math.round(m)):String(Math.round(m)/1000).replace('.',',')):String(Math.round(m));
const exK=k=>SAISIE_K?String(k).replace('.',','):String(Math.round(k*1000));   // exemple d'un montant donné en milliers

/* ================= données ================= */
let OPS_CORB={};   // nombre d'opérations masquées par compte supprimé
let all=[], budgets={}, ready=false, DEBUT_SUIVI='';   // début du suivi quotidien : avant, seul le véhicule est noté
let now=new Date(), today=iso(now);   // remis à jour par nouveauJour() quand la page reste ouverte au-delà de minuit
let vueFin='mois',view='mois', cur={y:now.getFullYear(),m:now.getMonth()}, filtre='', query='', shown=80, editId=null;
async function reqServeur(method,url,body){
  let r;
  // téléphone : une liaison Tailscale endormie peut laisser la requête pendante sans fin ; au-delà du délai, on la tient pour hors ligne
  const ac=MODE_SYNC&&typeof AbortController!=='undefined'?new AbortController():null,minu=ac?setTimeout(()=>ac.abort(),LOC.donnees?20000:60000):0;
  try{r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:ac?ac.signal:undefined})}
  catch(e){clearTimeout(minu);const err=new Error(MODE_SYNC?"L'ordinateur n'est pas joignable (Tailscale, ordinateur allumé ?).":'Le serveur local ne répond pas. Vérifiez que le carnet est lancé (commande : appya).');err.horsLigne=true;throw err}
  let j=null;try{j=await r.json()}catch(e){/* réponse sans JSON : le code HTTP suffit au message */}
  clearTimeout(minu);
  if(!r.ok)throw new Error((j&&j.erreur)||('Erreur '+r.status));
  return j;
}
/* ================= téléphone : stockage local et synchronisation ================= */
/* Sur l'ordinateur (localhost), Daftar parle directement au serveur, comme avant. Ailleurs (téléphone, en https via
   Tailscale), les données vivent dans le téléphone (IndexedDB) : chaque saisie est enregistrée localement et placée
   dans une file d'attente, puis envoyée à l'ordinateur par /api/sync, qui renvoie tout ce qui a changé depuis la
   dernière révision reçue. Les réglages (postes, comptes, biens, parités) se modifient en direct sur l'ordinateur. */
/* Version autonome (lien web GitHub Pages, APK Android) : mode.js y met APPYA_AUTONOME = true. Les données vivent
   seulement dans l'appareil (IndexedDB), sans ordinateur ; moteur.js applique les règles du serveur. */
/* Démo (adresse « ?demo ») : version autonome avec trois ans de données simulées, rangées à part (base « appya-demo ») */
const MODE_DEMO=(()=>{try{return new URLSearchParams(location.search).has('demo')}catch(e){return false}})()&&!!window.indexedDB&&!!window.AppYaMoteur;
const MODE_AUTONOME=(window.APPYA_AUTONOME===true||MODE_DEMO)&&!!window.indexedDB&&!!window.AppYaMoteur;
const MODE_SYNC=!MODE_AUTONOME&&(()=>{let force=false;force=lsGet('appya-test-sync')==='1';
  return !!(window.isSecureContext&&window.indexedDB&&(force||!['localhost','127.0.0.1','[::1]'].includes(location.hostname)))})();
let IDB=null;
function ouvrirIDB(){return new Promise((res,rej)=>{const r=indexedDB.open(MODE_DEMO?'appya-demo':'appya',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function kvGet(k){IDB=IDB||await ouvrirIDB();return new Promise((res,rej)=>{const t=IDB.transaction('kv').objectStore('kv').get(k);t.onsuccess=()=>res(t.result);t.onerror=()=>rej(t.error)})}
async function kvSet(k,v){IDB=IDB||await ouvrirIDB();return new Promise((res,rej)=>{const tx=IDB.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
const LOC={donnees:null,file:[],rev:0,dernier:'',etat:'',msg:'',lu:false,demoV:0,occupe:false,manuel:false};
async function locCharger(){if(LOC.lu)return;const e=await kvGet('etat');if(e)Object.assign(LOC,{donnees:e.donnees||null,file:e.file||[],rev:e.rev||0,dernier:e.dernier||'',demoV:e.demoV||0});LOC.lu=true}
async function locSauver(){await kvSet('etat',{donnees:LOC.donnees,file:LOC.file,rev:LOC.rev,dernier:LOC.dernier,demoV:LOC.demoV})}
const maintenant=()=>new Date().toISOString();
const nouvelIdOp=()=>'t'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function verifLocale(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||''))throw new Error('Date invalide.');if(!(+d.montant>0))throw new Error('Le montant doit être positif.');if(!String(d.libelle||'').trim())throw new Error('Le libellé est obligatoire.')}
function appliquerReleve(prm,ch){(prm.comptes||[]).forEach(c=>{if(c.id!==ch.compte)return;
  c.releves=(c.releves||[]).filter(r=>r.date!==ch.date).concat(ch.solde==null?[]:[{date:ch.date,solde:ch.solde,...(ch.heure?{heure:ch.heure}:{})}]).sort((a,b)=>a.date<b.date?-1:1)})}
/* après une synchronisation, les données reçues de l'ordinateur remplacent les réglages du téléphone : on y rejoue,
   dans l'ordre, ce qui est encore en attente d'envoi (soldes notés, réglages faits hors ligne) */
function reappliquerEnAttente(){const M=window.AppYaMoteur;
  for(const c of LOC.file){if(c.type==='releve')appliquerReleve(LOC.donnees.parametres,c);
    else if(c.type==='params'&&M){try{   // avec base : fusion avec ce que l'ordinateur a changé entre-temps (sinon remplacement)
      const corps=c.base&&M.fusionnerReglages?M.fusionnerReglages(LOC.donnees.parametres,c.base,c.corps).corps:JSON.parse(JSON.stringify(c.corps));
      M.regler(LOC.donnees,corps)}catch(e){c.erreur='Réglage non appliqué sur ce téléphone : '+e.message;note('réglage en attente',e)}}}
  delete LOC.donnees.historique}
async function releveLocal(compte,date,solde,heure){await locPret();
  const ch={type:'releve',id:nouvelIdOp(),maj:maintenant(),compte,date,solde,...(heure?{heure}:{}),doc:{libelle:`solde de ${nomCpt(compte)} au ${dmy(date)}`}};
  LOC.file=LOC.file.filter(x=>!(x.type==='releve'&&x.compte===compte&&x.date===date)).concat([ch]);   // le dernier solde noté à cette date remplace le précédent
  appliquerReleve(LOC.donnees.parametres,ch);await locSauver();syncBientot()}
function enFile(ch){LOC.file=LOC.file.filter(x=>x.id!==ch.id).concat([ch])}   // le dernier changement d'une ligne remplace le précédent
async function locPret(){
  await locCharger();
  if(!LOC.donnees){await synchroniser();
    if(!LOC.donnees)throw new Error("Première ouverture : reliez le téléphone à l'ordinateur (Tailscale actif, ordinateur allumé) pour charger vos données une première fois.")}
}
function chargerScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Module introuvable : '+src));document.head.appendChild(s)})}
async function donneesDemo(){if(!window.AppYaDemo)await chargerScript('demo.js');LOC.demoV=window.AppYaDemo.version||1;return window.AppYaDemo.generer(today)}
/* démo enregistrée par une version précédente des données simulées : elle est recréée */
async function demoAJour(){if(!MODE_DEMO||!LOC.donnees)return;if(!window.AppYaDemo)await chargerScript('demo.js');if(LOC.demoV!==(window.AppYaDemo.version||1))LOC.donnees=null}
async function reqAutonome(method,url,body){
  const p=url.split('?')[0],M=window.AppYaMoteur;
  await locCharger();
  await demoAJour();
  if(!LOC.donnees){LOC.donnees=MODE_DEMO?await donneesDemo():M.vide();await locSauver()}
  if(M.purgerCorbeille(LOC.donnees))await locSauver();   // comptes supprimés depuis plus de 30 jours
  const d=LOC.donnees,ops=d.operations;
  if(method==='GET'&&p==='/api/info')return MODE_DEMO?{version:'',fichier:'données de démonstration (simulées)',sauvegardes:'aucune',app:'appya'}:{version:'',fichier:'dans cet appareil (rien ne quitte le téléphone)',sauvegardes:'Données et réglages › Sauvegarde',app:'appya'};
  if(method==='GET'&&p==='/api/donnees')return JSON.parse(JSON.stringify(d));
  // chaque écriture travaille sur une copie : une erreur de validation ne laisse rien à moitié fait
  const essai=JSON.parse(JSON.stringify(d));let res;
  const m=p.match(/^\/api\/operations\/([\w-]+)$/);
  if(p==='/api/operations'&&method==='POST'){const docs=Array.isArray(body)?body:[body];
    const nouv=docs.map(doc=>({id:nouvelIdOp(),...M.nettoyer(doc,essai)}));nouv.forEach(o=>M.marquer(essai,o));essai.operations.push(...nouv);
    res=Array.isArray(body)?nouv:nouv[0]}
  else if(m&&method==='PUT'){const i=essai.operations.findIndex(o=>o.id===m[1]);if(i<0)throw new Error('Ligne introuvable (déjà supprimée ?).');
    res=essai.operations[i]=M.marquer(essai,{id:m[1],...M.nettoyer(body,essai)})}
  else if(m&&method==='DELETE'){const i=essai.operations.findIndex(o=>o.id===m[1]);if(i<0)throw new Error('Ligne introuvable (déjà supprimée ?).');
    essai.operations.splice(i,1);essai.supprimees=(essai.supprimees||[]).filter(t=>t.id!==m[1]).concat([M.marquer(essai,{id:m[1]})]);res={supprime:m[1]}}
  else if(p==='/api/parametres'&&method==='PUT')res=M.regler(essai,body||{});
  else if(p==='/api/reclasser'&&method==='POST')res=M.reclasser(essai,body||{});
  else throw new Error('Action indisponible dans la version autonome.');
  LOC.donnees=essai;await locSauver();return JSON.parse(JSON.stringify(res));
}
async function reqLocale(method,url,body){
  if(MODE_AUTONOME)return reqAutonome(method,url,body);
  const p=url.split('?')[0];
  if(method==='GET'&&p==='/api/info'){try{return await reqServeur(method,url)}catch(e){return {version:'',fichier:"dans le téléphone, synchronisé avec l'ordinateur",sauvegardes:"sur l'ordinateur",app:'appya'}}}
  await locPret();
  const ops=LOC.donnees.operations;
  if(method==='GET'&&p==='/api/donnees')return JSON.parse(JSON.stringify(LOC.donnees));
  if(p==='/api/operations'&&method==='POST'){const docs=Array.isArray(body)?body:[body];docs.forEach(verifLocale);
    const out=docs.map(x=>{const o={...x,id:nouvelIdOp(),maj:maintenant(),cree:x.cree||new Date().toISOString().slice(0,19)+'Z'};ops.push(o);enFile({type:'set',id:o.id,maj:o.maj,doc:o});return o});
    await locSauver();syncBientot();return Array.isArray(body)?out:out[0]}
  const m=p.match(/^\/api\/operations\/([\w-]+)$/);
  if(m&&method==='PUT'){verifLocale(body);const i=ops.findIndex(o=>o.id===m[1]);if(i<0)throw new Error('Ligne introuvable.');
    const o={...body,id:m[1],maj:maintenant()};ops[i]=o;enFile({type:'set',id:o.id,maj:o.maj,doc:o});await locSauver();syncBientot();return o}
  if(m&&method==='DELETE'){const i=ops.findIndex(o=>o.id===m[1]);if(i<0)throw new Error('Ligne introuvable.');
    ops.splice(i,1);enFile({type:'del',id:m[1],maj:maintenant()});await locSauver();syncBientot();return {supprime:m[1]}}
  /* réglages et reclassements : faits dans le téléphone (même hors ligne), mis en file d'attente comme les saisies et
     appliqués par l'ordinateur à la synchronisation. Seul le retour en arrière (historique de l'ordinateur) demande la liaison. */
  const M=window.AppYaMoteur;
  if(p==='/api/parametres'&&method==='PUT'&&M&&body&&body.restaurer==null){
    /* base = sections touchées telles que le téléphone les voyait : l'ordinateur n'appliquera que ce qui a changé
       (fusion élément par élément), sans effacer ce qui a été réglé sur l'ordinateur entre-temps */
    const prm=LOC.donnees.parametres||{},base={};
    for(const k of ['postes','budgets','revenus','evenements','programmees','comptes','biens','devises'])if(k in body&&k in prm)base[k]=JSON.parse(JSON.stringify(prm[k]));
    const essai=JSON.parse(JSON.stringify(LOC.donnees)),res=M.regler(essai,JSON.parse(JSON.stringify(body)));delete essai.historique;
    LOC.donnees=essai;LOC.file=LOC.file.concat([{type:'params',id:nouvelIdOp(),maj:maintenant(),corps:body,base,doc:{libelle:'réglages : '+Object.keys(body).join(', ')}}]);
    await locSauver();syncBientot();return JSON.parse(JSON.stringify(res))}
  if(p==='/api/reclasser'&&method==='POST'&&M){
    const avant=new Map(ops.map(o=>[o.id,o.categorie])),res=M.reclasser(LOC.donnees,body||{});
    for(const o of LOC.donnees.operations)if(avant.get(o.id)!==o.categorie){o.maj=maintenant();enFile({type:'set',id:o.id,maj:o.maj,doc:o})}
    await locSauver();syncBientot();return res}
  try{const r=await reqServeur(method,url,body);await synchroniser();return r}
  catch(e){throw new Error(e.horsLigne?"Ce réglage se fait quand le téléphone est relié à l'ordinateur (Tailscale actif, ordinateur allumé). Les saisies, elles, marchent hors ligne.":e.message)}
}
async function req(method,url,body){return MODE_SYNC||MODE_AUTONOME?reqLocale(method,url,body):reqServeur(method,url,body)}
let syncEnCours=null,syncT=null,syncEncore=false;
function syncBientot(){clearTimeout(syncT);syncT=setTimeout(()=>synchroniser(),2500);majSync()}
/* une demande arrivée pendant un échange en cours déclenche un second passage juste après : rien de ce qui a été
   saisi entre-temps n'attend la synchronisation suivante */
function synchroniser(){
  if(!MODE_SYNC)return Promise.resolve();
  if(syncEnCours){syncEncore=true;return syncEnCours}
  LOC.occupe=true;
  syncEnCours=(async()=>{do{syncEncore=false;await unPassage()}while(syncEncore&&LOC.etat==='ok')})().finally(()=>{syncEnCours=null;LOC.occupe=false;LOC.manuel=false;majSync()});
  return syncEnCours;
}
async function unPassage(){
    majSync();
    try{
      await locCharger();
      const envoi=LOC.file.map(({erreur,...c})=>c),cle=c=>c.id+'|'+c.maj,envoyes=new Set(envoi.map(cle));
      const r=await reqServeur('POST','/api/sync',{depuis:LOC.donnees?LOC.rev:0,horloge:maintenant(),changements:envoi});
      const rejets=new Map((r.rejets||[]).map(x=>[x.id,x.erreur]));
      // retirer de la file ce qui est arrivé ; garder (avec le motif) ce qui a été refusé, et ce qui a été saisi pendant l'échange
      LOC.file=LOC.file.filter(c=>!envoyes.has(cle(c))||rejets.has(c.id)).map(c=>envoyes.has(cle(c))&&rejets.has(c.id)?{...c,erreur:rejets.get(c.id)}:c);
      if(!LOC.donnees)LOC.donnees={version:r.version,parametres:r.parametres,operations:[]};
      const attente=new Set(LOC.file.map(c=>c.id)),ops=LOC.donnees.operations,idx=new Map(ops.map((o,i)=>[o.id,i]));
      for(const o of r.operations||[]){if(attente.has(o.id))continue;const i=idx.get(o.id);if(i===undefined){idx.set(o.id,ops.length);ops.push(o)}else ops[i]=o}
      const sup=new Set((r.supprimees||[]).filter(t=>!attente.has(t.id)).map(t=>t.id));
      if(sup.size)LOC.donnees.operations=ops.filter(o=>!sup.has(o.id));
      Object.assign(LOC.donnees,{parametres:r.parametres,version:r.version});
      reappliquerEnAttente();   // soldes et réglages notés sur le téléphone, pas encore reçus par l'ordinateur
      LOC.rev=r.rev;LOC.dernier=maintenant();LOC.etat='ok';LOC.msg='';
      await locSauver();
      if((r.conflits||[]).length)status(`Synchronisation : ${r.conflits.length} conflit${r.conflits.length>1?'s':''} réglé${r.conflits.length>1?'s':''} — `+r.conflits.map(c=>`« ${c.libelle||c.id} » ${c.motif}`).join(' ; ')+'.');
      if(ready)await charger(true);
    }catch(e){LOC.etat=e.horsLigne?'horsligne':'erreur';LOC.msg=e.message}
    majSync();
}
function majSync(){
  if(!MODE_SYNC)return;const b=$('syncBtn');b.hidden=false;
  const n=LOC.file.length,refus=LOC.file.filter(c=>c.erreur).length,h=LOC.dernier?new Date(LOC.dernier).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'';
  let t,cls='';
  // « Synchronisation… » seulement s'il y a quelque chose à envoyer, si on a touché le bouton ou au tout premier échange ;
  // les vérifications automatiques (ouverture, toutes les 2 min) gardent l'état connu (« ✓ À jour »)
  if(LOC.occupe&&(n||LOC.manuel||!LOC.dernier))t='⟳ Synchronisation…';
  else if(refus){t=`⚠ ${refus} ligne${refus>1?'s':''} refusée${refus>1?'s':''}`;cls='err'}
  else if(LOC.etat==='horsligne'||LOC.etat==='erreur'){t=`Hors ligne${n?` · ${n} en attente`:''}`;cls='off'}
  else if(n)t=`⟳ ${n} en attente`;
  else t=`✓ À jour${h?' · '+h:''}`;
  // sur téléphone, le détail après « · » (heure, nombre en attente) se cache pour tenir sur la ligne du logo
  const i=t.indexOf(' · ');b.innerHTML=i<0?esc(t):`${esc(t.slice(0,i))}<span class="syncdet">${esc(t.slice(i))}</span>`;b.className='btn ghost syncpill '+cls;
  b.title=(LOC.dernier?`Dernière synchronisation : ${new Date(LOC.dernier).toLocaleString('fr-FR')}. `:'')+'Toucher pour synchroniser maintenant.';
}
$('syncBtn').onclick=async()=>{
  LOC.manuel=true;majSync();await synchroniser();const refus=LOC.file.filter(c=>c.erreur);
  if(refus.length)status("Lignes refusées par l'ordinateur : "+refus.map(c=>`« ${(c.doc&&c.doc.libelle)||c.id} » : ${c.erreur}`).join(' ; ')+'. Modifiez-les ou supprimez-les, puis synchronisez.',true);
  else if(LOC.etat==='horsligne')status("Pas de liaison avec l'ordinateur : vérifiez que Tailscale est actif sur le téléphone et que l'ordinateur est allumé. Vos saisies restent en attente dans le téléphone.",true);
  else status('');
};

const norm=x=>{const n=NAT[x.nature]?x.nature:'depense';return {id:x.id,date:String(x.date||''),montant:+x.montant||0,libelle:String(x.libelle||''),nature:n,
  compte:x.compte||'especes',vers:x.vers||'',personne:String(x.personne||''),echeance:x.echeance||'',bien:x.bien||'',
  categorie:n==='depense'?(CAT[x.categorie]?x.categorie:'autre'):'',remarque:String(x.remarque||''),cree:String(x.cree||''),
  tiers:x.tiers||'',vehicule:x.vehicule||'',cat_vehicule:x.cat_vehicule||'',cat_maison:x.cat_maison||'',km:+x.km||0,quantite:+x.quantite||0,unite:x.unite||'',
  cat_revenu:n==='revenu'?String(x.cat_revenu||''):'',pour:n==='depense'&&Array.isArray(x.pour)?x.pour.slice():[],ponctuel:n==='revenu'?+x.ponctuel||0:0,cat_ponctuel:n==='revenu'&&x.ponctuel?String(x.cat_ponctuel||'autre'):'',evenement:(n==='depense'||n==='revenu')?String(x.evenement||''):'',prog:x.prog||'',prog_date:x.prog_date||''}};
const api={
  async add(doc){const x=await req('POST','/api/operations',doc);all.push(norm(x));return x},
  async addMany(docs){const xs=await req('POST','/api/operations',docs);xs.forEach(x=>all.push(norm(x)));return xs},
  async put(id,doc){const x=await req('PUT','/api/operations/'+encodeURIComponent(id),doc);all=all.map(e=>e.id===id?norm(x):e);return x},
  async del(id){await req('DELETE','/api/operations/'+encodeURIComponent(id));all=all.filter(e=>e.id!==id)},
  async params(body){const r=await req('PUT','/api/parametres',body);if(!MODE_SYNC)annulable('Réglages enregistrés.',annulerDernierReglage);return r},
  async reclasser(changements){return req('POST','/api/reclasser',{changements})},
  /* noter (ou retirer, solde null) le solde d'un compte à une date. Téléphone synchronisé : file d'attente, comme
     une saisie, donc possible hors ligne ; ailleurs : réglage direct (liste des comptes). */
  async releve(compte,date,solde){
    // solde noté pour aujourd'hui : on retient l'heure, pour que les opérations du jour saisies ensuite comptent après lui
    const heure=date===today&&solde!==null?new Date().toISOString().slice(0,19)+'Z':'';
    if(MODE_SYNC)return releveLocal(compte,date,solde,heure);
    return this.params({comptes:TOUS.map(c=>c.id!==compte?c:{...c,releves:c.releves.filter(r=>r.date!==date).concat(solde===null?[]:[{date,solde,...(heure?{heure}:{})}])})})}
};
function status(msg,err){const s=$('status');s.hidden=!msg;s.setAttribute('role',err?'alert':'status');if(msg){s.textContent=msg;s.className='note'+(err?' err':'')}}
/* Panneaux de Données et réglages (postes, comptes, événements, programmées, libellés) : préparés tout de suite si on les
   regarde, sinon juste après l'affichage de la vue, pour que les chiffres apparaissent d'abord */
let panT=0;
function panneauxReglages(){clearTimeout(panT);const go=()=>{if(!dirty)openPostes();if(!cbDirty)openCB();if(!evtDirty)openEvt();if(!progDirty)openProg();if(!foyDirty)openFoyers();renderLibs()};
  if(view==='donnees')go();else requestAnimationFrame(()=>{panT=setTimeout(go,0)})}
let REV_VU=null;   // ordinateur : révision des données déjà affichée (rien à redessiner si elle n'a pas changé)
async function charger(silencieux){
  try{
    const d=await req('GET','/api/donnees');
    if(silencieux&&ready&&!MODE_SYNC&&!MODE_AUTONOME&&d.rev!=null&&d.rev===REV_VU)return;
    REV_VU=d.rev;
    const p=d.parametres||{};
    setPostes(p.postes);setComptes(p.comptes);setBiens(p.biens);setRevenus(p.revenus);setEvenements(p.evenements);setProgrammees(p.programmees);setFoyers(p.foyers);setDevises(p.devises);DEBUT_SUIVI=p.debut_suivi||'';
    const enCorb=new Set(CORB.map(c=>c.id));OPS_CORB={};
    all=(d.operations||[]).map(norm).filter(e=>{if(!e.date)return false;const k=enCorb.has(e.compte)?e.compte:enCorb.has(e.vers)?e.vers:'';if(k){OPS_CORB[k]=(OPS_CORB[k]||0)+1;return false}return true});HIST=Array.isArray(d.historique)?d.historique:null;if(!$('savBox').hidden)renderHistorique();
    budgets=p.budgets||{};
    if(!ready){ready=true;
      // au premier chargement, se placer sur le dernier mois saisi si le mois courant est vide
      if(!monthItems(cur.y,cur.m).length&&all.length){const last=all.map(e=>e.date).filter(d=>d<=today).sort().pop()||all[0].date;cur={y:+last.slice(0,4),m:+last.slice(5,7)-1}}}
    status('');if(editId&&!all.some(e=>e.id===editId))resetForm();
    fillSelects();render();panneauxReglages();
  }catch(e){if(!silencieux)status(e.message,true);if(!ready)$('list').innerHTML='<div class="empty">Impossible de lire les données.</div>'}
}

/* ================= calculs ================= */
const sorted=a=>[...a].sort((x,y)=>x.date<y.date?-1:x.date>y.date?1:(x.cree<y.cree?-1:1));
function monthItems(y,m){const p=`${y}-${pad(m+1)}`;return all.filter(e=>perso(e)&&e.date.startsWith(p))}
function yearItems(y){return all.filter(e=>perso(e)&&e.date.startsWith(y+'-'))}
const sum=a=>a.reduce((s,e)=>s+e.montant,0);
/* type de revenu (enregistré, sinon deviné du libellé) ; exceptionnel = rattaché à un événement, ou revenu ponctuel */
function guessCatR(lib){return guessCat(lib,REVENUS)}
const catRev=e=>REV[e.cat_revenu]?e.cat_revenu:guessCatR(e.libelle);
const estExc=e=>(e.nature==='depense'||e.nature==='revenu')&&(!!e.evenement||(e.nature==='revenu'&&!(REV[catRev(e)]||{}).courant));
/* « dont ponctuel » : part exceptionnelle d'un revenu courant reçu en un seul virement (rappel, bonus versé avec le
   salaire). L'opération garde le montant du virement (solde, relevé) ; seuls les calculs courant / exceptionnel la
   partagent. Sans effet sur un revenu déjà exceptionnel (type ponctuel ou événement). */
const partPonct=e=>e.nature==='revenu'&&e.ponctuel>0&&!estExc(e)?Math.min(e.ponctuel,e.montant):0;
const revCour=e=>e.nature==='revenu'&&!estExc(e)?e.montant-partPonct(e):0;   // part courante d'un revenu
const revExc=e=>e.nature!=='revenu'?0:estExc(e)?e.montant:partPonct(e);     // part exceptionnelle d'un revenu
const sumF=(a,f)=>a.reduce((s,e)=>s+f(e),0);
function guessEvt(lib){const L=normTxt(lib);const ev=EVTS.find(x=>x.mots.some(m=>{const k=normTxt(m);return k&&hasWord(L,k)}));return ev?ev.id:''}
const deps=a=>a.filter(e=>e.nature==='depense'&&!e.evenement&&perso(e));      // dépenses COURANTES (statistiques, postes, couleurs des jours)
const depsExc=a=>a.filter(e=>e.nature==='depense'&&e.evenement&&perso(e));    // dépenses exceptionnelles (rattachées à un événement)
const ofNat=(a,...n)=>sum(a.filter(e=>n.includes(e.nature)));
function byCat(items){const r={};deps(items).forEach(e=>r[e.categorie]=(r[e.categorie]||0)+e.montant);return r}
/* Flux d'une période : entrées (revenus + remboursements) − sorties (dépenses + investissements + prêts) ; les virements sont neutres */
/* ent = entrées courantes (revenus courants + remboursements), entX = revenus exceptionnels ; dep = dépenses courantes,
   exc = dépenses exceptionnelles ; net compte TOUT (aucune opération n'échappe au solde) */
function flux(items){items=items.filter(perso);const ent=sumF(items,revCour)+ofNat(items,'remboursement'),entX=sumF(items,revExc),
  dep=sum(deps(items)),exc=sum(depsExc(items)),inv=ofNat(items,'investissement'),pre=ofNat(items,'pret');return {ent,entX,dep,exc,inv,pre,net:ent+entX-dep-exc-inv-pre}}
/* Effet d'une opération sur le solde d'un compte */
function effet(e,cid){if(e.nature==='depense'&&e.tiers===cid&&e.compte!==cid)return e.montant;   // votre part versée au compte d'un tiers
  if(e.nature==='virement')return (e.vers===cid?e.montant:0)-(e.compte===cid?e.montant:0);return e.compte===cid?NAT[e.nature].s*e.montant:0}
/* Solde d'un compte = dernier relevé noté + opérations datées APRÈS ce relevé (un relevé inclut les opérations de son jour).
   Chaque relevé est comparé au précédent + opérations intermédiaires : l'écart révèle une opération oubliée. */
/* une opération compte après un solde noté si elle est datée d'un jour suivant, ou du même jour mais saisie après
   l'heure où le solde a été noté (soldes notés « aujourd'hui ») ; sans heure, le solde inclut toutes les opérations de son jour */
const apresReleve=(e,r)=>!r||e.date>r.date||(e.date===r.date&&!!r.heure&&String(e.cree||'')>r.heure);
function etatCompte(c){
  const rel=[...c.releves].sort((a,b)=>a.date<b.date?-1:1);
  const hist=rel.map((r,i)=>{if(!i)return {...r,attendu:null,ecart:0};const p=rel[i-1];const att=p.solde+all.filter(e=>apresReleve(e,p)&&!apresReleve(e,r)).reduce((s,e)=>s+effet(e,c.id),0);return {...r,attendu:att,ecart:r.solde-att}});
  const last=rel[rel.length-1];const d0=last?last.date:'';
  const apres=all.filter(e=>apresReleve(e,last)&&effet(e,c.id)!==0);
  return {solde:(last?last.solde:0)+apres.reduce((s,e)=>s+effet(e,c.id),0),last,n:apres.length,hist,ecarts:hist.filter(h=>h.ecart)};
}
/* Créances : un compte par personne, ouvert par un prêt, réduit par les remboursements jusqu'à zéro */
function creances(){
  const g=new Map();
  for(const e of sorted(all)){
    if(e.nature!=='pret'&&e.nature!=='remboursement')continue;const k=normTxt(e.personne);if(!k)continue;
    let x=g.get(k);if(!x){x={key:k,nom:e.personne,prete:0,rembourse:0,premier:e.date,dernier:e.date,echeance:''};g.set(k,x)}
    if(e.nature==='pret'){x.prete+=e.montant;if(e.echeance&&(!x.echeance||e.echeance<x.echeance))x.echeance=e.echeance}else x.rembourse+=e.montant;
    x.dernier=e.date;
  }
  return [...g.values()].map(x=>({...x,reste:x.prete-x.rembourse,retard:x.prete>x.rembourse&&x.echeance&&x.echeance<today})).sort((a,b)=>(b.reste>0)-(a.reste>0)||b.reste-a.reste);
}
function personneConnue(nom){const k=normTxt(nom);if(!k)return nom;const cs=creances();const ex=cs.find(c=>c.key===k);if(ex)return ex.nom;
  const m=cs.filter(c=>c.key.startsWith(k+' ')||k.startsWith(c.key+' '));return m.length===1?m[0].nom:nom}
/* Bien : coût de revient = prix d'achat + investissements ; la valeur actuelle (estimée à la main) donne la plus- ou moins-value
   et un taux annuel moyen depuis l'achat : (valeur / coût)^(1/années) − 1 */
function etatBien(b){
  const inv=all.filter(e=>e.nature==='investissement'&&e.bien===b.id),I=sum(inv);
  const usage=b.poste?all.filter(e=>e.nature==='depense'&&e.categorie===b.poste&&(!b.date_achat||e.date>=b.date_achat)):[];
  const cout=b.prix_achat+I;const est=[...b.estimations].sort((x,y)=>x.date<y.date?-1:1).pop()||null;
  let V=null,pv=null,taux=null,ans=null;
  if(est){V=est.valeur;pv=V-cout;if(b.date_achat&&cout>0&&V>0){ans=(new Date(est.date)-new Date(b.date_achat))/(365.25*864e5);if(ans>=.25)taux=Math.pow(V/cout,1/ans)-1}}
  return {nInv:inv.length,I,U:sum(usage),nU:usage.length,cout,est,V,pv,taux,ans,valeur:V!==null?V:cout};
}
function patrimoine(){
  const liq=MES().reduce((s,c)=>s+etatCompte(c).solde,0);
  const biens=BIENS.reduce((s,b)=>s+etatBien(b).valeur,0);
  // compte d'un tiers à découvert : vous avez avancé l'argent, il vous le doit (sauf avance « en sourdine » : gardée dans
  // le compte, pas comptée) ; un solde positif lui appartient (non compté)
  const av=TIERS().filter(c=>!c.sourdine).map(c=>Math.max(0,-etatCompte(c).solde)).filter(v=>v>0);
  const cre=creances().reduce((s,c)=>s+Math.max(0,c.reste),0)+av.reduce((a,v)=>a+v,0);
  return {liq,biens,cre,nTiers:av.length,net:liq+biens+cre};
}

/* ================= reconnaissance d'une note ================= */
function comptesCites(L){
  const r=[];for(const c of COMPTES){let best=-1;for(const k of [...c.mots,c.nom].map(normTxt).filter(Boolean)){const i=wordPos(L,k);if(i>=0&&(best<0||i<best))best=i}if(best>=0)r.push({id:c.id,pos:best})}
  return r.sort((a,b)=>a.pos-b.pos).map(x=>x.id);
}
const defCourant=()=>(COMPTES.find(c=>c.type==='courant')||COMPTES[0]).id;
const defEpargne=()=>(COMPTES.find(c=>c.type==='epargne')||{}).id||'';
/* intérêts sans compte cité : le compte épargne qui les produit, c'est-à-dire celui qui porte un taux (s'il y en a
   plusieurs, celui dont le solde est le plus élevé : il produit le plus d'intérêts) ; à défaut, le premier compte épargne */
function compteInterets(){const l=MES().filter(c=>c.type==='epargne'&&+c.taux>0);
  if(l.length>1)return l.map(c=>[c.id,etatCompte(c).solde]).sort((a,b)=>b[1]-a[1])[0][0];return l.length?l[0].id:defEpargne()}
const MOTS_VIDES=new Set(['a','au','aux','de','du','des','la','le','par','pour','en','et','pret','prete','prets','avance','remb','rembourse','remboursement','remboursements','dette']);
function extrairePersonne(lib){
  const cpt=new Set(COMPTES.flatMap(c=>[...c.mots,c.nom]).map(normTxt));
  const t=String(lib).split(/\s+/).filter(w=>{const n=normTxt(w);return n&&!MOTS_VIDES.has(n)&&!n.startsWith('remb')&&!cpt.has(n)&&!/^[\d.,]+$/.test(n)});
  return personneConnue(t.join(' ').trim());
}
/* Nature, comptes, poste, bien et personne devinés à partir du seul libellé (aucun signe dans les notes) */
function guessOp(lib){
  const L=normTxt(lib),cites=comptesCites(L),dc=defCourant(),de=defEpargne();
  const r={nature:'depense',compte:cites[0]||'especes',vers:'',personne:'',bien:'',categorie:''};
  const fleche=/(>|→|\bvers\b)/.test(L);
  if(hasWord(L,'retrait')){r.nature='virement';r.compte=cites.find(x=>x!=='especes')||dc;r.vers='especes'}
  // intérêts (« intérêts épargne ») : un revenu sur le compte cité, pas un virement vers l'épargne
  else if(hasWord(L,'interet')){r.nature='revenu';r.compte=cites[0]||compteInterets()||dc}
  else if(hasWord(L,'epargne')&&de){r.nature='virement';r.compte=cites[0]||dc;r.vers=cites[1]||(cites[0]===de?'':de);if(!r.vers||r.vers===r.compte){r.vers=de;r.compte=r.compte===de?dc:r.compte}}
  else if((fleche||hasWord(L,'transfert')||hasWord(L,'virement'))&&cites.length>=2){r.nature='virement';r.compte=cites[0];r.vers=cites[1]}
  else if(hasWord(L,'remb')){r.nature='remboursement';r.personne=extrairePersonne(lib)}
  else if(hasWord(L,'pret')||hasWord(L,'avance')){r.nature='pret';r.personne=extrairePersonne(lib)}
  else if(MOTS_REVENU.some(k=>hasWord(L,k))||(hasWord(L,'virement')&&hasWord(L,'recu'))){r.nature='revenu';r.compte=cites[0]||dc}
  // mot-clé d'un bien → investissement, sauf un bien qui n'est pas un engin quand la note parle d'un engin (« réparation pompe
  // boîte » : la pompe du terrain ne l'emporte pas sur la boîte de la voiture)
  else{const b=BIENS.find(b=>b.mots.some(m=>{const k=normTxt(m);return k&&hasWord(L,k)}));if(b&&(b.vehicule||!(VEHS().length&&motVehFort(L)))){r.nature='investissement';r.bien=b.id}}
  if(r.nature==='depense')r.categorie=guessCat(lib);
  // véhicule : dépense du poste du véhicule, ou investissement dans un bien véhicule.
  // Quelques mots désignent sans ambiguïté la voiture et passent avant l'ordre des postes (« vidange huile » ≠ huile du Foyer)
  let v=enginDe(lib,r.nature==='depense'?r.categorie:'',r.nature==='investissement'?r.bien:'');
  // mot fort (carburant, vidange, pièce…) ou engin cité par son nom : le poste de l'engin passe avant l'ordre des postes
  const fort=motVehFort(L);
  // mot fort sans engin cité : l'engin d'un poste dédié (l'engin affiché d'abord), pas celui qui partage par hasard le poste
  // trouvé (« vidange huile » rangé au Foyer par « huile » n'est pas une vidange du groupe électrogène)
  if(r.nature==='depense'&&fort&&!enginCite(lib)){const d=[VEH(),...VEHS()].find(x=>x&&posteDedie(x.poste));if(d)v=d}
  const nom=!!v&&enginCiteNom(lib)===v;
  if(v&&v.poste&&r.nature==='depense'&&(fort||nom))r.categorie=v.poste;
  // poste partagé (posteDedie) : engin seulement s'il est cité par son nom ou qu'un mot fort est écrit
  if(v&&((r.nature==='depense'&&r.categorie===v.poste&&(posteDedie(v.poste)||fort||nom))||(r.nature==='investissement'&&BIEN[r.bien]&&BIEN[r.bien].vehicule))){
    r.vehicule=r.nature==='investissement'?r.bien:v.id;const c=guessCatV(lib);r.cat_vehicule=r.nature==='investissement'?(c==='achat'?'achat':'investissement'):c}
  if(r.nature==='investissement'&&BIEN[r.bien]&&BIEN[r.bien].maison)r.cat_maison=guessCatM(lib);
  if(r.nature==='revenu')r.cat_revenu=guessCatR(lib);
  if(r.nature==='depense'||r.nature==='revenu')r.evenement=guessEvt(lib);
  if(r.nature==='depense'){const p=guessPour(lib);if(p.length)r.pour=p}
  // votre part versée au compte d'un tiers (« contribution maison ») : reste votre dépense, et alimente ce compte
  if(r.nature==='depense'){const t=TIERS().find(c=>c.contrib.some(m=>{const k=normTxt(m);return k&&(L===k||hasWord(L,k))}));if(t&&t.id!==r.compte)r.tiers=t.id}
  return r;
}

/* ================= bouton retour ================= */
/* Chaque changement de rubrique, de vue ou d'onglet de Données et réglages est une étape de l'historique du navigateur :
   le bouton retour (téléphone, navigateur, APK via @capacitor/app) ramène à l'étape précédente au lieu de fermer Daftar.
   Une fenêtre ouverte (confirmation, engin…) se ferme d'abord. Seul le premier écran laisse sortir de l'application. */
function ongletActif(){const t=tabs.find(([tt])=>$(tt).getAttribute('aria-selected')==='true');return t?t[0]:'tOne'}
function etatNav(){return {v:view,t:view==='donnees'?ongletActif():'',s:view==='donnees'&&saisieSeule?1:0,m:view==='donnees'&&!saisieSeule&&menuReglages?1:0}}
/* plusieurs changements (vue + onglet) = une seule étape de l'historique */
function navEtape(fn){const r=navRetour;navRetour=true;try{fn()}finally{navRetour=r;navNoter()}}
/* appelée par render() et showTab() ; ignore les affichages faits pendant le chargement du script (navPret) */
function navNoter(){if(!navPret||navRetour||!history.pushState)return;const st=etatNav(),k=JSON.stringify(st);if(k===navCle)return;
  try{if(!navCle)history.replaceState(st,'');else history.pushState(st,'')}catch(e){note('historique (bouton retour)',e)}navCle=k}
addEventListener('popstate',ev=>{
  const ouv=[...document.querySelectorAll('dialog[open]')];
  if(ouv.length){ouv.forEach(d=>d.close());try{history.pushState(etatNav(),'')}catch(e){note('historique (bouton retour)',e)}return}   // retour = fermer la fenêtre
  const st=ev.state;if(!st||!st.v)return;
  navRetour=true;try{if(st.v!=='donnees'&&editId)resetForm();view=st.v;saisieSeule=!!st.s;menuReglages=!!st.m;if(st.t)showTab(st.t,false,true);render();window.scrollTo(0,0)}finally{navRetour=false}
  navCle=JSON.stringify(etatNav())});
