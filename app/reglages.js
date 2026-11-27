/* Daftar — relevés bancaires, opérations programmées, événements et types de revenus, retour en arrière, sauvegarde.
   Un des six scripts de la page (app/index.html), chargés DANS L'ORDRE : noyau, vues, saisie, stats, reglages,
   demarrage. Scripts classiques (pas de modules) : leurs déclarations de premier niveau sont communes. Un script ne
   doit donc, en s'exécutant, appeler que ce qui est déclaré dans lui-même ou dans les précédents ; le démarrage
   (premier affichage) est dans demarrage.js, chargé en dernier. */
/* ================= relevé bancaire : lecture, comparaison avec le carnet, ajouts et corrections à valider ================= */
let REL=null;   // {r: relevé lu, cpt, depuis, groupes, ok, corr, ajout, absents}
const TOL_J=5;  // écart de date toléré entre le relevé et le carnet (jours)
const ecartJ=(a,b)=>Math.abs(nbJ(a,b)-1);
function devinerCompteReleve(texte){const T=normTxt(texte);
  const c=COMPTES.filter(c=>c.id!=='especes').find(c=>[c.nom,...c.mots].some(m=>{const k=normTxt(m);return k.length>2&&T.includes(k)}));
  return (c||COMPTES.find(c=>c.type==='courant')||COMPTES[0]).id}
/* vocabulaire des banques → mots compris par la reconnaissance de Daftar */
function libelleLisible(lib){return String(lib).replace(/\bRET ?DAB\b|\bRETDAB\b/i,'retrait DAB').replace(/\bFACTURATIO ?PACKAGE\b/i,'facturation package')
  .replace(/\bVIRT? RECU\b/i,'virement reçu').replace(/\bVIR ?EXT ?MO\b/i,'virement').replace(/\bPHCIE\b/i,'pharmacie').replace(/\bPMT\b/i,'paiement carte').replace(/\s+/g,' ').trim()}
function proposition(g,cid){
  const lib=libelleLisible(g.libelle),L=normTxt(lib),base={date:g.date,montant:g.montant,libelle:lib,compte:cid,cree:''};
  if(g.sens==='credit'){const gr=guessOp(lib);return {...base,nature:'revenu',cat_revenu:gr.cat_revenu||guessCatR(lib),evenement:''}}
  if(hasWord(L,'retrait')&&!hasWord(L,'frais'))return {...base,nature:'virement',vers:'especes'};
  const go=guessOp(lib+' '+nomCpt(cid));
  if(go.nature==='virement'&&go.vers&&go.vers!==cid)return {...base,nature:'virement',vers:go.vers};
  // frais fixes : rattachés à l'opération programmée de même montant, sur ce compte, si une échéance est proche
  const pr=PROGS.find(p=>p.compte===cid&&p.mode==='fixe'&&p.montant===g.montant&&echeances(p,addJ(g.date,TOL_J)).some(d=>ecartJ(d,g.date)<=TOL_J));
  if(pr){const d=echeances(pr,addJ(g.date,TOL_J)).filter(d=>ecartJ(d,g.date)<=TOL_J).pop();return {...base,libelle:pr.libelle,nature:'depense',categorie:pr.categorie||'autre',prog:pr.id,prog_date:d}}
  return {...base,nature:'depense',categorie:guessCat(lib)}
}
function comparerReleve(r,cid,depuis){
  const au=r.au||today,lignes=r.lignes.filter(l=>l.date>=depuis&&l.date<=au);
  // une carte débite souvent deux lignes (montant + commission) même jour, même libellé : on les regroupe
  const groupes=[];for(const l of lignes){const g=groupes.find(x=>x.date===l.date&&x.libelle===l.libelle&&x.sens===l.sens);
    if(g){g.montant+=l.montant;g.parts.push(l.montant)}else groupes.push({...l,parts:[l.montant]})}
  const sg=g=>g.sens==='credit'?1:-1;
  const carnet=all.filter(e=>e.date>=addJ(depuis,-TOL_J)&&e.date<=addJ(au,TOL_J)&&effet(e,cid)!==0);
  const pris=new Set(),ok=[],corr=[],ajout=[];
  const chercher=(g,montant,tol)=>carnet.filter(e=>!pris.has(e.id)&&Math.sign(effet(e,cid))===sg(g)&&ecartJ(e.date,g.date)<=tol&&(montant?Math.abs(e.montant)===montant:true))
    .sort((a,b)=>ecartJ(a.date,g.date)-ecartJ(b.date,g.date));
  const reste=[];
  for(const g of groupes){   // 1) montant exact (le groupe, sinon une de ses lignes seule)
    let e=chercher(g,g.montant,TOL_J)[0];
    if(!e&&g.parts.length>1)e=g.parts.map(m=>chercher(g,m,TOL_J)[0]).find(Boolean);
    if(e){pris.add(e.id);ok.push({g,e})}else reste.push(g)}
  for(const g of reste){   // 2) montant voisin (±15 %) et date proche : correction proposée
    const e=chercher(g,0,TOL_J).filter(e=>Math.abs(e.montant-g.montant)<=.15*g.montant)[0];
    if(e){pris.add(e.id);corr.push({g,e,choix:true})}else ajout.push({g,p:proposition(g,cid),choix:true})}
  const absents=carnet.filter(e=>!pris.has(e.id)&&e.date>=depuis&&e.date<=au);
  return {r,cpt:cid,depuis,groupes,ok,corr,ajout,absents,solde:r.solde!=null?{date:r.au||today,solde:r.solde,choix:true}:null};
}
function detailProp(p,i){
  if(p.nature==='depense')return `<select data-a="${i}" data-k="categorie" aria-label="Poste">${optsPostes(p.categorie)}</select>`;
  if(p.nature==='virement')return `→ <select data-a="${i}" data-k="vers" aria-label="Vers le compte">${optsComptes(p.vers,p.compte)}</select>`;
  if(p.nature==='revenu')return `<select data-a="${i}" data-k="cat_revenu" aria-label="Type de revenu">${REVENUS.map(r=>`<option value="${r.id}"${r.id===p.cat_revenu?' selected':''}>${esc(r.label)}</option>`).join('')}</select>`;
  return '';
}
function renderReleve(){
  const R=REL;if(!R){$('relRes').innerHTML='';$('relActions').hidden=true;return}
  const mt=(g)=>`<span class="rmt${g.sens==='credit'?' in':''}">${g.sens==='credit'?'+':'−'}${fmtC(g.montant)}</span>`;
  const avant=R.r.lignes.filter(l=>l.date<R.depuis).length;
  let h=`<p class="hint">${R.r.source==='ocr'?'Lu par OCR (vérifiez bien les montants) · ':''}Relevé du ${dmy(R.r.du)} au ${dmy(R.r.au)} · ${R.r.lignes.length} lignes${avant?` (dont ${avant} avant le ${dmy(R.depuis)}, non comparées)`:''} · compte ${esc(nomCpt(R.cpt))}.</p>`;
  if(R.solde){const s=etatCompte(CPT[R.cpt]),att=soldeAu(CPT[R.cpt],R.solde.date);
    h+=`<div class="relrow"><input type="checkbox" data-s ${R.solde.choix?'checked':''} aria-label="Noter le solde"><span>Noter le solde du relevé : <b>${fmtC(R.solde.solde)} FCFA</b> au ${dmy(R.solde.date)}</span><span class="rinfo">Solde calculé par Daftar à cette date : ${fmtC(att)} FCFA${att!==R.solde.solde?` · écart ${sgnM(R.solde.solde-att)} (lignes manquantes ou en trop)`:' · identique'}</span></div>`}
  h+=`<h4 class="relsec">➕ À ajouter au carnet (${R.ajout.length})</h4>`+(R.ajout.length?R.ajout.map((x,i)=>`<div class="relrow"><input type="checkbox" data-c="${i}" ${x.choix?'checked':''} aria-label="Ajouter"><span>${dmy(x.g.date)}</span>${mt(x.g)}
    <input class="rlib" data-a="${i}" data-k="libelle" value="${esc(x.p.libelle)}" aria-label="Libellé"><select data-a="${i}" data-k="nature" aria-label="Nature">${optsNat(x.p.nature)}</select>${detailProp(x.p,i)}
    <span class="rinfo">Relevé : ${esc(x.g.libelle)}${x.g.parts.length>1?` · ${x.g.parts.map(fmtC).join(' + ')} (montant + frais)`:''}${x.p.prog?' · rattachée à l\'opération programmée':''}</span></div>`).join(''):'<p class="hint">Aucune.</p>');
  h+=`<h4 class="relsec">✎ À corriger dans le carnet (${R.corr.length})</h4>`+(R.corr.length?R.corr.map((x,i)=>`<div class="relrow"><input type="checkbox" data-k2="${i}" ${x.choix?'checked':''} aria-label="Corriger"><span>${esc(x.e.libelle)}</span>
    <span class="rinfo">Carnet : ${dmy(x.e.date)} · ${fmtC(x.e.montant)} FCFA → relevé : ${dmy(x.g.date)} · <b>${fmtC(x.g.montant)} FCFA</b> (${esc(x.g.libelle)})</span></div>`).join(''):'<p class="hint">Aucune.</p>');
  h+=`<h4 class="relsec">⚠ Dans le carnet mais pas dans le relevé (${R.absents.length})</h4>`+(R.absents.length?`<p class="hint">À vérifier : ligne notée sur le mauvais compte, en double, ou pas encore passée en banque. Rien n'est modifié.</p>`+R.absents.map(e=>`<div class="relrow"><span>${dmy(e.date)}</span><span class="rmt">${fmtC(e.montant)}</span><span>${esc(e.libelle)}</span></div>`).join(''):'<p class="hint">Aucune.</p>');
  h+=`<details><summary class="hint">✓ Déjà dans le carnet (${R.ok.length})</summary>${R.ok.map(x=>`<div class="relrow"><span>${dmy(x.g.date)}</span>${mt(x.g)}<span>${esc(x.g.libelle)}</span><span class="rinfo">= ${esc(x.e.libelle)} du ${dmy(x.e.date)}</span></div>`).join('')}</details>`;
  $('relRes').innerHTML=h;$('relActions').hidden=!(R.ajout.length||R.corr.length||R.solde);
}
function initReleve(){const v=$('relCpt').value;$('relCpt').innerHTML=optsComptes(v||devinerCompteReleve(''));if(!$('relDepuis').value)$('relDepuis').value=DEBUT_SUIVI||''}
let relLu=null;
$('relFichier').onchange=async ev=>{const f=ev.target.files[0];REL=null;renderReleve();if(!f)return;
  $('relMsg').textContent='Lecture du relevé…';
  try{relLu=await window.AppYaReleve.lire(f,p=>{$('relMsg').textContent=`Lecture du texte (OCR) : ${Math.round(p*100)} %`});
    if(!relLu.lignes.length){$('relMsg').textContent="Aucune opération reconnue dans ce fichier.";return}
    $('relCpt').innerHTML=optsComptes(devinerCompteReleve(relLu.texte));
    $('relDepuis').value=[relLu.du,DEBUT_SUIVI].filter(Boolean).sort().pop()||relLu.du;
    $('relMsg').textContent=`${relLu.lignes.length} opérations lues (${dmy(relLu.du)} → ${dmy(relLu.au)}). Vérifiez le compte, puis « Analyser ».`}
  catch(e){$('relMsg').textContent='Lecture impossible : '+(e.message||e)}};
$('relGo').onclick=()=>{if(!relLu){$('relMsg').textContent="Choisissez d'abord le fichier du relevé.";return}
  REL=comparerReleve(relLu,$('relCpt').value,$('relDepuis').value||relLu.du);renderReleve();
  $('relMsg').textContent=`${REL.ok.length} déjà notées · ${REL.corr.length} à corriger · ${REL.ajout.length} à ajouter · ${REL.absents.length} à vérifier.`};
$('relRes').addEventListener('change',ev=>{const t=ev.target;if(!REL)return;
  if(t.dataset.s!==undefined){REL.solde.choix=t.checked;return}
  if(t.dataset.c!==undefined){REL.ajout[+t.dataset.c].choix=t.checked;return}
  if(t.dataset.k2!==undefined){REL.corr[+t.dataset.k2].choix=t.checked;return}
  if(t.dataset.a!==undefined){const x=REL.ajout[+t.dataset.a],k=t.dataset.k;x.p[k]=t.value;
    if(k==='nature'){if(x.p.nature==='virement'&&!x.p.vers)x.p.vers='especes';if(x.p.nature==='depense'&&!x.p.categorie)x.p.categorie=guessCat(x.p.libelle);if(x.p.nature==='revenu'&&!x.p.cat_revenu)x.p.cat_revenu=guessCatR(x.p.libelle);
      if(['pret','remboursement','investissement'].includes(x.p.nature)){x.p.nature='depense';$('relMsg2').textContent='Prêts et investissements : ajoutez-les par « Une opération ».'}renderReleve()}}});
$('relRes').addEventListener('input',ev=>{const t=ev.target;if(REL&&t.dataset.a!==undefined&&t.dataset.k==='libelle')REL.ajout[+t.dataset.a].p.libelle=t.value});
$('relAppliquer').onclick=async()=>{const R=REL;if(!R)return;
  const aj=R.ajout.filter(x=>x.choix),co=R.corr.filter(x=>x.choix),so=R.solde&&R.solde.choix?R.solde:null;
  if(!aj.length&&!co.length&&!so){$('relMsg2').textContent='Rien de coché.';return}
  const lignes=[];if(aj.length)lignes.push(['Ajouts',`${aj.length} opération${aj.length>1?'s':''} · ${fmtC(sum(aj.map(x=>x.g)))} FCFA`]);
  if(co.length)lignes.push(['Corrections',co.map(x=>`${x.e.libelle} : ${fmtC(x.e.montant)} → ${fmtC(x.g.montant)}`).join(' ; ')]);
  if(so)lignes.push(['Solde noté',`${fmtC(so.solde)} FCFA au ${dmy(so.date)} (${nomCpt(R.cpt)})`]);
  if(!await dialogue('Appliquer le relevé au carnet ?',lignes,'Les opérations ajoutées portent la remarque « relevé ».'))return;
  $('relAppliquer').disabled=true;
  try{const base=Date.now();
    if(aj.length)await api.addMany(aj.map((x,i)=>docOp({...x.p,remarque:'relevé '+nomCpt(R.cpt),cree:new Date(base+i).toISOString()})));
    for(const x of co){const e=x.e;await api.put(e.id,docOp({...e,date:x.g.date,montant:x.g.montant,remarque:(e.remarque?e.remarque+' · ':'')+'corrigé d\'après le relevé'}))}
    if(so)await api.releve(R.cpt,so.date,so.solde);
    await charger();REL=comparerReleve(relLu,R.cpt,R.depuis);renderReleve();
    $('relMsg2').textContent=`Fait : ${aj.length} ajout${aj.length>1?'s':''}, ${co.length} correction${co.length>1?'s':''}${so?', solde noté':''}.`}
  catch(e){$('relMsg2').textContent=e.message}
  $('relAppliquer').disabled=false;
};

/* ================= opérations programmées : échéances à confirmer ================= */
const finMois=(y,m)=>new Date(y,m+1,0).getDate();
function echeances(p,jusqua){
  const out=[];if(!p.actif||!p.debut)return out;let y=+p.debut.slice(0,4),m=+p.debut.slice(5,7)-1;
  for(let k=0;k<400;k++){const d=iso(new Date(y,m,Math.min(p.jour,finMois(y,m))));if(d>jusqua||(p.fin&&d>p.fin))break;if(d>=p.debut)out.push(d);m+=p.periode;y+=Math.floor(m/12);m%=12}
  return out;
}
function prochaineEcheance(p){const l=echeances(p,iso(new Date(new Date().getFullYear()+2,0,1)));return l.find(d=>d>today)||''}
function soldeAu(c,date){const rel=[...(c.releves||[])].filter(r=>r.date<=date).sort((a,b)=>a.date<b.date?-1:1).pop(),d0=rel?rel.date:'';
  return (rel?rel.solde:0)+all.filter(e=>apresReleve(e,rel)&&e.date<=date).reduce((s,e)=>s+effet(e,c.id),0)}
function montantProg(p,date){if(p.mode!=='interets')return p.montant;const c=CPT[p.compte];if(!c||c.taux==null)return 0;return Math.max(0,Math.round(soldeAu(c,date)*c.taux/100))}
function aConfirmer(){const faites=new Set(all.filter(e=>e.prog).map(e=>e.prog+'|'+e.prog_date));
  return PROGS.flatMap(p=>echeances(p,today).filter(d=>!faites.has(p.id+'|'+d)&&!p.ignorees.includes(d)).map(d=>({p,date:d,montant:montantProg(p,d)})))}
function majBandeauProg(){const l=ready?aConfirmer():[];$('progBandeau').hidden=!l.length;if(!l.length)return;
  $('progN').textContent=`${l.length} opération${l.length>1?'s':''} programmée${l.length>1?'s':''} à confirmer`;
  const noms=[...new Set(l.map(x=>x.p.libelle))];$('progDet').textContent=noms.slice(0,3).join(' · ')+(noms.length>3?' …':'')}
let progListe=[];
function ouvrirProg(){
  progListe=aConfirmer().sort((a,b)=>a.date<b.date?-1:1);if(!progListe.length)return;
  $('dlgProgList').innerHTML=progListe.map((x,i)=>`<div class="pgrow"><input type="checkbox" checked data-i="${i}" aria-label="Retenir ${esc(x.p.libelle)} du ${dmy(x.date)}">
    <span class="pgl">${esc(x.p.libelle)} <span class="hint">${NAT[x.p.nature].l.toLowerCase()} · ${esc(nomCpt(x.p.compte))} · échéance du ${dmy(x.date)}${x.p.mode==='interets'?' · intérêts calculés : solde × '+String(CPT[x.p.compte]?.taux).replace('.',',')+' %':''}</span></span>
    <span class="pgf"><input type="date" value="${x.date}" data-d="${i}" aria-label="Date"><input inputmode="numeric" value="${x.montant||''}" data-m="${i}" aria-label="Montant en FCFA" placeholder="montant FCFA"></span></div>`).join('');
  $('dlgProgMsg').textContent='';$('dlgProg').showModal();
}
function progCoches(){return progListe.map((x,i)=>({...x,ok:$('dlgProgList').querySelector(`[data-i="${i}"]`).checked,d:$('dlgProgList').querySelector(`[data-d="${i}"]`).value,m:Math.round(num($('dlgProgList').querySelector(`[data-m="${i}"]`).value))})).filter(x=>x.ok)}
$('progVoir').onclick=ouvrirProg;
$('dlgProgNon').onclick=()=>$('dlgProg').close();
$('dlgProgOk').onclick=async()=>{
  const l=progCoches();if(!l.length){$('dlgProgMsg').textContent='Rien de coché.';return}
  const bad=l.find(x=>!(x.m>0)||!/^\d{4}-\d{2}-\d{2}$/.test(x.d));if(bad){$('dlgProgMsg').textContent=`Montant ou date invalide : ${bad.p.libelle} du ${dmy(bad.date)}.`;return}
  const base=Date.now();
  const docs=l.map((x,i)=>docOp({date:x.d,montant:x.m,libelle:x.p.libelle,nature:x.p.nature,compte:x.p.compte,categorie:x.p.categorie||'autre',cat_revenu:x.p.cat_revenu,prog:x.p.id,prog_date:x.date,cree:new Date(base+i).toISOString()}));
  try{await api.addMany(docs);$('dlgProg').close();status(`${docs.length} opération${docs.length>1?'s':''} programmée${docs.length>1?'s':''} enregistrée${docs.length>1?'s':''}.`);render()}
  catch(e){$('dlgProgMsg').textContent=e.message}
};
$('dlgProgIgn').onclick=async()=>{
  const l=progCoches();if(!l.length){$('dlgProgMsg').textContent='Rien de coché.';return}
  const ign={};l.forEach(x=>(ign[x.p.id]=ign[x.p.id]||[]).push(x.date));
  try{await api.params({programmees:PROGS.map(p=>({...p,ignorees:p.ignorees.concat(ign[p.id]||[])}))});await charger();$('dlgProg').close();status(`${l.length} échéance${l.length>1?'s':''} ignorée${l.length>1?'s':''}.`)}
  catch(e){$('dlgProgMsg').textContent=e.message}
};

/* réglage des opérations programmées */
let progDirty=false;
function progRow(p){
  const cls=p.nature==='revenu'?REVENUS.map(r=>`<option value="${r.id}"${r.id===p.cat_revenu?' selected':''}>${esc(r.label)}</option>`).join(''):optsPostes(p.categorie||'autre');
  const nx=prochaineEcheance(p);
  return `<div class="evrow" data-id="${p.id||''}" data-ign="${esc(JSON.stringify(p.ignorees||[]))}"><input class="pLib" value="${esc(p.libelle||'')}" placeholder="Frais de tenue de compte…" aria-label="Libellé" maxlength="200" style="flex:3 1 16em;font-weight:600">
    <select class="pNat" aria-label="Nature"><option value="depense"${p.nature!=='revenu'?' selected':''}>Dépense</option><option value="revenu"${p.nature==='revenu'?' selected':''}>Revenu</option></select>
    <select class="pMode" aria-label="Montant"><option value="fixe"${p.mode!=='interets'?' selected':''}>montant fixe</option><option value="interets"${p.mode==='interets'?' selected':''}>intérêts du compte</option></select>
    ${p.mode==='interets'?'<span class="hint">montant calculé à chaque échéance</span>':`<input class="pMt" inputmode="numeric" value="${p.montant||''}" placeholder="montant FCFA" aria-label="Montant en FCFA" style="flex:0 1 8em">`}
    <select class="pCpt" aria-label="Compte">${optsComptes(p.compte||'especes')}</select>
    <select class="pCls" aria-label="${p.nature==='revenu'?'Type de revenu':'Poste'}">${cls}</select>
    <select class="pPer" aria-label="Périodicité">${Object.entries(PERIODES).map(([k,v])=>`<option value="${k}"${+k===+(p.periode||1)?' selected':''}>${v}</option>`).join('')}</select>
    <label class="chk">le <input class="pJour" inputmode="numeric" value="${p.jour||1}" aria-label="Jour du mois" style="width:3.5em;flex:0 0 3.5em"></label>
    <label class="chk">à partir du <input type="date" class="pDeb" value="${p.debut||today}" aria-label="Début"></label>
    <label class="chk">jusqu'au <input type="date" class="pFin" value="${p.fin||''}" aria-label="Fin (facultatif)"></label>
    <label class="chk"><input type="checkbox" class="pAct"${p.actif!==false?' checked':''}> active</label>
    <span class="hint">${nx?'prochaine : '+dmy(nx):''}</span>
    <button type="button" class="mini danger" data-x aria-label="Supprimer">✕</button></div>`}
function lireProg(r){return {id:r.dataset.id,libelle:r.querySelector('.pLib').value.trim(),nature:r.querySelector('.pNat').value,mode:r.querySelector('.pMode').value,
  montant:r.querySelector('.pMt')?Math.round(num(r.querySelector('.pMt').value))||0:0,compte:r.querySelector('.pCpt').value,
  categorie:r.querySelector('.pNat').value==='depense'?r.querySelector('.pCls').value:'',cat_revenu:r.querySelector('.pNat').value==='revenu'?r.querySelector('.pCls').value:'',
  periode:+r.querySelector('.pPer').value,jour:parseInt(r.querySelector('.pJour').value,10)||1,debut:r.querySelector('.pDeb').value,fin:r.querySelector('.pFin').value,
  actif:r.querySelector('.pAct').checked,ignorees:JSON.parse(r.dataset.ign||'[]')}}
function openProg(){$('progList').innerHTML=PROGS.length?PROGS.map(progRow).join(''):'<div class="hint">Aucune opération programmée.</div>';progDirty=false}
$('progList').addEventListener('input',()=>{progDirty=true});
$('progList').addEventListener('change',ev=>{progDirty=true;const t=ev.target;if(!t.matches('.pNat,.pMode'))return;const r=t.closest('.evrow'),p=lireProg(r);
  if(t.matches('.pMode')&&p.mode==='interets'){p.nature='revenu';p.cat_revenu='interets';const c=CPT[p.compte];if(c&&c.periode)p.periode=[1,2,3,6,12].includes(+c.periode)?+c.periode:p.periode}
  if(t.matches('.pNat')){p.categorie=p.categorie||'autre';p.cat_revenu=p.cat_revenu||'autre'}
  r.outerHTML=progRow(p)});
$('progList').addEventListener('click',ev=>{const b=ev.target.closest('[data-x]');if(!b)return;retirerLigne(b.closest('.evrow'),'Opération programmée',()=>{progDirty=true},true)});
function ajouterProg(p){const l=$('progList');if(!l.querySelector('.evrow'))l.innerHTML='';l.insertAdjacentHTML('beforeend',progRow(p));l.lastElementChild.querySelector('.pLib').focus();progDirty=true}
$('progAdd').onclick=()=>ajouterProg({nature:'depense',mode:'fixe',compte:(COMPTES.find(c=>c.type==='courant')||COMPTES[0]).id,categorie:'autre',periode:1,jour:30,debut:today});
$('progAddInt').onclick=()=>{const c=COMPTES.find(c=>c.taux!=null);if(!c){$('progMsg').textContent="Aucun compte n'a de taux d'intérêt : réglez-le d'abord dans Comptes et biens.";return}
  ajouterProg({libelle:'Intérêts '+c.nom,nature:'revenu',mode:'interets',compte:c.id,cat_revenu:'interets',periode:[1,2,3,6,12].includes(+c.periode)?+c.periode:6,jour:30,debut:today})};
$('progSave').onclick=async()=>{
  const pris=new Set(PROGS.map(x=>x.id)),out=[];
  for(const r of $('progList').querySelectorAll('.evrow')){const p=lireProg(r);if(!p.libelle)continue;p.id=p.id||nouvelId(p.libelle,pris);out.push(p)}
  try{await api.params({programmees:out});progDirty=false;await charger();$('progMsg').textContent='Opérations programmées enregistrées.'}catch(e){$('progMsg').textContent=e.message}
};

/* ================= événements et types de revenus (Données et réglages) ================= */
let evtDirty=false;
const utiliseEvt=id=>all.some(e=>e.evenement===id),utiliseRev=id=>all.some(e=>e.nature==='revenu'&&catRev(e)===id);
function evtRow(x){const used=x.id&&utiliseEvt(x.id);
  return `<div class="evrow" data-id="${x.id||''}"><input class="eNom" value="${esc(x.nom||'')}" placeholder="Mariage Awa, Voyage Dakar…" aria-label="Nom de l'événement" maxlength="60">
    <select class="eType" aria-label="Type">${Object.entries(TYPES_EVT).map(([k,v])=>`<option value="${k}"${k===(x.type||'autre')?' selected':''}>${v}</option>`).join('')}</select>
    <input type="date" class="eDeb" value="${x.debut||''}" aria-label="Début"><input type="date" class="eFin" value="${x.fin||''}" aria-label="Fin">
    <input class="eBud" inputmode="decimal" value="${x.budget?versSaisie(x.budget):''}" placeholder="budget" aria-label="Budget ${U_SAISIE()}">
    <input class="eMots" value="${esc((x.mots||[]).join(', '))}" placeholder="mots-clés : mariage awa, dot…" aria-label="Mots-clés">
    <button type="button" class="mini danger" data-x ${used?'disabled title="Événement utilisé : impossible à supprimer"':''} aria-label="Supprimer l'événement">✕</button></div>`}
function revRow(r){const used=r.id&&utiliseRev(r.id),autre=r.id==='autre';
  return `<div class="evrow" data-id="${r.id||''}"><input class="rNom" value="${esc(r.label||'')}" placeholder="Nom du type" aria-label="Nom du type de revenu" maxlength="60">
    <label class="chk"><input type="checkbox" class="rCour"${r.courant?' checked':''}> courant</label>
    ${autre?'<span class="hint eMots">revenus non reconnus · toujours en dernier</span>':`<input class="rMots" value="${esc((r.mots||[]).join(', '))}" placeholder="mots-clés : mission, perdiem…" aria-label="Mots-clés">`}
    <button type="button" class="mini danger" data-x ${used||autre?'disabled title="Type utilisé : impossible à supprimer"':''} aria-label="Supprimer le type">✕</button></div>`}
function openEvt(){$('evtList').innerHTML=EVTS.length?EVTS.map(evtRow).join(''):'<div class="hint">Aucun événement pour l\'instant.</div>';$('revList').innerHTML=REVENUS.map(revRow).join('');evtDirty=false;
  fiches($('evtList'),resumeEvt,'evtSave',openEvt);fiches($('revList'),resumeRev,'revSave',openEvt);openProjet()}
function resumeEvt(r){const d=valIn(r,'.eDeb'),f=valIn(r,'.eFin'),b=valIn(r,'.eBud'),m=valIn(r,'.eMots');
  return `<b>★ ${esc(valIn(r,'.eNom')||'Nouvel événement')}</b> <span class="hint">${esc(selTxt(r.querySelector('.eType')))}${d?` · du ${dmy(d)}`:''}${f?` au ${dmy(f)}`:''}${b?` · budget ${mtS(b)}`:''}${m?` · ${esc(m)}`:''}</span>`}
function resumeRev(r){const m=r.querySelector('.rMots');
  return `<b>${esc(valIn(r,'.rNom')||'Nouveau type')}</b> <span class="hint">${r.querySelector('.rCour').checked?'courant':'ponctuel'}${m&&m.value.trim()?` · ${esc(m.value.trim())}`:r.dataset.id==='autre'?' · revenus non reconnus':''}</span>`}
const mots=v=>v.split(',').map(x=>x.trim()).filter(Boolean);
['evtList','revList'].forEach(id=>{$(id).addEventListener('input',()=>{evtDirty=true});
  $(id).addEventListener('click',ev=>{const b=ev.target.closest('[data-x]');if(!b||b.disabled)return;retirerLigne(b.closest('.evrow'),id==='evtList'?'Événement':'Type de revenu',()=>{evtDirty=true})})});
$('evtAdd').onclick=()=>{const l=$('evtList');if(!l.querySelector('.evrow'))l.innerHTML='';l.insertAdjacentHTML('beforeend',evtRow({type:'mariage',debut:today}));ficher(l.lastElementChild,resumeEvt,true);l.lastElementChild.querySelector('.eNom').focus();evtDirty=true};
$('revAdd').onclick=()=>{const l=$('revList'),a=l.querySelector('.evrow[data-id="autre"]');a.insertAdjacentHTML('beforebegin',revRow({courant:false}));ficher(a.previousElementSibling,resumeRev,true);a.previousElementSibling.querySelector('.rNom').focus();evtDirty=true};
$('evtSave').onclick=async()=>{
  const pris=new Set(EVTS.map(x=>x.id)),out=[];
  for(const r of $('evtList').querySelectorAll('.evrow')){const nom=r.querySelector('.eNom').value.trim();if(!nom)continue;
    const b=r.querySelector('.eBud').value.trim(),bud=b?montantSaisi(b):0;if(!(bud>=0)){$('evtMsg').textContent=`Budget invalide pour ${nom}.`;return}
    out.push({id:r.dataset.id||nouvelId(nom,pris),nom,type:r.querySelector('.eType').value,debut:r.querySelector('.eDeb').value,fin:r.querySelector('.eFin').value,budget:bud,mots:mots(r.querySelector('.eMots').value)})}
  try{await api.params({evenements:out});evtDirty=false;await charger();$('evtMsg').textContent='Événements enregistrés.'}catch(e){$('evtMsg').textContent=e.message}
};
$('revSave').onclick=async()=>{
  const pris=new Set(REVENUS.map(x=>x.id)),out=[];
  for(const r of $('revList').querySelectorAll('.evrow')){const label=r.querySelector('.rNom').value.trim();if(!label)continue;const m=r.querySelector('.rMots');
    out.push({id:r.dataset.id||nouvelId(label,pris),label,courant:r.querySelector('.rCour').checked,mots:m?mots(m.value):[]})}
  try{await api.params({revenus:out});evtDirty=false;await charger();$('revMsg').textContent='Types de revenus enregistrés.'}catch(e){$('revMsg').textContent=e.message}
};

/* ================= retour en arrière (historique des réglages) ================= */
const quand=d=>{const x=new Date(d);return isNaN(x)?String(d):x.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'})+' à '+x.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})};
function renderHistorique(){
  if(!HIST){$('histList').innerHTML='<p class="hint">Disponible sur l\'ordinateur (ou dans la version autonome).</p>';$('origineBtn').disabled=true;return}
  $('origineBtn').disabled=false;
  $('histList').innerHTML=HIST.length?HIST.map((h,i)=>({h,i})).reverse().map(({h,i})=>`<div class="histrow"><span><b>${esc(h.resume||'réglages')}</b> <span class="hint">le ${quand(h.date)}${Object.keys(h.ops||{}).length?` · ${Object.keys(h.ops).length} ligne(s) reclassée(s)`:''}</span></span><button type="button" class="btn ghost" data-h="${i}">Rétablir l'état d'avant</button></div>`).join('')
    :'<p class="hint">Aucun changement de réglages pour l\'instant.</p>';
}
$('histList').addEventListener('click',async ev=>{const b=ev.target.closest('[data-h]');if(!b)return;const h=HIST[+b.dataset.h];
  if(!await dialogue("Rétablir l'état d'avant ce changement ?",[['Changement',h.resume||'réglages'],['Date',quand(h.date)]],'Les réglages reviennent à cet état ; ce retour pourra lui-même être annulé.'))return;
  try{await req('PUT','/api/parametres',{restaurer:+b.dataset.h});await charger();renderHistorique();$('histMsg').textContent='État rétabli.';annulable('Réglages rétablis.',annulerDernierReglage)}catch(e){$('histMsg').textContent=e.message}});
$('origineBtn').onclick=async()=>{
  if(!await dialogue("Revenir aux réglages d'origine ?",[['Remis à l\'origine','postes et mots-clés, budgets, types de revenus, parités'],['Gardés','opérations, comptes, biens, engins, maisons, événements, opérations programmées']],"Les lignes des postes retirés vont dans « Autre ». Tout se rétablit ensuite depuis la liste ci-dessus."))return;
  try{await req('PUT','/api/parametres',{origine:true});await charger();renderHistorique();$('histMsg').textContent="Réglages d'origine rétablis.";annulable("Réglages d'origine rétablis.",annulerDernierReglage)}catch(e){$('histMsg').textContent=e.message}};

/* ================= sauvegarde : exporter / importer (fichier JSON au format de donnees/carnet.json) ================= */
$('savTexte').innerHTML=MODE_AUTONOME
  ?"Vos données n'existent <b>que dans cet appareil</b>. Exportez-les régulièrement (fichier <code>appya-AAAA-MM-JJ.json</code>, à garder dans un endroit sûr : Drive, ordinateur, envoi à vous-même) : sans ce fichier, désinstaller l'application ou changer de téléphone efface tout. Pour les retrouver sur un autre appareil, importez ce fichier."
  :MODE_SYNC?"Les données du téléphone sont une copie de celles de l'ordinateur. Exporter en garde une copie dans ce téléphone (Téléchargements)."
  :"L'ordinateur garde déjà une copie chaque jour (donnees/sauvegardes). Exporter en fait une copie à déplacer où vous voulez. Ce fichier peut aussi être importé dans la version autonome (téléphone).";
$('savImportBox').hidden=!MODE_AUTONOME;
$('savExport').onclick=async()=>{
  try{const d=await req('GET','/api/donnees');const nom=`appya-${new Date().toISOString().slice(0,10)}.json`;
    await enregistrerFichier(nom,new Blob([JSON.stringify(d,null,1)],{type:'application/json'}));
    $('savMsg').textContent=`Fichier ${nom} : ${d.operations.length} ligne${d.operations.length>1?'s':''}.`;
    lsSet('daftar-sauvegarde-faite',new Date().toISOString());majRappelSauvegarde()}
  catch(e){$('savMsg').textContent="L'export a échoué : "+(e.message||'erreur')}
};
$('savFichier').onchange=async ev=>{
  const f=ev.target.files[0];ev.target.value='';if(!f||!MODE_AUTONOME)return;
  try{const d=window.AppYaMoteur.verifierImport(JSON.parse(await f.text()));
    if(!confirm(`Remplacer toutes les données de cet appareil par ce fichier (${d.operations.length} lignes) ? Les données actuelles seront perdues, sauf si vous les avez exportées.`))return;
    await locCharger();LOC.donnees=d;await locSauver();await charger();$('savMsg').textContent=`Sauvegarde importée : ${d.operations.length} lignes.`;
    lsSet('daftar-sauvegarde-faite',new Date().toISOString());majRappelSauvegarde()}
  catch(e){$('savMsg').textContent="Import impossible : "+(e instanceof SyntaxError?"ce fichier n'est pas un JSON valide.":e.message)}
};

/* rappel de sauvegarde (version autonome : téléphone, lien web) : les données n'existent que dans l'appareil. Bandeau si
   des opérations ont été saisies ou modifiées depuis le dernier export et que celui-ci date d'au moins RAPPEL_SAV jours
   (jamais exporté : compté depuis la première saisie). « Dans 3 jours » le fait taire 3 jours. Pas dans la démo. */
const RAPPEL_SAV=7;
function majRappelSauvegarde(){
  const b=$('savBandeau');if(!MODE_AUTONOME||MODE_DEMO||!ready||!all.length){b.hidden=true;return}
  const fait=lsGet('daftar-sauvegarde-faite')||'',tard=lsGet('daftar-sauvegarde-plus-tard')||'',maintenant=new Date().toISOString();
  const marques=all.map(e=>e.maj||e.cree||'').filter(Boolean).sort(),derniere=marques[marques.length-1]||'',premiere=marques[0]||maintenant;
  const jours=Math.floor((Date.now()-Date.parse(fait||premiere))/864e5);
  b.hidden=!(derniere>fait&&jours>=RAPPEL_SAV&&tard<=maintenant);
  if(!b.hidden)$('savBandeauTxt').textContent=(fait?`Dernière sauvegarde il y a ${jours} jours`:'Aucune sauvegarde pour l\'instant')+
    " : vos données n'existent que dans cet appareil. Un fichier exporté les protège si le téléphone est perdu ou changé.";
}
$('savMaintenant').onclick=()=>$('savExport').click();
$('savPlusTard').onclick=()=>{lsSet('daftar-sauvegarde-plus-tard',new Date(Date.now()+3*864e5).toISOString());$('savBandeau').hidden=true};


/* ================= foyers et membres (Données et réglages › Foyers, 2026-11-27) ================= */
let foyDirty=false;
const utilisePour=id=>all.some(e=>(e.pour||[]).includes(id));
function ageDe(n){if(!n)return null;const a=new Date(n+'T12:00'),t=new Date(today+'T12:00');let x=t.getFullYear()-a.getFullYear();if(t<new Date(t.getFullYear(),a.getMonth(),a.getDate(),12))x--;return x>=0?x:null}
function mbRow(m){const used=m.id&&utilisePour(m.id);
  return `<div class="evrow mbrow" data-id="${m.id||''}"><input class="mNom" value="${esc(m.nom||'')}" placeholder="prénom" aria-label="Prénom du membre" maxlength="60">
    <select class="mRole" aria-label="Rôle">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}"${k===(m.role||'enfant')?' selected':''}>${v}</option>`).join('')}</select>
    <input type="date" class="mNais" value="${m.naissance||''}" aria-label="Date de naissance (facultatif)">
    <input class="mMots" value="${esc((m.mots||[]).join(', '))}" placeholder="autres mots : maman, surnom…" aria-label="Mots-clés du membre">
    <button type="button" class="mini danger" data-x ${used?'disabled title="Membre avec des dépenses : impossible à supprimer"':''} aria-label="Retirer le membre">✕</button></div>`}
function foyBlk(f){const used=!!f.id&&(utilisePour(f.id)||f.membres.some(m=>utilisePour(m.id)));
  return `<div class="foyblk" data-id="${f.id||''}"><div class="evlist foyhead"><div class="evrow foyrow" data-id="${f.id||''}"><input class="fNomF" value="${esc(f.nom||'')}" placeholder="Foyer 1" aria-label="Nom du foyer" maxlength="60"><button type="button" class="mini danger" data-xf ${used?'disabled title="Foyer avec des dépenses : impossible à supprimer"':''} aria-label="Retirer le foyer">✕</button></div></div>
    <div class="evlist mbList">${f.membres.map(mbRow).join('')}</div>
    <div class="row"><button type="button" class="btn ghost small" data-addm>+ Ajouter un membre</button></div></div>`}
function resumeFoyer(r){const n=r.closest('.foyblk').querySelectorAll('.mbrow').length;
  return `<b>${esc(valIn(r,'.fNomF')||'Nouveau foyer')}</b> <span class="hint">${n?`${n} membre${n>1?'s':''}`:'aucun membre pour l\'instant'} · dépenses du poste Foyer communes par défaut</span>`}
function resumeMembre(r){const a=ageDe(valIn(r,'.mNais')),m=valIn(r,'.mMots');
  return `<b>${esc(valIn(r,'.mNom')||'Nouveau membre')}</b> <span class="hint">${esc(selTxt(r.querySelector('.mRole')))}${a!==null?` · ${a} an${a>1?'s':''}`:''}${m?` · ${esc(m)}`:''}</span>`}
function ficherFoyer(b){fiches(b.querySelector('.foyhead'),resumeFoyer,'foySave',openFoyers);fiches(b.querySelector('.mbList'),resumeMembre,'foySave',openFoyers)}
function openFoyers(){
  // aucun foyer enregistré : « Foyer 1 » proposé (le foyer qui existe déjà), à compléter avec ses membres
  const l=FOYERS.length?FOYERS:[{id:'',nom:'Foyer 1',membres:[]}];
  $('foyList').innerHTML=l.map(foyBlk).join('');$('foyList').querySelectorAll('.foyblk').forEach(ficherFoyer);
  if(!FOYERS.length)$('foyList').querySelectorAll('.foyrow').forEach(r=>r.classList.remove('edit'));
  foyDirty=false}
$('foyList').addEventListener('input',()=>{foyDirty=true});
$('foyList').addEventListener('click',ev=>{const t=ev.target.closest('[data-x],[data-xf],[data-addm]');if(!t||t.disabled)return;
  if(t.dataset.addm!==undefined){const l=t.closest('.foyblk').querySelector('.mbList');l.insertAdjacentHTML('beforeend',mbRow({role:'enfant'}));
    ficher(l.lastElementChild,resumeMembre,true);l.lastElementChild.querySelector('.mNom').focus();foyDirty=true;return}
  if(t.dataset.xf!==undefined){retirerLigne(t.closest('.foyblk'),'Foyer',()=>{foyDirty=true});return}
  retirerLigne(t.closest('.mbrow'),'Membre',()=>{foyDirty=true})});
$('foyAdd').onclick=()=>{const n=$('foyList').querySelectorAll('.foyblk').length;$('foyList').insertAdjacentHTML('beforeend',foyBlk({id:'',nom:`Foyer ${n+1}`,membres:[]}));
  const b=$('foyList').lastElementChild;ficherFoyer(b);b.querySelector('.fNomF').focus();foyDirty=true};
$('foySave').onclick=async()=>{
  const pris=new Set([...FOYERS.map(f=>f.id),...MEMBRES().map(m=>m.id)]),out=[];
  for(const b of $('foyList').querySelectorAll('.foyblk')){const nom=valIn(b,'.fNomF');if(!nom){$('foyMsg').textContent='Chaque foyer doit avoir un nom.';return}
    const f={id:b.dataset.id||nouvelId(nom,pris),nom,membres:[]};
    for(const r of b.querySelectorAll('.mbrow')){const mn=valIn(r,'.mNom');if(!mn)continue;
      f.membres.push({id:r.dataset.id||nouvelId(mn,pris),nom:mn,role:r.querySelector('.mRole').value,naissance:valIn(r,'.mNais'),mots:mots(valIn(r,'.mMots'))})}
    out.push(f)}
  try{await api.params({foyers:out});foyDirty=false;await charger();openFoyers();$('foyMsg').textContent='Foyers enregistrés.'}catch(e){$('foyMsg').textContent=e.message}
};
