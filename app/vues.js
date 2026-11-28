/* Daftar — rendu des vues (Mois, Année, Patrimoine, journal), carnet des engins, carnet de la maison.
   Un des six scripts de la page (app/index.html), chargés DANS L'ORDRE : noyau, vues, saisie, stats, reglages,
   demarrage. Scripts classiques (pas de modules) : leurs déclarations de premier niveau sont communes. Un script ne
   doit donc, en s'exécutant, appeler que ce qui est déclaré dans lui-même ou dans les précédents ; le démarrage
   (premier affichage) est dans demarrage.js, chargé en dernier. */
/* ================= rendu ================= */
const optsComptes=(sel,sauf)=>COMPTES.filter(c=>c.id!==sauf).map(c=>`<option value="${c.id}"${c.id===sel?' selected':''}>${esc(c.nom)}</option>`).join('');
const optsPostes=sel=>CATS.map(c=>`<option value="${c.id}"${c.id===sel?' selected':''}>${esc(c.label)}</option>`).join('');
const optsBiens=sel=>BIENS.map(b=>`<option value="${b.id}"${b.id===sel?' selected':''}>${esc(b.nom)}</option>`).join('');
const optsNat=sel=>Object.entries(NAT).map(([k,v])=>`<option value="${k}"${k===sel?' selected':''}>${v.l}</option>`).join('');
const nomCpt=id=>(CPT[id]||{}).nom||id;
/* Couleur d'un compte : celle choisie (charte de la banque), sinon une couleur par type */
const COUL_TYPE={especes:'#F3E3A3',courant:'#6b7b90',epargne:'#2e8a57',carte:'#9363b0',mobile:'#2f97ad',tiers:'#b07a3c'};
const coulCpt=id=>{const c=CPT[id];return (c&&c.couleur)||COUL_TYPE[(c||{}).type]||'#9a968c'};
const dotCpt=id=>`<i aria-hidden="true" class="dot cdot" style="background:${coulCpt(id)}"></i>`;
function filtreOk(e,f){
  if(!f)return true;const t=f[0],v=f.slice(2);
  if(t==='k')return e.nature==='depense'&&e.categorie===v;
  if(t==='n')return e.nature===v;
  if(t==='e')return e.evenement===v;
  if(t==='r')return e.nature==='revenu'&&!e.evenement&&(catRev(e)===v||(partPonct(e)>0&&e.cat_ponctuel===v));
  if(t==='x')return estExc(e)||partPonct(e)>0;
  if(t==='c')return e.compte===v||e.vers===v||e.tiers===v;
  if(t==='m')return pourDe(e).includes(v)||(!!FOYER[v]&&pourDe(e).some(x=>(MEMBRE[x]||{}).foyer===v));   // foyer : commun + ses membres
  if(t==='o')return e.nature==='depense'&&perso(e)&&pourDe(e).includes('moi');   // Moi
  if(t==='p')return normTxt(e.personne)===v;
  if(t==='b'){const b=BIEN[v];return e.bien===v||(!!b&&!!b.poste&&e.nature==='depense'&&e.categorie===b.poste&&(!b.date_achat||e.date>=b.date_achat))}
  return true;
}
function filtreNom(f){const t=f[0],v=f.slice(2);
  if(t==='k')return (CAT[v]||CAT.autre).label;if(t==='n')return NAT[v].l;if(t==='e')return '★ '+((EVT[v]||{}).nom||v);if(t==='r')return (REV[v]||{label:v}).label;if(t==='x')return 'Exceptionnel';if(t==='c')return nomCpt(v);if(t==='m')return FOYER[v]?FOYER[v].nom:(MEMBRE[v]||{}).nom||v;if(t==='o')return 'Moi';
  if(t==='p'){const c=creances().find(x=>x.key===v);return c?c.nom:v}if(t==='b')return (BIEN[v]||{}).nom||v;return f}
/* Filtrer un journal l'amène tout de suite à l'écran (titre, filtre actif et premières lignes), sous la barre figée
   (scroll-padding-top) : poste, compte, personne, bien, mois ou année d'un carnet (demande du 2026-11-19).
   Saut direct puis recalage : les panneaux du dessus (content-visibility:auto) prennent leur vraie hauteur pendant le
   défilement, ce qui décalait la cible (Patrimoine : le journal finissait 400 px trop haut). */
function allerJournal(id){const el=$(id);if(!el||el.hidden)return;let n=0;
  const caler=()=>{el.scrollIntoView({block:'start'});const pad=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
    if(++n<4&&Math.abs(el.getBoundingClientRect().top-pad)>4)requestAnimationFrame(caler)};
  requestAnimationFrame(caler)}
function voirJournal(f){filtre=f;query='';$('q').value='';shown=80;render();allerJournal('journal')}

function render(){try{renderVue()}finally{navNoter()}}
function renderVue(){
  majBandeauProg();
  $('demoBandeau').hidden=!MODE_DEMO;
  $('accueil').hidden=MODE_DEMO||!ready||all.length>0||memo('appya-accueil-vu')==='1'||view!=='mois';
  // trois rubriques : Mes finances (Mois, Année, Patrimoine, Statistiques), My Car, Données et réglages ;
  // chaque vue n'affiche que son contenu
  const isM=view==='mois',isA=view==='annee',isP=view==='patrimoine',isS=view==='stats',isFo=view==='foyer',isV=view==='vehicule',isH=view==='maison',isD=view==='donnees',isB=view==='biens',isF=!isV&&!isH&&!isD&&!isB,sm=isS?statsMode:'';
  if(isF)vueFin=view;
  $('aFin').setAttribute('aria-pressed',isF);$('aVeh').setAttribute('aria-pressed',isV);majRubSaisie();$('aMai').setAttribute('aria-pressed',isH);
  $('aBiens').setAttribute('aria-pressed',isB||isV||isH);$('bHub').setAttribute('aria-pressed',isB);$('segBiens').hidden=!(isB||isV||isH);$('biensHub').hidden=!isB;
  $('maiAn').setAttribute('aria-pressed',!maiAll);$('maiTout').setAttribute('aria-pressed',maiAll);$('segMai').hidden=!isH;
  $('vMois').setAttribute('aria-pressed',isM);$('vAn').setAttribute('aria-pressed',isA);$('vPat').setAttribute('aria-pressed',isP);$('vStats').setAttribute('aria-pressed',isS);$('foyPanel').hidden=!isFo;
  // Foyer : à côté de la période, en vue Mois ou Année ; il garde la période (mois ou année) de la vue d'où il vient
  $('foyBtn').hidden=!((isM||isA||isFo)&&foyerActif());$('foyBtn').setAttribute('aria-pressed',isFo);
  if(isFo){$('vMois').setAttribute('aria-pressed',foyMode==='mois');$('vAn').setAttribute('aria-pressed',foyMode!=='mois')}
  $('vehAn').setAttribute('aria-pressed',!vehAll);$('vehTout').setAttribute('aria-pressed',vehAll);
  $('segFin').hidden=!isF;$('segVeh').hidden=!isV;$('subCtl').hidden=isD;
  {const lv=VEHS(),cv=VEH(),lm=MAISONS(),cm=MAISON();
    $('segEngins').hidden=!isV||lv.length<2;$('addEngin').hidden=!isV;$('segMaisons').hidden=!isH||lm.length<2;
    if(isV&&lv.length>1)$('segEngins').innerHTML=lv.map(b=>`<button type="button" data-v="${b.id}" aria-pressed="${cv&&b.id===cv.id}">${esc(b.nom)}</button>`).join('');
    if(isH&&lm.length>1)$('segMaisons').innerHTML=lm.map(b=>`<button type="button" data-h="${b.id}" aria-pressed="${cm&&b.id===cm.id}">${esc(b.nom)}</button>`).join('');}
  $('prev').hidden=$('next').hidden=!(isM||isA||isFo||sm==='mois'||sm==='annee'||(isV&&!vehAll)||(isH&&!maiAll));$('navBox').hidden=isD||isB||(isV&&vehAll)||(isH&&maiAll);
  $('perLabel').textContent=isD?'':(isV||isH)?String(cur.y):isP?`au ${now.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}`:(isM||sm==='mois'||(isFo&&foyMode==='mois'))?new Date(cur.y,cur.m,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):(isA||sm==='annee'||isFo)?String(cur.y):sm==='periode'?`du ${dmy(statsDu)} au ${dmy(statsAu)}`:"Tout l'historique";
  $('perLabel').style.textTransform=(sm==='periode'||sm==='tout')?'none':'';   // « du … au … » et « Tout l'historique » gardent leur casse
  const tableau=isM||isA||isP;
  $('resumePanel').hidden=$('journal').hidden=!tableau;
  $('postesPanel').hidden=!(isM||isA);$('rythmePanel').hidden=!isA;  // en vue Mois, le rythme hebdomadaire est dans le résumé
  ['comptesPanel','biensPanel','pretsPanel'].forEach(i=>$(i).hidden=!isP);
  $('statsBox').hidden=!isS;$('saisie').hidden=!isD;if(!isS)cacherTip();
  ['vehDash','vehStats','vehRecap','vehVid','vehJournal'].forEach(i=>$(i).hidden=!isV);
  ['maiDash','maiStats','maiRecap','maiPersp','maiJournal'].forEach(i=>$(i).hidden=!isH);
  document.title=(isD?'Données et réglages':isB?'Mes biens':isH?'Maison':isV?'Engins · '+(vehAll?'toutes les années':cur.y):isP?'Patrimoine':(isS?'Statistiques · ':'')+$('perLabel').textContent.replace(/^./,c=>c.toUpperCase()))+' · Daftar';
  if(isB){renderHub();return}
  if(isV){renderVehicule();return}
  if(isH){renderMaison();return}
  if(isD)return;
  if(isV&&($('vidPanel').hidden||$('vidPanel').dataset.v!==(VEH()||{}).id))openVidange();
  if(isFo){renderFoyer();return}
  if(!tableau){if(isS)renderStats();return}
  const items=sorted(isP?all.filter(e=>perso(e)||(filtre&&filtre==='c:'+e.compte)):isM?monthItems(cur.y,cur.m):yearItems(cur.y));   // Patrimoine : opérations des tiers seulement sur leur compte
  /* indicateurs (résumé, postes) : seulement les opérations à partir du début du suivi quotidien (DEBUT_SUIVI, 02/10/2026) ;
     avant, seules les dépenses du véhicule étaient notées : non significatif (demande du 2026-11-17). Le journal garde tout. */
  const suivi=e=>!DEBUT_SUIVI||e.date>=DEBUT_SUIVI,itemsI=isP?items:items.filter(suivi);
  const F=flux(itemsI);const total=F.dep;

  /* résumé */
  const stat=(l,v,s,big,col)=>`<div class="stat"><span class="label">${lblIc(l)}</span><span class="${big?'big':'v'}"${col?` style="color:${col}"`:''}>${valAbr(l,v)}</span><span class="s">${s}</span></div>`;
  const fluxCol=F.net>=0?'var(--ok)':'var(--warn)';
  if(isP){
    const P=patrimoine();
    $('hero').innerHTML=`<div class="oeilL"><button class="btn ghost small oeil" id="oeilBtn" type="button" title="Afficher ou masquer le patrimoine, les soldes, les biens et les prêts"></button></div>`+stat('Patrimoine net',fmtM(P.net),`${U()} · comptes + biens + créances`,true)+
      stat('Comptes',fmtM(P.liq),`${U()} sur ${MES().length} comptes`)+stat('Biens',fmtM(P.biens),`${U()} · valeur actuelle, sinon coût`)+
      stat('On vous doit',fmtM(P.cre),`${U()} · ${creances().filter(c=>c.reste>0).length+P.nTiers} personne(s)`)+statsPatrimoine(P,stat);
    majOeil();
    renderComptes();renderBiens();renderPrets();
  }else if(isM){
    const days=new Date(cur.y,cur.m+1,0).getDate();
    const isCur=cur.y===now.getFullYear()&&cur.m===now.getMonth();
    const elapsed=isCur?now.getDate():days;
    const pm=cur.m===0?{y:cur.y-1,m:11}:{y:cur.y,m:cur.m-1};
    // mois en cours : on compare à la même période du mois précédent (1er → même jour)
    const prevTot=sum(deps(monthItems(pm.y,pm.m).filter(e=>suivi(e)&&(!isCur||+e.date.slice(8,10)<=elapsed))));
    const pmName=new Date(pm.y,pm.m,1).toLocaleDateString('fr-FR',{month:'long'});
    let delta='—',dcol='';
    if(prevTot>0){const d=(total-prevTot)/prevTot*100;delta=(d>=0?'+':'')+fmt1(d)+' %';dcol=d>0?'var(--warn)':'var(--ok)'}
    const btot=Object.values(budgets).reduce((a,b)=>a+b,0);
    // mois du début du suivi : les jours comptent à partir de ce jour-là (le 1er octobre 2026 n'était pas suivi)
    const j0=DEBUT_SUIVI&&DEBUT_SUIVI.slice(0,7)===`${cur.y}-${pad(cur.m+1)}`?+DEBUT_SUIVI.slice(8,10):1,nj=Math.max(1,elapsed-j0+1);
    const mdj=medianeJours(items,elapsed,j0);
    const partiel=DEBUT_SUIVI&&iso(new Date(cur.y,cur.m+1,0))<DEBUT_SUIVI?`<div class="partiel">Suivi partiel : avant le ${dmy(DEBUT_SUIVI)}, seules les dépenses du véhicule (reprises de son carnet) sont notées.</div>`:'';
    if(partiel){$('hero').innerHTML=`<div class="partiel">Mois antérieur au suivi quotidien (commencé le ${dmy(DEBUT_SUIVI)}) : seules les dépenses du véhicule y sont notées, d'où aucun indicateur. Le journal ci-dessous les montre.</div>`}
    else{const J=statsJours(items,`${cur.y}-${pad(cur.m+1)}-${pad(j0)}`,`${cur.y}-${pad(cur.m+1)}-${pad(elapsed)}`,total,stat,'du mois')||{vides:'',gros:''};
      // ordre demandé le 2026-11-19 : dépenses et entrées côte à côte, solde, comparaison, épargne, investi et prêté,
      // plus grosse journée, jours sans dépense ; puis moyenne par jour et exceptionnel ; dépenses par semaine
      $('hero').innerHTML=stat('Dépenses courantes du mois',fmtM(total),`${U()}${btot?` · budget ${fmtM(btot)}`:''} · ${deps(items).length} lignes`,true)+
      stat('Entrées courantes',fmtM(F.ent),`${U()} · revenus courants et remboursements`,true)+
      stat('Solde du mois',sgnM(F.net),`${U()} · toutes entrées − toutes sorties`,false,fluxCol)+
      stat(`Vs ${isCur?'même période':'mois précédent'}`,delta,prevTot?`${fmtM(prevTot)} ${U()} ${isCur?`(1–${elapsed} ${pmName})`:`en ${pmName}`}`:'pas de données',false,dcol)+
      statEpargne(items,total,isCur,elapsed,days,stat,nj)+
      stat('Investi et prêté',fmtM(F.inv+F.pre),`${U()} · investi ${fmtM(F.inv)} · prêté ${fmtM(F.pre)}`)+J.gros+J.vides+
      stat('Moyenne par jour',`${fmtM(total/nj)} <span class="sd" title="Médiane des dépenses journalières : un jour sur deux, on dépense moins (jours sans dépense comptés à 0)"><span aria-hidden="true">(médiane ${mdj===null?'—':fmtM(mdj)})</span><span class="sr">, médiane ${mdj===null?'non calculable':fmtM(mdj)+' '+U()}</span></span>`,`${U()} sur ${nj} jours${j0>1?` (depuis le ${j0})`:""}`)+
      (F.exc||F.entX?stat('Exceptionnel',`${fmtM(F.exc)} · <span style="color:var(--ok)">+${fmtM(F.entX)}</span>`,`${U()} · dépensés (événements) · <span style="color:var(--ok)">reçus (revenus ponctuels)</span>`):'')+
      semaines(items,days,isCur?now.getDate():0)}
  }else{
    const months=[...Array(12)].map((_,i)=>sum(deps(monthItems(cur.y,i).filter(suivi))));
    const used=months.filter(v=>v>0).length;const mx=Math.max(...months),mi=months.indexOf(mx);
    const partielA=DEBUT_SUIVI&&`${cur.y}-01-01`<DEBUT_SUIVI?`<div class="partiel">Suivi partiel : avant le ${dmy(DEBUT_SUIVI)}, seules les dépenses du véhicule sont notées ; les indicateurs ne comptent qu'à partir de cette date.</div>`:'';
    if(DEBUT_SUIVI&&`${cur.y}-12-31`<DEBUT_SUIVI)$('hero').innerHTML=`<div class="partiel">Année antérieure au suivi quotidien (commencé le ${dmy(DEBUT_SUIVI)}) : seules les dépenses du véhicule y sont notées, d'où aucun indicateur. Le journal ci-dessous les montre.</div>`;
    else{const J=statsJours(itemsI,DEBUT_SUIVI&&DEBUT_SUIVI>`${cur.y}-01-01`?DEBUT_SUIVI:`${cur.y}-01-01`,cur.y===now.getFullYear()?today:`${cur.y}-12-31`,total,stat,"de l'année")||{vides:'',gros:''};
      // même présentation que la vue Mois (demande du 2026-11-19) ; comparaison avec l'année précédente à la même date, jours suivis seulement
      const y0=cur.y-1,isCurY=cur.y===now.getFullYear(),lim=isCurY?`${y0}${today.slice(4)}`:`${y0}-12-31`,av=sum(deps(yearItems(y0).filter(e=>suivi(e)&&e.date<=lim)));
      let dA='—',cA='';if(av>0){const d=(total-av)/av*100;dA=(d>=0?'+':'')+fmt1(d)+' %';cA=d>0?'var(--warn)':'var(--ok)'}
      const mm=months.map((v,i)=>({v,i})).filter(x=>x.v>0||(isCurY&&x.i<=now.getMonth()&&(!DEBUT_SUIVI||`${cur.y}-${pad(x.i+1)}-31`>=DEBUT_SUIVI))),mmx=Math.max(1,...months);
      const barresMois=mm.length?`<div class="stat semaine"><span class="label">Dépenses par mois</span><div class="hsem">`+mm.map(x=>`<div class="hs${isCurY&&x.i===now.getMonth()?' now':''}" title="${new Date(cur.y,x.i,1).toLocaleDateString('fr-FR',{month:'long'})} : ${fmtM(x.v)} ${U()}"><span class="d">${MOIS[x.i].slice(0,4)}</span><span class="tr"><span class="col" style="width:${x.v?Math.max(1,x.v/mmx*100):0}%"></span></span><span class="v">${x.v?fmtA(x.v):'–'}</span></div>`).join('')+'</div></div>':'';
      $('hero').innerHTML=partielA+stat(`Dépenses courantes ${cur.y}`,fmtM(total),U(),true)+
      stat('Entrées courantes',fmtM(F.ent),`${U()} · revenus courants et remboursements`,true)+
      stat("Solde de l'année",sgnM(F.net),`${U()} · toutes entrées − toutes sorties`,false,fluxCol)+
      stat(`Vs ${y0}${isCurY?' même période':''}`,dA,av?`${fmtM(av)} ${U()} en ${y0}${isCurY?` (au ${dmy(lim)})`:''}`:'pas de données suivies',false,cA)+
      statEpargneAn(itemsI,total,stat)+
      stat('Investi et prêté',fmtM(F.inv+F.pre),`${U()} · investi ${fmtM(F.inv)} · prêté ${fmtM(F.pre)}`)+J.gros+J.vides+
      stat('Moyenne mensuelle',used?fmtM(total/used):'—',`sur ${used} mois saisis`)+
      stat('Mois le plus cher',mx?fmtM(mx):'—',mx?new Date(cur.y,mi,1).toLocaleDateString('fr-FR',{month:'long'}):'')+
      (F.exc||F.entX?stat('Exceptionnel',`${fmtM(F.exc)} · <span style="color:var(--ok)">+${fmtM(F.entX)}</span>`,`${U()} · dépensés (événements) · <span style="color:var(--ok)">reçus (revenus ponctuels)</span>`):'')+barresMois}
  }

  if(!isP){
    /* postes */
    const bc=byCat(itemsI);const cats=Object.entries(bc).sort((a,b)=>b[1]-a[1]);
    if(isM)Object.keys(budgets).forEach(k=>{if(!bc[k]&&CAT[k])cats.push([k,0])});
    const scale=Math.max(1,...cats.map(([k,v])=>Math.max(v,isM?(budgets[k]||0):0)));
    const fk=filtre.startsWith('k:')?filtre.slice(2):null;
    $('bars').innerHTML=cats.length?cats.map(([id,v])=>{const c=CAT[id]||CAT.autre;const b=isM?budgets[id]:0;const over=b&&v>b;
      return `<button type="button" class="bar${fk===id?' sel':''}" data-c="k:${id}" aria-pressed="${fk===id}"><span class="name"><span class="dot" aria-hidden="true" style="background:${color(c.id)}"></span>${esc(c.label)}</span><div class="track"><div class="fill" style="width:${v/scale*100}%;background:${over?'var(--warn)':color(c.id)}"></div>${b?`<span class="budget" style="left:calc(${b/scale*100}% - 1px)" title="Budget ${fmtM(b)} ${U()}"></span>`:''}</div><span class="amt">${fmtA(v)}<span class="pct">${total?Math.round(v/total*100):0} %</span>${b?`<span class="over" style="color:${over?'var(--warn)':'var(--muted)'}">${over?`dépassé de ${fmtA(v-b)}`:`reste ${fmtA(b-v)}`}</span>`:''}</span></button>`}).join('')
      :'<div class="empty">Aucune dépense sur cette période.</div>';


    /* rythme (dépenses) */
    if(!isM){
      const months=[...Array(12)].map((_,i)=>monthItems(cur.y,i));
      const tots=months.map(it=>sum(deps(it)));const mx=Math.max(1,...tots);
      $('chartTitle').textContent='Dépenses par mois';$('chartHint').textContent='Touchez un mois pour l\'ouvrir';
      $('chart').style.gridTemplateColumns='repeat(12,1fr)';
      $('chart').innerHTML=tots.map((v,i)=>`<button type="button" class="wk" data-m="${i}" aria-label="${MOIS[i]} : ${fmtM(v)} ${U()}"><span class="v">${v?fmt(v/1000)+'k':''}</span><div class="col" style="height:${v/mx*72}%"></div><span class="d">${MOIS[i].slice(0,4)}</span></button>`).join('');
      const used=CATS.filter(c=>deps(items).some(e=>e.categorie===c.id));
      // tableau mois × postes : replié par défaut (demande du 28/11), le choix est retenu sur l'appareil
      const tv=lsGet('daftar-tableau-mois')==='1';$('yearTblBar').hidden=!items.length;$('yearTblWrap').hidden=!items.length||!tv;
      $('yearTblBtn').textContent=tv?'Masquer le tableau par mois et par poste':'Afficher le tableau par mois et par poste';$('yearTblBtn').setAttribute('aria-expanded',tv);
      const ligne=(lab,it,attr)=>{const b=byCat(it),f=flux(it);return `<tr${attr}><td>${lab}</td>${used.map(c=>`<td>${b[c.id]?fmtM(b[c.id]):'–'}</td>`).join('')}<td><b>${fmtM(f.dep)}</b></td><td>${f.exc?fmtM(f.exc):'–'}</td><td>${f.ent?fmtM(f.ent):'–'}</td><td>${f.entX?fmtM(f.entX):'–'}</td><td>${f.inv+f.pre?fmtM(f.inv+f.pre):'–'}</td><td style="color:${f.net>=0?'var(--ok)':'var(--warn)'}">${sgnM(f.net)}</td></tr>`};
      $('yearTbl').innerHTML=`<thead><tr><th>Mois</th>${used.map(c=>`<th>${esc(c.label)}</th>`).join('')}<th>Dépenses courantes</th><th>Exceptionnel</th><th>Entrées courantes</th><th>Revenus ponctuels</th><th>Investi, prêté</th><th>Solde</th></tr></thead><tbody>`+
        months.map((it,i)=>it.length?ligne(new Date(cur.y,i,1).toLocaleDateString('fr-FR',{month:'long'}),it,` class="click" data-m="${i}"`):'').join('')+
        ligne('Total',items,' class="tot"')+'</tbody>';
    }
  }

  /* filtres : plus d'étiquettes sous la recherche (demande du 2026-11-13) ; on filtre depuis « Dépenses par poste »,
     la vue Patrimoine, ou la recherche, et le filtre actif s'affiche à côté du titre avec « tout afficher » */

  /* journal */
  let jl=items.slice().reverse().filter(e=>filtreOk(e,filtre));
  if(query){const q=normTxt(query);jl=jl.filter(e=>normTxt(e.libelle+' '+e.remarque+' '+e.personne+' '+((EVT[e.evenement]||{}).nom||'')).includes(q))}
  const filt=[];if(filtre)filt.push(filtreNom(filtre));if(query)filt.push(`« ${query} »`);
  const fj=flux(jl);
  $('jSub').innerHTML=`${jl.length} lignes · dépenses ${fmtM(fj.dep)}${fj.exc?` + ${fmtM(fj.exc)} exceptionnelles`:''}${fj.ent+fj.entX?` · entrées ${fmtM(fj.ent+fj.entX)}`:''} ${U()}`+(filt.length?` · ${esc(filt.join(', '))} · <a href="#" id="clr" style="color:var(--accent)">tout afficher</a>`:'');
  const clr=$('clr');if(clr)clr.onclick=ev=>{ev.preventDefault();filtre='';query='';$('q').value='';render()};
  const page=jl.slice(0,shown);const dayDep={},dayDepC={},dayEnt={};jl.forEach(e=>{if(e.nature==='depense'){dayDep[e.date]=(dayDep[e.date]||0)+e.montant;if(!e.evenement)dayDepC[e.date]=(dayDepC[e.date]||0)+e.montant}if(NAT[e.nature].s>0)dayEnt[e.date]=(dayEnt[e.date]||0)+e.montant});
  let html='',curD=null;const SJ=seuilsJour();
  // légende retirée et niveau non écrit à l'écran (demande du 2026-11-13) : seule la couleur de la journée reste visible
  for(const e of page){
    if(e.date!==curD){curD=e.date;const dl=new Date(e.date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',...(isP?{year:'numeric'}:{})});
      const nv=SJ&&dayDepC[e.date]?niveauJour(dayDepC[e.date],SJ):null;
      html+=`<div class="dayhead${nv?' j-'+nv.cls:''}"><strong>${dl}</strong><span class="num">${nv?`<span class="sr">dépenses de la journée : niveau ${nv.l}, </span>`:''}${dayEnt[e.date]?`<span class="in">+${fmt(dayEnt[e.date])}</span> `:''}${dayDep[e.date]?fmt(dayDep[e.date]):''}</span></div>`}
    const s=NAT[e.nature].s;
    html+=`<div class="item${editId===e.id?' editing':''}" data-id="${e.id}"><button type="button" class="lib"${editId===e.id?' aria-current="true"':''}><span class="sr">Modifier : </span><span>${esc(e.libelle)}</span><span class="tag">${opTag(e)}${e.remarque?` · ${esc(e.remarque)}`:''}</span></button><span class="amt${s>0?' in':s===0?' muted':''}">${s>0?'+':''}${fmt(e.montant)}<span class="sr"> ${U()}</span></span><button type="button" class="del" data-del="${e.id}" aria-label="Supprimer ${esc(e.libelle)}">✕</button></div>`;
  }
  const lab=isP?'':isM?' en '+new Date(cur.y,cur.m,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):' en '+cur.y;
  $('list').innerHTML=jl.length?html:`<div class="empty">${filt.length?'Aucune ligne ne correspond à ce filtre.':`Aucune opération${lab}. Ajoutez-en une ci-dessus, ou collez la liste de votre carnet.`}</div>`;
  $('more').hidden=jl.length<=shown;$('more').textContent=`Afficher plus (${jl.length-shown} restantes)`;
}
/* Petit graphique des dépenses par semaine (1–7, 8–14, 15–21, 22–28, 29–fin), placé dans le résumé du mois ;
   la semaine en cours est mise en avant */
/* Médiane des dépenses par jour sur les jours 1 … n de la période (un jour sans dépense compte 0, comme dans la moyenne) ;
   remplace l'écart type σ (1.4.6, demande de l'utilisateur) : les dépenses d'un jour sont très asymétriques (quelques
   grosses journées), la moyenne et σ en sont tirés vers le haut, la médiane dit ce qu'est un jour ordinaire. */
/* Taux d'épargne du mois (1.4.6) = (revenus courants − dépenses courantes) / revenus courants ; remboursements de prêts et
   revenus ponctuels exclus (ce ne sont pas des revenus réguliers). PRÉVISIONNEL (mois en cours) : même calcul sur les dépenses
   à ce jour, comme si les revenus courants attendus étaient déjà tombés (revenuAttendu). */
function revCourMois(y,m){const r={};monthItems(y,m).forEach(e=>{if(e.nature==='revenu'&&!estExc(e)){const c=catRev(e);r[c]=(r[c]||0)+revCour(e)}});return r}
// les n mois complets qui précèdent (y, m), en s'arrêtant avant le début du suivi (ou la première opération)
function moisPrecedents(y,m,n){const deb=DEBUT_SUIVI||all.reduce((a,e)=>!a||e.date<a?e.date:a,''),L=[];
  for(let i=1;i<=n;i++){const d=new Date(y,m-i,1);if(!deb||iso(new Date(d.getFullYear(),d.getMonth()+1,0))<deb)break;L.push({y:d.getFullYear(),m:d.getMonth()})}return L}
/* Revenu courant attendu pour le mois. Un type de revenu courant est « fixe » s'il est tombé CHACUN des mois suivis parmi les
   3 précédents : on l'attend au montant du mois précédent. Sans revenu fixe : moyenne mensuelle des revenus courants des
   12 derniers mois suivis. manque = ce qui n'est pas encore tombé (vide : le prévisionnel égale le réel). */
function revenuAttendu(y,m){
  const tot=o=>Object.values(o).reduce((a,b)=>a+b,0),recu=revCourMois(y,m),M3=moisPrecedents(y,m,3);if(!M3.length)return null;
  const R3=M3.map(p=>revCourMois(p.y,p.m)),manque=[];let t=tot(recu),fixe=false;
  for(const c of Object.keys(R3[0]))if(R3.every(x=>x[c]>0)){fixe=true;const v=R3[0][c];if((recu[c]||0)<v){t+=v-(recu[c]||0);manque.push({c,v})}}
  if(fixe)return {total:t,mode:'fixe',manque,mensuel:Object.keys(R3[0]).filter(c=>R3.every(x=>x[c]>0)).reduce((a,c)=>a+R3[0][c],0)};
  const M12=moisPrecedents(y,m,12),moy=M12.reduce((a,p)=>a+tot(revCourMois(p.y,p.m)),0)/M12.length;
  return {total:Math.max(t,moy),mode:'moyenne',moy,n:M12.length,mensuel:moy,manque:t<moy?[{c:'',v:moy-t}]:[]};
}
/* Prévisionnel (mois en cours) = (revenu attendu − dépenses prévues) / revenu attendu ; dépenses prévues = dépenses à ce
   jour + moyenne par jour × jours restants (même projection que la vue Statistiques). */
/* calculs (partagés par les vues Mois, Année et Statistiques) : rev = revenus courants, te = taux réel, tp = prévisionnel */
function epargneMois(y,m,items,dep,isCur,el,days,nj=el){
  const rev=sumF(items,revCour),o={rev,te:rev>0?(rev-dep)/rev:null,tp:null,det:''};
  if(isCur&&el<days){const A=revenuAttendu(y,m),R=A?A.total:rev,reste=days-el,depP=dep+dep/nj*reste;
    /* mois en cours, revenus attendus pas encore tous tombés : le taux réel n'a pas de sens (25 559 d'intérêts face à
       355 000 de dépenses donnaient −1 289,6 %, 19/11/2026) ; « — » jusqu'à leur arrivée, le prévisionnel reste */
    if(A&&A.manque.length&&o.te!==null){o.te=null;o.attente=true}
    if(R>0){o.tp=(R-depP)/R;
      const quoi=!A||!A.manque.length?'':A.mode==='fixe'?A.manque.map(x=>`${(REV[x.c]||{label:x.c}).label.toLowerCase()} ${fmt(x.v)}`).join(' + '):`revenu moyen ${fmt(A.moy)} (${A.n} mois)`;
      o.det=`Prévisionnel de fin de mois : ${quoi?`revenus attendus : ${quoi} ; `:''}dépenses prévues ${fmt(depP)} (${fmt(dep/nj)} par jour × ${reste} jours restants) ${U()}.`}}
  return o;
}
function epargneAn(y,itemsI,dep){
  const rev=sumF(itemsI,revCour),o={rev,te:rev>0?(rev-dep)/rev:null,tp:null,det:''};
  if(y===now.getFullYear()){
    const d0=DEBUT_SUIVI&&DEBUT_SUIVI>`${y}-01-01`?DEBUT_SUIVI:`${y}-01-01`,js=d0<=today?nbJ(d0,today):0,jr=nbJ(today,`${y}-12-31`)-1;
    const A=revenuAttendu(y,now.getMonth());
    if(js>0&&A){const manque=A.manque.reduce((a,x)=>a+x.v,0),mr=11-now.getMonth(),revP=rev+manque+A.mensuel*mr,depP=dep+dep/js*jr;
      if(revP>0){o.tp=(revP-depP)/revP;
        o.det=`Prévisionnel de fin d'année : revenus ${fmt(revP)} (reçus ${fmt(rev)} + attendus ce mois ${fmt(manque)} + ${fmt(A.mensuel)} × ${mr} mois) ; dépenses ${fmt(depP)} (${fmt(dep/js)} par jour suivi × ${jr} jours restants) ${U()}.`}}}
  return o;
}
function pcE(x){return fmt1(x*100)+'\u00a0%'}   // espace insécable : « 6,9 % » ne se coupe pas
// case « Taux d'épargne » : seuls les taux à l'écran (réel · prévisionnel en jaune), le détail dans la bulle
function caseEpargne(o,stat,sansRev){
  const reel=`<span${o.te!==null&&o.te<0?' style="color:var(--warn)"':''}${o.attente?' title="Taux réel affiché quand les revenus attendus du mois (salaire, prime…) seront tombés"':''}>${o.te===null?'—':pcE(o.te)}</span>`;
  if(o.tp!==null)return stat("Taux d'épargne",`${reel} · <span style="color:var(--jm)" title="${esc(o.det)}">${pcE(o.tp)}</span>`,`réel · <span style="color:var(--jm)">prévisionnel</span>`);
  return stat("Taux d'épargne",reel,o.rev>0?'revenus courants − dépenses courantes':sansRev);
}
// fonctions déclarées (et non const) : render() peut être appelé avant cette ligne pendant le chargement du script
function statEpargne(items,dep,isCur,el,days,stat,nj=el){return caseEpargne(epargneMois(cur.y,cur.m,items,dep,isCur,el,days,nj),stat,'pas encore de revenu courant ce mois')}
function statEpargneAn(itemsI,dep,stat){return caseEpargne(epargneAn(cur.y,itemsI,dep),stat,'pas de revenu courant noté')}
/* ---- icônes des indicateurs (2026-11-19) : une icône colorée devant le libellé de chaque case, choisie d'après le libellé.
   La couleur porte sur l'icône seulement (le chiffre reste en couleur de texte, sauf comparaison verte/rouge). ---- */
const IC_STAT=[[/^Patrimoine net/,'patrimoine','var(--accent)'],[/^Comptes/,'banque','var(--viz1)'],[/^Disponible/,'finances','var(--viz1)'],
  [/^Biens acquis/,'house','var(--viz3)'],[/^Biens/,'house','var(--viz3)'],[/^On vous doit/,'main','var(--viz2)'],[/^Mois d'autonomie/,'sablier','var(--ok)'],
  [/^Non saisi/,'question','var(--warn)'],[/^Intérêts attendus/,'tendance','var(--ok)'],[/^Épargne/,'cochon','var(--viz3)'],
  [/^(Dépenses|Travaux)/,'sortie','var(--jh)'],[/^(Entrées|Revenus)/,'sauve','var(--ok)'],[/^Moyenne par jour/,'mois','var(--accent)'],
  [/^(Moyenne mensuelle|Par mois de travaux)/,'annee','var(--accent)'],[/^Vs /,'tendance','var(--muted)'],[/^(Taux d'épargne|Mis de côté)/,'cochon','var(--viz3)'],
  [/^Jours sans dépense/,'calok','var(--ok)'],[/^(Plus grosse journée|Mois le plus cher)/,'pic','var(--jm)'],[/^Exceptionnel/,'etoile','var(--jm)'],
  [/^(Investi et prêté|Prêts)/,'main','var(--viz2)'],[/^Investissements/,'chantier','var(--viz2)'],[/^Solde/,'balance','var(--accent)'],
  [/^Carburant/,'pompe','var(--cv-carburant)'],[/^Entretien/,'cle','var(--cv-reparation)'],[/^Prix moyen du litre/,'tag','var(--cv-carburant)'],
  [/^Consommation/,'jauge','var(--accent)'],[/^Prochaine vidange/,'huile','var(--jm)'],[/^(Km parcourus|Heures de marche)/,'route','var(--viz1)'],
  [/^Coût/,'pieces','var(--viz2)'],[/^Poste principal/,'tag','var(--accent)'],[/^Part du terrain/,'house','var(--viz3)']];
/* Montants abrégés dans les cartes (2026-11-19) : 355 162 → 355 K, 1 282 962 → 1,28 M (3 chiffres significatifs), par
   défaut ; réglage par appareil (Données et réglages › Saisie, localStorage daftar-abrege) pour tout afficher. Ne touche
   que la valeur principale des cases (pas le journal, les tableaux, les sous-titres), et pas les km, heures, jours ni mois.
   Le montant complet reste dans la bulle (title). */
let ABREGE=lsGet('daftar-abrege')!=='0';
function abr(n){const a=Math.abs(n),sg=n<0?'−':'',[d,u]=a>=1e9?[1e9,' Md']:a>=1e6?[1e6,' M']:[1e3,' K'],q=a/d;
  return sg+q.toLocaleString('fr-FR',{maximumFractionDigits:q>=100?0:q>=10?1:2})+u}
const RE_NB=/([−+-]?)(\d{1,3}(?:[\u202f\u00a0 ]\d{3})+)(?![\d,])/g,SANS_ABR=/^(Km|Heures|Jours|Mois d'autonomie|Consommation|Biens acquis|Prochaine vidange)/;
function valAbr(l,v){if(!ABREGE||SANS_ABR.test(String(l).replace(/<[^>]*>/g,'')))return v;
  return String(v).replace(/(<[^>]*>)|([^<]+)/g,(m,tag,txt)=>tag?tag:txt.replace(RE_NB,(t,sg,ch)=>{const n=+ch.replace(/\D/g,'')*(sg==='−'||sg==='-'?-1:1);
    // abrégé à l'écran ; montant exact dans la bulle (souris) ET pour les lecteurs d'écran (un title n'est pas lu partout)
    return n>-1000&&n<1000?t:`<span title="${t.trim()}"><span aria-hidden="true">${sg==='+'?'+':''}${abr(n)}</span><span class="sr">${t.trim()}</span></span>`}))}
// même abrègement pour un montant isolé (barres des postes, cartes des biens) ; masqué → reste masqué
function fmtA(n){return valAbr('',fmtM(n))}
function sgnA(n){return valAbr('',sgnM(n))}
function lblIc(l){const t=String(l).replace(/<[^>]*>/g,''),x=IC_STAT.find(([re])=>re.test(t));
  return x?`<svg class="ic sic" style="color:${x[2]}" aria-hidden="true" focusable="false"><use href="#i-${x[1]}"/></svg>${l}`:l}
/* ---- indicateurs complémentaires (1.4.8, liste du 2026-11-17) ---- */
// dépenses courantes par jour, du jour d0 au jour d1 inclus (jours sans dépense = 0)
function depParJour(items,d0,d1){const m=new Map();if(!d0||d1<d0)return m;for(let d=d0;d<=d1;d=addJ(d,1))m.set(d,0);
  deps(items).forEach(e=>{if(m.has(e.date))m.set(e.date,m.get(e.date)+e.montant)});return m}
// jours sans dépense ; plus grosse journée et sa part de la période
function statsJours(items,d0,d1,total,stat,quand){
  const m=depParJour(items,d0,d1);if(!m.size)return null;
  const vides=[...m.values()].filter(v=>v===0).length;let jx='',vx=0;m.forEach((v,d)=>{if(v>vx){vx=v;jx=d}});
  return {vides:stat('Jours sans dépense',`${vides}`,`sur ${m.size} jours suivis`),gros:
    (vx?stat('Plus grosse journée',fmtM(vx),`${U()} · ${new Date(jx+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long'})} · ${total?Math.round(vx/total*100):0} % ${quand}`):'')};
}
// Patrimoine : mois d'autonomie (comptes ÷ dépenses courantes mensuelles moyennes) ; écarts des soldes notés (opérations non saisies)
function statsPatrimoine(P,stat){
  // répartition du patrimoine (barre colorée : comptes, biens, ce qu'on vous doit) ; pourcentages cachés quand les montants le sont
  const tot=P.liq+P.biens+P.cre,parts=[['s1','Comptes',P.liq],['s3','Biens',P.biens],['s2','On vous doit',P.cre]].filter(x=>x[2]>0);
  const barre=tot>0?`<div class="pcompo" style="grid-column:1/-1"><div class="segbar" role="img" aria-label="${esc(masque?'Répartition du patrimoine':'Répartition : '+parts.map(x=>`${x[1]} ${Math.round(x[2]/tot*100)} %`).join(', '))}">${parts.map(x=>{const q=x[2]/tot*100;return `<span class="${x[0]}" style="flex:${q}">${!masque&&q>=12?`${x[1]} ${Math.round(q)} %`:''}</span>`}).join('')}</div></div>`:'';
  // comptes : disponible (espèces, courants, cartes, mobile money) / épargne ; intérêts attendus sur un an (comptes rémunérés)
  const mes=MES().map(c=>({c,s:etatCompte(c).solde})),epa=mes.filter(x=>x.c.type==='epargne').reduce((a,x)=>a+x.s,0),dispo=P.liq-epa;
  const inter=mes.filter(x=>x.c.taux).reduce((a,x)=>a+x.s*(Math.pow(1+x.c.taux/100,12/(x.c.periode||12))-1),0);
  const plus=(epa?stat('Disponible',fmtM(dispo),`${U()} · espèces, comptes courants, cartes, mobile money`)+stat('Épargne',fmtM(epa),`${U()} · comptes épargne${P.liq>0?` · ${masque?'••':Math.round(epa/P.liq*100)} % des comptes`:''}`):'')+
    (inter>0?stat('Intérêts attendus',fmtM(inter),`${U()} sur un an, au taux de vos comptes rémunérés`):'');
  const d0=DEBUT_SUIVI||debutSuivi(),js=d0<=today?nbJ(d0,today):0,depS=sum(deps(allP().filter(e=>e.date>=d0&&e.date<=today))),mens=js?depS/js*30.44:0;
  let neg=0,pos=0;MES().forEach(c=>etatCompte(c).ecarts.forEach(h=>{if(!d0||h.date>=d0){if(h.ecart<0)neg-=h.ecart;else pos+=h.ecart}}));
  return barre+plus+(mens>0?stat("Mois d'autonomie",masque?'•••':fmt1(P.liq/mens),`mois · comptes ÷ dépenses courantes moyennes (${fmtM(mens)} ${U()} par mois)`):'')+
    (neg||pos?stat('Non saisi (soldes notés)',fmtM(neg),`${U()} de sorties manquantes${pos?` · ${fmtM(pos)} d'entrées manquantes`:''}, d'après les écarts des soldes notés`):'');
}
function medianeJours(items,n,j0=1){
  const k=n-j0+1;if(k<1)return null;const j=new Array(k).fill(0);
  deps(items).forEach(e=>{const d=+e.date.slice(8,10);if(d>=j0&&d<=n)j[d-j0]+=e.montant});
  j.sort((a,b)=>a-b);return k%2?j[(k-1)/2]:(j[k/2-1]+j[k/2])/2;
}
/* Dépenses par semaine (2026-11-19) : 4 semaines (1–7, 8–14, 15–21, 22–fin du mois), barres horizontales */
function semaines(items,days,jour){
  const w=[0,0,0,0];deps(items).forEach(e=>{const d=+e.date.slice(8,10);w[Math.min(3,Math.floor((d-1)/7))]+=e.montant});
  const wl=['1–7','8–14','15–21',`22–${days}`],wm=Math.max(1,...w),sc=jour?Math.min(3,Math.floor((jour-1)/7)):-1;
  return `<div class="stat semaine"><span class="label">Dépenses par semaine</span><div class="hsem">`+
    w.map((v,i)=>`<div class="hs${i===sc?' now':''}" title="Du ${wl[i].replace('–',' au ')} : ${fmtM(v)} ${U()}"><span class="d">${wl[i]}</span><span class="tr"><span class="col" style="width:${v?Math.max(1,v/wm*100):0}%"></span></span><span class="v">${v?fmtA(v):'–'}</span></div>`).join('')+'</div></div>';
}
/* Niveau de dépense d'une journée (dépenses courantes), règle choisie par l'utilisateur le 2026-11-13 : on prend la
   journée la moins chère et la plus chère depuis le début du suivi (jours avec dépense), et on partage cet écart en
   trois tranches égales. Vert : tranche du bas ; jaune : tranche du milieu (elle contient le milieu (min+max)/2) ;
   rouge : tranche du haut. Le niveau est aussi écrit (bas, moyen, élevé). */
function seuilsJour(){
  const j=periodeJours(debutSuivi(),today).filter(v=>v>0);if(j.length<5)return null;
  const mn=Math.min(...j),mx=Math.max(...j),t=(mx-mn)/3;if(!(t>0))return null;
  return {min:mn,max:mx,bas:mn+t,haut:mn+2*t,milieu:(mn+mx)/2,n:j.length};
}
const niveauJour=(v,S)=>v<=S.bas?{cls:'bas',l:'bas'}:v<=S.haut?{cls:'moy',l:'moyen'}:{cls:'haut',l:'élevé'};
function opTag(e){
  const cn=dotCpt(e.compte)+esc(nomCpt(e.compte));
  const progTag=e.prog?' · <span class="nat" title="opération programmée">programmée</span>':'';
  const evTag=progTag+(e.evenement?` · <span class="nat exc">★ ${esc((EVT[e.evenement]||{}).nom||e.evenement)}</span>`:'');
  switch(e.nature){
    case 'depense':{const p=CAT[e.categorie]||CAT.autre,po=pourDe(e);return `<span class="dot" aria-hidden="true" style="background:${color(p.id)}"></span>${esc(p.label)}${po.length&&(e.pour||[]).length?` · <span class="nat">pour ${esc(po.length===1&&po[0]==='moi'?'moi':libellePour(po))}</span>`:''}${e.compte!=='especes'?` · ${cn}`:''}${evTag}`}
    case 'revenu':{const r=REV[catRev(e)]||{label:'',courant:true};return `<span class="nat in">Revenu</span> · ${esc(r.label)}${!r.courant&&!e.evenement?' <span class="nat exc">ponctuel</span>':''}${partPonct(e)?` · <span class="nat exc">dont ${fmt(partPonct(e))} ${U()} ${esc(((REV[e.cat_ponctuel]||{label:'autre revenu'}).label).toLowerCase())} (ponctuel)</span>`:''} · ${cn}${evTag}`}
    case 'virement':return `<span class="nat">Virement</span> · ${cn} → ${dotCpt(e.vers)}${esc(nomCpt(e.vers))}`;
    case 'pret':return `<span class="nat out">Prêt</span> · ${esc(e.personne)} · ${cn}${e.echeance?` · échéance ${dmy(e.echeance)}`:''}`;
    case 'remboursement':return `<span class="nat in">Remboursement</span> · ${esc(e.personne)} · ${cn}`;
    case 'investissement':return `<span class="nat inv">Investissement</span> · ${esc((BIEN[e.bien]||{}).nom||'')} · ${cn}`;
  }
  return '';
}

/* ---------- vue patrimoine ---------- */
let releveOuvert=null, estimOuvert=null;
function renderComptes(){
  let tot=0;
  const parts=MES().map(c=>({c,v:Math.max(0,etatCompte(c).solde)})).filter(x=>x.v>0),tp=parts.reduce((a,x)=>a+x.v,0);
  const repart=tp?`<div class="stack" role="img" aria-label="Répartition des soldes">${parts.map(x=>`<span style="flex:${x.v};background:${coulCpt(x.c.id)}" title="${esc(x.c.nom)} : ${fmtM(x.v)} ${U()} (${part(x.v/tp*100)} %)"></span>`).join('')}</div>
    <div class="legend">${parts.map(x=>`<button type="button" class="linkbtn" data-f="c:${x.c.id}">${dotCpt(x.c.id)}${esc(x.c.nom)} <span class="muted">${part(x.v/tp*100)} %</span></button>`).join('')}</div>`:'';
  const tiers=TIERS();
  $('comptesList').innerHTML=repart+COMPTES.filter(c=>c.type!=='tiers').concat(tiers).map((c,i,l)=>{const s=etatCompte(c);if(c.type!=='tiers')tot+=s.solde;const L=s.last;
    const ent=c.type==='tiers'&&c===tiers[0]?`<div class="acct tot"><b>Total des comptes</b><span class="acct-s num">${fmtM(tot)}</span></div>
      <h3 class="sub" style="margin-top:14px">Comptes gérés pour des tiers</h3><p class="hint">Gardés à part : ils ne comptent ni dans vos comptes ni dans vos dépenses. Un solde négatif est de l'argent que vous avez avancé : compté comme dette, il entre dans « On vous doit » ; en sourdine, il reste dans le compte sans entrer dans votre patrimoine.</p>`:'';
    const tit=c.type==='tiers'?`<span class="tag">${c.morale?'Personne morale':'Personne'} · ${esc(c.titulaire||c.nom)}</span>`:`<span class="tag">${TYPES_CPT[c.type]||''}</span>`;
    const ec=s.ecarts.length?`<span class="warn">${s.ecarts.length} écart${s.ecarts.length>1?'s':''} entre relevés</span>`:'';
    const interet=c.taux?`<span class="hint">Intérêts : ${fmt1(c.taux)} % tous les ${c.periode||12} mois, soit environ ${fmtM(s.solde*c.taux/100)} ${U()} par période au solde actuel</span>`:'';
    return ent+`<div class="acct" style="--cc:${coulCpt(c.id)}">
      <div class="acct-h">${dotCpt(c.id)}<button type="button" class="linkbtn" data-f="c:${c.id}"><b>${esc(c.nom)}</b></button>${tit}<span class="acct-s num${s.solde<0?' warn':''}">${fmtM(s.solde)}</span></div>
      ${c.type==='tiers'&&s.solde<0?`<div class="row" style="gap:4px 10px"><span class="hint">Avance de ${fmtM(-s.solde)} ${U()} : ${c.sourdine?'<b>en sourdine</b>, non comptée dans votre patrimoine':'<b>comptée comme dette</b> (« On vous doit »)'}</span><button type="button" class="linkbtn" data-sourd="${c.id}">${c.sourdine?'Compter comme dette':'Mettre en sourdine'}</button></div>`:''}
      <div class="acct-d"><span class="hint">${L?`Relevé du ${dmy(L.date)} : ${fmtM(L.solde)} ${U()}${s.n?` · ${s.n} opération${s.n>1?'s':''} depuis`:''}`:'Aucun relevé : solde calculé depuis zéro'}</span>${ec}${interet}</div>
      <div class="row"><button type="button" class="btn ghost small" data-rel="${c.id}">Noter le solde</button>${s.hist.length?`<details><summary class="hint">Relevés (${s.hist.length})</summary><div class="tbl"><table><thead><tr><th>Date</th><th>Noté</th><th>Attendu</th><th>Écart</th><th></th></tr></thead><tbody>${s.hist.slice().reverse().map(h=>`<tr><td>${dmy(h.date)}</td><td>${fmtM(h.solde)}</td><td>${h.attendu===null?'–':fmtM(h.attendu)}</td><td class="${h.ecart?'warn':''}">${h.attendu===null?'–':h.ecart?sgnM(h.ecart):'0'}</td><td><button type="button" class="del" data-delrel="${c.id}|${h.date}" aria-label="Supprimer ce relevé">✕</button></td></tr>`).join('')}</tbody></table></div></details>`:''}</div>
      ${releveOuvert===c.id?`<div class="row relform"><input type="date" id="relD" value="${today}" aria-label="Date du relevé"><input type="text" inputmode="decimal" id="relV" placeholder="solde ${U_SAISIE()}" aria-label="Solde ${U_SAISIE()}" aria-describedby="relH" style="max-width:11em"><span class="hint" id="relH"></span><button type="button" class="btn small" data-relok="${c.id}">Enregistrer</button><button type="button" class="btn ghost small" data-relno>Annuler</button></div>`:''}
    </div>`}).join('')+(tiers.length?'':`<div class="acct tot"><b>Total des comptes</b><span class="acct-s num">${fmtM(tot)}</span></div>`);
  const v=$('relV');if(v){v.focus();v.oninput=()=>{const m=montantSaisi(v.value,true);$('relH').textContent=isFinite(m)?`= ${fmtC(m)} FCFA`:''}}
}
function renderBiens(){
  if(!BIENS.length){$('biensList').innerHTML='<div class="empty">Aucun bien. Ajoutez-en dans l\'onglet « Comptes et biens ».</div>';return}
  $('biensList').innerHTML=BIENS.map(b=>{const s=etatBien(b);const act=b.type==='actif';
    const val=s.V!==null?`${fmtA(s.V)} <span class="hint">(estimée le ${dmy(s.est.date)})</span>`:'<span class="hint">non renseignée</span>';
    const pv=s.V!==null?`<div class="kv"><span>${s.pv>=0?'Plus-value':'Moins-value'}</span><b style="color:${s.pv>=0?'var(--ok)':'var(--warn)'}">${sgnA(s.pv)} (${s.cout?pct(s.pv/s.cout):'–'})</b></div>`:'';
    const tx=s.taux!==null?`<div class="kv"><span>${s.taux>=0?'Appréciation':'Dépréciation'} annuelle moyenne</span><b style="color:${s.taux>=0?'var(--ok)':'var(--warn)'}">${pct(s.taux)} par an</b></div>${(s.taux>=0)!==act?`<span class="hint">${act?'Ce bien actif perd de la valeur.':'Ce bien passif prend de la valeur.'}</span>`:''}`:'';
    return `<div class="card">
      <div class="acct-h"><b>${esc(b.nom)}</b><span class="tag">${act?'Actif · prend de la valeur':'Passif · perd de la valeur'}</span></div>
      <div class="kv"><span>Acheté${b.date_achat?` le ${dmy(b.date_achat)}`:''}</span><b>${fmtA(b.prix_achat)}</b></div>
      <div class="kv"><button type="button" class="linkbtn" data-f="b:${b.id}">Investissements (${s.nInv})</button><b>${fmtA(s.I)}</b></div>
      <div class="kv"><span>Coût de revient</span><b>${fmtA(s.cout)}</b></div>
      <div class="kv"><span>Valeur actuelle</span><b>${val}</b></div>${pv}${tx}
      ${b.poste?`<div class="kv"><button type="button" class="linkbtn" data-f="b:${b.id}">Frais d'usage (${esc((CAT[b.poste]||{}).label||'')}, ${s.nU})</button><span class="num">${fmtA(s.U)}</span></div>`:''}
      ${estimOuvert===b.id?`<div class="row relform"><input type="date" id="estD" value="${today}" aria-label="Date de l’estimation"><input type="text" inputmode="decimal" id="estV" placeholder="valeur ${U_SAISIE()}" aria-label="Valeur ${U_SAISIE()}" aria-describedby="estH" style="max-width:11em"><span class="hint" id="estH"></span><button type="button" class="btn small" data-estok="${b.id}">Enregistrer</button><button type="button" class="btn ghost small" data-estno>Annuler</button></div>`:`<div class="row"><button type="button" class="btn ghost small" data-est="${b.id}">Mettre à jour la valeur</button></div>`}
    </div>`}).join('');
  const v=$('estV');if(v){v.focus();v.oninput=()=>{const m=montantSaisi(v.value);$('estH').textContent=isFinite(m)?`= ${fmtC(m)} FCFA`:''}}
}
function renderPrets(){
  const cs=creances();
  if(!cs.length){$('pretsList').innerHTML='<div class="empty">Aucun prêt. Notez par exemple « prêt 100 Ali échéance 30/07/26 ».</div>';return}
  const tot=cs.reduce((s,c)=>s+Math.max(0,c.reste),0);
  $('pretsList').innerHTML=`<div class="tbl"><table><thead><tr><th>Personne</th><th>Prêté</th><th>Remboursé</th><th>Reste dû</th><th>Échéance</th></tr></thead><tbody>`+
    cs.map(c=>`<tr class="click${c.reste<=0?' solde':''}" data-f="p:${esc(c.key)}"><td>${esc(c.nom)}<span class="hint"> · depuis le ${dmy(c.premier)}</span></td><td>${fmtM(c.prete)}</td><td>${c.rembourse?fmtM(c.rembourse):'–'}</td><td class="${c.retard?'warn':''}"><b>${c.reste>0?fmtM(c.reste):c.reste<0?'trop-perçu '+fmtM(-c.reste):'soldé'}</b></td><td class="${c.retard?'warn':''}">${c.echeance&&c.reste>0?dmy(c.echeance)+(c.retard?' · en retard':''):'–'}</td></tr>`).join('')+
    `<tr class="tot"><td>Total à recevoir</td><td></td><td></td><td>${fmtM(tot)}</td><td></td></tr></tbody></table></div>`;
}
document.querySelector('.wrap').addEventListener('click',ev=>{const t=ev.target.closest('[data-f]');if(t&&!t.closest('#bars'))voirJournal(t.dataset.f)});
$('comptesList').addEventListener('click',async ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if(b.dataset.rel){releveOuvert=b.dataset.rel;renderComptes();return}
  if('relno' in b.dataset){releveOuvert=null;renderComptes();return}
  if(b.dataset.sourd){   // avance d'un compte de tiers : comptée comme dette, ou en sourdine
    const id=b.dataset.sourd,c=CPT[id];if(!c)return;b.disabled=true;
    try{await api.params({comptes:TOUS.map(x=>x.id!==id?x:{...x,sourdine:!x.sourdine})});await charger(true);
      status(c.sourdine?`${c.nom} : l'avance est de nouveau comptée comme dette.`:`${c.nom} : avance mise en sourdine, hors patrimoine.`)}
    catch(e){status(e.message,true);b.disabled=false}return}
  if(b.dataset.relok||b.dataset.delrel){
    let id,date,solde=null;
    if(b.dataset.relok){id=b.dataset.relok;date=$('relD').value;solde=montantSaisi($('relV').value,true);if(!date||!isFinite(solde)){$('relH').textContent=`Date et solde (${U_SAISIE()}) requis.`;return}}
    else{[id,date]=b.dataset.delrel.split('|');if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Supprimer ?';return}}
    b.disabled=true;try{await api.releve(id,date,solde);releveOuvert=null;await charger()}
    catch(e){status(e.message,true);if($('relH'))$('relH').textContent=e.message;b.disabled=false}
  }
});
$('biensList').addEventListener('click',async ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if(b.dataset.est){estimOuvert=b.dataset.est;renderBiens();return}
  if('estno' in b.dataset){estimOuvert=null;renderBiens();return}
  if(b.dataset.estok){
    const id=b.dataset.estok,date=$('estD').value,valeur=montantSaisi($('estV').value);
    if(!date||!isFinite(valeur)){$('estH').textContent=`Date et valeur (${U_SAISIE()}) requises.`;return}
    const bs=BIENS.map(x=>x.id!==id?x:{...x,estimations:x.estimations.filter(e=>e.date!==date).concat([{date,valeur}])});
    b.disabled=true;try{await api.params({biens:bs});estimOuvert=null;await charger()}catch(e){status(e.message,true);b.disabled=false}
  }
});

/* ---------- navigation ---------- */
const parMois=()=>view==='mois'||(view==='stats'&&statsMode==='mois')||(view==='foyer'&&foyMode==='mois');   // sinon (Année, Statistiques par année, Véhicule) : l'année
$('prev').onclick=()=>{if(parMois()){cur.m--;if(cur.m<0){cur.m=11;cur.y--}}else cur.y--;shown=80;render()};
$('next').onclick=()=>{if(parMois()){cur.m++;if(cur.m>11){cur.m=0;cur.y++}}else cur.y++;shown=80;render()};
/* Téléphone (2026-11-27, demande de l'utilisateur) : dans Mes finances par mois ou par année (Mois, Année, Foyer,
   Statistiques), balayer l'écran vers la gauche = période suivante, vers la droite = période précédente, comme les
   flèches, sans remonter en haut. Pas depuis un tableau ou un graphique qui défile de côté, ni un champ de saisie. */
let glisse=null;
document.addEventListener('touchstart',ev=>{const t=ev.touches[0];
  glisse=ev.touches.length===1&&['mois','annee','foyer','stats'].includes(view)&&!$('prev').hidden&&!$('navBox').hidden&&
    !ev.target.closest('input,select,textarea,button.del,.tbl,.chart,.plot,.clavier,dialog,nav.apptabs,.seg')?{x:t.clientX,y:t.clientY,t:Date.now()}:null},{passive:true});
document.addEventListener('touchend',ev=>{if(!glisse)return;const t=ev.changedTouches[0],dx=t.clientX-glisse.x,dy=t.clientY-glisse.y,dt=Date.now()-glisse.t;glisse=null;
  if(Math.abs(dx)<70||Math.abs(dx)<2*Math.abs(dy)||dt>800)return;
  $(dx<0?'next':'prev').click();
  // petit glissement des cartes affichées, dans le sens du geste
  const c=dx<0?'glisseG':'glisseD';document.querySelectorAll('main.wrap>section:not([hidden])').forEach(s=>{s.classList.remove('glisseG','glisseD');void s.offsetWidth;s.classList.add(c)});
  setTimeout(()=>document.querySelectorAll('.glisseG,.glisseD').forEach(s=>s.classList.remove('glisseG','glisseD')),400)},{passive:true});
// Foyer affiché : Mois / Année changent seulement sa période, on reste dans le Foyer (demande du 27/11)
$('vMois').onclick=()=>{if(view==='foyer')foyMode='mois';else view='mois';shown=80;render()};
$('vAn').onclick=()=>{if(view==='foyer')foyMode='annee';else view='annee';shown=80;render()};
$('vPat').onclick=()=>{view='patrimoine';shown=80;render()};
$('foyBtn').onclick=()=>{if(view==='foyer')view=foyMode==='mois'?'mois':'annee';else{foyMode=view==='mois'?'mois':'annee';view='foyer'}shown=80;render()};
$('vStats').onclick=()=>{view='stats';render();window.scrollTo({top:0,behavior:doux()})};
// Saisir = une nouvelle opération, à la date du jour (et non la dernière date saisie ou modifiée, demande du 28/11)
$('aSaisir').onclick=()=>{nouveauJour();if(editId)resetForm();$('fDate').value=today;navEtape(()=>{retourVue=null;saisieSeule=true;view='donnees';showTab('tOne');render()});window.scrollTo({top:0,behavior:'instant'});$('fAmt').focus({preventScroll:true})};
// une rubrique s'ouvre toujours en haut de la page (la barre figée la laisse toucher depuis n'importe où)
const enHaut=()=>window.scrollTo({top:0,behavior:'instant'});
$('aFin').onclick=()=>{view=vueFin;render();enHaut()};
/* logo : retour à l'accueil = premier écran (Mes finances, vue Mois, mois en cours, haut de page), comme à l'ouverture */
$('logoAccueil').onclick=()=>{nouveauJour();if(editId)resetForm();navEtape(()=>{retourVue=null;saisieSeule=false;vueFin='mois';view='mois';
  cur={y:now.getFullYear(),m:now.getMonth()};filtre='';shown=80;render()});enHaut()};
$('aVeh').onclick=()=>{view='vehicule';render();enHaut()};
/* Mes biens : page d'ensemble (engins, maisons, autres biens) ; un bien s'ouvre dans sa rubrique. Modifier se fait
   seulement par « Modifier les biens » (Comptes et biens), pas sur chaque carte (demande de l'utilisateur, 2026-11-27) */
$('aBiens').onclick=$('bHub').onclick=()=>{view='biens';render();enHaut()};
function renderHub(){
  const V=VEHS(),M=MAISONS(),A=BIENS.filter(b=>!b.vehicule&&!b.maison);
  // projet d'un bien (maison ou autre) : investi / budget, échéance
  const pjTxt=b=>{if(!aProjet(b))return '';const pj=b.projet,s=etatBien(b);return ` · projet ${fmtA(s.I)}${pj.budget?` / ${fmtA(pj.budget)}`:''} ${U()}${pj.echeance?`, échéance ${dmy(pj.echeance)}`:''}`};
  const carte=(b,sous,attr)=>`<div class="hubcard"><button type="button" class="hubgo" ${attr}><b>${esc(b.nom)}</b><span class="hint">${sous}${b.maison?'':pjTxt(b)}</span><span class="chev" aria-hidden="true">›</span></button></div>`;
  const groupe=(titre,ic,l,f)=>l.length?`<h3 class="cbsec hubsec"><svg class="ic" aria-hidden="true" focusable="false"><use href="#${ic}"/></svg>${titre}</h3><div class="hubgrid">${l.map(f).join('')}</div>`:'';
  $('hubList').innerHTML=(BIENS.length?'':'<div class="empty">Aucun bien pour l\'instant : ajoutez un engin, une maison ou un terrain.</div>')+
    groupe('Engins','i-car',V,b=>{const k=kmNow(b);return carte(b,`${ENGINS[b.engin]||'Engin'}${k?` · ${nb(k)} ${UK(b)}`:''}`,`data-hv="${b.id}"`)})+
    groupe('Maisons','i-house',M,b=>{const s=etatBien(b);return carte(b,`travaux ${fmtA(s.I)} ${U()}`,`data-hh="${b.id}"`)})+
    groupe('Autres biens','i-patrimoine',A,b=>{const s=etatBien(b);return carte(b,`${s.V!==null?'valeur':'coût'} ${fmtA(s.V!==null?s.V:s.cout)} ${U()}`,`data-hp="${b.id}"`)});
}
function modifierBien(id,nouveau){navEtape(()=>{retourVue=view;view='donnees';showTab('tCB');render()});
  setTimeout(()=>{if(nouveau)$('addBien').click();
    const r=nouveau?$('bienEdit').lastElementChild:id?document.querySelector(`#bienEdit .cbrow[data-id="${CSS.escape(id)}"]`):$('bienEdit').previousElementSibling;
    if(!r)return;r.scrollIntoView({block:'center',behavior:doux()});const n=r.querySelector('.bNom');if(n)n.focus({preventScroll:true})},0)}
$('hubList').addEventListener('click',ev=>{const t=ev.target.closest('button');if(!t)return;const d=t.dataset;
  if(d.hv){choisirEngin(d.hv);view='vehicule'}else if(d.hh){choisirMaison(d.hh);view='maison'}else if(d.hp){vueFin='patrimoine';view='patrimoine'}else return;
  render();enHaut();if(d.hp)setTimeout(()=>allerJournal('biensPanel'),0)});
$('hubEngin').onclick=()=>$('addEngin').click();
$('hubBien').onclick=()=>modifierBien('',true);
$('hubGerer').onclick=()=>modifierBien('');
$('aMai').onclick=()=>{view='maison';render();enHaut()};
$('aDon').onclick=()=>{navEtape(()=>{retourVue=null;saisieSeule=false;menuReglages=true;view='donnees';render()});enHaut()};
function openMonth(ev){const t=ev.target.closest('[data-m]');if(!t)return;cur.m=+t.dataset.m;view='mois';render();window.scrollTo({top:0,behavior:doux()})}
$('chart').addEventListener('click',openMonth);$('yearTbl').addEventListener('click',openMonth);
$('accFermer').onclick=()=>{memo('appya-accueil-vu','1');render()};
$('accComptes').onclick=()=>{navEtape(()=>{view='donnees';showTab('tCB');render()});$('saisie').scrollIntoView({behavior:doux()})};
$('accSaisir').onclick=()=>{nouveauJour();if(editId)resetForm();$('fDate').value=today;navEtape(()=>{saisieSeule=true;view='donnees';showTab('tOne');render()});$('fAmt').focus()};
$('demoRecreer').onclick=async()=>{if(!confirm('Effacer les données de démo modifiées et recréer les trois années simulées ?'))return;await locCharger();LOC.donnees=await donneesDemo();await locSauver();await charger();status('Données de démo recréées.')};
$('segEngins').addEventListener('click',ev=>{const b=ev.target.closest('[data-v]');if(!b)return;choisirEngin(b.dataset.v);render()});
$('segMaisons').addEventListener('click',ev=>{const b=ev.target.closest('[data-h]');if(!b)return;choisirMaison(b.dataset.h);render()});
$('bars').addEventListener('click',ev=>{const b=ev.target.closest('[data-c]');if(!b)return;filtre=filtre===b.dataset.c?'':b.dataset.c;render();if(filtre)allerJournal('journal')});
let qT;$('q').addEventListener('input',()=>{clearTimeout(qT);qT=setTimeout(()=>{query=$('q').value.trim();render()},200)});
$('more').onclick=()=>{shown+=150;render()};

/* ================= carnet du véhicule ================= */
/* Le véhicule est un bien marqué « vehicule » ; ses opérations (dépenses du poste Voiture et investissements dans le bien)
   portent vehicule, cat_vehicule et, au besoin, km (compteur) et quantite + unite (L ou u). Calculs repris de l'ancien
   My Car : km parcourus = somme des écarts positifs entre relevés successifs ; consommation = litres des pleins
   relevés (sauf le dernier) / distance entre le premier et le dernier plein relevé. */
const CATS_V=[{id:'carburant',l:'Carburant'},{id:'entretien',l:'Entretien'},{id:'reparation',l:'Réparation'},{id:'service',l:'Service'},{id:'achat',l:'Achat'},{id:'investissement',l:'Investissement'},{id:'autre',l:'Autre'}];
const CATV=Object.fromEntries(CATS_V.map(c=>[c.id,c]));
const MOTS_CATV=[['carburant',['essence','gasoil','gazoil','carburant','super','diesel']],['entretien',['vidange','huile','filtre','entretien','lavage','graissage','nettoy']],
  ['reparation',['répar','repar','soudure','tôlerie','tolerie','for ','dépannage','depannage','mécan','mecan']],
  ['service',['diagnostic','visite','contrôle','controle','assurance','fiche technique','vignette','parking','électricien','electricien','main-d']],
  ['achat',['achat','pneu','batterie','amortisseur','couverture','pièce','piece','ampoule']],['investissement',['investissement','installation','gps','autoradio','radio']]];
function guessCatV(lib){const L=String(lib||'').toLowerCase();if(/amende/.test(L))return 'autre';for(const [c,ms] of MOTS_CATV)if(ms.some(m=>L.includes(m)))return c;return 'autre'}
/* Plusieurs engins (voitures, motos…) et plusieurs maisons : la rubrique affiche l'engin / la maison choisi(e) */
const ENGINS={voiture:'Voiture',moto:'Moto',bus:'Bus',camion:'Camion',groupe:'Groupe électrogène',autre:'Autre engin'};
const memo=(k,v)=>{if(v===undefined)return lsGet(k)||'';lsSet(k,v)};
let vehSelId=memo('appya-engin'),maiSelId=memo('appya-maison');
const VEHS=()=>BIENS.filter(b=>b.vehicule);
/* unité du compteur : heures de marche pour un groupe électrogène, kilomètres sinon */
const UK=v=>v&&v.engin==='groupe'?'h':'km';
const INTERVALLE_DEFAUT=t=>t==='groupe'?250:3000;
const VEH=()=>{const l=VEHS();return l.find(b=>b.id===vehSelId)||l[0]||null};
function choisirEngin(id){vehSelId=id;memo('appya-engin',id);vehSel=null}
/* engin d'une saisie : bien investi, sinon nom propre de l'engin cité (« yamaha », « corolla »), sinon l'engin affiché
   s'il a ce poste, sinon un engin de ce poste, sinon l'engin affiché */
const MOTS_GENERIQUES=new Set(['voiture','moto','camion','vehicule','engin','auto','bus']);
/* engin CITÉ dans le libellé : un mot propre de son nom (« corolla », « yamaha »), sinon son type quand un seul engin
   est de ce type (« essence moto » → la moto, « gasoil groupe » → le groupe) ; sinon null */
const MOTS_TYPE_ENGIN={voiture:['voiture','auto'],moto:['moto'],bus:['bus'],camion:['camion'],groupe:['groupe','generateur','electrogene']};
const motEntier=(L,w)=>new RegExp(`(^|[^a-z0-9])${w}s?([^a-z0-9]|$)`).test(L);
/* engin cité par un mot PROPRE de son nom (« corolla », « hyundai ») : cela suffit à faire de la note une dépense d'engin */
function enginCiteNom(lib){const L=normTxt(lib);
  return VEHS().find(v=>normTxt(v.nom).split(/[^a-z0-9]+/).some(w=>w.length>=4&&!MOTS_GENERIQUES.has(w)&&hasWord(L,w)))||null}
/* le type seul (« moto ») ne fait que CHOISIR l'engin quand la note est déjà une dépense d'engin (mot fort, poste dédié) :
   « essence moto » → la moto, mais « taxi moto » reste un transport payé */
function enginCite(lib){
  const L=normTxt(lib),l=VEHS();
  const nom=enginCiteNom(lib);
  if(nom)return nom;
  for(const [t,mots] of Object.entries(MOTS_TYPE_ENGIN))if(mots.some(w=>motEntier(L,w))){const u=l.filter(v=>(v.engin||'voiture')===t);if(u.length===1)return u[0]}
  return null;
}
/* poste DÉDIÉ aux engins (2026-11-25) : un de ses mots-clés est un mot fort du véhicule (carburant, vidange, garage…), comme le
   poste « Voiture ». Toute dépense d'un poste dédié est une dépense d'engin. Un poste PARTAGÉ (Foyer avec un groupe
   électrogène, Transport avec une moto) ne donne une dépense d'engin que si l'engin est cité ou qu'un mot fort est écrit :
   sinon « riz » devenait une dépense du groupe et « taxi » une dépense de la moto. */
function posteDedie(p){const c=CAT[p];return !!c&&c.mots.some(m=>{const k=normTxt(m);return k.length>=4&&MOTS_VEH_FORTS.some(f=>k.startsWith(f)||f.startsWith(k))})}
function enginDe(lib,categorie,bien){
  if(bien&&BIEN[bien]&&BIEN[bien].vehicule)return BIEN[bien];
  const l=VEHS();
  const cite=enginCite(lib);
  if(cite)return cite;
  const cur=VEH();if(cur&&categorie&&cur.poste===categorie)return cur;
  return l.find(v=>categorie&&v.poste===categorie)||cur;
}
const MOTS_VEH_FORTS=['vidange','carburant','essence','gasoil','gazoil','diesel','vulcanis','garage','mecanicien','pneu'];   // forme sans accents (normTxt)
/* pièces et organes d'un engin (2026-11-25) : désignent aussi l'engin et passent avant l'ordre des postes (« filtre huile
   boîte » ≠ huile du Foyer ; « réparation pompe boîte » ≠ pompe du terrain). Pas « bougie » (bougie d'éclairage au Foyer).
   Ils ne servent pas à reconnaître un poste dédié (posteDedie). */
const MOTS_VEH_PIECES=['filtre','boite','radiateur','demarreur','injecteur','bobine','alternateur','carburateur','embrayage','frein',
  'courroie','suspension','amortisseur','parallelisme','calandre','diagnostic'];
const motVehFort=L=>MOTS_VEH_FORTS.some(k=>hasWord(L,k))||MOTS_VEH_PIECES.some(k=>hasWord(L,k));
const vidangeDe=v=>({intervalle:INTERVALLE_DEFAUT(v&&v.engin),dernier:0,prochain:0,...((v&&v.vidange)||{})});
const isVidange=e=>/vidange/i.test(e.libelle)&&!/bo[iî]te/i.test(e.libelle);
const nb=(n,d=0)=>(+n).toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:d});   // km, litres : jamais convertis en devise
const colV=id=>`var(--cv-${CATV[id]?id:'autre'})`;
let vehAll=false,vehSel=null,vehQ='',vehShown=60;   // plus d'étiquettes de catégorie (demande du 2026-11-13)
function vehOps(v=VEH()){return v?sorted(all.filter(e=>e.vehicule===v.id)):[]}
function chaineKm(list){let prev=null;return list.map(e=>{let diff=null;if(e.km){if(prev!=null)diff=e.km-prev;prev=e.km}return {...e,diff}})}
function statsVeh(items,v=VEH()){
  const total=sum(items),fuel=items.filter(e=>e.cat_vehicule==='carburant'),fuelTot=sum(fuel);
  const withQ=fuel.filter(e=>e.quantite>0),litres=withQ.reduce((a,e)=>a+e.quantite,0),cout=sum(withQ);
  const km=items.reduce((a,e)=>a+(e.diff>0?e.diff:0),0),fk=withQ.filter(e=>e.km).sort((a,b)=>a.km-b.km);
  let conso=null;if(fk.length>=2){const dist=fk[fk.length-1].km-fk[0].km,l=fk.slice(0,-1).reduce((a,e)=>a+e.quantite,0);if(dist>0)conso=UK(v)==='h'?l/dist:l/dist*100}
  return {total,fuelTot,litres,prix:litres?cout/litres:null,km,conso,mois:new Set(items.map(e=>e.date.slice(0,7))).size,n:items.length,inv:ofNat(items,'investissement')};
}
function kmNow(v=VEH()){return Math.max(vidangeDe(v).dernier||0,...vehOps(v).map(e=>e.km||0),0)}
function renderVehicule(){
  const v=VEH();
  ['vehDash','vehRecap','vehVid','vehJournal'].forEach(i=>$(i).hidden=!v);
  if(!v){$('vehHero').innerHTML='<div class="empty">Aucun engin pour l\'instant : voiture, moto, bus, groupe électrogène… Touchez « + Ajouter un engin » ci-dessus.</div>';return}
  const vd=vidangeDe(v),list=chaineKm(vehOps()),k=kmNow();
  /* vidange */
  $('kmNow').textContent=k?nb(k)+' '+UK(v):'—';
  if(vd.prochain&&k){
    const left=vd.prochain-k,span=Math.max(1,vd.prochain-vd.dernier),p=Math.min(100,Math.max(0,(k-vd.dernier)/span*100)),warn=left<=500;
    // pourcentages écrits dans la barre (demande du 2026-11-19) : effectué / restant de l'intervalle ; un segment trop court reste muet
    const pf=Math.round(p),g=$('gauge');g.querySelector('.gfait').style.width=p+'%';g.querySelector('.gfait span').textContent=pf>=10?pf+' %':'';
    g.querySelector('.greste span').textContent=100-pf>=10?(100-pf)+' %':'';g.classList.toggle('warn',warn);
    $('gauge').setAttribute('aria-valuenow',Math.round(p));$('gauge').setAttribute('aria-valuetext',`${Math.round(p)} % de l'intervalle, ${nb(left)} ${UK(v)} avant la vidange`);
    const pill=$('vPill');pill.hidden=!warn;pill.className='pill warn';pill.textContent=left<=0?'Vidange dépassée':'Vidange bientôt';
  }else{const g=$('gauge');g.querySelector('.gfait').style.width='0';g.querySelectorAll('span').forEach(x=>x.textContent='');$('vPill').hidden=true}
  $('tLast').textContent='dernière '+(vd.dernier?nb(vd.dernier)+' '+UK(v):'—');$('tNext').textContent='prochaine '+(vd.prochain?nb(vd.prochain)+' '+UK(v):'—');
  $('vehDashNom').innerHTML=`<svg class="ic" style="margin-right:6px" aria-hidden="true" focusable="false"><use href="#i-car"/></svg>${esc(v.nom)} · ${esc(ENGINS[v.engin]||'Engin')}`;
  /* indicateurs de la période */
  const items=vehAll?list:list.filter(e=>e.date.startsWith(cur.y+'-')),st=statsVeh(items);
  $('vehTitre').innerHTML=`<svg class="ic" style="color:var(--accent);margin-right:6px" aria-hidden="true" focusable="false"><use href="#i-car"/></svg>${esc(v.nom)} · ${vehAll?'toutes les années':cur.y}`;
  // plus de ligne « N lignes, du … au … » sous le titre (demande du 2026-11-19)
  // couleur : liseré de la catégorie (carburant, entretien) ; comparaisons en vert (mieux) ou rouge (moins bien), avec le signe
  const tile=(l,val,s,o={})=>`<div class="stat"${o.lis?` style="border-left:4px solid ${o.lis};padding-left:8px"`:''}><span class="label">${lblIc(l)}</span><span class="v"${o.col?` style="color:${o.col}"`:''}>${valAbr(l,val)}</span><span class="s">${s}</span></div>`;
  const ent=items.filter(e=>['entretien','reparation','service'].includes(e.cat_vehicule)).reduce((a,e)=>a+e.montant,0);
  const glob=statsVeh(list,v),consoCol=st.conso&&glob.conso&&!vehAll?(st.conso>glob.conso*1.1?'var(--warn)':st.conso<glob.conso*.9?'var(--ok)':''):'';
  // même période de l'année précédente (année en cours : jusqu'au même jour)
  let vs='';if(!vehAll){const y0=cur.y-1,lim=cur.y===now.getFullYear()?`${y0}${today.slice(4)}`:`${y0}-12-31`,av=list.filter(e=>e.date.startsWith(y0+'-')&&e.date<=lim),ta=sum(av);
    if(ta>0){const d=st.total/ta-1;vs=tile(`Vs ${y0}${cur.y===now.getFullYear()?' même période':''}`,pct(d),`${fmtM(ta)} ${U()} en ${y0}`,{col:d>0?'var(--warn)':'var(--ok)'})}}
  // prochaine vidange : date estimée au rythme des 6 derniers mois (km ou heures par jour)
  let pvid='';if(vd.prochain&&k){const left=vd.prochain-k,d0=addJ(today,-182),anc=list.filter(e=>e.km&&e.date>=d0).sort((a,b)=>a.km-b.km)[0];
    const rythme=anc&&k>anc.km?(k-anc.km)/Math.max(1,nbJ(anc.date,today)-1):0;
    if(left<=0)pvid=tile('Prochaine vidange','dépassée',`de ${nb(-left)} ${UK(v)}`,{col:'var(--warn)'});
    else if(rythme>0){const dt=addJ(today,Math.round(left/rythme)),j=nbJ(today,dt)-1;
      pvid=tile('Prochaine vidange',`vers le ${dmy(dt)}`,`dans ${j} jours environ · ${nb(rythme,1)} ${UK(v)}/jour`,{col:j<=30?'var(--warn)':''})}}
  $('vehHero').innerHTML=tile('Dépenses',fmtM(st.total),`${U()}${st.mois?` · ${fmtM(st.total/st.mois)} par mois`:''}`)+vs+
    tile('Carburant',fmtM(st.fuelTot),`${U()} · ${nb(st.litres)} L${st.total?` · ${Math.round(st.fuelTot/st.total*100)} %`:''}`,{lis:colV('carburant')})+
    tile('Entretien et réparations',fmtM(ent),`${U()}${st.total?` · ${Math.round(ent/st.total*100)} % des dépenses`:''}`,{lis:colV('reparation')})+
    tile('Prix moyen du litre',st.prix?fmtM(st.prix):'—',`${U()}/L`)+tile('Consommation',st.conso?nb(st.conso,1):'—',`${UK(v)==='h'?'L/h':'L/100 km'}${consoCol?` · moyenne ${nb(glob.conso,1)}`:''}`,{col:consoCol})+pvid+
    (UK(v)==='h'?tile('Heures de marche',st.km?nb(st.km):'—',st.km&&st.mois?`h · ${nb(st.km/st.mois)} h/mois`:'h')+tile('Coût par heure',st.km?fmtM(st.total/st.km):'—',`${U()}/h`)
    :tile('Km parcourus',st.km?nb(st.km):'—',st.km&&st.mois?`km · ${nb(st.km/st.mois)} km/mois`:'km')+tile('Coût total par km',st.km?fmtM(st.total/st.km):'—',`${U()}/km${st.km?` · ${fmtM((st.total-st.fuelTot)/st.km)} hors carburant`:''}`));
  /* récapitulatif : mois de l'année, ou années */
  let bk;
  if(vehAll){const ys=[...new Set(list.map(e=>e.date.slice(0,4)))].sort();bk=ys.map(y=>({key:y,label:y,court:y,items:list.filter(e=>e.date.startsWith(y+'-'))}))}
  else bk=MOIS.map((m,i)=>({key:i,label:new Date(cur.y,i,1).toLocaleDateString('fr-FR',{month:'long'}),court:m.slice(0,4),items:items.filter(e=>+e.date.slice(5,7)-1===i)}));
  bk.forEach(b=>{b.st=statsVeh(b.items,v);b.cats={};b.items.forEach(e=>b.cats[e.cat_vehicule]=(b.cats[e.cat_vehicule]||0)+e.montant)});
  $('vehRecTitre').textContent=vehAll?'Récapitulatif annuel':'Récapitulatif mensuel';$('vehRecHint').textContent=vehAll?'Touchez une année pour l\'ouvrir':'Touchez un mois pour filtrer le journal';
  const mx=Math.max(1,...bk.map(b=>b.st.total)),used=CATS_V.filter(c=>items.some(e=>e.cat_vehicule===c.id));
  $('vehChart').style.gridTemplateColumns=`repeat(${bk.length},1fr)`;
  $('vehChart').innerHTML=bk.map(b=>`<div class="vcol${vehSel===b.key?' sel':''}"><button type="button" data-k="${b.key}" aria-label="${esc(b.label)} : ${fmtM(b.st.total)} ${U()}"><span class="vv">${b.st.total?fmtAxeM(b.st.total/DEV.taux):''}</span><div class="vstack" style="height:${b.st.total/mx*78}%">${CATS_V.filter(c=>b.cats[c.id]).map(c=>`<div style="flex:${b.cats[c.id]};background:${colV(c.id)}"></div>`).join('')}</div><span class="m">${esc(b.court)}</span></button></div>`).join('');
  $('vehLegend').innerHTML=used.map(c=>`<span><i class="lk" style="background:${colV(c.id)}" aria-hidden="true"></i>${c.l}</span>`).join('');
  const tot={};used.forEach(c=>tot[c.id]=sum(items.filter(e=>e.cat_vehicule===c.id)));const cell=x=>x?fmtM(x):'–';
  $('vehTbl').innerHTML=!items.length?`<tbody><tr><td class="empty" style="text-align:center">Aucune dépense du véhicule en ${cur.y}.</td></tr></tbody>`:
    `<thead><tr><th>${vehAll?'Année':'Mois'}</th>${used.map(c=>`<th>${c.l}</th>`).join('')}<th>Total</th><th>Litres</th><th>${UK(v)==='h'?'Heures':'Km'}</th>${vehAll?(UK(v)==='h'?'<th>L/h</th><th>Par h</th>':'<th>L/100</th><th>Par km</th>'):''}</tr></thead><tbody>`+
    bk.filter(b=>b.st.n).map(b=>`<tr class="click${vehSel===b.key?' sel':''}" data-k="${b.key}"><td>${esc(b.label)}</td>${used.map(c=>`<td>${cell(b.cats[c.id])}</td>`).join('')}<td><b>${fmtM(b.st.total)}</b></td><td>${b.st.litres?nb(b.st.litres):'–'}</td><td>${b.st.km?nb(b.st.km):'–'}</td>${vehAll?`<td>${b.st.conso?nb(b.st.conso,1):'–'}</td><td>${b.st.km?fmtM(b.st.total/b.st.km):'–'}</td>`:''}</tr>`).join('')+
    `<tr class="tot"><td>Total</td>${used.map(c=>`<td>${cell(tot[c.id])}</td>`).join('')}<td>${fmtM(st.total)}</td><td>${st.litres?nb(st.litres):'–'}</td><td>${st.km?nb(st.km):'–'}</td>${vehAll?`<td>${st.conso?nb(st.conso,1):'–'}</td><td>${st.km?fmtM(st.total/st.km):'–'}</td>`:''}</tr></tbody>`;
  /* vidanges (toutes années) */
  let pv=null;const vr=list.filter(e=>isVidange(e)&&e.km).map(e=>{const r={...e,int:pv!=null?e.km-pv:null};pv=e.km;return r}),ints=vr.filter(r=>r.int!=null).map(r=>r.int);
  $('vidInt').textContent=nb(vd.intervalle);$('vidSub').textContent=ints.length?`intervalle moyen ${nb(moyenne(ints))} ${UK(v)}`:'';
  $('vidTbl').innerHTML=vr.length?`<thead><tr><th>Date</th><th>Nature</th><th>${UK(v)==='h'?'Heures':'Km'}</th><th>Intervalle</th><th>Coût</th></tr></thead><tbody>`+
    vr.slice(-1).map(r=>`<tr><td>${dmy(r.date)}</td><td style="text-align:left;font-family:var(--f-body)">${esc(r.libelle)}</td><td>${nb(r.km)}</td><td class="${r.int>vd.intervalle*1.2?'long':''}">${r.int!=null?nb(r.int)+' '+UK(v):'–'}${r.int>vd.intervalle*1.2?'<span class="sr"> (intervalle trop long)</span>':''}</td><td>${fmtM(r.montant)}</td></tr>`).join('')+
    (vd.prochain?`<tr class="tot"><td>Prochaine</td><td style="text-align:left">prévue</td><td>${nb(vd.prochain)}</td><td>${vd.dernier?nb(vd.prochain-vd.dernier)+' '+UK(v):'–'}</td><td></td></tr>`:'')+'</tbody>'
    :'<tbody><tr><td class="empty" style="text-align:center">Aucune vidange avec compteur enregistrée.</td></tr></tbody>';
  if(vr.length)$('vidTbl').querySelector('tbody tr:first-child td:first-child').innerHTML=`Dernière<br><span class="hint">${dmy(vr[vr.length-1].date)}</span>`;
  /* filtres et journal du véhicule */
  let jl=items.slice().reverse();
  if(vehSel!==null)jl=jl.filter(e=>vehAll?e.date.startsWith(vehSel+'-'):+e.date.slice(5,7)-1===vehSel);
  if(vehQ){const q=normTxt(vehQ);jl=jl.filter(e=>normTxt(e.libelle+' '+e.remarque).includes(q))}
  $('vehJSub').textContent=`${jl.length} lignes · ${fmt(sum(jl))} ${U()}`;
  let html='',jd=null;
  for(const e of jl.slice(0,vehShown)){
    if(e.date!==jd){jd=e.date;html+=`<div class="dayhead"><strong>${new Date(e.date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</strong></div>`}
    const det=[CATV[e.cat_vehicule]?.l||'Autre'].concat(e.nature==='investissement'?['coût du véhicule']:[],e.quantite?[`${nb(e.quantite,2)} ${e.unite==='u'?'u.':'L'}`]:[],e.km?[`${nb(e.km)} ${UK(v)}`]:[],e.diff>0?[`+${nb(e.diff)} ${UK(v)}`]:[]).join(' · ');
    html+=`<div class="item${editId===e.id?' editing':''}" data-id="${e.id}"><button type="button" class="lib"><span class="sr">Modifier : </span><span>${esc(e.libelle)}</span><span class="tag"><span class="dot" aria-hidden="true" style="background:${colV(e.cat_vehicule)}"></span>${esc(det)}${e.remarque&&!/^carnet du véhicule \S+$/.test(e.remarque)?` · ${esc(e.remarque.replace(/ ?·? ?carnet du véhicule \S+/,''))}`:''}</span></button><span class="amt">${fmt(e.montant)}<span class="sr"> ${U()}</span></span><button type="button" class="del" data-del="${e.id}" aria-label="Supprimer ${esc(e.libelle)}">✕</button></div>`;
  }
  $('vehList').innerHTML=jl.length?html:'<div class="empty">Aucune dépense du véhicule pour ce filtre.</div>';
  $('vehMore').hidden=jl.length<=vehShown;$('vehMore').textContent=`Afficher plus (${jl.length-vehShown} restantes)`;
}
function choixBucketVeh(k){if(vehAll){cur.y=+k;vehAll=false;vehSel=null}else vehSel=vehSel===k?null:k;render();if(vehSel!==null)allerJournal('vehJournal')}
$('vehChart').addEventListener('click',ev=>{const b=ev.target.closest('[data-k]');if(b)choixBucketVeh(vehAll?b.dataset.k:+b.dataset.k)});
$('vehTbl').addEventListener('click',ev=>{const t=ev.target.closest('tr[data-k]');if(t)choixBucketVeh(vehAll?t.dataset.k:+t.dataset.k)});
let vqT;$('vq').addEventListener('input',()=>{clearTimeout(vqT);vqT=setTimeout(()=>{vehQ=$('vq').value.trim();render()},200)});
$('vehMore').onclick=()=>{vehShown+=150;render()};
$('vehAn').onclick=()=>{vehAll=false;vehSel=null;render()};
$('vehTout').onclick=()=>{vehAll=true;vehSel=null;render()};

/* ajouter un engin depuis la rubrique Engins */
function majEnginForm(){const t=$('eType').value,u=t==='groupe'?'h':'km';$('eIntLab').textContent=`Intervalle de vidange (${u})`;$('eDerLab').textContent=`Dernière vidange (${u}, facultatif)`;
  if(!$('eInt').dataset.touche)$('eInt').value=INTERVALLE_DEFAUT(t);
  if(!$('ePoste').dataset.touche){const pref=t==='groupe'?['energie','foyer']:t==='bus'||t==='camion'?['transport','voiture']:['voiture','transport'];$('ePoste').value=pref.find(x=>CAT[x])||'autre'}}
$('addEngin').onclick=()=>{$('enginForm').reset();delete $('eInt').dataset.touche;delete $('ePoste').dataset.touche;
  $('eType').innerHTML=Object.entries(ENGINS).map(([k,l])=>`<option value="${k}">${l}</option>`).join('');
  $('ePoste').innerHTML=CATS.map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join('');majEnginForm();$('eMsg').textContent='';$('dlgEngin').showModal();$('eNom').focus()};
$('eType').addEventListener('change',majEnginForm);$('eInt').addEventListener('input',()=>{$('eInt').dataset.touche=1});$('ePoste').addEventListener('change',()=>{$('ePoste').dataset.touche=1});
$('eAnnuler').onclick=()=>$('dlgEngin').close();
$('enginForm').addEventListener('submit',async ev=>{ev.preventDefault();
  const nom=$('eNom').value.trim(),t=$('eType').value,int=Math.round(num($('eInt').value))||INTERVALLE_DEFAUT(t),der=Math.round(num($('eDer').value))||0;
  const prix=$('ePrix').value.trim()?montantSaisi($('ePrix').value):0;if(!nom){$('eMsg').textContent='Donnez un nom.';return}if(!isFinite(prix)){$('eMsg').textContent=`Prix d'achat invalide (${U_SAISIE()}).`;return}
  const id=nouvelId(nom,new Set(BIENS.map(b=>b.id)));
  const b={id,nom,type:'passif',date_achat:$('eDate').value,prix_achat:prix,poste:$('ePoste').value==='autre'?'':$('ePoste').value,mots:[],estimations:[],vehicule:true,engin:t,vidange:{intervalle:int,dernier:der,prochain:der?der+int:0}};
  try{await api.params({biens:BIENS.concat([b])});choisirEngin(id);$('dlgEngin').close();await charger();status(`Engin « ${nom} » ajouté.`)}catch(e){$('eMsg').textContent=e.message}});

/* repères de vidange (Mes biens › Engins › Modifier les repères de vidange) */
function openVidange(){const v=VEH(),vd=vidangeDe(v);$('vidVehNom').textContent=v?v.nom:'aucun engin (Comptes et biens › rôle « Engin »)';$('vidForm').hidden=!v;
  $('vidPanel').dataset.v=v?v.id:'';$('vidChoix').hidden=true;   // l'engin est celui affiché dans Engins
 $('vidVeh').innerHTML=VEHS().map(b=>`<option value="${b.id}"${v&&b.id===v.id?' selected':''}>${esc(b.nom)}</option>`).join('');
  const u=UK(v);$('sIntLab').textContent=`Intervalle de vidange (${u})`;$('sLastLab').textContent=`Dernière vidange (${u})`;$('sNextLab').textContent=`Prochaine vidange (${u})`;
  $('sInt').value=vd.intervalle||'';$('sLast').value=vd.dernier||'';$('sNext').value=vd.prochain||''}
['sInt','sLast'].forEach(i=>$(i).addEventListener('input',()=>{const a=num($('sInt').value),b=num($('sLast').value);if(a>0&&b>0)$('sNext').value=b+a}));
$('vidVeh').addEventListener('change',()=>{choisirEngin($('vidVeh').value);openVidange();render()});
/* repères de vidange : dans Engins, pour l'engin affiché (2026-11-27 ; avant : onglet « Repères vidange » des réglages) */
$('vidModif').onclick=()=>{const p=$('vidPanel'),o=p.hidden;if(o)openVidange();p.hidden=!o;$('vidModif').setAttribute('aria-expanded',o);if(o)$('sInt').focus()};
async function enregistrerVidange(vd,v=VEH()){if(!v)return;await api.params({biens:BIENS.map(b=>b.id===v.id?{...b,vidange:vd}:b)})}
$('vidForm').addEventListener('submit',async ev=>{ev.preventDefault();
  const vd={intervalle:Math.round(num($('sInt').value))||3000,dernier:Math.round(num($('sLast').value))||0,prochain:Math.round(num($('sNext').value))||0};
  try{await enregistrerVidange(vd);await charger();$('vidMsg').textContent='';$('vidPanel').hidden=true;$('vidModif').setAttribute('aria-expanded',false);status('Repères de vidange enregistrés.')}catch(e){$('vidMsg').textContent=e.message}});

/* ================= carnet de la maison ================= */
/* La maison est un bien marqué « maison » ; ses travaux sont des investissements dans ce bien,
   classés par cat_maison. Le bien porte projet = {budget, echeance, note} pour les perspectives. */
const CATS_M=[{id:'terrain',l:'Terrain'},{id:'administratif',l:'Administratif'},{id:'arrosage',l:'Arrosage'},{id:'eau',l:'Eau, pompe, forage'},{id:'maconnerie',l:'Maçonnerie'},
  {id:'materiaux',l:'Matériaux'},{id:'electricite',l:'Électricité'},{id:'main-oeuvre',l:'Main-d\'œuvre'},{id:'autre',l:'Autre'}];
const CATM=Object.fromEntries(CATS_M.map(c=>[c.id,c]));
const MOTS_CATM=[['terrain',['achat terrain','bornage','lotissement']],['administratif',['titre foncier','permis','notaire','mairie','cadastre','dossier','timbre']],
  ['main-oeuvre',['main d','main-d','ouvrier','gardien','manoeuvre','manœuvre','tâcheron','tacheron']],   // avant maçonnerie : « main-d'œuvre maçon »
  ['arrosage',['arrosage','arroser']],['eau',['pompe','forage','puits','citerne','robinet','eau']],
  ['maconnerie',['fondation','maçon','macon','brique','parpaing','béton','beton','dalle','mur','trou','fouille']],
  ['materiaux',['ciment','sable','gravier','fer ','tôle','tole','bois','planche','matériau','materiau']],['electricite',['électric','electric','câble','cable','solaire','panneau']]];
function guessCatM(lib){const L=String(lib||'').toLowerCase();for(const [c,ms] of MOTS_CATM)if(ms.some(m=>L.includes(m)))return c;return 'autre'}
const MAISONS=()=>BIENS.filter(b=>b.maison);
const MAISON=()=>{const l=MAISONS();return l.find(b=>b.id===maiSelId)||l[0]||null};
function choisirMaison(id){maiSelId=id;memo('appya-maison',id);maiSel=null}
const colM=id=>`var(--cm-${CATM[id]?id:'autre'})`;
let maiAll=true,maiSel=null;   // plus d'étiquettes de catégorie (demande du 2026-11-13)
function maiOps(){const m=MAISON();return m?sorted(all.filter(e=>e.nature==='investissement'&&e.bien===m.id)):[]}
function renderMaison(){
  const m=MAISON();
  ['maiDash','maiRecap','maiPersp','maiJournal'].forEach(i=>$(i).hidden=!m);
  if(!m){$('maiHero').innerHTML='<div class="empty">Aucune maison. Dans Données et réglages › Comptes et biens, ajoutez le terrain ou la maison et choisissez son rôle « Maison ».</div>';return}
  const s=etatBien(m),ops=maiOps(),pj={budget:0,echeance:'',note:'',...(m.projet||{})};
  /* bandeau : coût et valeur */
  $('maiNom').textContent=m.nom;
  $('maiCout').innerHTML=`${fmtM(s.cout)}<small>${esc(U())}</small>`;
  $('maiAchat').textContent=`terrain ${fmtM(m.prix_achat)} ${U()}${m.date_achat?` (acheté le ${dmy(m.date_achat)})`:''} + travaux ${fmtM(s.I)} ${U()}`;
  $('maiValeur').textContent=s.V!==null?`${fmtM(s.V)} ${U()}`:'non renseignée';
  $('maiValeurS').textContent=s.V!==null?`estimée le ${dmy(s.est.date)} · ${s.pv>=0?'plus':'moins'}-value ${sgnM(s.pv)} ${U()}${s.taux!==null?` · ${pct(s.taux)} par an`:''}`:'Notez-la dans Mes finances › Patrimoine';
  /* indicateurs de la période */
  const items=maiAll?ops:ops.filter(e=>e.date.startsWith(cur.y+'-')),tot=sum(items),nmois=new Set(items.map(e=>e.date.slice(0,7))).size;
  const pc={};items.forEach(e=>pc[e.cat_maison||'autre']=(pc[e.cat_maison||'autre']||0)+e.montant);const top=Object.entries(pc).sort((a,b)=>b[1]-a[1])[0];
  $('maiTitre').textContent=`${m.nom} · ${maiAll?'depuis le début':cur.y}`;
  $('maiSub').textContent=items.length?`${items.length} dépense${items.length>1?'s':''} de travaux, du ${dmy(items[0].date)} au ${dmy(items[items.length-1].date)}`:'';
  const tile=(l,val,sub)=>`<div class="stat"><span class="label">${lblIc(l)}</span><span class="v">${valAbr(l,val)}</span><span class="s">${sub}</span></div>`;
  $('maiHero').innerHTML=tile('Travaux',fmtM(tot),`${U()} · ${items.length} opérations`)+tile('Par mois de travaux',nmois?fmtM(tot/nmois):'—',`${U()} · ${nmois} mois avec dépense`)+
    tile('Poste principal',top?`<span style="font-family:var(--f-body)">${esc(CATM[top[0]].l)}</span>`:'—',top?`${fmtM(top[1])} ${U()} · ${Math.round(top[1]/tot*100)} %`:'')+
    tile('Part du terrain',s.cout?Math.round(m.prix_achat/s.cout*100)+' %':'—','du coût de revient');
  /* récapitulatif : années, ou mois de l'année */
  let bk;
  if(maiAll){const ys=[...new Set(ops.map(e=>e.date.slice(0,4)))].sort();bk=ys.map(y=>({key:y,label:y,court:y,items:ops.filter(e=>e.date.startsWith(y+'-'))}))}
  else bk=MOIS.map((x,i)=>({key:i,label:new Date(cur.y,i,1).toLocaleDateString('fr-FR',{month:'long'}),court:x.slice(0,4),items:items.filter(e=>+e.date.slice(5,7)-1===i)}));
  bk.forEach(b=>{b.tot=sum(b.items);b.cats={};b.items.forEach(e=>{const c=e.cat_maison||'autre';b.cats[c]=(b.cats[c]||0)+e.montant})});
  $('maiRecTitre').textContent=maiAll?'Travaux par année':'Travaux par mois';
  const mx=Math.max(1,...bk.map(b=>b.tot)),used=CATS_M.filter(c=>items.some(e=>(e.cat_maison||'autre')===c.id));
  $('maiChart').style.gridTemplateColumns=`repeat(${Math.max(1,bk.length)},1fr)`;
  $('maiChart').innerHTML=bk.map(b=>`<div class="vcol${maiSel===b.key?' sel':''}"><button type="button" data-k="${b.key}" aria-label="${esc(b.label)} : ${fmtM(b.tot)} ${U()}"><span class="vv">${b.tot?fmtAxeM(b.tot/DEV.taux):''}</span><div class="vstack" style="height:${b.tot/mx*78}%">${CATS_M.filter(c=>b.cats[c.id]).map(c=>`<div style="flex:${b.cats[c.id]};background:${colM(c.id)}"></div>`).join('')}</div><span class="m">${esc(b.court)}</span></button></div>`).join('');
  $('maiLegend').innerHTML=used.map(c=>`<span><i class="lk" style="background:${colM(c.id)}" aria-hidden="true"></i>${esc(c.l)}</span>`).join('');
  const cell=x=>x?fmtM(x):'–';
  $('maiTbl').innerHTML=!items.length?`<tbody><tr><td class="empty" style="text-align:center">Aucuns travaux ${maiAll?'notés':'en '+cur.y}.</td></tr></tbody>`:
    `<thead><tr><th>${maiAll?'Année':'Mois'}</th>${used.map(c=>`<th>${esc(c.l)}</th>`).join('')}<th>Total</th></tr></thead><tbody>`+
    bk.filter(b=>b.tot).map(b=>`<tr class="click${maiSel===b.key?' sel':''}" data-k="${b.key}"><td>${esc(b.label)}</td>${used.map(c=>`<td>${cell(b.cats[c.id])}</td>`).join('')}<td><b>${fmtM(b.tot)}</b></td></tr>`).join('')+
    `<tr class="tot"><td>Total</td>${used.map(c=>`<td>${cell(pc[c.id])}</td>`).join('')}<td>${fmtM(tot)}</td></tr></tbody>`;
  /* perspectives : rythme d'investissement, budget du projet, échéance, valeur projetée */
  const p=[],il=addJ(today,-364),inv12=sum(ops.filter(e=>e.date>=il)),prem=ops[0]?ops[0].date:'',ans=prem?Math.max(1/12,(nbJ(prem,today)-1)/365.25):0,parAn=ans?s.I/ans:0;
  const rythme=inv12||parAn,src=inv12?'des 12 derniers mois':'moyen depuis le début des travaux';
  if(ops.length)p.push(`Rythme des travaux : ${fmtM(inv12)} ${U()} sur les 12 derniers mois ; ${fmtM(parAn)} ${U()} par an en moyenne depuis le ${dmy(prem)}.`);
  let jauge='';
  if(pj.budget>0){
    const reste=Math.max(0,pj.budget-s.I),av=Math.min(100,s.I/pj.budget*100);
    jauge=`<div class="mjauge"><div class="mjauge-t"><b>Budget des travaux</b><span>${fmtM(s.I)} / ${fmtM(pj.budget)} ${U()} · ${Math.round(av)} %</span></div><div class="gauge maigauge" role="meter" aria-label="Avancement du budget des travaux" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(av)}"><div style="width:${av}%"></div></div></div>`;
    if(reste<=0)p.push(`Le budget des travaux (${fmtM(pj.budget)} ${U()}) est atteint${s.I>pj.budget?`, dépassé de ${fmtM(s.I-pj.budget)} ${U()}`:''}.`);
    else{
      p.push(`Reste à investir : ${fmtM(reste)} ${U()} sur un budget de ${fmtM(pj.budget)} ${U()}.`);
      if(rythme>0){const a=reste/rythme,fin=new Date(now.getTime()+a*365.25*864e5);p.push(`Au rythme ${src} (${fmtM(rythme)} ${U()} par an), les travaux seraient financés vers ${fin.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}, dans environ ${a<1?Math.max(1,Math.round(a*12))+' mois':fmt1(a)+' ans'}.`)}
      if(pj.echeance&&pj.echeance>today){const mo=Math.max(1,(nbJ(today,pj.echeance)-1)/30.44),besoin=reste/mo;
        p.push(`Pour finir à l'échéance du ${dmy(pj.echeance)}, il faudrait investir environ ${fmtM(besoin)} ${U()} par mois, contre ${fmtM(rythme/12)} ${U()} au rythme ${src}${besoin>rythme/12*1.1?' : il faudra accélérer':''}.`)}
      else if(pj.echeance)p.push(`L'échéance du ${dmy(pj.echeance)} est passée : mettez-la à jour dans menu ≡ › Événements et projets › Projets.`);
    }
  }else p.push('Fixez un budget et une échéance dans menu ≡ › Événements et projets › Projets : l\'avancement et la date d\'achèvement s\'afficheront ici.');
  if(s.taux!==null&&s.V)p.push(`Valeur projetée au taux observé (${pct(s.taux)} par an) : environ ${fmtM(s.V*(1+s.taux))} ${U()} dans un an et ${fmtM(s.V*Math.pow(1+s.taux,5))} ${U()} dans cinq ans. C'est une extrapolation d'une seule estimation, à revoir à chaque nouvelle valeur notée.`);
  else p.push('Notez une valeur actuelle (Mes finances › Patrimoine › Mettre à jour la valeur) pour calculer l\'appréciation et la valeur projetée.');
  if(pc.autre&&tot)p.push(`${fmt1(pc.autre/tot*100)} % des travaux de la période sont sans détail (« Autre ») : préciser le libellé (ciment, main-d'œuvre, brique…) rendra l'analyse par poste plus juste.`);
  $('maiPerspTxt').innerHTML=`<div class="row"><button type="button" class="btn small" data-pjdep="${m.id}">+ Dépense du projet (travaux, achats…)</button></div>`+jauge+(pj.note?`<p class="hint">Projet : ${esc(pj.note)}</p>`:'')+`<ul class="analyse">${p.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`;
  /* filtres et journal */
  let jl=items.slice().reverse();
  if(maiSel!==null)jl=jl.filter(e=>maiAll?e.date.startsWith(maiSel+'-'):+e.date.slice(5,7)-1===maiSel);
  $('maiJSub').textContent=`${jl.length} lignes · ${fmt(sum(jl))} ${U()}`;
  $('maiList').innerHTML=jl.length?jl.map(e=>`<div class="item${editId===e.id?' editing':''}" data-id="${e.id}"><button type="button" class="lib"><span class="sr">Modifier : </span><span>${esc(e.libelle)}</span><span class="tag"><span class="dot" aria-hidden="true" style="background:${colM(e.cat_maison)}"></span>${esc((CATM[e.cat_maison]||CATM.autre).l)} · ${dmy(e.date)} · ${esc(nomCpt(e.compte))}${e.remarque?` · ${esc(e.remarque)}`:''}</span></button><span class="amt">${fmt(e.montant)}<span class="sr"> ${U()}</span></span><button type="button" class="del" data-del="${e.id}" aria-label="Supprimer ${esc(e.libelle)}">✕</button></div>`).join(''):'<div class="empty">Aucuns travaux pour ce filtre.</div>';
}
function choixBucketMai(k){if(maiAll){cur.y=+k;maiAll=false;maiSel=null}else maiSel=maiSel===k?null:k;render();if(maiSel!==null)allerJournal('maiJournal')}
$('maiChart').addEventListener('click',ev=>{const b=ev.target.closest('[data-k]');if(b)choixBucketMai(maiAll?b.dataset.k:+b.dataset.k)});
$('maiTbl').addEventListener('click',ev=>{const t=ev.target.closest('tr[data-k]');if(t)choixBucketMai(maiAll?t.dataset.k:+t.dataset.k)});
$('maiAn').onclick=()=>{maiAll=false;maiSel=null;render()};
$('maiTout').onclick=()=>{maiAll=true;maiSel=null;render()};

/* projets (Données et réglages › Événements et projets, 2026-11-27) : budget, échéance et note d'un bien, maison ou autre
   (terrain, engin…). « Maison » donne au bien le carnet des travaux. Une maison garde toujours un projet (vide = pas listé). */
const aProjet=b=>!!b.projet&&(!b.maison||b.projet.budget>0||!!b.projet.echeance||!!b.projet.note);
function pjRow(b){const pj={budget:0,echeance:'',note:'',...(b.projet||{})},neuf=!b.id;
  const l=BIENS.filter(x=>neuf?!aProjet(x):x.id===b.id);
  return `<div class="evrow pjrow" data-id="${b.id||''}"><select class="jBien" aria-label="Bien du projet"${neuf?'':' disabled'}>${l.map(x=>`<option value="${x.id}"${x.id===b.id?' selected':''}>${esc(x.nom)}</option>`).join('')||'<option value="">aucun bien sans projet (ajoutez-le dans Comptes et biens)</option>'}</select>
    <select class="jNat" aria-label="Nature du projet"><option value="maison"${b.maison?' selected':''}>Maison (construction)</option><option value="autre"${b.maison?'':' selected'}>Autre bien</option></select>
    <input class="jBud" inputmode="decimal" value="${pj.budget?versSaisie(pj.budget):''}" placeholder="budget" aria-label="Budget ${U_SAISIE()}" style="max-width:9em">
    <input type="date" class="jEch" value="${pj.echeance||''}" aria-label="Échéance souhaitée">
    <input class="jNote" value="${esc(pj.note||'')}" maxlength="300" placeholder="note : 3 pièces, forage, clôture…" aria-label="Note sur le projet">
    <button type="button" class="mini danger" data-x aria-label="Retirer le projet">✕</button></div>`}
function resumeProjet(r){const b=BIEN[r.querySelector('.jBien').value],bud=valIn(r,'.jBud'),e=valIn(r,'.jEch'),n=valIn(r,'.jNote'),s=b?etatBien(b):null;
  return `<b>${esc(b?b.nom:'Nouveau projet')}</b>${b&&r.dataset.id?` <button type="button" class="btn ghost small" data-pjdep="${b.id}">+ Dépense</button>`:''} <span class="hint">${r.querySelector('.jNat').value==='maison'?'Maison':'Autre bien'}${bud?` · budget ${mtS(bud)}`:''}${s?` · investi ${fmtM(s.I)} ${U()}`:''}${e?` · échéance ${dmy(e)}`:''}${n?` · ${esc(n)}`:''}</span>`}
function openProjet(){const l=BIENS.filter(aProjet);$('pjList').innerHTML=l.length?l.map(pjRow).join(''):'<div class="hint">Aucun projet pour l\'instant.</div>';
  fiches($('pjList'),resumeProjet,'pjSave',openEvt)}
$('pjList').addEventListener('input',()=>{evtDirty=true});
/* dépense d'un projet = investissement dans son bien : Une opération pré-remplie (nature Investissement, le bien) */
function depenseProjet(id){if(!BIEN[id])return;nouveauJour();resetForm();navEtape(()=>{saisieSeule=true;view='donnees';showTab('tOne');render()});
  $('fNat').value='investissement';$('fBien').value=id;touched.nat=true;touched.bien=true;majChamps();
  $('addMsg').textContent=`Dépense du projet « ${BIEN[id].nom} » : un investissement dans ce bien.`;window.scrollTo({top:0,behavior:'instant'});$('fAmt').focus()}
$('pjList').addEventListener('click',ev=>{const d=ev.target.closest('[data-pjdep]');if(d){depenseProjet(d.dataset.pjdep);return}});
$('pjList').addEventListener('click',ev=>{const b=ev.target.closest('[data-x]');if(b&&!b.disabled)retirerLigne(b.closest('.evrow'),'Projet',()=>{evtDirty=true})});
$('pjAdd').onclick=()=>{const l=$('pjList');if(!l.querySelector('.evrow'))l.innerHTML='';l.insertAdjacentHTML('beforeend',pjRow({}));ficher(l.lastElementChild,resumeProjet,true);
  const r=l.lastElementChild,b=BIEN[r.querySelector('.jBien').value];if(b)r.querySelector('.jNat').value=b.maison?'maison':'autre';r.querySelector('.jBien').focus();evtDirty=true};
$('pjList').addEventListener('change',ev=>{if(ev.target.classList.contains('jBien')){const b=BIEN[ev.target.value];if(b)ev.target.closest('.evrow').querySelector('.jNat').value=b.maison?'maison':'autre'}});
$('pjSave').onclick=async()=>{const par={};
  for(const r of $('pjList').querySelectorAll('.pjrow')){const id=r.querySelector('.jBien').value;if(!id||!BIEN[id])continue;
    const t=valIn(r,'.jBud'),bud=t?montantSaisi(t):0;if(!(bud>=0)){$('pjMsg').textContent=`Budget invalide pour ${BIEN[id].nom} (${U_SAISIE()}).`;return}
    par[id]={maison:r.querySelector('.jNat').value==='maison',projet:{budget:bud,echeance:valIn(r,'.jEch'),note:valIn(r,'.jNote')}}}
  const biens=BIENS.map(b=>{const x={...b};
    if(par[b.id]){x.maison=par[b.id].maison;x.projet=par[b.id].projet;if(x.maison)choisirMaison(b.id)}
    else if(aProjet(b)){if(b.maison)x.projet={budget:0,echeance:'',note:''};else delete x.projet}   // projet retiré
    if(!x.projet)delete x.projet;return x});
  try{await api.params({biens});evtDirty=false;await charger();openEvt();$('pjMsg').textContent='Projets enregistrés.'}catch(e){$('pjMsg').textContent=e.message}};


/* ================= vue Foyer (Mes finances › Foyer, 2026-11-27) =================
   Dépenses (courantes et exceptionnelles, vos comptes, depuis le début du suivi) réparties selon « pour » : le commun de
   chaque foyer, chaque membre (part égale quand une dépense vise plusieurs membres), et vous (« Moi »). */
let foyMode='mois';
function partsPour(items){const r={};
  const add=(k,e,v)=>{const x=r[k]=r[k]||{tot:0,cats:{},n:0};x.tot+=v;x.cats[e.categorie]=(x.cats[e.categorie]||0)+v;x.n++};
  for(const e of items){if(e.nature!=='depense'||!perso(e))continue;const p=pourDe(e);if(!p.length){if((CAT[e.categorie]||{}).pour!=='general')add('_hors',e,e.montant)}else p.forEach(id=>add(id,e,e.montant/p.length))}
  return r}
// mois de l'année y comptés pour la moyenne mensuelle : depuis le début du suivi, jusqu'au mois en cours
function moisDeLAnnee(y){let a=0,b=11;if(y===now.getFullYear())b=now.getMonth();if(DEBUT_SUIVI&&+DEBUT_SUIVI.slice(0,4)===y)a=+DEBUT_SUIVI.slice(5,7)-1;return Math.max(1,b-a+1)}
function renderFoyer(){
  $('foySous').textContent=foyMode==='mois'?'du mois':'de l\'année, moyenne par mois';
  if(!FOYERS.length){$('foyBody').innerHTML=`<div class="empty">Aucun foyer pour l'instant. <button type="button" class="btn ghost small" id="foyOuvrir">Déclarer le foyer et ses membres</button></div>`;
    $('foyOuvrir').onclick=()=>{navEtape(()=>{view='donnees';showTab('tFoy');render()});openFoyers()};return}
  const its=(foyMode==='mois'?monthItems(cur.y,cur.m):yearItems(cur.y)).filter(e=>!DEBUT_SUIVI||e.date>=DEBUT_SUIVI),P=partsPour(its);
  const nm=foyMode==='mois'?1:moisDeLAnnee(cur.y),r0=v=>Math.round(v);
  const lignes=[];
  for(const f of FOYERS)lignes.push({k:f.id,lab:'Commun',f},...f.membres.map(m=>({k:m.id,lab:m.nom,sous:ROLES[m.role]+(m.naissance&&ageDe(m.naissance)!==null?` · ${ageDe(m.naissance)} ans`:''),f})));
  const tousTot=lignes.reduce((a,l)=>a+((P[l.k]||{}).tot||0),0)+((P.moi||{}).tot||0)||1;
  const barre=l=>{const x=P[l.k]||{tot:0,n:0};return `<button type="button" class="foyl" data-f="${l.f===undefined&&l.k!=='moi'?l.k:l.k==='moi'?'o:':'m:'+l.k}"><span class="foyn"><b>${esc(l.lab)}</b>${l.sous?`<span class="hint">${esc(l.sous)}</span>`:''}</span>
    <span class="foyb"><i style="width:${Math.max(x.tot?1.5:0,x.tot/tousTot*100)}%"></i></span><span class="foym num">${fmtM(r0(x.tot))}${foyMode!=='mois'&&x.tot?`<span class="hint">${fmtM(r0(x.tot/nm))}/mois</span>`:''}</span></button>`};
  const table=ls=>{const cats=CATS.filter(c=>ls.some(l=>(P[l.k]||{cats:{}}).cats[c.id]));if(!cats.length)return '';return `<div class="tbl fige"><table><thead><tr><th>Pour</th>${cats.map(c=>`<th>${esc(c.label)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${ls.map(l=>{const x=P[l.k]||{tot:0,cats:{}};
    return `<tr class="click" data-f="m:${l.k}"><td>${esc(l.lab)}</td>${cats.map(c=>`<td>${x.cats[c.id]?fmtM(r0(x.cats[c.id])):'–'}</td>`).join('')}<td><b>${fmtM(r0(x.tot))}</b></td></tr>`}).join('')}</tbody></table></div>`};
  // indicateurs (demande du 28/11) : coût du foyer, sa part dans vos dépenses, coût d'un enfant par mois, évolution
  const totFoy=lignes.reduce((a,l)=>a+((P[l.k]||{}).tot||0),0),totDep=its.filter(e=>e.nature==='depense'&&perso(e)).reduce((a,e)=>a+e.montant,0);
  const E=MEMBRES().filter(m=>m.role==='enfant'),totE=E.reduce((a,m)=>a+((P[m.id]||{}).tot||0),0);
  // même période d'avant : mois (ou année) précédent, jusqu'au même jour si la période est en cours
  const enCours=foyMode==='mois'?cur.y===now.getFullYear()&&cur.m===now.getMonth():cur.y===now.getFullYear();
  const av=foyMode==='mois'?(cur.m?{y:cur.y,m:cur.m-1}:{y:cur.y-1,m:11}):{y:cur.y-1};
  const jusqu=d=>{if(!enCours)return true;const j=new Date(d+'T12:00');return foyMode==='mois'?j.getDate()<=now.getDate():(j.getMonth()<now.getMonth()||(j.getMonth()===now.getMonth()&&j.getDate()<=now.getDate()))};
  const itsAv=(foyMode==='mois'?monthItems(av.y,av.m):yearItems(av.y)).filter(e=>(!DEBUT_SUIVI||e.date>=DEBUT_SUIVI)&&jusqu(e.date));
  const PA=partsPour(itsAv),totAv=FOYERS.reduce((a,f)=>a+((PA[f.id]||{}).tot||0)+f.membres.reduce((b,m)=>b+((PA[m.id]||{}).tot||0),0),0);
  const evo=totAv>0?(totFoy-totAv)/totAv:null;
  const tuile=(l,v,sous,col)=>`<div class="stat"><span class="label">${lblIc(l)}</span><span class="v"${col?` style="color:${col}"`:''}>${valAbr(l,v)}</span><span class="s">${sous}</span></div>`;
  let h=`<div class="hero foyhero">`+
    tuile('Dépenses du foyer',fmtM(r0(totFoy)),`${U()}${foyMode!=='mois'?` · ${fmtM(r0(totFoy/nm))}/mois`:''} · commun et membres`)+
    tuile('Part dans vos dépenses',totDep?`${fmt1(totFoy/totDep*100)} %`:'—',`de ${fmtM(r0(totDep))} ${U()} dépensés en tout`)+
    tuile('Par enfant et par mois',E.length?fmtM(r0(totE/E.length/nm)):'—',E.length?`${U()} · ${E.length} enfant${E.length>1?'s':''}`:'aucun enfant déclaré')+
    tuile(foyMode==='mois'?'Vs mois précédent':'Vs année précédente',evo===null?'—':`${evo>=0?'+':''}${fmt1(evo*100)} %`,totAv?`${fmtM(r0(totAv))} ${U()}${enCours?' à la même date':''}`:'pas de dépense à comparer',evo===null?'':evo>0?'var(--warn)':'var(--ok)')+
    `</div>`;
  for(const f of FOYERS){const ls=lignes.filter(l=>l.f===f),tot=ls.reduce((a,l)=>a+((P[l.k]||{}).tot||0),0);
    const enf=f.membres.filter(m=>m.role==='enfant'),te=enf.reduce((a,m)=>a+((P[m.id]||{}).tot||0),0);
    h+=`<div class="foycard"><div class="phead"><h3 class="sub">${esc(f.nom)}</h3><span class="hint">${fmtM(r0(tot))} ${U()}${foyMode!=='mois'?` · ${fmtM(r0(tot/nm))} ${U()}/mois`:''}${FOYERS.length>1&&enf.length&&te?` · enfants ${fmtM(r0(te/enf.length/nm))} ${U()} par enfant et par mois`:''}</span></div>
      <div class="foybars">${ls.map(barre).join('')}</div>${table(ls)}</div>`}
  const moi={k:'moi',lab:'Moi',sous:'dépenses pour vous-même'};
  h+=`<div class="foycard"><div class="foybars">${barre(moi)}</div></div>`;
  // dépenses générales (voiture, loyer, aides, bureau…) : absentes d'ici, comptées dans Mes finances. Postes « à préciser »
  // (santé, transport…) sans personne choisie : signalées, à préciser dans le journal
  const H=P._hors;if(H&&H.tot){const cs=CATS.filter(c=>H.cats[c.id]);
    h+=`<p class="hint">Sans personne précisée (non comptées ici) : ${cs.map(c=>`<button type="button" class="linkbtn" data-f="k:${c.id}">${esc(c.label)} ${fmtM(r0(H.cats[c.id]))}</button>`).join(' · ')} ${U()}. Les dépenses générales (voiture, loyer, aides…) restent dans Mes finances.</p>`}
  $('foyBody').innerHTML=h;
}
// une ligne (commun, membre, Moi) : son journal, sur la même période
$('foyBody').addEventListener('click',ev=>{const t=ev.target.closest('[data-f]');if(!t)return;filtre=t.dataset.f;view=foyMode==='mois'?'mois':'annee';shown=80;render();allerJournal('journal')});

$('maiPerspTxt').addEventListener('click',ev=>{const d=ev.target.closest('[data-pjdep]');if(d)depenseProjet(d.dataset.pjdep)});
$('yearTblBtn').onclick=()=>{lsSet('daftar-tableau-mois',lsGet('daftar-tableau-mois')==='1'?'0':'1');render()};
