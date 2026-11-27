/* Daftar — statistiques, montants masqués, export Excel.
   Un des six scripts de la page (app/index.html), chargés DANS L'ORDRE : noyau, vues, saisie, stats, reglages,
   demarrage. Scripts classiques (pas de modules) : leurs déclarations de premier niveau sont communes. Un script ne
   doit donc, en s'exécutant, appeler que ce qui est déclaré dans lui-même ou dans les précédents ; le démarrage
   (premier affichage) est dans demarrage.js, chargé en dernier. */
/* ================= statistiques ================= */
/* Panneau d'analyse : alertes, six graphiques (SVG dessinés à la largeur réelle du conteneur), conclusions, perspectives.
   Règles de visualisation : une seule échelle par graphique, traits fins (2 px), barres ≤ 24 px à bout arrondi,
   grille en filet plein, bulle au survol ET au clavier, un tableau « Voir les données » par graphique.
   Couleurs : --viz1 / --viz2 (bleu / orange, validées daltonisme et contraste en clair et en sombre). */
let statsMode='mois',statsDu='',statsAu='';   // période d'analyse : mois | annee | periode | tout (dates initialisées ci-dessous)
const JOURS=['lun.','mar.','mer.','jeu.','ven.','sam.','dim.'],JOURS_L=['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const addJ=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)};
const nbJ=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5)+1;
const jourSem=s=>(new Date(s+'T12:00:00').getDay()+6)%7;   // 0 = lundi
statsAu=today;statsDu=addJ(today,-29);   // période choisie par défaut : les 30 derniers jours
/* graduations « rondes » dans la devise affichée ; renvoie des valeurs en devise affichée */
function graduations(maxCFA,n=4){const max=maxCFA/DEV.taux;if(!(max>0))return [0,1];const raw=max/n,p=Math.pow(10,Math.floor(Math.log10(raw))),r=raw/p,st=(r<=1?1:r<=2?2:r<=2.5?2.5:r<=5?5:10)*p;const t=[0];while(t[t.length-1]<max-1e-9)t.push(+(t[t.length-1]+st).toFixed(10));return t}
const fmtAxe=vd=>{const a=Math.abs(vd);if(a>=1e6)return (Math.round(vd/1e5)/10).toLocaleString('fr-FR')+' M';if(a>=1e4)return Math.round(vd/1e3).toLocaleString('fr-FR')+' k';return (Math.round(vd*100)/100).toLocaleString('fr-FR',{maximumFractionDigits:DEV.taux!==1&&a<10?2:0})};
const moisNom=(y,m,court)=>new Date(y,m,1).toLocaleDateString('fr-FR',court?{month:'short'}:{month:'long',year:'numeric'});

/* ---------- bulle d'information (texte inséré par textContent : les libellés viennent des données) ---------- */
const tip=document.createElement('div');tip.id='tip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.appendChild(tip);
function montrerTip(x,y,titre,lignes){
  tip.replaceChildren();const t=document.createElement('div');t.className='tip-t';t.textContent=titre;tip.appendChild(t);
  for(const l of lignes){const r=document.createElement('div');r.className='tip-r';if(l.cls){const k=document.createElement('i');k.className='tip-k '+l.cls;r.appendChild(k)}
    const v=document.createElement('b');v.textContent=l.val;r.appendChild(v);if(l.lab){const s=document.createElement('span');s.textContent=' '+l.lab;r.appendChild(s)}tip.appendChild(r)}
  tip.hidden=false;const W=tip.offsetWidth,H=tip.offsetHeight;let left=x+14,top=y-H-12;if(left+W>innerWidth-8)left=Math.max(8,x-W-14);if(top<8)top=y+18;
  tip.style.left=left+'px';tip.style.top=top+'px';
}
const cacherTip=()=>{tip.hidden=true};
/* relie chaque marque [data-i] d'un graphique à sa bulle : survol (suit la souris) et focus clavier (au-dessus de la marque) */
function lierTips(racine,f){
  racine.querySelectorAll('[data-i]').forEach(el=>{const i=+el.dataset.i;
    el.addEventListener('pointermove',ev=>{const d=f(i);montrerTip(ev.clientX,ev.clientY,d.titre,d.lignes)});
    el.addEventListener('pointerleave',cacherTip);
    // au clavier, la page défile d'abord jusqu'à la marque : on place la bulle après ce défilement
    el.addEventListener('focus',()=>setTimeout(()=>{if(document.activeElement!==el)return;const r=el.getBoundingClientRect(),d=f(i);montrerTip(r.left+r.width/2,r.top,d.titre,d.lignes)},60));
    el.addEventListener('blur',cacherTip)});
}
// au défilement, la bulle d'un survol à la souris se ferme ; celle d'une marque atteinte au clavier reste
addEventListener('scroll',()=>{const a=document.activeElement;if(!(a&&a.closest&&a.closest('#statsBox')&&(a.matches('[data-i]')||a.classList.contains('ov'))))cacherTip()},{passive:true});

/* ---------- période analysée : un mois, une année, une période choisie ou tout l'historique ---------- */
function bornesStats(){
  if(statsMode==='mois'){const pm=cur.m?{y:cur.y,m:cur.m-1}:{y:cur.y-1,m:11};
    return {debut:iso(new Date(cur.y,cur.m,1)),finPer:iso(new Date(cur.y,cur.m+1,0)),nom:moisNom(cur.y,cur.m),court:moisNom(cur.y,cur.m,true),
      cmp:{debut:iso(new Date(pm.y,pm.m,1)),fin:iso(new Date(pm.y,pm.m+1,0)),nom:moisNom(pm.y,pm.m),court:moisNom(pm.y,pm.m,true)}}}
  if(statsMode==='annee')return {debut:`${cur.y}-01-01`,finPer:`${cur.y}-12-31`,nom:`l'année ${cur.y}`,court:String(cur.y),
      cmp:{debut:`${cur.y-1}-01-01`,fin:`${cur.y-1}-12-31`,nom:`l'année ${cur.y-1}`,court:String(cur.y-1)}};
  if(statsMode==='periode'){let a=statsDu,b=statsAu;if(a>b)[a,b]=[b,a];const N=nbJ(a,b);
    return {debut:a,finPer:b,nom:`la période du ${dmy(a)} au ${dmy(b)}`,court:`${dmy(a)} – ${dmy(b)}`,
      cmp:{debut:addJ(a,-N),fin:addJ(a,-1),nom:`les ${N} jours précédents`,court:'période précédente'}}}
  const d=allP().map(e=>e.date).sort()[0]||today;
  return {debut:d,finPer:today,nom:"tout l'historique",court:'historique',cmp:null};
}
const debutSuivi=()=>DEBUT_SUIVI||deps(all).map(e=>e.date).sort()[0]||today;   // début du suivi quotidien (parametres.debut_suivi)
function periodeStats(){
  const B=bornesStats(),fin=B.finPer<today?B.finPer:today,prem=debutSuivi();
  // avant le début du suivi, un jour sans dépense notée n'est pas un jour « à zéro » : on ne le compte pas
  const d0=B.debut>prem?B.debut:prem,n=d0<=fin?nbJ(d0,fin):0;
  const jours=new Array(n).fill(0);deps(all).forEach(e=>{if(e.date>=d0&&e.date<=fin)jours[nbJ(d0,e.date)-1]+=e.montant});
  return {...B,fin,d0,n,jours,ops:all.filter(e=>perso(e)&&e.date>=d0&&e.date<=fin)};   // opérations de la période SUIVIE
}
const moyenne=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const ecartType=a=>{if(a.length<2)return 0;const m=moyenne(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/(a.length-1))};

/* ---------- briques SVG ---------- */
const PAD={l:52,r:14,t:12,b:26};
function grilleY(w,h,ticksD,yCFA){
  return ticksD.map(t=>{const y=yCFA(t*DEV.taux);return `<line class="grid" x1="${PAD.l}" x2="${w-PAD.r}" y1="${y}" y2="${y}"/><text class="axe" x="${PAD.l-6}" y="${y+4}" text-anchor="end">${fmtAxe(t)}</text>`}).join('');
}
/* colonnes (une ou plusieurs séries, même unité, une seule échelle) */
function svgColonnes(w,h,cats,series,opts={}){
  const n=cats.length,ns=series.length,max=Math.max(1,...series.flatMap(s=>s.vals));
  const tk=opts.pct?graduationsPct(max):graduations(max),top=opts.pct?tk[tk.length-1]:tk[tk.length-1]*DEV.taux;
  const ih=h-PAD.t-PAD.b,y=v=>PAD.t+ih-(v/top)*ih,band=(w-PAD.l-PAD.r)/n;
  const bw=Math.max(4,Math.min(24,(band*0.7-(ns-1)*2)/ns)),grp=ns*bw+(ns-1)*2;
  let g=opts.pct?tk.map(t=>{const yy=y(t);return `<line class="grid" x1="${PAD.l}" x2="${w-PAD.r}" y1="${yy}" y2="${yy}"/><text class="axe" x="${PAD.l-6}" y="${yy+4}" text-anchor="end">${t} %</text>`}).join(''):grilleY(w,h,tk,y);
  cats.forEach((c,i)=>{const x0=PAD.l+i*band+(band-grp)/2;
    series.forEach((s,k)=>{const v=s.vals[i],x=x0+k*(bw+2),yy=y(v),hh=PAD.t+ih-yy;
      if(hh>0.5){const r=Math.min(4,hh,bw/2);g+=`<path class="${s.cls}" d="M${x},${PAD.t+ih}V${yy+r}Q${x},${yy} ${x+r},${yy}H${x+bw-r}Q${x+bw},${yy} ${x+bw},${yy+r}V${PAD.t+ih}Z"/>`}});
    const lab=opts.etiq?opts.etiq(i):c;if(lab)g+=`<text class="axe" x="${PAD.l+i*band+band/2}" y="${h-8}" text-anchor="middle">${esc(lab)}</text>`;
    g+=`<rect class="hit" data-i="${i}" tabindex="0" role="img" aria-label="${esc(opts.aria(i))}" x="${PAD.l+i*band}" y="${PAD.t}" width="${band}" height="${ih}"/>`});
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="false"><line class="base" x1="${PAD.l}" x2="${w-PAD.r}" y1="${PAD.t+ih}" y2="${PAD.t+ih}"/>${g}</svg>`;
}
function graduationsPct(max){const st=max>40?20:max>20?10:5;const t=[0];while(t[t.length-1]<max)t.push(t[t.length-1]+st);return t}
/* barres horizontales classées (une série, une teinte), valeur au bout */
function svgBarresH(w,items,aria){
  const lh=30,h=items.length*lh+6,labW=Math.min(170,w*0.36),valW=86,max=Math.max(1,...items.map(x=>x.v)),L=w-labW-valW-8;
  let g='';items.forEach((x,i)=>{const y=i*lh+6,bw=Math.max(2,x.v/max*L),r=Math.min(4,bw/2);
    g+=`<text class="lab" x="${labW-8}" y="${y+15}" text-anchor="end">${esc(x.lab.length>22?x.lab.slice(0,21)+'…':x.lab)}</text>`+
      `<path class="s1" d="M${labW},${y+4}H${labW+bw-r}Q${labW+bw},${y+4} ${labW+bw},${y+4+r}V${y+20-r}Q${labW+bw},${y+20} ${labW+bw-r},${y+20}H${labW}Z"/>`+
      `<text class="val" x="${labW+bw+6}" y="${y+16}">${esc(fmt(x.v))}</text>`+
      `<rect class="hit" data-i="${i}" tabindex="0" role="img" aria-label="${esc(aria(i))}" x="0" y="${y}" width="${w}" height="${lh}"/>`});
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${g}</svg>`;
}
/* tableau « Voir les données » */
const tableDonnees=(tetes,lignes)=>`<details class="vdonnees"><summary>Voir les données</summary><div class="tbl"><table><thead><tr>${tetes.map(t=>`<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>${lignes.map(l=>`<tr>${l.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
const figure=(id,titre,sous,legende)=>`<figure class="scard" id="${id}"><figcaption><b>${titre}</b>${sous?`<span class="hint">${sous}</span>`:''}</figcaption>${legende||''}<div class="plot"></div><div class="vd"></div></figure>`;
const legendeHTML=items=>`<div class="slegende">${items.map(x=>`<span><i class="lk ${x.cls}" aria-hidden="true"></i>${esc(x.lab)}</span>`).join('')}</div>`;

/* ---------- 1. dépenses cumulées sur la période, période précédente de même nature, projection ---------- */
function serieCumul(debut,n){const j=new Array(Math.max(0,n)).fill(0),prem=debutSuivi();deps(all).forEach(e=>{if(e.date>=debut&&e.date>=prem){const k=nbJ(debut,e.date);if(k<=n)j[k-1]+=e.montant}});let s=0;return {j,c:j.map(v=>s+=v)}}
function analyseCumul(P){
  const N=nbJ(P.debut,P.finPer),el=P.fin<P.debut?0:nbJ(P.debut,P.fin),A=serieCumul(P.debut,el),tot=el?A.c[el-1]:0;
  // la période de comparaison n'est retenue que si au moins 90 % de ses jours étaient suivis (sinon sa courbe serait faussement basse)
  const prem=debutSuivi(),suivi=x=>x.fin<prem?0:nbJ(x.debut>prem?x.debut:prem,x.fin)/nbJ(x.debut,x.fin);
  const C=P.cmp&&suivi(P.cmp)>=0.9?P.cmp:null,Nb=C?nbJ(C.debut,C.fin):0,B=C?serieCumul(C.debut,Nb):null;
  const moy=P.n?moyenne(P.jours):0,sd=ecartType(P.jours),enCours=P.fin===today&&el<N;
  let proj=null;if(enCours&&P.n>=3){const r=N-el,e=1.2816*sd*Math.sqrt(r);proj={fin:tot+moy*r,bas:Math.max(tot,tot+moy*r-e),haut:tot+moy*r+e}}
  const btot=statsMode==='mois'?Object.values(budgets).reduce((a,b)=>a+b,0):0;
  return {N,el,A,tot,C,Nb,B,moy,sd,proj,enCours,btot,prevTot:B?B.c[Nb-1]:0,prevMeme:B&&el?B.c[Math.min(el,Nb)-1]:0};
}

/* ---------- 2. dépenses et entrées par semaine (période ≤ 62 jours) ou par mois ---------- */
function dessinerMensuel(w,P){
  const fig=$('figMensuel'),N=nbJ(P.debut,P.fin<P.debut?P.debut:P.fin),hebdo=nbJ(P.debut,P.finPer)<=62;
  let grp=[];
  if(hebdo){for(let i=0;i<N;i+=7){const a=addJ(P.debut,i),b=addJ(P.debut,Math.min(N,i+7)-1);grp.push({a,b,cat:`${dmy(a).slice(0,5)}`,nom:`du ${dmy(a)} au ${dmy(b)}`})}}
  else{const prem=P.ops.map(e=>e.date).sort()[0]||P.debut;let d=new Date(+prem.slice(0,4),+prem.slice(5,7)-1,1);const f=new Date(+P.fin.slice(0,4),+P.fin.slice(5,7)-1,1);
    while(d<=f){const y=d.getFullYear(),m=d.getMonth();grp.push({a:iso(new Date(y,m,1)),b:iso(new Date(y,m+1,0)),cat:moisNom(y,m,true),nom:moisNom(y,m)});d=new Date(y,m+1,1)}}
  let F=grp.map(x=>flux(all.filter(e=>e.date>=x.a&&e.date<=x.b&&e.date>=P.d0&&e.date<=P.fin)));
  while(grp.length>1&&F[0].dep+F[0].ent===0){grp.shift();F.shift()}   // pas de mois vides en tête
  fig.querySelector('figcaption b').textContent=hebdo?'Dépenses et entrées par semaine':'Dépenses et entrées par mois';
  const cats=grp.map(x=>x.cat),every=Math.ceil(grp.length/Math.max(1,w/60));
  fig.querySelector('.plot').innerHTML=grp.length?svgColonnes(w,220,cats,[{cls:'s1',vals:F.map(f=>f.dep)},{cls:'s2',vals:F.map(f=>f.ent)}],
    {etiq:i=>i%every?'':cats[i],aria:i=>`${grp[i].nom} : dépenses ${fmt(F[i].dep)} ${U()}, entrées ${fmt(F[i].ent)} ${U()}`}):'<div class="empty">Aucune opération sur la période.</div>';
  lierTips(fig,i=>({titre:grp[i].nom,lignes:[{cls:'k-s1',val:`${fmt(F[i].dep)} ${U()}`,lab:'dépenses'},{cls:'k-s2',val:`${fmt(F[i].ent)} ${U()}`,lab:'entrées'},{val:`${sgn(F[i].net)} ${U()}`,lab:'solde (entrées − dépenses, investissements, prêts)'}]}));
  fig.querySelector('.vd').innerHTML=tableDonnees([hebdo?'Semaine':'Mois','Dépenses','Entrées','Investi','Prêté','Solde'],grp.map((x,i)=>[x.nom,fmt(F[i].dep),fmt(F[i].ent),fmt(F[i].inv),fmt(F[i].pre),sgn(F[i].net)]));
  return {grp,F};
}

/* ---------- 3. histogramme des dépenses journalières (part des jours, %) ---------- */
const CLASSES=[[0,0,'0'],[1,2000],[2001,5000],[5001,10000],[10001,20000],[20001,50000],[50001,100000],[100001,Infinity]];
function dessinerHisto(w,P){
  if(!P.n){const f=$('figHisto');f.querySelector('.plot').innerHTML='<div class="empty">Aucune dépense notée sur la période.</div>';f.querySelector('.vd').innerHTML='';return {c:CLASSES.map(()=>0),pct:CLASSES.map(()=>0)}}
  const c=CLASSES.map(()=>0);P.jours.forEach(v=>{const k=CLASSES.findIndex(([a,b])=>v>=a&&v<=b);c[k<0?0:k]++});
  const pct=c.map(n=>n/P.n*100);
  const kc=v=>{const d=v/DEV.taux;return d>=1e6?(Math.round(d/1e5)/10).toLocaleString('fr-FR')+' M':d>=1000?(Math.round(d/100)/10).toLocaleString('fr-FR')+' k':(Math.round(d*100)/100).toLocaleString('fr-FR')};
  const lab=([a,b,l],i)=>l||(b===Infinity?`> ${kc(a-1)}`:i===1?`≤ ${kc(b)}`:`${kc(a-1)}–${kc(b)}`);
  const cats=CLASSES.map(lab),fig=$('figHisto');
  fig.querySelector('.plot').innerHTML=svgColonnes(w,210,cats,[{cls:'s1',vals:pct}],{pct:true,etiq:i=>w<520&&i%2?'':cats[i],aria:i=>`Dépenses du jour ${cats[i]} ${U()} : ${c[i]} jours, ${fmt1(pct[i])} % des jours`});
  lierTips(fig,i=>({titre:i?`Jours dépensant ${cats[i]} ${U()}`:'Jours sans dépense',lignes:[{cls:'k-s1',val:`${fmt1(pct[i])} %`,lab:`des jours (${c[i]} sur ${P.n})`}]}));
  fig.querySelector('.vd').innerHTML=tableDonnees([`Dépense du jour (${U()})`,'Jours','Part des jours'],cats.map((x,i)=>[x,c[i],fmt1(pct[i])+' %']));
  return {c,pct};
}

/* ---------- 4. moyenne par jour de la semaine ---------- */
function dessinerSemaine(w,P){
  const s=new Array(7).fill(0),n=new Array(7).fill(0);P.jours.forEach((v,i)=>{const k=jourSem(addJ(P.d0,i));s[k]+=v;n[k]++});
  const moy=s.map((v,i)=>n[i]?v/n[i]:0),fig=$('figSemaine');
  fig.querySelector('.plot').innerHTML=svgColonnes(w,200,JOURS,[{cls:'s1',vals:moy}],{aria:i=>`${JOURS_L[i]} : ${fmt(moy[i])} ${U()} en moyenne, sur ${n[i]} ${JOURS_L[i]}s`});
  lierTips(fig,i=>({titre:`Le ${JOURS_L[i]}`,lignes:[{cls:'k-s1',val:`${fmt(moy[i])} ${U()}`,lab:'en moyenne'},{val:`${n[i]}`,lab:`${JOURS_L[i]}s observés`}]}));
  fig.querySelector('.vd').innerHTML=tableDonnees(['Jour','Moyenne','Jours observés','Total'],JOURS_L.map((j,i)=>[j,fmt(moy[i]),n[i],fmt(s[i])]));
  return {moy,n};
}

/* ---------- 5. libellés les plus coûteux ---------- */
function dessinerLibelles(w,P){
  const g=new Map();deps(P.ops).forEach(e=>{const k=normTxt(e.libelle);let x=g.get(k);if(!x){x={lab:e.libelle.trim(),v:0,n:0,cat:e.categorie};g.set(k,x)}x.v+=e.montant;x.n++});
  const tot=sum(deps(P.ops)),top=[...g.values()].sort((a,b)=>b.v-a.v).slice(0,8),fig=$('figLibelles');
  fig.querySelector('.plot').innerHTML=top.length?svgBarresH(w,top,i=>`${top[i].lab} : ${fmt(top[i].v)} ${U()}, ${top[i].n} fois, ${fmt1(top[i].v/tot*100)} % des dépenses`):'<div class="empty">Aucune dépense sur la période.</div>';
  lierTips(fig,i=>({titre:top[i].lab,lignes:[{cls:'k-s1',val:`${fmt(top[i].v)} ${U()}`,lab:`${fmt1(top[i].v/tot*100)} % des dépenses`},{val:`${top[i].n} fois`,lab:`· ${(CAT[top[i].cat]||CAT.autre).label}`}]}));
  fig.querySelector('.vd').innerHTML=tableDonnees(['Libellé','Total','Fois','Part'],top.map(x=>[x.lab,fmt(x.v),x.n,fmt1(x.v/tot*100)+' %']));
  return {top,tot};
}

/* ---------- 6. composition du patrimoine (barre segmentée, ≤ 6 parties) ---------- */
function dessinerPatrimoine(){
  const P=patrimoine(),parts=[{lab:'Comptes',v:P.liq,cls:'s1'},{lab:'Biens',v:P.biens,cls:'s2'},{lab:'Créances',v:P.cre,cls:'s3'}].filter(x=>x.v>0),tot=parts.reduce((a,x)=>a+x.v,0);
  const fig=$('figPatri');
  fig.querySelector('.plot').innerHTML=`<div class="segbar" role="img" aria-label="${esc('Patrimoine net '+fmt(P.net)+' '+U()+' : '+parts.map(x=>`${x.lab.toLowerCase()} ${fmt1(x.v/tot*100)} %`).join(', '))}">${parts.map((x,i)=>`<span class="${x.cls}" data-i="${i}" tabindex="0" style="flex:${x.v}">${x.v/tot>.12?`${fmt1(x.v/tot*100)} %`:''}</span>`).join('')}</div>`;
  fig.querySelector('.slegende').innerHTML=parts.map(x=>`<span><i class="lk k-${x.cls}" aria-hidden="true"></i>${esc(x.lab)}</span>`).join('');
  lierTips(fig,i=>({titre:parts[i].lab,lignes:[{cls:'k-'+parts[i].cls,val:`${fmt(parts[i].v)} ${U()}`,lab:`${fmt1(parts[i].v/tot*100)} % du patrimoine`}]}));
  fig.querySelector('.vd').innerHTML=tableDonnees(['Partie','Montant','Part'],parts.map(x=>[x.lab,fmt(x.v),fmt1(x.v/tot*100)+' %']).concat([['Patrimoine net',fmt(P.net),'100 %']]));
  return P;
}

/* ---------- 7. bilan de la période : cumuls et indicateurs de long terme (1.4.8) ---------- */
function bilanStats(P){
  const ops=P.ops,F=flux(ops),dep=F.dep+F.exc,rev=sum(ops.filter(e=>e.nature==='revenu')),revC=sumF(ops,revCour);
  const epargne=rev-dep,ep=all.filter(e=>perso(e)&&e.nature==='virement'&&e.date>=P.d0&&e.date<=P.fin&&(CPT[e.vers]||{}).type==='epargne').reduce((a,e)=>a+e.montant,0);
  const rem=ofNat(ops,'remboursement'),mois=Math.max(1,P.n/30.44);
  const acquis=BIENS.filter(b=>b.date_achat&&b.date_achat>=P.d0&&b.date_achat<=P.fin),investiTout=BIENS.reduce((a,b)=>a+etatBien(b).cout,0);
  const parMois=v=>P.n>=28?` · ${fmt(v/mois)} par mois`:'',part=v=>revC>0?` · ${pcE(v/rev)} des revenus`:'';
  const st=(l,v,sub,col)=>`<div class="stat"><span class="label">${lblIc(l)}</span><span class="v"${col?` style="color:${col}"`:''}>${valAbr(l,v)}</span><span class="s">${sub}</span></div>`;
  $('bilanSous').textContent=` · du ${dmy(P.d0)} au ${dmy(P.fin)} (${P.n} jours suivis)`;
  $('statsBilan').innerHTML=P.n?
    st('Revenus cumulés',fmt(rev),`${U()}${parMois(rev)}${rev>revC?` · dont ${fmt(rev-revC)} ponctuels`:''}`)+
    st('Dépenses cumulées',fmt(dep),`${U()}${parMois(dep)}${F.exc?` · dont ${fmt(F.exc)} exceptionnelles`:''}`)+
    st('Épargne nette',sgn(epargne),`${U()} · revenus − dépenses${part(epargne)}`,epargne<0?'var(--warn)':'')+
    st('Mis de côté',fmt(ep),`${U()} virés vers l'épargne${part(ep)}`)+
    st('Investissements',fmt(F.inv),`${U()} sur la période · ${fmt(investiTout)} investis en tout dans vos biens`)+
    st('Biens acquis',String(acquis.length),acquis.length?`${esc(acquis.map(b=>b.nom).join(', '))} · ${fmt(acquis.reduce((a,b)=>a+(+b.prix_achat||0),0))} ${U()}`:'aucun sur la période')+
    st('Prêts',fmt(F.pre),`${U()} prêtés · ${fmt(rem)} remboursés`)+
    st('Solde des opérations',sgn(F.net),`${U()} · toutes entrées − toutes sorties (dépenses, investissements, prêts)`,F.net<0?'var(--warn)':'')
    :'<p class="hint">Aucun jour suivi sur cette période.</p>';
}
/* Cumuls (fusion de « Dépenses cumulées » et « Cumuls sur la période », 2026-11-18) : dépenses courantes (comparées à la
   période précédente au même stade, projection et fourchette 80 %, budget), revenus et investissements additionnés jour après
   jour, une seule échelle. Axe : du début du suivi dans la période jusqu'à la fin de la période (la projection y tient). */
function dessinerCumuls(w,P,M){
  const fig=$('figCumuls'),h=250,N=M.N,el=M.el,off=Math.max(0,nbJ(P.debut,P.d0)-1),nx=N-off;
  fig.querySelector('figcaption b').textContent=statsMode==='annee'?"Cumuls de l'année":statsMode==='mois'?'Cumuls du mois':'Cumuls sur la période';
  if(!el||!P.n){fig.querySelector('.plot').innerHTML='<div class="empty">Aucun jour suivi sur cette période.</div>';fig.querySelector('.slegende').innerHTML='';fig.querySelector('.vd').innerHTML='';return}
  const cum=f=>{const j=new Array(el).fill(0);P.ops.forEach(e=>{if(f(e)){const k=nbJ(P.debut,e.date);if(k>=1&&k<=el)j[k-1]+=e.montant}});let c=0;return j.map(v=>c+=v)};
  const S=[{cls:'ln1',k:'k-l1',lab:'Dépenses courantes',c:M.A.c},{cls:'ln2',k:'k-l2',lab:'Revenus',c:cum(e=>e.nature==='revenu')},{cls:'ln3',k:'k-l3',lab:'Investissements',c:cum(e=>e.nature==='investissement')}];
  const Bc=M.B?M.B.c:null,max=Math.max(1,...S.map(x=>x.c[el-1]),...(Bc?Bc.slice(off,N):[]),M.proj?M.proj.haut:0,M.btot);
  const tk=graduations(max),top=tk[tk.length-1]*DEV.taux,ih=h-PAD.t-PAD.b,X=d=>PAD.l+(nx<2?0:(d-off-1)/(nx-1))*(w-PAD.l-PAD.r-70),Y=v=>PAD.t+ih-(v/top)*ih;
  const pl=(c,a,b)=>c.slice(a,b).map((v,i)=>`${X(a+i+1).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  let g=grilleY(w,h,tk,Y)+`<line class="base" x1="${PAD.l}" x2="${w-PAD.r}" y1="${PAD.t+ih}" y2="${PAD.t+ih}"/>`;
  [off+1,N].forEach((d,i)=>{g+=`<text class="axe" x="${X(d)}" y="${h-8}" text-anchor="${i?'end':'start'}">${dmy(addJ(P.debut,d-1)).slice(0,8)}</text>`});
  if(M.btot)g+=`<line class="budget-l" x1="${PAD.l}" x2="${X(N)}" y1="${Y(M.btot)}" y2="${Y(M.btot)}"/><text class="axe" x="${X(N)}" y="${Y(M.btot)-5}" text-anchor="end">budget ${fmtAxe(M.btot/DEV.taux)}</text>`;
  if(Bc)g+=`<polyline class="ln-prev" points="${pl(Bc,off,Math.min(N,Bc.length))}"/>`;
  if(M.proj){const x1=X(el),x2=X(N);g+=`<polygon class="band" points="${x1},${Y(M.tot)} ${x2},${Y(M.proj.haut)} ${x2},${Y(M.proj.bas)}"/><line class="ln-proj" x1="${x1}" y1="${Y(M.tot)}" x2="${x2}" y2="${Y(M.proj.fin)}"/>`}
  S.forEach(x=>{g+=`<polyline class="${x.cls}" points="${pl(x.c,off,el)}"/>`});
  // étiquettes directes au dernier jour connu (écartées si elles se chevauchent)
  const fins=S.filter(x=>x.c[el-1]>0).map(x=>({x,y:Y(x.c[el-1])})).sort((a,b)=>a.y-b.y);for(let i=1;i<fins.length;i++)if(fins[i].y-fins[i-1].y<14)fins[i].y=fins[i-1].y+14;
  const xe=M.proj?X(el)-6:X(el)+6,an=M.proj?'end':'start';
  fins.forEach(f=>{g+=`<text class="val" x="${xe}" y="${f.y+(M.proj?-6:4)}" text-anchor="${an}">${esc(fmt(f.x.c[el-1]))}</text>`});
  g+=`<line class="cross" x1="0" x2="0" y1="${PAD.t}" y2="${PAD.t+ih}" visibility="hidden"/><rect class="hit ov" tabindex="0" role="img" aria-label="${esc(`Cumuls au ${dmy(P.fin)} : `+S.map(x=>`${x.lab.toLowerCase()} ${fmt(x.c[el-1])} ${U()}`).join(', ')+(M.B?` ; dépenses au même stade pour ${M.C.nom} : ${fmt(M.prevMeme)} ${U()}`:'')+(M.proj?` ; projection de fin de période ${fmt(M.proj.fin)} ${U()}`:'')+'. Flèches gauche et droite pour parcourir les jours.')}" x="${PAD.l}" y="${PAD.t}" width="${Math.max(1,X(N)-PAD.l)}" height="${ih}"/>`;
  fig.querySelector('.plot').innerHTML=`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${g}</svg>`;
  const ov=fig.querySelector('.ov'),cr=fig.querySelector('.cross');let jour=el;
  const montrer=(d,cx,cy)=>{d=Math.max(off+1,Math.min(N,d));jour=d;const x=X(d);cr.setAttribute('x1',x);cr.setAttribute('x2',x);cr.setAttribute('visibility','visible');
    const l=[];if(d<=el)S.forEach(s=>l.push({cls:s.k,val:`${fmt(s.c[d-1])} ${U()}`,lab:s.lab.toLowerCase()}));
    else if(M.proj)l.push({cls:'k-proj',val:`${fmt(M.tot+M.moy*(d-el))} ${U()}`,lab:'dépenses, projection'});
    if(Bc&&d<=Bc.length)l.push({cls:'k-prev',val:`${fmt(Bc[d-1])} ${U()}`,lab:`dépenses, ${M.C.court}`});
    const r=ov.getBoundingClientRect();montrerTip(cx??(r.left+(x-PAD.l)),cy??r.top+20,dmy(addJ(P.debut,d-1)),l)};
  ov.addEventListener('pointermove',ev=>{const r=ov.getBoundingClientRect();montrer(Math.round(off+1+(ev.clientX-r.left)/r.width*(nx-1)),ev.clientX,ev.clientY)});
  ov.addEventListener('pointerleave',()=>{cr.setAttribute('visibility','hidden');cacherTip()});
  ov.addEventListener('focus',()=>setTimeout(()=>{if(document.activeElement===ov)montrer(jour)},60));ov.addEventListener('blur',()=>{cr.setAttribute('visibility','hidden');cacherTip()});
  ov.addEventListener('keydown',ev=>{const k={ArrowRight:1,ArrowLeft:-1}[ev.key];if(k){ev.preventDefault();montrer(jour+k)}});
  fig.querySelector('figcaption .hint').textContent=`Additionnés jour après jour, même échelle${M.C?` · dépenses comparées à ${M.C.court}`:''}${M.proj?' · projection jusqu\'à la fin de la période':''}`;
  fig.querySelector('.slegende').innerHTML=S.map(x=>({cls:x.k,lab:x.lab})).concat(M.B?[{cls:'k-prev',lab:`dépenses ${M.C.court}`}]:[],M.proj?[{cls:'k-proj',lab:'projection (fourchette 80 %)'}]:[]).map(x=>`<span><i class="lk ${x.cls}" aria-hidden="true"></i>${esc(x.lab)}</span>`).join('');
  // tableau : chaque jour pour un mois, sinon chaque fin de mois (et le dernier jour connu)
  const lignes=[];for(let d=off+1;d<=el;d++){const dt=addJ(P.debut,d-1);if(statsMode==='mois'||d===el||addJ(dt,1).slice(8)==='01')lignes.push([dmy(dt),...S.map(s=>fmt(s.c[d-1]))].concat(Bc?[d<=Bc.length?fmt(Bc[d-1]):'–']:[]))}
  fig.querySelector('.vd').innerHTML=tableDonnees(['Au','Dépenses courantes cumulées','Revenus cumulés','Investissements cumulés'].concat(Bc?[`Dépenses ${M.C.court}`]:[]),lignes);
}

/* ---------- alertes, conclusions, perspectives (règles explicites, chiffres tirés des mêmes calculs) ---------- */
/* mois complets de la période où le suivi des dépenses était actif */
function moisSuivis(P){const out=[],prem=debutSuivi().slice(0,7);let d=new Date(+P.debut.slice(0,4),+P.debut.slice(5,7)-1,1);
  while(iso(d)<=P.fin){const y=d.getFullYear(),m=d.getMonth(),a=iso(new Date(y,m,1)),b=iso(new Date(y,m+1,0)),k=a.slice(0,7);
    if(a>=P.debut&&b<=P.fin&&b<today&&k>=prem)out.push({y,m,f:flux(monthItems(y,m))});d=new Date(y,m+1,1)}return out}
function analyser(P,M,H,S,L){
  const al=[],co=[],pe=[],j0=P.jours,moy=moyenne(j0),sd=ecartType(j0),cv=moy?sd/moy:0;
  // alertes : niveau 2 = important, 1 = à surveiller, 0 = information ; les alertes de situation (prêts, comptes, biens) valent quelle que soit la période
  creances().filter(c=>c.retard).forEach(c=>al.push({n:2,t:'Prêt en retard',m:`${c.nom} doit encore ${fmt(c.reste)} ${U()} ; échéance du ${dmy(c.echeance)} dépassée de ${nbJ(c.echeance,today)-1} jours.`}));
  if(M.proj&&M.prevTot>0&&M.proj.fin>M.prevTot*1.1)al.push({n:1,t:'Rythme de dépense',m:`À ce rythme, ${P.nom} finirait vers ${fmt(M.proj.fin)} ${U()} de dépenses, soit ${pct(M.proj.fin/M.prevTot-1)} par rapport à ${M.C.nom} (${fmt(M.prevTot)} ${U()}).`});
  if(statsMode==='mois'){
    if(M.btot&&(M.tot>M.btot||(M.proj&&M.proj.fin>M.btot)))al.push({n:M.tot>M.btot?2:1,t:'Budget du mois',m:M.tot>M.btot?`Budget total dépassé de ${fmt(M.tot-M.btot)} ${U()}.`:`La projection (${fmt(M.proj.fin)} ${U()}) dépasse le budget total de ${fmt(M.proj.fin-M.btot)} ${U()}.`});
    Object.entries(budgets).forEach(([k,b])=>{const v=byCat(monthItems(cur.y,cur.m))[k]||0;if(v>b)al.push({n:2,t:'Budget dépassé',m:`${(CAT[k]||CAT.autre).label} : ${fmt(v)} ${U()} pour un budget de ${fmt(b)} ${U()}.`})});
    if(M.enCours&&!ofNat(monthItems(cur.y,cur.m),'revenu'))al.push({n:0,t:'Entrées du mois',m:`Aucun revenu noté pour ${P.nom} : pensez au salaire et à la prime dès leur arrivée.`});
  }
  COMPTES.forEach(c=>{const s=etatCompte(c);
    // écarts des soldes notés DANS la période analysée ; sorties et entrées non notées séparées (2026-11-25 : la somme
    // affichait « 0 FCFA (2 écarts) » quand un écart de +1 et un de −1 s'annulaient)
    const ec=s.ecarts.filter(e=>e.date>=P.debut&&e.date<=P.fin);
    if(ec.length){const somme=f=>ec.filter(f).reduce((a,e)=>a+e.ecart,0),moins=somme(e=>e.ecart<0),plus=somme(e=>e.ecart>0);
      const parts=[moins?`sorties non notées ${sgn(moins)} ${U()}`:'',plus?`entrées non notées ${sgn(plus)} ${U()}`:''].filter(Boolean).join(' · ');
      al.push({n:1,t:'Écarts de relevés (opérations probablement non notées)',m:`${c.nom} : ${parts} (${ec.length} écart${ec.length>1?'s':''}, le dernier au solde noté le ${dmy(ec[ec.length-1].date)})`})}
    if(s.last&&nbJ(s.last.date,today)>31&&c.type!=='especes'&&!estTiers(c.id))al.push({n:0,t:'Solde à vérifier',m:`${c.nom} : dernier relevé noté le ${dmy(s.last.date)} (il y a ${nbJ(s.last.date,today)-1} jours).`})});
  const esp=CPT.especes?etatCompte(CPT.especes).solde:null,j30=periodeJours(addJ(today,-29),today),m30=moyenne(j30);
  if(esp!==null&&m30>0&&esp<m30*7)al.push({n:1,t:'Réserve d\'espèces',m:`${fmt(esp)} ${U()} en espèces, soit environ ${Math.max(0,Math.floor(esp/m30))} jours de dépenses au rythme des 30 derniers jours (${fmt(m30)} ${U()} par jour).`});
  BIENS.forEach(b=>{const e=etatBien(b);if(!e.est)al.push({n:0,t:'Valeur à renseigner',m:`${b.nom} : aucune valeur actuelle notée, l'appréciation ne peut pas être calculée.`});else if(nbJ(e.est.date,today)>183)al.push({n:0,t:'Estimation ancienne',m:`${b.nom} : valeur estimée le ${dmy(e.est.date)}, à mettre à jour.`})});
  // conclusions sur la période
  if(!P.n)co.push(`Aucune dépense notée sur ${P.nom} : le suivi quotidien commence le ${dmy(debutSuivi())}.`);
  else if(P.n>=7){
    const med=(()=>{const t=[...j0].sort((a,b)=>a-b),k=t.length;return k%2?t[(k-1)/2]:(t[k/2-1]+t[k/2])/2})();
    co.push(`Sur ${P.n} jours (du ${dmy(P.d0)} au ${dmy(P.fin)}), vous dépensez en moyenne ${fmt(moy)} ${U()} par jour ; un jour sur deux, moins de ${fmt(med)} ${U()} (médiane). L'écart type vaut ${fmt(sd)} ${U()}. Le coefficient de variation (écart type / moyenne) vaut ${cv.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} : ${cv>1?'vos dépenses sont très irrégulières, portées par quelques grosses journées':cv>0.6?'vos dépenses varient nettement d\'un jour à l\'autre':'vos dépenses sont assez régulières'}.`);
    const tri=[...j0].sort((a,b)=>b-a),k=Math.min(5,tri.length),part=tri.slice(0,k).reduce((a,v)=>a+v,0)/(j0.reduce((a,v)=>a+v,0)||1);
    co.push(`Les ${k} jours les plus chers concentrent ${fmt1(part*100)} % des dépenses de la période ; ${fmt1(H.pct[0])} % des jours n'ont aucune dépense notée.`);
    const imax=S.moy.indexOf(Math.max(...S.moy)),imin=S.moy.indexOf(Math.min(...S.moy)),nmin=Math.min(...S.n),nmax=Math.max(...S.n);
    if(nmin>=2)co.push(`Le ${JOURS_L[imax]} est en moyenne le jour le plus dépensier (${fmt(S.moy[imax])} ${U()}), le ${JOURS_L[imin]} le plus calme (${fmt(S.moy[imin])} ${U()}). Avec ${nmin===nmax?nmin:nmin+' à '+nmax} jours observés par jour de semaine, cet écart reste indicatif.`);
  }else co.push(`La période ne compte que ${P.n} jour${P.n>1?'s':''} de dépenses notées : les moyennes ne sont pas encore significatives.`);
  if(M.B&&M.el)co.push(`Au même stade, ${M.C.nom} totalisait ${fmt(M.prevMeme)} ${U()} contre ${fmt(M.tot)} ${U()} pour ${P.nom}${M.prevMeme?` (${pct(M.tot/M.prevMeme-1)})`:''}.`);
  const bc=byCat(P.ops),tp=sum(deps(P.ops)),top=Object.entries(bc).sort((a,b)=>b[1]-a[1])[0];
  if(top&&tp)co.push(`Premier poste : ${(CAT[top[0]]||CAT.autre).label}, ${fmt1(top[1]/tp*100)} % des dépenses courantes${L.top[0]?` ; premier libellé : « ${L.top[0].lab} » (${fmt(L.top[0].v)} ${U()}, ${L.top[0].n} fois)`:''}.`);
  // taux d'épargne de la période (mêmes règles que les vues Mois et Année)
  const depP=sum(deps(P.ops));let E=null;
  if(statsMode==='mois'){const days=new Date(cur.y,cur.m+1,0).getDate(),isC=cur.y===now.getFullYear()&&cur.m===now.getMonth(),el=isC?now.getDate():days,
      j1=P.d0.slice(0,7)===`${cur.y}-${pad(cur.m+1)}`?+P.d0.slice(8,10):1;E=epargneMois(cur.y,cur.m,P.ops,depP,isC,el,days,Math.max(1,el-j1+1))}
  else if(statsMode==='annee')E=epargneAn(cur.y,P.ops,depP);
  else{const rv=sumF(P.ops,revCour);E={rev:rv,te:rv>0?(rv-depP)/rv:null,tp:null}}
  if(E.te!==null)co.push(`Taux d'épargne de ${P.nom} : ${pcE(E.te)} (revenus courants ${fmt(E.rev)} ${U()}, dépenses courantes ${fmt(depP)} ${U()}).`);
  else if(E.attente)co.push(`Taux d'épargne réel de ${P.nom} : en attente des revenus habituels du mois (${fmt(E.rev)} ${U()} de revenus courants reçus pour l'instant, ${fmt(depP)} ${U()} de dépenses courantes).`);
  else if(P.n)co.push(`Aucun revenu courant noté sur ${P.nom} : le taux d'épargne réel ne peut pas encore être calculé.`);
  if(E.tp!==null)pe.push(`Taux d'épargne prévisionnel : ${pcE(E.tp)}. ${E.det}`);
  // évolution des postes par rapport à la période précédente, au même stade
  if(M.C&&M.el){const fC=addJ(M.C.debut,M.el-1),finC=fC<M.C.fin?fC:M.C.fin,avant=byCat(allP().filter(e=>e.date>=M.C.debut&&e.date<=finC)),
      ev=Object.keys({...bc,...avant}).map(k=>({k,a:avant[k]||0,v:bc[k]||0})).map(x=>({...x,d:x.v-x.a})).filter(x=>Math.abs(x.d)>=10000&&(!x.a||Math.abs(x.d)/x.a>=.2));
    const lib=x=>`${(CAT[x.k]||CAT.autre).label} ${x.d>0?'+':'−'}${fmt(Math.abs(x.d))} ${U()}${x.a?` (${pct(x.v/x.a-1)})`:' (nouveau)'}`;
    const up=ev.filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,3),dn=ev.filter(x=>x.d<0).sort((a,b)=>a.d-b.d).slice(0,3);
    if(up.length||dn.length)co.push(`Par rapport à ${M.C.nom} au même stade : ${up.length?`en hausse, ${up.map(lib).join(', ')}`:'aucun poste en nette hausse'} ; ${dn.length?`en baisse, ${dn.map(lib).join(', ')}`:'aucun poste en nette baisse'}.`)}
  const comp=moisSuivis(P).filter(x=>x.f.ent>0);
  comp.forEach(x=>{const ep=all.filter(e=>e.nature==='virement'&&e.date.startsWith(`${x.y}-${pad(x.m+1)}`)&&(CPT[e.vers]||{}).type==='epargne').reduce((a,e)=>a+e.montant,0);
    co.push(`${moisNom(x.y,x.m).replace(/^./,c=>c.toUpperCase())} : ${fmt(x.f.ent)} ${U()} d'entrées pour ${fmt(x.f.dep)} ${U()} de dépenses courantes (${fmt1(x.f.dep/x.f.ent*100)} % des entrées)${ep?` ; ${fmt(ep)} ${U()} mis en épargne, soit ${fmt1(ep/x.f.ent*100)} % des entrées`:''} ; solde ${sgn(x.f.net)} ${U()}.`)});
  // perspectives
  if(M.proj)pe.push(`Fin de ${P.nom} : environ ${fmt(M.proj.fin)} ${U()} de dépenses courantes si le rythme actuel se maintient (fourchette à 80 % : ${fmt(M.proj.bas)} à ${fmt(M.proj.haut)} ${U()}, en supposant des jours indépendants).`);
  COMPTES.filter(c=>c.taux).forEach(c=>{const s=etatCompte(c).solde,per=c.periode||12,an=s*(Math.pow(1+c.taux/100,12/per)-1);
    pe.push(`${c.nom} : à ${fmt1(c.taux)} % tous les ${per} mois, le solde actuel rapporterait environ ${fmt(s*c.taux/100)} ${U()} à la prochaine échéance et ${fmt(an)} ${U()} sur un an (intérêts composés, avant frais et impôts).`)});
  BIENS.forEach(b=>{const e=etatBien(b);if(e.taux!==null)pe.push(`${b.nom} : au taux observé de ${pct(e.taux)} par an, sa valeur serait d'environ ${fmt(e.V*(1+e.taux))} ${U()} dans un an. Taux calculé sur ${fmt1(e.ans)} ans entre le coût de revient et votre estimation.`)});
  const cr=creances().filter(c=>c.reste>0),tcr=cr.reduce((a,c)=>a+c.reste,0),PT=patrimoine(),dt=PT.cre-tcr;
  if(cr.length||dt>0)pe.push(`On vous doit ${fmt(PT.cre)} ${U()} : ${fmt(tcr)} ${U()} de prêts à ${cr.length} personne${cr.length>1?'s':''}${cr.filter(c=>c.retard).length?` (dont ${cr.filter(c=>c.retard).map(c=>c.nom).join(', ')} en retard)`:''}${dt>0?` et ${fmt(dt)} ${U()} avancés sur des comptes de tiers`:''}. Recouvrés, ils ajouteraient ${fmt1(PT.cre/Math.max(1,PT.liq)*100)} % à vos comptes.`);
  if(comp.length){const nm=moyenne(comp.map(x=>x.f.net));pe.push(`Au solde mensuel moyen de la période (${sgn(nm)} ${U()} sur ${comp.length} mois complet${comp.length>1?'s':''}), vos comptes ${nm>=0?'gagneraient':'perdraient'} environ ${fmt(Math.abs(nm)*12)} ${U()} sur douze mois. C'est une estimation fragile tant que l'historique est court.`)}
  const nbm=Math.round(nbJ(debutSuivi(),today)/30.44);if(nbm<6)pe.push(`Le suivi quotidien couvre environ ${Math.max(1,nbm)} mois : les tendances deviendront fiables avec 6 à 12 mois de données.`);
  return {al:al.sort((a,b)=>b.n-a.n),co,pe};
}
function periodeJours(a,b){const d0=a>debutSuivi()?a:debutSuivi();if(d0>b)return [];const j=new Array(nbJ(d0,b)).fill(0);deps(all).forEach(e=>{if(e.date>=d0&&e.date<=b)j[nbJ(d0,e.date)-1]+=e.montant});return j}

/* ---------- assemblage ---------- */
const NIV=[{cls:'info',ic:'ℹ',lab:'Information'},{cls:'att',ic:'⚠',lab:'À surveiller'},{cls:'grave',ic:'⛔',lab:'Important'}];
function renderStats(){
  const box=$('statsBox');if(box.hidden||!ready)return;
  $('statsPer').querySelectorAll('[data-p]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.p===statsMode));
  $('statsDates').hidden=statsMode!=='periode';$('statsDu').value=statsDu;$('statsAu').value=statsAu;
  const w=Math.max(240,Math.floor($('figCumuls').querySelector('.plot').clientWidth)),wl=Math.max(240,Math.floor($('figHisto').querySelector('.plot').clientWidth));
  const P=periodeStats();
  const M=analyseCumul(P);dessinerCumuls(w,P,M);dessinerMensuel(w,P);const H=dessinerHisto(wl,P),S=dessinerSemaine(wl,P),L=dessinerLibelles(w,P);dessinerPatrimoine();
  $('statsBase').textContent=`Période analysée : ${P.nom}${statsMode==='periode'?'':` (du ${dmy(P.debut)} au ${dmy(P.finPer)})`}`+(P.n?` · ${P.n} jour${P.n>1?'s':''} de dépenses notées, du ${dmy(P.d0)} au ${dmy(P.fin)}`:' · aucune dépense notée')+` · montants en ${DEV.code==='XAF'?'francs CFA':DEV.nom.toLowerCase()}.`;
  const A=analyser(P,M,H,S,L);
  // une seule carte, une ligne par type d'alerte (les alertes de même type sont regroupées)
  const grp=[];A.al.forEach(a=>{const g=grp.find(x=>x.t===a.t);if(g){g.m.push(a.m);g.n=Math.max(g.n,a.n)}else grp.push({t:a.t,n:a.n,m:[a.m]})});
  $('statsAlertes').innerHTML=grp.length?grp.map(a=>`<li class="${NIV[a.n].cls}"><span class="aic" aria-hidden="true">${NIV[a.n].ic}</span><span><span class="sr">${NIV[a.n].lab} : </span><b>${esc(a.t)}</b> — ${esc(a.m.join(' · '))}</span></li>`).join(''):'<li class="info"><span class="aic" aria-hidden="true">✓</span><span>Aucune alerte : rien d\'anormal détecté.</span></li>';
  bilanStats(P);
  $('statsConclusions').innerHTML=A.co.map(t=>`<li>${esc(t)}</li>`).join('');
  $('statsPersp').innerHTML=A.pe.map(t=>`<li>${esc(t)}</li>`).join('');
}
$('statsPer').addEventListener('click',ev=>{const b=ev.target.closest('[data-p]');if(!b)return;statsMode=b.dataset.p;render();if(statsMode==='periode')$('statsDu').focus()});
['statsDu','statsAu'].forEach(i=>$(i).addEventListener('change',()=>{if(!$(i).value)return;if(i==='statsDu')statsDu=$(i).value;else statsAu=$(i).value;render()}));
let rsT;if(window.ResizeObserver)new ResizeObserver(()=>{clearTimeout(rsT);rsT=setTimeout(renderStats,150)}).observe($('statsBox'));

/* ================= montants masqués ================= */
function majOeil(){const b=$('oeilBtn');if(!b)return;b.textContent=masque?'👁 Afficher':'🙈 Masquer';b.setAttribute('aria-pressed',!masque);
  b.setAttribute('aria-label',masque?'Afficher le patrimoine, les soldes, les biens et les prêts':'Masquer le patrimoine, les soldes, les biens et les prêts')}
function basculerMasque(v){masque=v;majOeil();render();if(typeof renderDraft==='function'&&draft.length)renderDraft();renderLibs()}
/* bouton Afficher / Masquer : dans la carte du patrimoine (redessinée à chaque rendu) */
$('hero').addEventListener('click',ev=>{if(ev.target.closest('#oeilBtn')){basculerMasque(!masque);const b=$('oeilBtn');if(b)b.focus()}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&!masque)basculerMasque(true)});
majOeil();

/* ================= export Excel ================= */
/* « Exporter Excel » propose tout, ou une rubrique : Mes finances, My Car, House.
   Les montants exportés restent en francs CFA (unité des données), quelle que soit la devise d'affichage. */
let XLSXp=null;
function loadXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);if(XLSXp)return XLSXp;
  XLSXp=new Promise((res,rej)=>{const s=document.createElement('script');s.src='xlsx.full.min.js';s.onload=()=>res(window.XLSX);s.onerror=()=>{XLSXp=null;rej(new Error('load'))};document.head.appendChild(s)});return XLSXp}
const serial=d=>(Date.UTC(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10))-Date.UTC(1899,11,30))/86400000;
/* une feuille : lignes (1re = en-têtes), largeurs de colonnes, formats {colonne: format} appliqués aux lignes de données */
function feuille(X,lignes,larg,formats={},filtre=false){
  const ws=X.utils.aoa_to_sheet(lignes);
  for(const [col,z] of Object.entries(formats))for(let r=2;r<=lignes.length;r++)if(ws[col+r]&&typeof ws[col+r].v==='number')ws[col+r].z=z;
  ws['!cols']=larg.map(w=>({wch:w}));if(filtre&&lignes.length>1)ws['!autofilter']={ref:`A1:${String.fromCharCode(64+lignes[0].length)}${lignes.length}`};
  return ws;
}
const moisLong=m=>new Date(+m.slice(0,4),+m.slice(5)-1,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
/* journal du suivi financier : la période de la vue financière en cours */
function periodeFinanciere(){const v=vueFin;
  if(v==='mois')return {items:monthItems(cur.y,cur.m),nom:`${cur.y}-${pad(cur.m+1)}`};
  if(v==='patrimoine')return {items:all,nom:'tout'};
  return {items:yearItems(cur.y),nom:String(cur.y)};
}
function feuillesFinancier(X){
  const P=periodeFinanciere(),items=sorted(P.items),F=[];
  F.push(['Journal',feuille(X,[["Date","Nature","Montant (CFA)","Libellé","Poste / type de revenu","Courant ou exceptionnel","Dont ponctuel (CFA)","Événement","Compte","Vers","Personne","Bien","Remarque"]].concat(items.map(e=>[serial(e.date),NAT[e.nature].l,e.montant,e.libelle,
    e.nature==='depense'?(CAT[e.categorie]||CAT.autre).label:e.nature==='revenu'?(REV[catRev(e)]||{label:''}).label:null,(e.nature==='depense'||e.nature==='revenu')?(estExc(e)?'exceptionnel':partPonct(e)?`courant, dont ponctuel (${(REV[e.cat_ponctuel]||{label:'Autre revenu'}).label})`:'courant'):null,partPonct(e)||null,
    e.evenement?(EVT[e.evenement]||{}).nom||e.evenement:null,nomCpt(e.compte),e.vers?nomCpt(e.vers):null,e.personne||null,e.bien?(BIEN[e.bien]||{}).nom:null,e.remarque||null])),
    [11,18,14,34,22,24,14,18,14,14,18,18,24],{A:'dd/mm/yyyy',C:'#,##0',G:'#,##0'},true)]);
  const bp=byCat(items),tp=sum(deps(items));
  F.push(['Par poste',feuille(X,[["Poste","Montant (CFA)","Part","Budget mensuel (CFA)"]].concat(CATS.filter(c=>bp[c.id]).sort((a,b)=>bp[b.id]-bp[a.id]).map(c=>[c.label,bp[c.id],tp?bp[c.id]/tp:0,budgets[c.id]||null]),[["Total",tp,1,null]]),
    [18,15,9,20],{B:'#,##0',C:'0.0%',D:'#,##0'})]);
  const used=CATS.filter(c=>deps(all).some(e=>e.categorie===c.id)),mois=[...new Set(allP().map(e=>e.date.slice(0,7)))].sort(),ba=byCat(all),fa=flux(all);
  F.push(['Récap mensuel',feuille(X,[["Mois",...used.map(c=>c.label),"Dépenses courantes","Dépenses exceptionnelles","Entrées courantes","Revenus ponctuels","Investissements","Prêts","Solde"]].concat(mois.map(m=>{const it=all.filter(e=>e.date.startsWith(m)),b=byCat(it),f=flux(it);
    return [moisLong(m),...used.map(c=>b[c.id]||0),f.dep,f.exc,f.ent,f.entX,f.inv,f.pre,f.net]}),[["Total",...used.map(c=>ba[c.id]||0),fa.dep,fa.exc,fa.ent,fa.entX,fa.inv,fa.pre,fa.net]]),[16].concat(used.map(()=>14),[13,13,13,13,15,12,13]))]);
  const evx=EVTS.filter(x=>all.some(e=>e.evenement===x.id));
  if(evx.length)F.push(['Événements',feuille(X,[["Événement","Type","Début","Fin","Dépenses","Revenus","Net","Budget"]].concat(evx.map(x=>{const it=all.filter(e=>e.evenement===x.id),d=sum(it.filter(e=>e.nature==='depense')),r=sum(it.filter(e=>e.nature==='revenu'));
    return [x.nom,TYPES_EVT[x.type]||'',x.debut?dmy(x.debut):null,x.fin?dmy(x.fin):null,d,r,r-d,x.budget||null]})),[24,16,11,11,13,13,13,13],{E:'#,##0',F:'#,##0',G:'#,##0',H:'#,##0'})]);
  F.push(['Comptes',feuille(X,[["Compte","Type","Solde (CFA)","Dernier relevé","Solde du relevé"]].concat(COMPTES.map(c=>{const s=etatCompte(c);return [c.nom,TYPES_CPT[c.type]||'',s.solde,s.last?dmy(s.last.date):null,s.last?s.last.solde:null]})),[18,16,14,14,14],{C:'#,##0',E:'#,##0'})]);
  F.push(['Prêts',feuille(X,[["Personne","Prêté","Remboursé","Reste dû","Échéance"]].concat(creances().map(c=>[c.nom,c.prete,c.rembourse,c.reste,c.echeance?dmy(c.echeance):null])),[20,12,12,12,12],{B:'#,##0',C:'#,##0',D:'#,##0'})]);
  F.push(['Biens',feuille(X,[["Bien","Type","Date d'achat","Prix d'achat","Investissements","Coût de revient","Valeur actuelle","Plus/moins-value","Taux annuel"]].concat(BIENS.map(b=>{const s=etatBien(b);return [b.nom,b.type,b.date_achat?dmy(b.date_achat):null,b.prix_achat,s.I,s.cout,s.V,s.pv,s.taux]})),
    [22,8,12,13,15,15,15,16,11],{D:'#,##0',E:'#,##0',F:'#,##0',G:'#,##0',H:'#,##0',I:'0.0%'})]);
  return {feuilles:F,nom:`suivi-financier_${P.nom}`};
}
function feuillesVehicule(X){
  const v=VEH(),vo=chaineKm(vehOps()),F=[];
  F.push(['Véhicule',feuille(X,[["Date","Catégorie","Nature","Montant (CFA)","Libellé","Km","Écart km","Quantité","Unité","Remarque"]].concat(vo.map(e=>[serial(e.date),(CATV[e.cat_vehicule]||CATV.autre).l,NAT[e.nature].l,e.montant,e.libelle,e.km||null,e.diff>0?e.diff:null,e.quantite||null,e.quantite?(e.unite||'L'):null,e.remarque||null])),
    [11,14,14,13,34,10,9,9,6,24],{A:'dd/mm/yyyy',D:'#,##0',F:'#,##0',G:'#,##0'},true)]);
  const used=CATS_V.filter(c=>vo.some(e=>e.cat_vehicule===c.id)),mois=[...new Set(vo.map(e=>e.date.slice(0,7)))].sort();
  const ligne=(lab,it)=>{const s=statsVeh(it),c={};it.forEach(e=>c[e.cat_vehicule]=(c[e.cat_vehicule]||0)+e.montant);return [lab,...used.map(x=>c[x.id]||0),s.total,s.litres||null,s.km||null,s.conso||null,s.km?s.total/s.km:null]};
  F.push(['Récap véhicule',feuille(X,[["Mois",...used.map(c=>c.l),"Total (CFA)","Litres","Km","L/100 km","CFA par km"]].concat(mois.map(m=>ligne(moisLong(m),vo.filter(e=>e.date.startsWith(m)))),[ligne('Total',vo)]),
    [16].concat(used.map(()=>13),[13,9,9,9,10]),{...Object.fromEntries(used.map((_,i)=>[String.fromCharCode(66+i),'#,##0'])),[String.fromCharCode(66+used.length)]:'#,##0',[String.fromCharCode(67+used.length)]:'0.0',[String.fromCharCode(68+used.length)]:'#,##0',[String.fromCharCode(69+used.length)]:'0.0',[String.fromCharCode(70+used.length)]:'#,##0'})]);
  const vd=vidangeDe(v);let pv=null;const vr=vo.filter(e=>isVidange(e)&&e.km).map(e=>{const r=[serial(e.date),e.libelle,e.km,pv!=null?e.km-pv:null,e.montant];pv=e.km;return r});
  F.push(['Vidanges',feuille(X,[["Date","Nature","Km","Intervalle (km)","Coût (CFA)"]].concat(vr,vd.prochain?[["Prochaine","prévue",vd.prochain,vd.dernier?vd.prochain-vd.dernier:null,null]]:[]),[11,30,10,15,12],{A:'dd/mm/yyyy',C:'#,##0',D:'#,##0',E:'#,##0'})]);
  return {feuilles:F,nom:'vehicule'};
}
function feuillesMaison(X){
  const m=MAISON(),mo=maiOps(),F=[];
  F.push(['Travaux maison',feuille(X,[["Date","Catégorie","Montant (CFA)","Libellé","Compte","Remarque"]].concat(mo.map(e=>[serial(e.date),(CATM[e.cat_maison]||CATM.autre).l,e.montant,e.libelle,nomCpt(e.compte),e.remarque||null])),
    [11,20,13,34,14,24],{A:'dd/mm/yyyy',C:'#,##0'},true)]);
  const used=CATS_M.filter(c=>mo.some(e=>(e.cat_maison||'autre')===c.id)),ans=[...new Set(mo.map(e=>e.date.slice(0,4)))].sort();
  const ligne=(lab,it)=>{const c={};it.forEach(e=>{const k=e.cat_maison||'autre';c[k]=(c[k]||0)+e.montant});return [lab,...used.map(x=>c[x.id]||0),sum(it)]};
  F.push(['Récap maison',feuille(X,[["Année",...used.map(c=>c.l),"Total (CFA)"]].concat(ans.map(y=>ligne(y,mo.filter(e=>e.date.startsWith(y)))),[ligne('Total',mo)]),[10].concat(used.map(()=>16),[13]),
    Object.fromEntries(used.map((_,i)=>[String.fromCharCode(66+i),'#,##0']).concat([[String.fromCharCode(66+used.length),'#,##0']])))]);
  if(m){const s=etatBien(m),pj={budget:0,echeance:'',note:'',...(m.projet||{})};
    F.push(['Projet maison',feuille(X,[["Élément","Valeur"],["Bien",m.nom],["Date d'achat",m.date_achat?dmy(m.date_achat):null],["Prix du terrain (CFA)",m.prix_achat],["Travaux (CFA)",s.I],["Coût de revient (CFA)",s.cout],
      ["Valeur actuelle (CFA)",s.V],["Estimée le",s.est?dmy(s.est.date):null],["Plus/moins-value (CFA)",s.pv],["Taux annuel moyen",s.taux],["Budget des travaux (CFA)",pj.budget||null],
      ["Reste à investir (CFA)",pj.budget?Math.max(0,pj.budget-s.I):null],["Échéance",pj.echeance?dmy(pj.echeance):null],["Note",pj.note||null]],[26,30],{B:'#,##0'})]);
    const ws=F[F.length-1][1];if(ws.B10&&typeof ws.B10.v==='number')ws.B10.z='0.0%'}
  return {feuilles:F,nom:'maison'};
}
const EXPORTS={tout:{l:'Tout (toutes les rubriques)'},fin:{l:'Mes finances',f:feuillesFinancier},veh:{l:'Engins',f:feuillesVehicule},mai:{l:'Maison',f:feuillesMaison}};
async function exporter(choix){
  const btn=$('exportBtn'),lab=btn.innerHTML;btn.disabled=true;btn.setAttribute('aria-busy','true');
  try{
    const X=await loadXLSX(),wb=X.utils.book_new();
    const parts=choix==='tout'?[feuillesFinancier(X),feuillesVehicule(X),feuillesMaison(X)]:[EXPORTS[choix].f(X)];
    parts.forEach(p=>p.feuilles.forEach(([n,ws])=>X.utils.book_append_sheet(wb,ws,n)));
    const buf=X.write(wb,{bookType:'xlsx',type:'array'}),nom=choix==='tout'?`tout_${today}`:`${parts[0].nom}_${today}`;
    await enregistrerFichier(`Daftar_${nom}.xlsx`,new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    status(`Export « ${EXPORTS[choix].l} » prêt : Daftar_${nom}.xlsx (${wb.SheetNames.length} feuilles, montants en francs CFA).`);
  }catch(e){status(e&&e.message==='load'?"Le module d'export (xlsx.full.min.js) est introuvable dans le dossier app.":"L'export a échoué : "+(e&&e.message||'erreur inconnue'),true)}
  finally{btn.disabled=false;btn.removeAttribute('aria-busy');btn.innerHTML=lab}
}
/* menu du bouton : clavier (flèches, Début/Fin, Échap), fermeture au clic à côté ; la rubrique affichée est proposée en premier focus */
const menuX=$('exportMenu'),itemsX=()=>[...menuX.querySelectorAll('[role=menuitem]')];
function fermerMenuX(focus){if(menuX.hidden)return;menuX.hidden=true;$('exportBtn').setAttribute('aria-expanded','false');if(focus)$('exportBtn').focus()}
function ouvrirMenuX(){const cle=view==='vehicule'?'veh':view==='maison'?'mai':view==='donnees'?'tout':'fin';
  itemsX().forEach(b=>{b.querySelector('.cour').textContent=b.dataset.x===cle?'rubrique affichée':''});
  menuX.hidden=false;$('exportBtn').setAttribute('aria-expanded','true');(itemsX().find(b=>b.dataset.x===cle)||itemsX()[0]).focus()}
$('exportBtn').onclick=()=>menuX.hidden?ouvrirMenuX():fermerMenuX(true);
menuX.addEventListener('click',ev=>{const b=ev.target.closest('[data-x]');if(!b)return;fermerMenuX(true);exporter(b.dataset.x)});
menuX.addEventListener('keydown',ev=>{const it=itemsX(),i=it.indexOf(document.activeElement);
  const j={ArrowDown:i+1,ArrowUp:i-1,Home:0,End:it.length-1}[ev.key];
  if(j!==undefined){ev.preventDefault();it[(j+it.length)%it.length].focus()}else if(ev.key==='Escape'){ev.preventDefault();fermerMenuX(true)}else if(ev.key==='Tab')fermerMenuX(false)});
document.addEventListener('click',ev=>{if(!ev.target.closest('.expmenu'))fermerMenuX(false)});

/* enregistrer un fichier produit par la page : navigateur = téléchargement ; APK Android (Capacitor, qui ne gère pas
   les téléchargements) = fichier temporaire puis menu « Partager » (Drive, WhatsApp, Fichiers…) */
async function enregistrerFichier(nom,blob){
  const C=window.Capacitor,P=C&&C.Plugins;
  if(C&&C.isNativePlatform&&C.isNativePlatform()&&P&&P.Filesystem&&P.Share){
    const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)});
    const w=await P.Filesystem.writeFile({path:nom,data:b64,directory:'CACHE'});
    try{await P.Share.share({title:nom,files:[w.uri]})}catch(e){if(!/cancel/i.test(String(e&&e.message)))throw e}
    return;
  }
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=nom;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
