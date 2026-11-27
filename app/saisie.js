/* Daftar — saisie d'une opération, annulation, collage d'une liste, postes et libellés, comptes et biens, devises.
   Un des six scripts de la page (app/index.html), chargés DANS L'ORDRE : noyau, vues, saisie, stats, reglages,
   demarrage. Scripts classiques (pas de modules) : leurs déclarations de premier niveau sont communes. Un script ne
   doit donc, en s'exécutant, appeler que ce qui est déclaré dans lui-même ou dans les précédents ; le démarrage
   (premier affichage) est dans demarrage.js, chargé en dernier. */
/* ================= saisie d'une opération ================= */
let touched={};  // champs réglés à la main : la reconnaissance du libellé ne les écrase plus
function fillSelects(){
  const keep=id=>$(id).value;
  const v={nat:keep('fNat'),cpt:keep('fCpt'),cat:keep('fCat'),vers:keep('fVers'),bien:keep('fBien')};
  $('fNat').innerHTML=optsNat(v.nat||'depense');$('fCpt').innerHTML=optsComptes(v.cpt||'especes');
  $('fCat').innerHTML=optsPostes(CAT[v.cat]?v.cat:'autre');$('fVers').innerHTML=optsComptes(v.vers);$('fBien').innerHTML=optsBiens(v.bien);
  $('dlPers').innerHTML=creances().map(c=>`<option value="${esc(c.nom)}">`).join('');
  const cm=$('fCatM').value;$('fCatM').innerHTML=CATS_M.map(c=>`<option value="${c.id}"${c.id===cm?' selected':''}>${esc(c.l)}</option>`).join('');
  const cr=$('fCatR').value;$('fCatR').innerHTML=REVENUS.map(r=>`<option value="${r.id}"${r.id===cr?' selected':''}>${esc(r.label)} (${r.courant?'courant':'ponctuel'})</option>`).join('');
  const cp=$('fCatP').value,RP=REVENUS.filter(r=>!r.courant);$('fCatP').innerHTML=RP.map(r=>`<option value="${r.id}"${r.id===cp?' selected':''}>${esc(r.label)}</option>`).join('');
  const pc=$('pasteCpt').value;$('pasteCpt').innerHTML='<option value="">— non : compte reconnu dans chaque ligne —</option>'+COMPTES.map(c=>`<option value="${c.id}"${c.id===pc?' selected':''}>${esc(c.nom)}${c.type==='tiers'?' (tiers)':''}</option>`).join('');
  const ct=$('fTiers').value;$('fTiers').innerHTML='<option value="">— non —</option>'+TIERS().map(c=>`<option value="${c.id}"${c.id===ct?' selected':''}>${esc(c.nom)}</option>`).join('');
  const ce=$('fEvt').value;$('fEvt').innerHTML='<option value="">— aucun : opération courante —</option>'+[...EVTS].sort((a,b)=>(b.debut||'').localeCompare(a.debut||'')).map(x=>`<option value="${x.id}"${x.id===ce?' selected':''}>★ ${esc(x.nom)}</option>`).join('');
  const ve=$('fVeh').value;$('fVeh').innerHTML='<option value="">— aucun engin —</option>'+VEHS().map(b=>`<option value="${b.id}"${b.id===ve?' selected':''}>${esc(b.nom)}</option>`).join('');
  const cv=$('fCatV').value;$('fCatV').innerHTML=CATS_V.map(c=>`<option value="${c.id}"${c.id===cv?' selected':''}>${c.l}</option>`).join('');
  if(!editId&&!touched.nat)deviner();majChamps();
}
function majChamps(){
  const n=$('fNat').value;
  $('wCat').hidden=n!=='depense';$('wTiers').hidden=!(n==='depense'&&TIERS().length&&!estTiers($('fCpt').value));$('wVers').hidden=n!=='virement';$('wPers').hidden=!(n==='pret'||n==='remboursement');
  $('wEch').hidden=n!=='pret';$('wBien').hidden=n!=='investissement';
  $('wRev').hidden=n!=='revenu';$('wEvt').hidden=!((n==='depense'||n==='revenu')&&EVTS.length);
  // « dont ponctuel » : seulement pour un revenu courant hors événement (un revenu ponctuel l'est déjà en entier)
  $('wPonct').hidden=!(n==='revenu'&&(REV[$('fCatR').value]||{}).courant&&!($('fEvt').value&&!$('wEvt').hidden));
  // champs du véhicule : dépense du poste du véhicule, ou investissement dans un bien véhicule
  const bInv=n==='investissement'&&BIEN[$('fBien').value]&&BIEN[$('fBien').value].vehicule?BIEN[$('fBien').value]:null;
  const ctx=VEHS().length>0&&(bInv||(n==='depense'&&VEHS().some(b=>b.poste===$('fCat').value)));
  // poste partagé avec un engin (Foyer + groupe électrogène) : « aucun engin » par défaut, sauf engin reconnu dans le libellé
  const partage=ctx&&!bInv&&!posteDedie($('fCat').value);
  if(ctx&&!bInv&&!touched.veh){if(partage)$('fVeh').value=guessOp($('fLib').value).vehicule||'';else{const g=enginDe($('fLib').value,$('fCat').value,'');if(g)$('fVeh').value=g.id}}
  const v=bInv||BIEN[$('fVeh').value]||VEH();
  $('wVeh').hidden=!ctx;$('wVehSel').hidden=!!bInv||(VEHS().length<2&&!partage);
  const sansEngin=ctx&&!bInv&&!$('wVehSel').hidden&&!$('fVeh').value;
  document.querySelectorAll('#wVeh .vehdet').forEach(x=>{x.hidden=sansEngin});if(sansEngin)$('vidBox').hidden=true;
  $('wMai').hidden=!(n==='investissement'&&BIEN[$('fBien').value]&&BIEN[$('fBien').value].maison);
  if(ctx&&!sansEngin){const k=kmNow(v),km=num($('fKm').value),vd=vidangeDe(v);$('fKmLab').textContent=`Compteur (${UK(v)})`;$('fKmHint').textContent=k?`Dernier relevé (${v.nom}) : ${nb(k)} ${UK(v)}`:'';
    const vid=$('fCatV').value==='entretien'&&isVidange({libelle:$('fLib').value})&&km>0;$('vidBox').hidden=!vid;
    if(vid){if(!touched.vidnext)$('fVidNext').value=Math.round(km+vd.intervalle);$('fVidU').textContent=UK(v);$('fVidInt').textContent=`(compteur + intervalle de ${nb(vd.intervalle)}, modifiable)`}}
  $('fCptLab').textContent={revenu:'Reçu sur',remboursement:'Reçu sur',virement:'Depuis le compte'}[n]||'Payé avec';
}
function deviner(){
  const lib=$('fLib').value;if(!lib.trim()){$('fLibHint').textContent='';return}const g=guessOp(lib);
  if(!touched.nat)$('fNat').value=g.nature;
  if(!touched.cpt)$('fCpt').value=g.compte;
  if(!touched.vers&&g.vers)$('fVers').value=g.vers;
  if(!touched.pers&&g.personne)$('fPers').value=g.personne;
  if(!touched.bien&&g.bien)$('fBien').value=g.bien;
  if(!touched.cat)$('fCat').value=g.nature==='depense'?g.categorie:guessCat(lib);
  if(!touched.catv&&g.cat_vehicule)$('fCatV').value=g.cat_vehicule;
  if(!touched.catm&&g.cat_maison)$('fCatM').value=g.cat_maison;
  if(!touched.rev&&g.cat_revenu)$('fCatR').value=g.cat_revenu;
  if(!touched.evt)$('fEvt').value=g.evenement||'';
  if(!touched.tiers)$('fTiers').value=g.tiers||'';
  majChamps();
  // ce que la reconnaissance a réglé (champs non modifiés à la main), affiché sous le libellé
  const n=$('fNat').value,bits=[];
  if(!touched.nat)bits.push(NAT[n].l.toLowerCase());
  if(n==='depense'&&!touched.cat)bits.push('poste '+((CAT[$('fCat').value]||{}).label||''));
  if(n==='virement'&&!touched.vers)bits.push(`${nomCpt($('fCpt').value)} → ${nomCpt($('fVers').value)}`);
  else if(!touched.cpt)bits.push(($('fCptLab').textContent||'').toLowerCase()+' '+nomCpt($('fCpt').value));
  if(n==='investissement'&&!touched.bien&&BIEN[$('fBien').value])bits.push('bien '+BIEN[$('fBien').value].nom);
  if(n==='revenu'&&!touched.rev&&REV[$('fCatR').value]){const r=REV[$('fCatR').value];bits.push(`${r.label} (${r.courant?'courant':'ponctuel'})`)}
  if(!$('wEvt').hidden&&!touched.evt&&EVT[$('fEvt').value])bits.push('★ '+EVT[$('fEvt').value].nom+' (exceptionnel)');
  if((n==='pret'||n==='remboursement')&&!touched.pers&&$('fPers').value)bits.push($('fPers').value);
  if(!$('wTiers').hidden&&!touched.tiers&&$('fTiers').value)bits.push('versé au compte '+nomCpt($('fTiers').value));
  $('fLibHint').textContent=bits.length?'Reconnu : '+bits.join(' · ')+' (modifiable ci-dessous)':'';
}
$('fDate').value=today;
/* Nouveau jour (1.4.7) : la page reste ouverte (onglet de l'ordinateur, application du téléphone en arrière-plan) d'un jour
   à l'autre ; « aujourd'hui » était figé au chargement, et Saisir proposait encore la date de la veille. Au retour sur la
   page, à l'ouverture de Saisir et chaque minute : nouvelle date, formulaire remis à aujourd'hui (sauf modification en
   cours), mois affiché avancé s'il était le mois en cours, période des Statistiques « 30 derniers jours » décalée. */
function nouveauJour(){
  const t=iso(new Date());if(t===today)return false;
  const ancien=today,etaitCourant=cur.y===now.getFullYear()&&cur.m===now.getMonth();
  now=new Date();today=t;
  if(!editId)$('fDate').value=today;
  if(etaitCourant)cur={y:now.getFullYear(),m:now.getMonth()};
  if(statsAu===ancien){statsAu=today;statsDu=addJ(today,-29)}
  if(ready)render();return true;
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')nouveauJour()});
addEventListener('focus',nouveauJour);addEventListener('pageshow',nouveauJour);setInterval(nouveauJour,60000);
fillSelects();
const AMT_HINT=()=>SAISIE_K?'10 = 10 000 · 0,5 = 500':'par exemple 10000';   // court : le champ est sur une demi-ligne
/* Une opération : le montant est toujours positif ; un signe − tapé devant veut dire « sortie » (dépense) */
const amtNeg=()=>/^\s*[-−]/.test($('fAmt').value),amtVal=()=>cfa($('fAmt').value.replace(/^\s*[-−]\s*/,''));
function amtHint(){const v=amtVal();$('fAmtHint').textContent=v>0?`= ${fmtC(v)} FCFA${amtNeg()?' · sortie':''}`:($('fAmt').value.trim()?'Montant non reconnu':AMT_HINT())}
$('fAmt').addEventListener('input',()=>{amtHint();if(amtNeg()&&!touched.nat&&['revenu','remboursement'].includes($('fNat').value)){$('fNat').value='depense';majChamps()}});
['input','change','compositionend'].forEach(t=>$('fLib').addEventListener(t,deviner));   // claviers de téléphone : la saisie prédictive n'émet pas toujours « input »
[['fNat','nat'],['fCpt','cpt'],['fCat','cat'],['fVers','vers'],['fBien','bien'],['fPers','pers'],['fCatV','catv'],['fCatM','catm'],['fCatR','rev'],['fEvt','evt'],['fVeh','veh'],['fTiers','tiers']].forEach(([i,k])=>$(i).addEventListener(i==='fPers'?'input':'change',()=>{touched[k]=true;majChamps()}));
$('fKm').addEventListener('input',majChamps);
$('fVidNext').addEventListener('input',()=>{touched.vidnext=true});
const tabs=[['tOne','oneForm'],['tPaste','pasteBox'],['tRel','relBox'],['tPostes','posteBox'],['tCB','cbBox'],['tEvt','evtBox'],['tRev','revBox'],['tProg','progBox'],['tSai','saisieBox'],['tPar','paritesBox'],['tSav','savBox']];
/* garderMenu : rétablissement par le bouton retour (le menu ou la page est décidé par l'étape rétablie) ; sinon, choisir un
   onglet ouvre sa PAGE (le menu ≡ se ferme) */
function showTab(t,focus,garderMenu){if(t!=='tOne')saisieSeule=false;if(!garderMenu)menuReglages=false;tabs.forEach(([tt,p])=>{const on=tt===t;$(tt).setAttribute('aria-selected',on);$(tt).tabIndex=on?0:-1;$(p).hidden=!on});majRubSaisie();navNoter();if(focus)$(t).focus()}
/* « Saisir » montre seulement la carte de saisie (onglets cachés) ; « Données et réglages » montre tout */
/* trois façons de montrer Données et réglages : « seule » (bouton Saisir : la carte de saisie), « menu » (≡ : la liste des
   réglages, aucun panneau), « page » (un réglage choisi dans le menu, avec « ‹ Réglages » pour y revenir) */
function majRubSaisie(){const d=view==='donnees',s=d&&saisieSeule,m=d&&!s&&menuReglages;$('saisie').classList.toggle('seule',s);
  $('saisie').classList.toggle('regmenu',m);$('saisie').classList.toggle('regpage',d&&!s&&!m);
  const t=ongletActif();$('titrePage').textContent=t?$(t).querySelector('span').textContent:'';$('saisie').setAttribute('aria-label',s?'Saisir une opération':'Données et réglages');$('aSaisir').setAttribute('aria-pressed',s);$('aDon').setAttribute('aria-pressed',d&&!s)}
tabs.forEach(([t,p])=>{$(t).setAttribute('aria-controls',p);$(t).type='button';$(p).setAttribute('role','tabpanel');$(p).setAttribute('aria-labelledby',t)});
document.querySelector('.tabs').addEventListener('keydown',ev=>{
  const i=tabs.findIndex(([t])=>t===ev.target.id);if(i<0)return;
  const j={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:tabs.length-1}[ev.key];if(j===undefined)return;
  ev.preventDefault();showTab(tabs[(j+tabs.length)%tabs.length][0],true)});
tabs.forEach(([t])=>$(t).onclick=()=>{if(t==='tSav')renderHistorique();if((t==='tEvt'||t==='tRev')&&!evtDirty)openEvt();if(t==='tProg'&&!progDirty)openProg();if(t==='tRel')initReleve();showTab(t);enHaut()});
$('retourReglages').onclick=()=>{navEtape(()=>{menuReglages=true;render()});enHaut();$(ongletActif()).focus({preventScroll:true})};showTab('tOne');
/* modifications non enregistrées : point orange sur l'onglet et bouton « Enregistrer » mis en évidence ; avertissement si on ferme la page */
const BROUILLONS=[['tPostes',()=>dirty,['savePostes']],['tCB',()=>cbDirty,['saveCpt','saveBien']],['tEvt',()=>evtDirty,['evtSave','pjSave']],['tRev',()=>evtDirty,['revSave']],['tProg',()=>progDirty,['progSave']],['tPar',()=>devDirty,['saveDev']]];
function majBrouillons(){BROUILLONS.forEach(([t,d,bs])=>{const on=!!d();$(t).classList.toggle('brouillon',on);$(t).title=on?'Modifications non enregistrées':'';bs.forEach(b=>$(b).classList.toggle('brouillon',on))})}
['input','change','click'].forEach(e=>$('saisie').addEventListener(e,()=>setTimeout(majBrouillons,0)));
setInterval(majBrouillons,1500);
window.addEventListener('beforeunload',ev=>{if(BROUILLONS.some(([,d])=>d())){ev.preventDefault();ev.returnValue=''}});
/* unité de saisie : textes, exemples et champs suivent l'option */
function U_SAISIE(){return SAISIE_K?'en milliers':'en FCFA'}
function majSaisie(){
  document.querySelectorAll('.uS').forEach(x=>x.textContent=SAISIE_K?'(en milliers)':'(FCFA)');
  document.querySelectorAll('.uS-court').forEach(x=>x.textContent=U_SAISIE());
  document.querySelectorAll('.uS-acc').forEach(x=>x.textContent=SAISIE_K?'les montants se tapent en milliers':'les montants se tapent en francs CFA');
  document.querySelectorAll('[data-k]').forEach(x=>x.textContent=exK(+x.dataset.k));
  $('fAmt').placeholder=exK(10);
  $('pasteK').checked=SAISIE_K;
  $('pasteText').placeholder=[`${exK(10)} vivres le 02/10/26`,`${exK(4)} dej`,`${exK(200)} salaire banque le 27/10/26`,`${exK(80)} retrait banque`,`${exK(100)} épargne banque > mobile`,`prêt ${exK(100)} Ali échéance 30/07/26`,`remb ${exK(75)} Ali`,`${exK(50)} ciment maison`,`${exK(25)} carburant 35,7L 110882km`,`${exK(17)} vidange huile 110818km`,`${exK(12)} pharmacie`,`${exK(30)} scolarité banque`,`${exK(5)} crédit mobile`].join('\n');
  $('saisieK').checked=SAISIE_K;
  $('saisieKInfo').textContent=SAISIE_K?'Activé : tapez 10 pour 10 000 FCFA. Un nombre de 10 000 ou plus est pris tel quel.':'Désactivé : tapez le vrai montant, par exemple 10000 pour 10 000 FCFA.';
  amtHint();
}
$('saisieK').addEventListener('change',()=>{SAISIE_K=$('saisieK').checked;lsSet('daftar-saisie-milliers',SAISIE_K?'1':'0');
  majSaisie();if(!dirty)openPostes();if(!cbDirty)openCB();if(!evtDirty)openEvt();openProjet();render();status(SAISIE_K?'Montants en milliers sur cet appareil.':'Montants en francs CFA sur cet appareil.')});
majSaisie();
/* clavier Daftar des montants : remplace le clavier du téléphone (qui n'a pas toujours le signe −) dans les champs de montant ;
   chiffres, virgule, signe −, 00 et 000. Réglage par appareil (Données et réglages › Saisie), actif par défaut sur écran tactile. */
let CLAVIER=(()=>{const v=lsGet('daftar-clavier');if(v!==null)return v==='1';return matchMedia('(pointer:coarse)').matches})();
let clavCible=null,clavTel=null;
const champClav=el=>!!el&&el.tagName==='INPUT'&&(el.getAttribute('inputmode')==='decimal'||el.dataset.clav==='1')&&!el.closest('dialog')&&!el.disabled&&!el.readOnly;
function clavApercu(){const el=clavCible;$('clavApercu').textContent=el?(el.getAttribute('aria-label')||(el.labels&&el.labels[0]?el.labels[0].textContent:'')||'').trim():''}
function clavOuvrir(el){clavCible=el;el.dataset.clav='1';el.setAttribute('inputmode','none');$('clavier').hidden=false;document.body.classList.add('avec-clavier');clavApercu();
  setTimeout(()=>el.scrollIntoView({block:'center',behavior:doux()}),50)}
function clavFermer(){const el=clavCible;clavCible=null;$('clavier').hidden=true;document.body.classList.remove('avec-clavier');if(el)el.setAttribute('inputmode','decimal')}
document.addEventListener('focusin',ev=>{const el=ev.target;if(CLAVIER&&champClav(el)&&el.dataset.telephone!=='1')clavOuvrir(el);else if(clavCible&&el!==clavCible)clavFermer()});
document.addEventListener('focusout',ev=>{const el=ev.target;if(el!==clavTel&&el.dataset&&el.dataset.telephone==='1'){delete el.dataset.telephone}
  setTimeout(()=>{if(clavCible&&document.activeElement!==clavCible)clavFermer()},0)});
$('clavier').addEventListener('pointerdown',ev=>{if(ev.target.closest('button'))ev.preventDefault()});   // garde le curseur dans le champ
$('clavier').addEventListener('click',ev=>{const b=ev.target.closest('[data-c]'),el=clavCible;if(!b||!el)return;const c=b.dataset.c;
  if(c==='ok'){el.blur();clavFermer();return}
  /* clavier du téléphone pour ce champ : on le quitte puis on y revient DANS le même toucher (sinon Android n'ouvre pas son
     clavier) ; clavTel empêche la sortie du champ d'effacer la marque « telephone » (avant 1.4.6, le clavier Daftar revenait) */
  if(c==='tel'){el.dataset.telephone='1';clavTel=el;clavFermer();el.blur();el.focus({preventScroll:true});clavTel=null;return}
  let a=el.selectionStart??el.value.length,z=el.selectionEnd??a;
  if(c==='del'){if(a===z&&a>0)a--;el.setRangeText('',a,z,'end')}
  else if(c==='moins'){const neg=/^\s*[-−]/.test(el.value);el.value=neg?el.value.replace(/^\s*[-−]\s*/,''):'-'+el.value;const p=el.value.length;el.setSelectionRange(p,p)}
  else if(c===','){if(!el.value.includes(','))el.setRangeText(el.value?',':'0,',a,z,'end')}
  else el.setRangeText(c,a,z,'end');
  el.dispatchEvent(new Event('input',{bubbles:true}))});
function majClavier(){$('clavierK').checked=CLAVIER;$('clavierKInfo').textContent=CLAVIER?'Activé : toucher un champ de montant ouvre le clavier Daftar ; « ⌨ Clavier du téléphone » revient au clavier habituel.':'Désactivé : le clavier du téléphone s\'ouvre dans les champs de montant.'}
$('clavierK').addEventListener('change',()=>{CLAVIER=$('clavierK').checked;lsSet('daftar-clavier',CLAVIER?'1':'0');majClavier();status(CLAVIER?'Clavier Daftar activé sur cet appareil.':'Clavier du téléphone sur cet appareil.')});
majClavier();
function majAbrege(){$('abregeK').checked=ABREGE;$('abregeKInfo').textContent=ABREGE?'Activé : les grands montants des cartes sont abrégés (K = milliers, M = millions) ; le montant exact apparaît en survolant le chiffre. Le journal et les tableaux restent en entier.':'Désactivé : les cartes affichent les montants en entier.'}
$('abregeK').addEventListener('change',()=>{ABREGE=$('abregeK').checked;lsSet('daftar-abrege',ABREGE?'1':'0');majAbrege();render();status(ABREGE?'Montants abrégés dans les cartes.':'Montants en entier dans les cartes.')});
majAbrege();
function resetForm(){['fAmt','fLib','fRem','fPers','fEch','fKm','fQty'].forEach(i=>$(i).value='');$('fTiers').value='';$('fPonct').value='';$('fLibHint').textContent='';$('fUnit').value='L';$('fVid').checked=true;touched={};$('fVidNext').value='';$('fNat').value='depense';$('fCpt').value='especes';$('fCat').value='autre';$('fEvt').value='';editId=null;$('editBar').hidden=true;$('addBtn').textContent='Ajouter';majChamps();amtHint();render()}
/* fenêtre de confirmation : résumé lisible de l'opération avant l'enregistrement (Échap ou « Modifier » = annuler) */
/* ================= annuler : message en bas de l'écran, 10 secondes ================= */
let toastT=null,HIST=null;
function annulable(msg,annuler){
  clearTimeout(toastT);$('toastTxt').textContent=msg;$('toastBtn').hidden=!annuler;$('toast').hidden=false;
  $('toastBtn').onclick=async()=>{$('toast').hidden=true;try{await annuler();status('Annulé.')}catch(e){status(e.message||"L'annulation a échoué.",true)}};
  toastT=setTimeout(()=>{$('toast').hidden=true},10000);
}
$('toastX').onclick=()=>{$('toast').hidden=true};
/* une ligne d'une liste de réglages retirée (pas encore enregistrée) peut revenir à sa place */
function retirerLigne(row,quoi,salir,fem){const parent=row.parentNode,next=row.nextSibling;row.remove();salir();
  annulable(`${quoi} retiré${fem?'e':''} (pas encore enregistré${fem?'e':''})`,()=>{parent.insertBefore(row,next);salir()})}
/* Réglages en listes (2026-11-27, demande de l'utilisateur) : chaque élément se lit en une ligne (resume) ; « Modifier »
   ouvre SES champs ; « Enregistrer » lance l'enregistrement de la section (son bouton), « Annuler » la rouvre telle
   qu'enregistrée (rouvrir). Un élément nouveau s'ouvre directement. Le bouton de la section n'apparaît que s'il reste un
   changement sans élément ouvert (élément retiré, ordre changé) : majSale. */
const selTxt=s=>s&&s.selectedIndex>=0&&s.options[s.selectedIndex]?s.options[s.selectedIndex].text:'';
const mtS=v=>{const m=montantSaisi(v);return isFinite(m)?fmtC(m)+' FCFA':esc(v)};   // montant tapé (milliers ou non) → « 7 200 000 FCFA »
const valIn=(r,c)=>{const e=r.querySelector(c);return e?e.value.trim():''};
function ficher(r,resume,ouverte){if(r.querySelector(':scope>.fres'))return;r.classList.add('fiche');r.classList.toggle('edit',!!ouverte);
  r.insertAdjacentHTML('afterbegin',`<div class="fres"><span class="fsum">${resume(r)}</span><button type="button" class="btn ghost small fmod">Modifier</button></div>`);
  r.insertAdjacentHTML('beforeend',`<div class="fact"><button type="button" class="btn small fok">Enregistrer</button><button type="button" class="btn ghost small fno">Annuler</button></div>`)}
function fiches(liste,resume,saveId,rouvrir){
  liste.querySelectorAll(':scope>.cbrow,:scope>.evrow,:scope>.prow').forEach(r=>ficher(r,resume,!r.dataset.id&&!r.classList.contains('prow')));
  if(liste.dataset.fiches)return;liste.dataset.fiches='1';
  liste.addEventListener('click',ev=>{const b=ev.target.closest('.fmod,.fok,.fno');if(!b)return;const r=b.closest('.fiche');
    if(b.classList.contains('fmod')){r.classList.add('edit');const f=r.querySelector(':scope>input:not([type=color]),:scope>select,:scope>span>input:not([type=color]),:scope>.pmain>input');if(f)f.focus()}
    else if(b.classList.contains('fok'))$(saveId).click();
    else rouvrir();majSale()})}
const SALES=[['savePostes',()=>dirty,['posteList']],['saveCpt',()=>cbDirty,['cptEdit','cptEditT']],['saveBien',()=>cbDirty,['bienEdit']],
  ['evtSave',()=>evtDirty,['evtList']],['pjSave',()=>evtDirty,['pjList']],['revSave',()=>evtDirty,['revList']]];
function majSale(){for(const [b,d,ls] of SALES){const el=$(b);if(el)el.classList.toggle('voir',!!d()&&!ls.some(l=>$(l)&&$(l).querySelector('.fiche.edit')))}}
['input','change','click'].forEach(t=>document.addEventListener(t,()=>setTimeout(majSale,0)));
/* annuler le dernier changement de réglages = revenir au point de restauration le plus récent */
async function annulerDernierReglage(){if(!HIST||!HIST.length)throw new Error('Aucun changement à annuler.');await req('PUT','/api/parametres',{restaurer:HIST.length-1});await charger()}
/* fenêtre de confirmation générique (titre, lignes [libellé, valeur], note) */
function dialogue(titre,lignes,note){
  const dlg=$('dlgOp');$('dlgTitre').textContent=titre;
  $('dlgResume').innerHTML=lignes.map(([k,v,c])=>`<dt>${k}</dt><dd${c?` class="${c}"`:''}>${esc(v)}</dd>`).join('');
  $('dlgNote').textContent=note||'';$('dlgNote').hidden=!note;
  if(typeof dlg.showModal!=='function')return Promise.resolve(confirm(titre+'\n'+lignes.map(([k,v])=>k+' : '+v).join('\n')));
  return new Promise(res=>{
    const fin=v=>{dlg.removeEventListener('cancel',annul);$('dlgOk').onclick=$('dlgNon').onclick=null;if(dlg.open)dlg.close();res(v)};
    const annul=ev=>{ev.preventDefault();fin(false)};
    dlg.addEventListener('cancel',annul);$('dlgOk').onclick=()=>fin(true);$('dlgNon').onclick=()=>fin(false);
    dlg.showModal();$('dlgOk').focus();
  });
}
function confirmerOp(doc,opt={}){
  const dlg=$('dlgOp');
  const lignes=[['Date',new Date(doc.date+'T12:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})],
    ['Montant',`${fmtC(doc.montant)} FCFA`,'montant'],['Libellé',doc.libelle],['Nature',NAT[doc.nature].l]];
  if(doc.nature==='virement')lignes.push(['Virement',`${nomCpt(doc.compte)} → ${nomCpt(doc.vers)}`]);
  else lignes.push([{revenu:'Reçu sur',remboursement:'Reçu sur'}[doc.nature]||'Payé avec',nomCpt(doc.compte)]);
  if(doc.nature==='depense')lignes.push(['Poste',(CAT[doc.categorie]||{}).label||doc.categorie]);
  if(doc.cat_revenu){const r=REV[doc.cat_revenu]||{label:doc.cat_revenu};lignes.push(['Type de revenu',`${r.label} (${r.courant?'courant':'ponctuel'})`])}
  if(doc.ponctuel){const p=REV[doc.cat_ponctuel]||{label:'Autre revenu'};lignes.push(['Dont ponctuel',`${fmtC(doc.ponctuel)} FCFA ${p.label.toLowerCase()} · courant : ${fmtC(doc.montant-doc.ponctuel)} FCFA`])}
  if(doc.tiers)lignes.push(['Versé au compte',`${nomCpt(doc.tiers)} : votre dépense alimente aussi ce compte`]);
  if(estTiers(doc.compte))lignes.push(['Compte d\'un tiers','gardé à part : ne compte pas dans vos dépenses ni vos revenus']);
  if(doc.evenement)lignes.push(['Événement',`★ ${(EVT[doc.evenement]||{}).nom||doc.evenement} : opération exceptionnelle`]);
  if(doc.personne)lignes.push(['Personne',doc.personne]);
  if(doc.echeance)lignes.push(['Échéance',dmy(doc.echeance)]);
  if(doc.bien)lignes.push(['Bien',(BIEN[doc.bien]||{}).nom||doc.bien]);
  if(doc.cat_maison)lignes.push(['Travaux',(CATS_M.find(c=>c.id===doc.cat_maison)||{}).l||doc.cat_maison]);
  if(doc.vehicule){lignes.push(['Engin',((BIEN[doc.vehicule]||{}).nom||doc.vehicule)+' · '+((CATS_V.find(c=>c.id===doc.cat_vehicule)||{}).l||doc.cat_vehicule)]);
    if(doc.km)lignes.push(['Compteur',`${nb(doc.km)} ${UK(BIEN[doc.vehicule])}`]);if(doc.quantite)lignes.push(['Quantité',`${String(doc.quantite).replace('.',',')} ${doc.unite}`])}
  if(doc.remarque)lignes.push(['Remarque',doc.remarque]);
  $('dlgTitre').textContent=opt.edition?'Enregistrer ces modifications ?':'Ajouter cette opération ?';
  $('dlgResume').innerHTML=lignes.map(([k,v,c])=>`<dt>${k}</dt><dd${c?` class="${c}"`:''}>${esc(v)}</dd>`).join('');
  $('dlgNote').textContent=opt.vidange?`Prochaine vidange : ${nb(opt.vidange)} ${UK(BIEN[doc.vehicule])}.`:'';
  $('dlgNote').hidden=!opt.vidange;
  if(typeof dlg.showModal!=='function')return Promise.resolve(confirm(lignes.map(([k,v])=>k+' : '+v).join('\n')));
  return new Promise(res=>{
    const fin=v=>{dlg.removeEventListener('cancel',annul);$('dlgOk').onclick=$('dlgNon').onclick=null;if(dlg.open)dlg.close();res(v)};
    const annul=ev=>{ev.preventDefault();fin(false)};
    dlg.addEventListener('cancel',annul);$('dlgOk').onclick=()=>fin(true);$('dlgNon').onclick=()=>fin(false);
    dlg.showModal();$('dlgOk').focus();
  });
}
/* modifier une ligne depuis un journal : le formulaire s'ouvre dans Données et réglages, puis on revient à la vue d'origine */
let retourVue=null;
function revenir(){if(retourVue){view=retourVue;retourVue=null;render();window.scrollTo({top:0,behavior:doux()})}}
$('editCancel').onclick=()=>{resetForm();$('addMsg').textContent='';revenir()};
function startEdit(id){
  const e=all.find(x=>x.id===id);if(!e)return;
  navEtape(()=>{editId=id;saisieSeule=false;if(view!=='donnees'){retourVue=view;view='donnees'}showTab('tOne')});
  $('fDate').value=e.date;$('fAmt').value=versSaisie(e.montant);$('fLib').value=e.libelle;$('fNat').value=e.nature;$('fCpt').value=e.compte;
  $('fCat').value=e.categorie||'autre';$('fVers').value=e.vers;$('fPers').value=e.personne;$('fEch').value=e.echeance;$('fBien').value=e.bien;$('fRem').value=e.remarque;
  $('fCatM').value=e.cat_maison||guessCatM(e.libelle);$('fCatV').value=e.cat_vehicule||guessCatV(e.libelle);$('fKm').value=e.km||'';$('fQty').value=e.quantite?String(e.quantite).replace('.',','):'';$('fUnit').value=e.unite==='u'?'u':'L';$('fVid').checked=false;
  $('fCatR').value=e.nature==='revenu'?catRev(e):'autre';$('fEvt').value=e.evenement||'';$('fTiers').value=e.tiers||'';
  $('fPonct').value=e.nature==='revenu'&&e.ponctuel?versSaisie(e.ponctuel):'';if(e.cat_ponctuel&&REV[e.cat_ponctuel])$('fCatP').value=e.cat_ponctuel;
  $('fVeh').value=e.vehicule&&BIEN[e.vehicule]?e.vehicule:'';
  touched={nat:1,cpt:1,cat:1,vers:1,pers:1,bien:1,catv:1,catm:1,rev:1,evt:1,veh:1,tiers:1};majChamps();
  $('editBar').hidden=false;$('editWhat').textContent=`${e.libelle}, ${fmtC(e.montant)} FCFA`;
  $('addBtn').textContent='Enregistrer les modifications';$('addMsg').textContent='';amtHint();render();
  window.scrollTo({top:0,behavior:doux()});
}
function docOp(o){
  const d={date:o.date,montant:o.montant,libelle:o.libelle,nature:o.nature,compte:o.compte,cree:o.cree};
  if(o.nature==='depense')d.categorie=o.categorie;
  if(o.nature==='depense'&&o.tiers&&o.tiers!==o.compte)d.tiers=o.tiers;
  if(o.nature==='virement')d.vers=o.vers;
  if(o.nature==='pret'||o.nature==='remboursement'){d.personne=o.personne;if(o.nature==='pret'&&o.echeance)d.echeance=o.echeance}
  if(o.nature==='investissement')d.bien=o.bien;
  if(o.vehicule&&(o.nature==='depense'||o.nature==='investissement')){d.vehicule=o.vehicule;d.cat_vehicule=o.cat_vehicule||'autre';
    if(o.km>0)d.km=o.km;if(o.quantite>0){d.quantite=o.quantite;d.unite=o.unite||'L'}}
  if(o.nature==='investissement'&&o.cat_maison)d.cat_maison=o.cat_maison;
  if(o.nature==='revenu'){d.cat_revenu=o.cat_revenu||guessCatR(o.libelle);if(o.ponctuel>0){d.ponctuel=o.ponctuel;d.cat_ponctuel=o.cat_ponctuel||'autre'}}
  if((o.nature==='depense'||o.nature==='revenu')&&o.evenement)d.evenement=o.evenement;
  if(o.prog&&o.prog_date){d.prog=o.prog;d.prog_date=o.prog_date}
  if(o.remarque)d.remarque=o.remarque;
  return d;
}
$('oneForm').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const montant=amtVal();const libelle=$('fLib').value.trim();
  if(!(montant>0)){$('addMsg').textContent=(SAISIE_K?'Montant invalide : tapez un nombre en milliers, par exemple 10 pour 10 000 CFA.':'Montant invalide : tapez le montant en francs CFA, par exemple 10000.');return}
  if(!ready){$('addMsg').textContent="Les données ne sont pas encore chargées.";return}
  const nature=$('fNat').value;
  if(amtNeg()&&['revenu','remboursement'].includes(nature)){$('addMsg').textContent='Montant précédé de « − » : c\'est une sortie. Choisissez une dépense, ou retirez le signe.';return}
  if((nature==='pret'||nature==='remboursement')&&!$('fPers').value.trim()){$('addMsg').textContent='Indiquez la personne.';return}
  if(nature==='investissement'&&!$('fBien').value){$('addMsg').textContent="Choisissez le bien (ajoutez-le d'abord dans « Comptes et biens »).";return}
  // engin : celui choisi dans la liste (vide = aucun) ; liste cachée (un seul engin, poste dédié) = l'engin affiché
  const vehChoisi=$('wVeh').hidden?'':nature==='investissement'?$('fBien').value:$('wVehSel').hidden?VEH().id:$('fVeh').value;
  const avecVeh=!!vehChoisi,km=avecVeh?Math.round(num($('fKm').value))||0:0,qte=avecVeh?num($('fQty').value)||0:0;
  if(km>0){const avant=vehOps().filter(x=>x.km&&x.id!==editId&&x.date<=$('fDate').value).map(x=>x.km),prev=Math.max(0,...avant);
    if(km<prev){$('addMsg').textContent=`Kilométrage inférieur à un relevé antérieur (${nb(prev)} km). Vérifiez le compteur ou la date.`;return}}
  const ponct=$('wPonct').hidden||!$('fPonct').value.trim()?0:cfa($('fPonct').value);
  if(!(ponct>=0)||ponct>=montant){$('addMsg').textContent=ponct>=montant?'La part ponctuelle doit être inférieure au montant.':'Part ponctuelle invalide.';return}
  $('addBtn').disabled=true;
  try{
    const old=editId?all.find(x=>x.id===editId):null;
    const doc=docOp({date:$('fDate').value,montant,libelle,nature,compte:$('fCpt').value,categorie:$('fCat').value,vers:$('fVers').value,
      personne:nature==='pret'||nature==='remboursement'?personneConnue($('fPers').value.trim()):'',echeance:$('fEch').value,bien:$('fBien').value,
      vehicule:vehChoisi,cat_maison:$('wMai').hidden?'':$('fCatM').value,cat_vehicule:$('fCatV').value,km,quantite:qte,unite:$('fUnit').value,
      cat_revenu:$('fCatR').value,ponctuel:ponct,cat_ponctuel:$('fCatP').value,evenement:$('wEvt').hidden?'':$('fEvt').value,tiers:$('wTiers').hidden?'':$('fTiers').value,
      remarque:$('fRem').value.trim(),cree:old?old.cree:new Date().toISOString()});
    const nouvVid=avecVeh&&!$('vidBox').hidden&&$('fVid').checked&&km>0,vehOp=BIEN[doc.vehicule];
    const prochVid=nouvVid?Math.round(num($('fVidNext').value))||km+vidangeDe(vehOp).intervalle:0;
    if(nouvVid&&prochVid<=km){$('addMsg').textContent='La prochaine vidange doit être au-delà du compteur actuel.';$('addBtn').disabled=false;return}
    if(!await confirmerOp(doc,{edition:!!editId,vidange:prochVid})){$('addMsg').textContent='Rien n\'a été enregistré : corrigez puis validez à nouveau.';$('addBtn').disabled=false;return}
    if(editId){await api.put(editId,doc);$('addMsg').textContent='Modifications enregistrées.'}
    else{await api.add(doc);$('addMsg').textContent=`Ajouté : ${NAT[nature].l.toLowerCase()}, ${fmtC(montant)} FCFA, ${libelle}`}
    const [y,m]=doc.date.split('-').map(Number);const vr=retourVue||view;if(vr==='mois')cur={y,m:m-1};else if(vr==='annee'||vr==='vehicule'||vr==='maison')cur.y=y;
    if(nouvVid&&MODE_SYNC)$('addMsg').textContent+=' Le repère de vidange sera mis à jour à la synchronisation.';
    else if(nouvVid){const vd=vidangeDe(vehOp);await enregistrerVidange({...vd,dernier:km,prochain:prochVid},vehOp);await charger(true);$('addMsg').textContent+=` Vidange (${vehOp.nom}) : prochaine à ${nb(prochVid)} ${UK(vehOp)}.`}
    const keepDate=doc.date,etaitEdition=!!editId;resetForm();fillSelects();$('fDate').value=keepDate;if(etaitEdition)revenir();else $('fAmt').focus();
  }catch(e){$('addMsg').textContent=e.message||"L'enregistrement a échoué. Réessayez."}
  $('addBtn').disabled=false;
});
async function clicJournal(ev){
  const b=ev.target.closest('.del');
  if(b){ev.stopPropagation();
    if(!b.classList.contains('armed')){desarmer();b.classList.add('armed');b.textContent='Supprimer ?';b.dataset.lab=b.getAttribute('aria-label');b.setAttribute('aria-label','Confirmer : '+b.dataset.lab.toLowerCase());return}
    b.disabled=true;
    try{const id=b.dataset.del,e=all.find(x=>x.id===id);await api.del(id);if(editId===id)resetForm();else render();
      if(e)annulable(`« ${e.libelle} » supprimée.`,async()=>{await api.add(docOp(e));render()})}catch(e){status(e.message||'La suppression a échoué.',true);b.disabled=false}
    return}
  const it=ev.target.closest('.item');if(it)startEdit(it.dataset.id);
}
$('list').addEventListener('click',clicJournal);$('vehList').addEventListener('click',clicJournal);$('maiList').addEventListener('click',clicJournal);
$('vehList').addEventListener('keydown',ev=>{if(ev.key==='Escape')desarmer()});
function desarmer(){document.querySelectorAll('.del.armed').forEach(x=>{x.classList.remove('armed');x.textContent='✕';if(x.dataset.lab)x.setAttribute('aria-label',x.dataset.lab)})}
$('list').addEventListener('keydown',ev=>{if(ev.key==='Escape')desarmer()});

/* ================= coller une liste ================= */
let parsed=[];
const RE_MONTANT='(\\d{1,3}(?:[\\s\\u00a0\\u202f]\\d{3})+|\\d+(?:[.,]\\d+)?)';
/* montant et libellé d'une ligne de note (le montant ouvre la ligne, ou suit un mot : « prêt 100 Ali ») */
function montantLibelle(txt){
  const line=txt.replace(/\(\s*[\d.,\s]*\)/g,'').replace(/\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s*$/i,'').trim();
  let am=line.match(new RegExp('^'+RE_MONTANT+'\\.?\\s*(.*)$')),pre='';
  if(!am){const m2=line.match(new RegExp('^([^\\d\\s]+)\\s+'+RE_MONTANT+'\\.?\\s*(.*)$'));if(m2){pre=m2[1];am=[m2[0],m2[2],m2[3]]}}
  if(!am)return null;
  return {montant:cfa(am[1]),libelle:((pre?pre+' ':'')+am[2]).replace(/\s+(le|du)\s*$/i,'').replace(/\s+/g,' ').trim()||'(sans libellé)'};
}
function parseList(text,fallback,impose){
  const out=[];let date=fallback;let py=null,pm=null;const X=impose?CPT[impose]:null,pris=new Set();
  const an=y=>{y=+y;return y<100?y+2000:y};
  for(const raw of text.split(/\n/)){
    const neg=/^\s*[-−]/.test(raw);
    let line=raw.trim().replace(/^[+\-−]\s*/,'');if(!line)continue;
    let ech='';
    const em=line.match(/\(?\s*(?:échéance|echeance|délai|delai)\s*:?\s*(?:le\s+|au\s+)?(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*\)?/i);
    if(em){ech=`${an(em[3])}-${pad(+em[2])}-${pad(+em[1])}`;line=line.replace(em[0],' ')}
    const dm=line.match(/\b(?:le\s+|du\s+)?(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i);
    if(dm){let d=+dm[1],m=+dm[2],y=an(dm[3]);
      if(py&&m===pm&&y!==py)y=py; // coquille d'année
      date=`${y}-${pad(m)}-${pad(d)}`;py=y;pm=m;line=line.replace(dm[0],' ')}
    if(X){const r=ligneCompte(line,neg,date,X,pris);out.push(...r);continue}
    // véhicule : « 35,7L » et « 110882km », ou l'ancienne forme du carnet « (35,71) » = litres, « (106183) » = km.
    // Ces lectures ne valent que si la ligne concerne le véhicule : « 8 huile 5l » (foyer) garde son texte, et un
    // petit entier entre parenthèses (« (458) ») reste un cumul ignoré.
    let km=0,qte=0,unite='',kmEcrit=false;
    let lv=line.replace(/\b(\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d{3,7})\s*km\b/i,(m0,x)=>{km=num(x);kmEcrit=true;return ' '});
    lv=lv.replace(/(^|\s)(\d+(?:[.,]\d+)?)\s*l(?![\wàâäéèêëîïôöùûüç])/i,(m0,p0,x)=>{qte=num(x);unite='L';return p0+' '});
    lv=lv.replace(/\(\s*([\d\s.,\u00a0\u202f]+?)\s*\)/g,(m0,x)=>{const t=x.trim(),v=num(t);
      if(/[.,]\d/.test(t)&&v<500&&!qte){qte=v;unite='L';return ' '}if(v>=10000&&/^[\d\s\u00a0\u202f]+$/.test(t)&&!km){km=v;return ' '}return m0});
    let r=montantLibelle(lv);
    if(!r)continue;
    let g=guessOp(r.libelle);
    // un kilométrage écrit « …km » désigne le véhicule, quel que soit le libellé ; un nombre entre parenthèses, non
    // (« 2000 taxi (12000) » : cumul de la note, pas un compteur)
    if(!g.vehicule&&km&&kmEcrit&&VEHS().length&&g.nature==='depense'){const v=enginDe(r.libelle,g.categorie,'');g={...g,categorie:v.poste||g.categorie,vehicule:v.id,cat_vehicule:guessCatV(r.libelle)}}
    if(!g.vehicule){km=0;qte=0;unite='';r=montantLibelle(line);if(!r)continue;g=guessOp(r.libelle)}
    if(!(r.montant>0))continue;
    out.push({date,montant:r.montant,libelle:r.libelle,...g,echeance:g.nature==='pret'?ech:'',km,quantite:qte,unite:qte?(unite||'L'):''});
  }
  return out;
}
/* « Lignes d'un seul compte » : − = dépense de ce compte, sans signe = entrée ; « ( −244 000 ) » = solde du compte ce jour-là ;
   sur le compte d'un tiers, votre nom (« prt Ali ») = votre part : votre dépense en espèces, versée à ce compte, rattachée
   à la dépense déjà notée dans votre journal quand il y en a une (même montant, ±TOL_J jours, libellé de versement) */
function ligneCompte(line,neg,date,X,pris){
  const out=[];
  line=line.replace(/\(\s*([-−+]?)\s*(\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d+(?:[.,]\d+)?)\s*\)/,(m0,sg,v)=>{const m=cfa(v);
    if(m>0||v.trim()==='0')out.push({type:'releve',compte:X.id,date,solde:(sg==='-'||sg==='−'?-1:1)*(m||0),garder:true});return ' '});
  const r=montantLibelle(line);if(!r||!(r.montant>0))return out;
  const L=normTxt(r.libelle),base={date,montant:r.montant,libelle:r.libelle,vers:'',personne:'',bien:'',evenement:'',vehicule:'',km:0,quantite:0,unite:'',echeance:'',garder:true};
  if(neg){out.unshift({...base,nature:'depense',compte:X.id,categorie:guessCat(r.libelle)});return out}
  if(X.type==='tiers'&&X.moi.some(m=>{const k=normTxt(m);return k&&hasWord(L,k)})){
    const motsV=X.contrib.map(normTxt).filter(Boolean),jours=(a,b)=>Math.abs(Date.parse(a)-Date.parse(b))/864e5;
    const dejà=all.filter(e=>e.nature==='depense'&&perso(e)&&!e.tiers&&!pris.has(e.id)&&e.montant===r.montant&&jours(e.date,date)<=TOL_J&&
      (!motsV.length||motsV.some(k=>hasWord(normTxt(e.libelle),k)))).sort((a,b)=>jours(a.date,date)-jours(b.date,date))[0];
    if(dejà){pris.add(dejà.id);out.unshift({...base,nature:'depense',compte:dejà.compte,categorie:dejà.categorie,tiers:X.id,lier:dejà.id,libelle:dejà.libelle,date:dejà.date,note:r.libelle});return out}
    const lib=X.contrib[0]||('contribution '+X.nom.toLowerCase());
    out.unshift({...base,nature:'depense',compte:'especes',categorie:guessCat(lib),tiers:X.id,libelle:lib,note:r.libelle});return out}
  if(X.type==='tiers'){out.unshift({...base,nature:'revenu',compte:X.id,cat_revenu:guessCatR(r.libelle)});return out}
  const g=guessOp(r.libelle);out.unshift({...base,...g,compte:X.id,vers:g.nature==='virement'&&g.vers!==X.id?g.vers:'',nature:g.nature==='virement'&&(!g.vers||g.vers===X.id)?'revenu':g.nature,date,montant:r.montant,libelle:r.libelle,garder:true});
  return out;
}
function pvDetail(e,i){
  const evt=e.evenement&&EVT[e.evenement]?` <span class="nat exc">★ ${esc(EVT[e.evenement].nom)}</span>`:'';
  if(e.nature==='revenu')return `<select data-i="${i}" data-k="cat_revenu" aria-label="Type de revenu, ligne ${i+1}">${REVENUS.map(r=>`<option value="${r.id}"${r.id===e.cat_revenu?' selected':''}>${esc(r.label)}</option>`).join('')}</select>${evt}`;
  if(e.nature==='depense')return pvDetailBase(e,i)+evt;
  return pvDetailBase(e,i);
}
function pvDetailBase(e,i){
  const veh=e.vehicule?` <span class="hint">${esc([CATV[e.cat_vehicule]?.l||'Autre'].concat(e.quantite?[nb(e.quantite,2)+' '+(e.unite==='u'?'u.':'L')]:[],e.km?[nb(e.km)+' km']:[]).join(' · '))}</span>`:'';
  if(e.nature==='depense')return `<select data-i="${i}" data-k="categorie" aria-label="Poste, ligne ${i+1}">${optsPostes(e.categorie)}</select>${veh}`;
  if(e.nature==='virement')return `→ <select data-i="${i}" data-k="vers" aria-label="Vers le compte, ligne ${i+1}">${optsComptes(e.vers,e.compte)}</select>`;
  if(e.nature==='pret'||e.nature==='remboursement')return `<input data-i="${i}" data-k="personne" value="${esc(e.personne)}" placeholder="personne" aria-label="Personne, ligne ${i+1}" style="max-width:11em">${e.echeance?` <span class="hint">éch. ${dmy(e.echeance)}</span>`:''}`;
  const mai=e.cat_maison?` <span class="hint">${esc((CATM[e.cat_maison]||CATM.autre).l)}</span>`:'';
  if(e.nature==='investissement')return BIENS.length?`<select data-i="${i}" data-k="bien" aria-label="Bien, ligne ${i+1}">${optsBiens(e.bien)}</select>${veh}${mai}`:'<span class="warn">aucun bien</span>';
  return '';
}
function pvRender(){
  const garde=(e,i)=>`<input type="checkbox" data-i="${i}" data-k="garder"${e.garder?' checked':''} aria-label="Garder la ligne ${i+1}">`;
  $('pvBody').innerHTML=parsed.map((e,i)=>e.type==='releve'?`<tr class="solde"><td>${dmy(e.date)}</td><td class="${e.solde<0?'warn':''}">${fmt(e.solde)}</td><td style="text-align:left;font-family:var(--f-body)">Solde noté</td><td colspan="2">${esc(nomCpt(e.compte))}</td><td style="text-align:left">${garde(e,i)}</td></tr>`
    :e.lier?`<tr><td>${dmy(e.date)}</td><td>${fmt(e.montant)}</td><td style="text-align:left;font-family:var(--f-body);white-space:normal">${esc(e.libelle)} <span class="hint">(« ${esc(e.note)} »)</span></td><td colspan="2" style="text-align:left;white-space:normal">Déjà dans votre journal : rattachée au compte ${esc(nomCpt(e.tiers))}</td><td style="text-align:left">${garde(e,i)}</td></tr>`
    :`<tr><td>${garde(e,i)} ${dmy(e.date)}</td><td>${fmt(e.montant)}</td><td style="text-align:left;font-family:var(--f-body);white-space:normal">${esc(e.libelle)}</td><td><select data-i="${i}" data-k="nature" aria-label="Nature, ligne ${i+1}">${optsNat(e.nature)}</select></td><td><select data-i="${i}" data-k="compte" aria-label="Compte, ligne ${i+1}">${optsComptes(e.compte)}</select></td><td style="text-align:left">${pvDetail(e,i)}${e.tiers?` <span class="hint">→ versé au compte ${esc(nomCpt(e.tiers))}${e.note?` (« ${esc(e.note)} »)`:''}</span>`:''}</td></tr>`).join('');
  const ops=parsed.filter(e=>e.garder&&!e.type&&!e.lier),n=parsed.filter(e=>e.garder).length,f=flux(ops);
  $('importBtn').textContent=`Importer ${n} ligne${n>1?'s':''}`;
  $('pvMsg').textContent=`Dépenses ${fmt(f.dep)} · entrées ${fmt(f.ent)} · investi ${fmt(f.inv)} · prêté ${fmt(f.pre)} ${U()}`;
}
$('parseBtn').onclick=()=>{
  const sv=SAISIE_K;SAISIE_K=$('pasteK').checked;   // unité des montants de ce collage
  try{parsed=parseList($('pasteText').value,$('fDate').value||today,$('pasteCpt').value).map(e=>({garder:true,...e}))}finally{SAISIE_K=sv}
  if(!parsed.length){$('pastePreview').hidden=true;status("Aucune ligne reconnue. Chaque ligne doit contenir un montant, par exemple « 10 vivres ».",true);return}
  status('');pvRender();$('pastePreview').hidden=false;
};
$('pvBody').addEventListener('change',ev=>{const s=ev.target.closest('[data-i]');if(!s)return;const e=parsed[+s.dataset.i],k=s.dataset.k;
  if(k==='garder'){e.garder=s.checked;pvRender();return}
  e[k]=k==='personne'?s.value.trim():s.value;
  if(k==='nature'){const g=guessOp(e.libelle);if(e.nature==='depense')e.categorie=e.categorie||g.categorie||guessCat(e.libelle);
    if(e.nature==='revenu')e.cat_revenu=e.cat_revenu||guessCatR(e.libelle);
    if(e.nature==='virement'&&(!e.vers||e.vers===e.compte))e.vers=COMPTES.find(c=>c.id!==e.compte).id;
    if((e.nature==='pret'||e.nature==='remboursement')&&!e.personne)e.personne=extrairePersonne(e.libelle);
    if(!(e.nature==='depense'||e.nature==='investissement'))e.vehicule='';
    e.cat_maison=e.nature==='investissement'&&BIEN[e.bien]&&BIEN[e.bien].maison?(e.cat_maison||guessCatM(e.libelle)):'';
    if(e.nature==='investissement'&&!e.bien&&BIENS.length)e.bien=g.bien||BIENS[0].id}
  if(k==='compte'&&e.nature==='virement'&&e.vers===e.compte)e.vers=COMPTES.find(c=>c.id!==e.compte).id;
  if(k!=='personne')pvRender()});
$('importBtn').onclick=async()=>{
  if(!ready||!parsed.length)return;
  const ops=parsed.filter(e=>e.garder&&!e.type&&!e.lier),liens=parsed.filter(e=>e.garder&&e.lier),soldes=parsed.filter(e=>e.garder&&e.type==='releve');
  if(!ops.length&&!liens.length&&!soldes.length){$('pvMsg').textContent='Aucune ligne gardée.';return}
  const manque=parsed.findIndex(e=>e.garder&&!e.type&&!e.lier&&((e.nature==='pret'||e.nature==='remboursement')&&!e.personne)||(e.nature==='investissement'&&!e.bien));
  if(manque>=0){$('pvMsg').textContent=`Ligne ${manque+1} : indiquez la personne ou le bien.`;return}
  $('importBtn').disabled=true;
  const base=Date.now();const docs=ops.map((e,i)=>docOp({...e,personne:e.personne?personneConnue(e.personne):'',cree:new Date(base+i).toISOString()}));
  try{if(docs.length)await api.addMany(docs);let msg=`${docs.length} opération${docs.length>1?'s':''} importée${docs.length>1?'s':''}.`;
    for(const e of liens){const o=all.find(x=>x.id===e.lier);if(o)await api.put(o.id,docOp({...o,tiers:e.tiers}))}
    for(const e of soldes)await api.releve(e.compte,e.date,e.solde);
    if(liens.length)msg+=` ${liens.length} dépense${liens.length>1?'s':''} de votre journal rattachée${liens.length>1?'s':''} au compte.`;
    if(soldes.length){msg+=` ${soldes.length} solde${soldes.length>1?'s':''} noté${soldes.length>1?'s':''}.`;await charger(true)}
    // une vidange d'huile avec kilométrage plus récent que le repère le met à jour
    for(const v of VEHS()){const vd=vidangeDe(v),vid=docs.filter(d=>d.vehicule===v.id&&d.km>vd.dernier&&isVidange({libelle:d.libelle})).sort((a,b)=>b.km-a.km)[0];if(!vid)continue;
      if(MODE_SYNC)msg+=` Vidange ${v.nom} à ${nb(vid.km)} km : le repère sera mis à jour à la synchronisation.`;
      else{await enregistrerVidange({...vd,dernier:vid.km,prochain:vid.km+vd.intervalle},v);await charger(true);msg+=` Vidange ${v.nom} à ${nb(vid.km)} km : prochaine à ${nb(vid.km+vd.intervalle)} km.`}}
    $('pvMsg').textContent=msg;$('pasteText').value='';$('pastePreview').hidden=true;
    if(docs.length){const [y,m]=docs[0].date.split('-').map(Number);cur={y,m:m-1}}parsed=[];fillSelects();render()}
  catch(e){$('pvMsg').textContent=`Import refusé : ${e.message}. Aucune ligne n'a été ajoutée.`}
  $('importBtn').disabled=false;
};

/* ================= postes et libellés ================= */
let draft=[], dirty=false;
const PALETTE=['#2f6fa8','#c58b2a','#c0533a','#2e8a57','#d9772f','#6b7b90','#2f97ad','#8a9a2e','#9363b0','#cc5f86','#4f8f8f','#a0522d'];
function statsPoste(id){const it=allP().filter(e=>e.nature==='depense'&&e.categorie===id);return {n:it.length,t:sum(it)}}
function openPostes(){
  draft=CATS.map(c=>({id:c.id,label:c.label,couleur:c.couleur,mots:c.mots.join(', '),budget:budgets[c.id]?versSaisie(budgets[c.id]):'',del:false,cible:'autre'}));
  dirty=false;renderDraft();
}
function renderDraft(){
  const live=draft.filter(d=>!d.del&&d.id);
  $('posteList').innerHTML=draft.map((d,i)=>{
    const st=d.id?statsPoste(d.id):{n:0,t:0};const isA=d.id==='autre';const last=draft.length-2;
    return `<div class="prow${d.del?' del':''}" data-i="${i}"${d.id?` data-id="${d.id}"`:''}>
      <input type="color" class="pcol" value="${d.couleur}" aria-label="Couleur du poste ${esc(d.label)}" ${d.del?'disabled':''}>
      <div class="pmain">
        <input class="pname" value="${esc(d.label)}" aria-label="Nom du poste" maxlength="60" ${d.del?'disabled':''}>
        ${isA?'<span class="hint">Lignes dont aucun mot-clé n\'est reconnu. Toujours en dernier.</span>':`<textarea class="pmots" rows="2" placeholder="mots-clés séparés par des virgules : riz, vivres, marché…" aria-label="Mots-clés de ${esc(d.label)}" ${d.del?'disabled':''}>${esc(d.mots)}</textarea>`}
        <span class="pcount">${d.id?`${st.n} ligne${st.n>1?'s':''} · ${fmtM(st.t)} ${U()}`:'nouveau poste'}</span>
      </div>
      <input class="pbud" inputmode="decimal" value="${esc(d.budget)}" placeholder="budget / mois" aria-label="Budget mensuel ${U_SAISIE()}" ${d.del?'disabled':''}>
      <div class="pact">${isA?'':`<button type="button" class="mini" data-a="up" aria-label="Monter" ${i===0||d.del?'disabled':''}>↑</button><button type="button" class="mini" data-a="down" aria-label="Descendre" ${i>=last||d.del?'disabled':''}>↓</button><button type="button" class="mini danger" data-a="del" aria-label="Supprimer le poste" ${d.del?'disabled':''}>✕</button>`}</div>
      ${d.del?`<div class="pdel">${st.n?`Ses ${st.n} lignes iront dans <select class="pcible" aria-label="Poste de destination">${live.map(x=>`<option value="${x.id}"${x.id===d.cible?' selected':''}>${esc(x.label)}</option>`).join('')}</select>`:'Poste supprimé à l\'enregistrement.'}<button type="button" class="btn ghost" data-a="undo">Annuler la suppression</button></div>`:''}
    </div>`}).join('');
  // en liste : couleur, nom, mots-clés, budget ; « Modifier » ouvre le poste (gardé ouvert si l'ordre change)
  $('posteList').querySelectorAll('.prow').forEach(r=>{const d=draft[+r.dataset.i];ficher(r,resumePoste,d.edit||!d.id||d.del)});
  fiches($('posteList'),resumePoste,'savePostes',openPostes);
}
function resumePoste(r){const d=draft[+r.dataset.i],st=d.id?statsPoste(d.id):{n:0,t:0},m=String(d.mots||'').trim();
  return `<i class="pdot" style="background:${d.couleur}" aria-hidden="true"></i><b>${esc(d.label)}</b> <span class="hint">${m?esc(m.length>70?m.slice(0,70)+'…':m)+' · ':''}${d.budget?`budget ${mtS(d.budget)}/mois · `:''}${st.n} ligne${st.n>1?'s':''}</span>`}
$('posteList').addEventListener('click',ev=>{const b=ev.target.closest('.fmod');if(b){const r=b.closest('.prow');if(r)draft[+r.dataset.i].edit=true}},true);
function touch(){const first=!dirty;dirty=true;$('posteMsg').textContent='Modifications non enregistrées.';if(first)renderLibs()}
$('posteList').addEventListener('input',ev=>{
  const row=ev.target.closest('.prow');if(!row)return;const d=draft[+row.dataset.i];
  if(ev.target.classList.contains('pname'))d.label=ev.target.value;
  else if(ev.target.classList.contains('pmots'))d.mots=ev.target.value;
  else if(ev.target.classList.contains('pbud'))d.budget=ev.target.value;
  else if(ev.target.classList.contains('pcol'))d.couleur=ev.target.value;
  touch();
});
$('posteList').addEventListener('change',ev=>{if(ev.target.classList.contains('pcible')){draft[+ev.target.closest('.prow').dataset.i].cible=ev.target.value;touch()}});
$('posteList').addEventListener('click',ev=>{
  const b=ev.target.closest('[data-a]');if(!b)return;const i=+b.closest('.prow').dataset.i;const a=b.dataset.a;
  if(a==='up'&&i>0)[draft[i-1],draft[i]]=[draft[i],draft[i-1]];
  if(a==='down'&&i<draft.length-2)[draft[i+1],draft[i]]=[draft[i],draft[i+1]];
  if(a==='del'){if(!draft[i].id){draft.splice(i,1)}else{draft[i].del=true;draft[i].cible='autre'}}
  if(a==='undo')draft[i].del=false;
  touch();renderDraft();
});
$('addPoste').onclick=()=>{
  const used=new Set(draft.map(d=>d.couleur));const c=PALETTE.find(x=>!used.has(x))||PALETTE[draft.length%PALETTE.length];
  draft.splice(draft.length-1,0,{id:null,label:'Nouveau poste',couleur:c,mots:'',budget:'',del:false});
  touch();renderDraft();const rows=$('posteList').querySelectorAll('.prow');const inp=rows[rows.length-2].querySelector('.pname');inp.focus();inp.select();
};
function slug(t){return normTxt(t).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'poste'}
function nouvelId(label,pris){let id=slug(label),k=2;while(pris.has(id))id=slug(label)+'-'+(k++);pris.add(id);return id}
$('savePostes').onclick=async()=>{
  const postes=[],deplacer={},budg={},ids=new Set(draft.filter(d=>d.id).map(d=>d.id)),noms=new Set();
  for(const d of draft){
    if(d.del){if(d.id)deplacer[d.id]=d.cible;continue}
    const label=d.label.trim();if(!label){$('posteMsg').textContent='Chaque poste doit avoir un nom.';return}
    if(noms.has(label.toLowerCase())){$('posteMsg').textContent=`Deux postes s'appellent « ${label} ».`;return}noms.add(label.toLowerCase());
    const id=d.id||nouvelId(label,ids);
    const mots=d.id==='autre'?[]:d.mots.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
    if(d.budget.trim()){const n=cfa(d.budget);if(!(n>0)){$('posteMsg').textContent=`Budget invalide pour « ${label} ».`;return}budg[id]=n}
    postes.push({id,label,couleur:d.couleur,mots});
  }
  $('savePostes').disabled=true;
  try{const r=await api.params({postes,budgets:budg,deplacer});dirty=false;await charger();
    $('posteMsg').textContent='Postes enregistrés'+(r.deplacees?` · ${r.deplacees} ligne${r.deplacees>1?'s':''} déplacée${r.deplacees>1?'s':''}`:'')+'.'}
  catch(e){$('posteMsg').textContent=e.message}
  $('savePostes').disabled=false;
};
let proposals=[];
$('checkRules').onclick=()=>{
  if(dirty){$('rulesBox').hidden=false;$('rulesBox').innerHTML='<span class="hint">Enregistrez d\'abord les postes modifiés.</span>';return}
  proposals=sorted(deps(all)).map(e=>({e,g:guessCat(e.libelle)})).filter(x=>x.g!=='autre'&&x.g!==x.e.categorie);
  $('rulesBox').hidden=false;
  if(!proposals.length){$('rulesBox').innerHTML='<span class="hint">Toutes les dépenses correspondent déjà aux mots-clés.</span>';return}
  $('rulesBox').innerHTML=`<div class="tbl"><table><thead><tr><th></th><th>Date</th><th>Libellé</th><th>Montant</th><th>Actuel</th><th>Proposé</th></tr></thead><tbody>${proposals.map((x,i)=>`<tr><td><input type="checkbox" id="rp${i}" checked aria-label="Déplacer ${esc(x.e.libelle)}"></td><td>${dmy(x.e.date)}</td><td style="text-align:left;font-family:var(--f-body)">${esc(x.e.libelle)}</td><td>${fmt(x.e.montant)}</td><td style="font-family:var(--f-body);text-align:left">${esc(CAT[x.e.categorie].label)}</td><td style="font-family:var(--f-body);text-align:left"><b>${esc(CAT[x.g].label)}</b></td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button class="btn" type="button" id="applyRules">Déplacer les lignes cochées</button><span class="muted" id="rulesMsg">${proposals.length} proposition${proposals.length>1?'s':''}</span></div>`;
  $('applyRules').onclick=async()=>{
    const ch=proposals.filter((x,i)=>$('rp'+i).checked).map(x=>({id:x.e.id,categorie:x.g}));
    if(!ch.length){$('rulesMsg').textContent='Aucune ligne cochée.';return}
    $('applyRules').disabled=true;
    try{const r=await api.reclasser(ch);await charger();$('rulesBox').innerHTML=`<span class="hint">${r.modifiees} ligne${r.modifiees>1?'s':''} déplacée${r.modifiees>1?'s':''}.</span>`}
    catch(e){$('rulesMsg').textContent=e.message;$('applyRules').disabled=false}
  };
};
function libGroups(){
  const g=new Map();
  for(const e of deps(all)){const k=normTxt(e.libelle);if(!k)continue;let x=g.get(k);if(!x){x={key:k,label:e.libelle.trim(),ids:[],total:0,cats:new Set()};g.set(k,x)}x.ids.push(e.id);x.total+=e.montant;x.cats.add(e.categorie)}
  return [...g.values()].sort((a,b)=>b.total-a.total);
}
let groups=[];
function renderLibs(){
  groups=libGroups();const q=normTxt($('libQ').value);
  const rows=groups.map((g,i)=>({g,i})).filter(({g})=>!q||g.key.includes(q)||[...g.cats].some(c=>normTxt(CAT[c]?.label).includes(q)));
  $('libTbl').innerHTML=`<thead><tr><th>Libellé</th><th>Lignes</th><th>Total</th><th>Poste</th></tr></thead><tbody>`+
    rows.map(({g,i})=>{const one=g.cats.size===1?[...g.cats][0]:'';const auto=one&&guessCat(g.label)===one;
      return `<tr><td>${esc(g.label)}${auto?'':' <span class="auto">· classé à la main</span>'}</td><td>${g.ids.length}</td><td>${fmtM(g.total)}</td><td><span class="libp">${one?esc((CAT[one]||{}).label||''):'Plusieurs postes'} <button type="button" class="linkbtn" data-libmod aria-label="Modifier le poste de ${esc(g.label)}">Modifier</button></span><select hidden data-g="${i}" aria-label="Poste de ${esc(g.label)}" ${dirty?'disabled':''}>${one?'':'<option value="" selected>Plusieurs postes</option>'}${CATS.map(c=>`<option value="${c.id}"${c.id===one?' selected':''}>${esc(c.label)}</option>`).join('')}</select></td></tr>`}).join('')+
    (rows.length?'':`<tr><td colspan="4" class="empty" style="text-align:center">Aucun libellé ne correspond.</td></tr>`)+'</tbody>';
}
$('libQ').addEventListener('input',renderLibs);
$('libTbl').addEventListener('click',ev=>{const b=ev.target.closest('[data-libmod]');if(!b)return;const td=b.closest('td'),s=td.querySelector('select');td.querySelector('.libp').hidden=true;s.hidden=false;s.focus()});
$('libTbl').addEventListener('change',async ev=>{
  const sel=ev.target.closest('select[data-g]');if(!sel||!sel.value)return;
  if(dirty){$('libMsg').textContent="Enregistrez d'abord les postes modifiés.";return}
  const g=groups[+sel.dataset.g];const cat=sel.value;sel.disabled=true;
  try{
    const r=await api.reclasser(g.ids.map(id=>({id,categorie:cat})));
    // retenir l'association : le libellé exact devient un mot-clé du poste choisi (et quitte les autres)
    let postes=CATS.map(c=>({...c,mots:c.mots.filter(m=>normTxt(m)!==g.key)}));
    if(guessCat(g.label,postes)!==cat)postes=postes.map(c=>c.id===cat?{...c,mots:[...c.mots,g.label.trim().toLowerCase()]}:c);
    await api.params({postes});
    await charger();
    $('libMsg').textContent=`« ${g.label} » → ${CAT[cat].label} : ${r.modifiees} ligne${r.modifiees>1?'s':''} déplacée${r.modifiees>1?'s':''}, association retenue.`;
  }catch(e){$('libMsg').textContent=e.message;sel.disabled=false}
});

/* ================= comptes et biens ================= */
let cbDirty=false;
function utilisesCpt(){const s=new Set();all.forEach(e=>{s.add(e.compte);if(e.vers)s.add(e.vers);if(e.tiers)s.add(e.tiers)});return s}
const finCorb=c=>addJ(c.supprime,DELAI_CORB);
function renderCorb(){
  $('cptCorb').innerHTML=CORB.length?`<h4 class="cbsec">Comptes supprimés <span class="hint">rétablissables ${DELAI_CORB} jours, puis effacés pour de bon avec leurs opérations</span></h4>`+
    CORB.map(c=>`<div class="corb"><span>${dotCpt(c.id)} <b>${esc(c.nom)}</b> <span class="hint">${esc(TYPES_CPT[c.type]||'')} · supprimé le ${dmy(c.supprime)} · rétablissable jusqu'au ${dmy(finCorb(c))}${OPS_CORB[c.id]?` · ${OPS_CORB[c.id]} opération${OPS_CORB[c.id]>1?'s':''} masquée${OPS_CORB[c.id]>1?'s':''}`:''}</span></span><button type="button" class="btn ghost small" data-retab="${c.id}">Rétablir</button></div>`).join(''):'';
}
function cptRow(c){const used=c.id==='especes';   // tout compte peut être supprimé (corbeille de 30 jours), sauf Espèces
  return `<div class="cbrow" data-id="${c.id||''}"><span class="cNomL"><input type="color" class="cCoul" value="${c.id?coulCpt(c.id):(c.couleur||'#6b7b90')}" aria-label="Couleur du compte"><input class="cNom" value="${esc(c.nom)}" aria-label="Nom du compte" maxlength="60"></span>
    <select class="cType" aria-label="Type">${Object.entries(TYPES_CPT).map(([k,v])=>`<option value="${k}"${k===c.type?' selected':''}>${v}</option>`).join('')}</select>
    <input class="cMots" value="${esc((c.mots||[]).join(', '))}" placeholder="mots-clés : banque, carte…" aria-label="Mots-clés">
    <span class="row" style="gap:4px;flex-wrap:nowrap"><input class="cTaux" inputmode="decimal" value="${c.taux!=null?String(c.taux).replace('.',','):''}" placeholder="taux %" aria-label="Taux d'intérêt en %" style="width:5.5em"><input class="cPer" inputmode="numeric" value="${c.taux!=null?(c.periode||12):''}" placeholder="mois" aria-label="Période en mois" style="width:4.5em"></span>
    <button type="button" class="mini danger" ${c.id?`data-supcpt="${c.id}"`:'data-x'} ${used?'disabled title="Le compte Espèces ne se supprime pas"':''} aria-label="Supprimer le compte ${esc(c.nom)}">✕</button>
    <div class="cTiers"${c.type==='tiers'?'':' hidden'}><input class="cTit" value="${esc(c.titulaire||'')}" placeholder="titulaire (frère, maison familiale…)" aria-label="Titulaire du compte" maxlength="60">
      <select class="cMor" aria-label="Personne physique ou morale"><option value="">Personne physique</option><option value="1"${c.morale?' selected':''}>Personne morale (famille, association…)</option></select>
      <input class="cMoi" value="${esc((c.moi||[]).join(', '))}" placeholder="votre nom dans ses notes : ali" aria-label="Votre nom dans les notes de ce compte">
      <input class="cContrib" value="${esc((c.contrib||[]).join(', '))}" placeholder="vos versements : contribution maison" aria-label="Libellés de vos dépenses versées à ce compte">
      <select class="cSourd" aria-label="Solde négatif (avance)"><option value="">Solde négatif : compté comme dette</option><option value="1"${c.sourdine?' selected':''}>Solde négatif : en sourdine</option></select></div></div>`}
function bienRow(b){const used=all.some(e=>e.nature==='investissement'&&e.bien===b.id);
  return `<div class="cbrow bien" data-id="${b.id||''}"><input class="bNom" value="${esc(b.nom)}" aria-label="Nom du bien" maxlength="60">
    <select class="bType" aria-label="Type"><option value="actif"${b.type==='actif'?' selected':''}>Actif</option><option value="passif"${b.type==='passif'?' selected':''}>Passif</option></select>
    <input type="date" class="bDate" value="${b.date_achat||''}" aria-label="Date d'achat">
    <input class="bPrix" inputmode="decimal" value="${b.prix_achat?versSaisie(b.prix_achat):''}" placeholder="prix ${U_SAISIE()}" aria-label="Prix d'achat ${U_SAISIE()}">
    <select class="bPoste" aria-label="Poste des frais d'usage"><option value="">— pas de frais d'usage —</option>${CATS.filter(c=>c.id!=='autre').map(c=>`<option value="${c.id}"${c.id===b.poste?' selected':''}>${esc(c.label)}</option>`).join('')}</select>
    <input class="bMots" value="${esc((b.mots||[]).join(', '))}" placeholder="mots-clés d'investissement" aria-label="Mots-clés d'investissement">
    <select class="bRole" aria-label="Rôle du bien"><option value="">Rôle : bien simple</option>${Object.entries(ENGINS).map(([k,l])=>`<option value="v:${k}"${b.vehicule&&(b.engin||'voiture')===k?' selected':''}>Engin : ${l.toLowerCase()} (Mes biens › Engins)</option>`).join('')}<option value="maison"${b.maison?' selected':''}>Maison, construction (Mes biens › Maison)</option></select>
    <button type="button" class="mini danger" data-x ${used?'disabled title="Bien avec investissements : impossible à supprimer"':''} aria-label="Supprimer le bien">✕</button></div>`}
function openCB(){$('cptEdit').innerHTML=COMPTES.filter(c=>c.type!=='tiers').map(cptRow).join('');$('cptEditT').innerHTML=COMPTES.filter(c=>c.type==='tiers').map(cptRow).join('');renderCorb();$('bienEdit').innerHTML=BIENS.map(bienRow).join('');cbDirty=false;
  fiches($('cptEdit'),resumeCpt,'saveCpt',openCB);fiches($('cptEditT'),resumeCpt,'saveCpt',openCB);fiches($('bienEdit'),resumeBien,'saveBien',openCB)}
function resumeCpt(r){const t=r.querySelector('.cType').value,tx=valIn(r,'.cTaux'),m=valIn(r,'.cMots');
  return `<i class="pdot" style="background:${r.querySelector('.cCoul').value}" aria-hidden="true"></i><b>${esc(valIn(r,'.cNom')||'Nouveau compte')}</b> <span class="hint">${esc(selTxt(r.querySelector('.cType')))}${t==='tiers'&&valIn(r,'.cTit')?` · ${esc(valIn(r,'.cTit'))}`:''}${m?` · ${esc(m)}`:''}${tx?` · ${esc(tx)} % tous les ${esc(valIn(r,'.cPer')||'12')} mois`:''}</span>`}
function resumeBien(r){const ro=r.querySelector('.bRole').value,p=valIn(r,'.bPrix'),d=valIn(r,'.bDate'),po=r.querySelector('.bPoste').value;
  return `<b>${esc(valIn(r,'.bNom')||'Nouveau bien')}</b> <span class="hint">${ro.startsWith('v:')?esc(ENGINS[ro.slice(2)]||'Engin'):ro==='maison'?'Maison':'Bien'} · ${esc(selTxt(r.querySelector('.bType')))}${d?` · acheté le ${dmy(d)}`:''}${p?` · ${mtS(p)}`:''}${po?` · frais : ${esc(selTxt(r.querySelector('.bPoste')))}`:''}</span>`}
$('cbBox').addEventListener('input',()=>{cbDirty=true});
$('cbBox').addEventListener('change',ev=>{if(ev.target.classList.contains('cType'))ev.target.closest('.cbrow').querySelector('.cTiers').hidden=ev.target.value!=='tiers'});
$('cbBox').addEventListener('click',ev=>{const b=ev.target.closest('[data-x]');if(b&&!b.disabled){const r=b.closest('.cbrow');retirerLigne(r,r.classList.contains('bien')?'Bien':'Compte',()=>{cbDirty=true})}});
$('addCpt').onclick=()=>{$('cptEdit').insertAdjacentHTML('beforeend',cptRow({id:'',nom:'',type:'mobile',mots:[]}));ficher($('cptEdit').lastElementChild,resumeCpt,true);cbDirty=true;$('cptEdit').lastElementChild.querySelector('.cNom').focus()};
$('addCptT').onclick=()=>{$('cptEditT').insertAdjacentHTML('beforeend',cptRow({id:'',nom:'',type:'tiers',mots:[]}));ficher($('cptEditT').lastElementChild,resumeCpt,true);cbDirty=true;$('cptEditT').lastElementChild.querySelector('.cNom').focus()};
/* supprimer un compte enregistré : en deux temps, puis dans la corbeille (masqué avec ses opérations, rétablissable 30 jours) */
$('cbBox').addEventListener('click',async ev=>{const b=ev.target.closest('[data-supcpt],[data-retab]');if(!b||b.disabled)return;
  if(cbDirty){$('cptMsg').textContent="Enregistrez d'abord vos modifications des comptes.";return}
  if(b.dataset.supcpt){const c=CPT[b.dataset.supcpt];if(!c)return;
    if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Supprimer ?';b.setAttribute('aria-label',`Confirmer la suppression de ${c.nom}`);return}
    b.disabled=true;try{await api.params({comptes:TOUS.map(x=>x.id!==c.id?x:{...x,supprime:today})});await charger(true);
      $('cptMsg').textContent=`« ${c.nom} » supprimé : rétablissable jusqu'au ${dmy(addJ(today,DELAI_CORB))} (Comptes supprimés, ci-dessous).`}
    catch(e){$('cptMsg').textContent=e.message;b.disabled=false}return}
  const c=CPT[b.dataset.retab];if(!c)return;b.disabled=true;
  try{await api.params({comptes:TOUS.map(x=>{if(x.id!==c.id)return x;const y={...x};delete y.supprime;return y})});await charger(true);$('cptMsg').textContent=`« ${c.nom} » rétabli, avec ses opérations.`}
  catch(e){$('cptMsg').textContent=e.message;b.disabled=false}});
$('addBien').onclick=()=>{$('bienEdit').insertAdjacentHTML('beforeend',bienRow({id:'',nom:'',type:'actif',mots:[]}));ficher($('bienEdit').lastElementChild,resumeBien,true);cbDirty=true;$('bienEdit').lastElementChild.querySelector('.bNom').focus()};
const listeMots=s=>s.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
$('saveCpt').onclick=async()=>{
  const pris=new Set(TOUS.map(c=>c.id)),out=[];
  for(const r of [...$('cptEdit').querySelectorAll('.cbrow'),...$('cptEditT').querySelectorAll('.cbrow')]){
    const nom=r.querySelector('.cNom').value.trim();if(!nom){$('cptMsg').textContent='Chaque compte doit avoir un nom.';return}
    const old=CPT[r.dataset.id];const c={id:old?old.id:nouvelId(nom,pris),nom,couleur:r.querySelector('.cCoul').value,type:r.querySelector('.cType').value,mots:listeMots(r.querySelector('.cMots').value),releves:old?old.releves:[]};
    if(c.type==='tiers')Object.assign(c,{titulaire:r.querySelector('.cTit').value.trim()||nom,morale:!!r.querySelector('.cMor').value,moi:listeMots(r.querySelector('.cMoi').value),contrib:listeMots(r.querySelector('.cContrib').value),sourdine:!!r.querySelector('.cSourd').value});
    const t=r.querySelector('.cTaux').value.trim();if(t){const v=num(t);if(!(v>=0)){$('cptMsg').textContent=`Taux invalide pour « ${nom} ».`;return}c.taux=v;c.periode=Math.max(1,Math.round(num(r.querySelector('.cPer').value)||12))}
    out.push(c);
  }
  $('saveCpt').disabled=true;
  try{await api.params({comptes:out.concat(CORB)});cbDirty=false;await charger();$('cptMsg').textContent='Comptes enregistrés.'}catch(e){$('cptMsg').textContent=e.message}
  $('saveCpt').disabled=false;
};
$('saveBien').onclick=async()=>{
  const pris=new Set(BIENS.map(b=>b.id)),out=[];
  for(const r of $('bienEdit').querySelectorAll('.cbrow')){
    const nom=r.querySelector('.bNom').value.trim();if(!nom){$('bienMsg').textContent='Chaque bien doit avoir un nom.';return}
    const p=r.querySelector('.bPrix').value.trim(),prix=p?montantSaisi(p):0;if(!isFinite(prix)){$('bienMsg').textContent=`Prix invalide pour « ${nom} ».`;return}
    const old=BIEN[r.dataset.id];
    out.push({id:old?old.id:nouvelId(nom,pris),nom,type:r.querySelector('.bType').value,date_achat:r.querySelector('.bDate').value,prix_achat:prix,
      poste:r.querySelector('.bPoste').value,mots:listeMots(r.querySelector('.bMots').value),estimations:old?old.estimations:[],...(old&&old.projet?{projet:old.projet}:{}),
      ...(()=>{const ro=r.querySelector('.bRole').value;
        if(ro.startsWith('v:'))return {vehicule:true,engin:ro.slice(2),vidange:(old&&old.vidange)||{intervalle:INTERVALLE_DEFAUT(ro.slice(2)),dernier:0,prochain:0}};
        if(ro==='maison')return {maison:true,projet:(old&&old.projet)||{budget:0,echeance:'',note:''}};return {}})()});
  }
  $('saveBien').disabled=true;
  try{await api.params({biens:out});cbDirty=false;await charger();$('bienMsg').textContent='Biens enregistrés.'}catch(e){$('bienMsg').textContent=e.message}
  $('saveBien').disabled=false;
};

/* messages de résultat annoncés par les lecteurs d'écran */
['addMsg','pvMsg','posteMsg','libMsg','cptMsg','bienMsg','parMsg'].forEach(i=>$(i).setAttribute('aria-live','polite'));

/* ================= devises ================= */
function setDevises(l){
  DEVISES=(Array.isArray(l)&&l.length?l:DEVISES_DEFAUT).map(x=>({code:x.code,nom:x.nom,symbole:x.symbole,taux:x.code==='XAF'?1:+x.taux,maj:x.maj||''}));
  if(!DEVISES.some(d=>d.code==='XAF'))DEVISES.unshift(DEVISES_DEFAUT[0]);
  const voulu=lsGet('devise')||DEV.code;DEV=DEVISES.find(d=>d.code===voulu)||DEVISES[0];
  $('devise').innerHTML=DEVISES.map(d=>`<option value="${d.code}" title="${esc(d.nom)}"${d.code===DEV.code?' selected':''}>${esc(d.symbole)}</option>`).join('');
  majDevNote();if(!devDirty)openParites();
}
function majDevNote(){
  const n=$('devNote');n.hidden=DEV.code==='XAF';
  if(DEV.code!=='XAF')n.textContent=`Montants affichés en ${DEV.nom.toLowerCase()} (1 ${DEV.symbole} = ${fmt1(DEV.taux).replace(/,0$/,'')} FCFA${DEV.maj?`, parité du ${dmy(DEV.maj)}`:''}). La saisie reste en francs CFA.`;
}
$('devise').onchange=()=>{DEV=DEVISES.find(d=>d.code===$('devise').value)||DEVISES[0];lsSet('devise',DEV.code);majDevNote();render();renderDraft();renderLibs()};  // render() redessine aussi les statistiques
let devDirty=false;
const parRow=d=>{const ref=d.code==='XAF';return `<div class="parrow" data-code="${esc(d.code||'')}">
  <input class="dCode" value="${esc(d.code||'')}" maxlength="3" placeholder="USD" aria-label="Code ISO" ${ref?'disabled':''} style="text-transform:uppercase">
  <input class="dNom" value="${esc(d.nom||'')}" maxlength="40" placeholder="Nom" aria-label="Nom de la devise">
  <input class="dSym" value="${esc(d.symbole||'')}" maxlength="6" placeholder="$" aria-label="Symbole">
  <input class="dTaux" inputmode="decimal" value="${ref?'1':d.taux?String(d.taux).replace('.',','):''}" placeholder="FCFA pour 1 unité" aria-label="Francs CFA pour une unité" ${ref?'disabled':''}>
  ${ref?'<span class="hint">référence</span>':`<input type="date" class="dMaj" value="${d.maj||''}" aria-label="Date de la parité">`}
  <button type="button" class="mini danger" data-x ${ref?'disabled title="Devise de référence"':''} aria-label="Supprimer la devise">✕</button></div>`};
function openParites(){$('parList').innerHTML=DEVISES.map(parRow).join('');devDirty=false}

$('parList').addEventListener('input',ev=>{devDirty=true;if(ev.target.classList.contains('dTaux')){const r=ev.target.closest('.parrow').querySelector('.dMaj');if(r)r.value=today}});
$('parList').addEventListener('click',ev=>{const b=ev.target.closest('[data-x]');if(b&&!b.disabled){retirerLigne(b.closest('.parrow'),'Devise',()=>{devDirty=true},true)}});
$('addDev').onclick=()=>{$('parList').insertAdjacentHTML('beforeend',parRow({code:'',nom:'',symbole:'',taux:'',maj:today}));devDirty=true;$('parList').lastElementChild.querySelector('.dCode').focus()};
$('saveDev').onclick=async()=>{
  const out=[];
  for(const r of $('parList').querySelectorAll('.parrow')){
    const code=r.querySelector('.dCode').value.trim().toUpperCase();
    if(!/^[A-Z]{3}$/.test(code)){$('parMsg').textContent='Code de devise : 3 lettres (USD, EUR, CNY…).';return}
    const taux=code==='XAF'?1:num(r.querySelector('.dTaux').value);
    if(!(taux>0)){$('parMsg').textContent=`Parité invalide pour ${code}.`;return}
    out.push({code,nom:r.querySelector('.dNom').value.trim()||code,symbole:r.querySelector('.dSym').value.trim()||code,taux,maj:(r.querySelector('.dMaj')||{}).value||''});
  }
  $('saveDev').disabled=true;
  try{await api.params({devises:out});devDirty=false;await charger();$('parMsg').textContent='Parités enregistrées.'}catch(e){$('parMsg').textContent=e.message}
  $('saveDev').disabled=false;
};
setDevises(null);

