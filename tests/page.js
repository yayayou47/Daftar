/* Charge les scripts de app/index.html sous Node, avec un faux DOM tolérant (tout appel rend un objet neutre), pour
   tester les VRAIES fonctions de calcul de la page sans les recopier.
   Usage : node tests/page.js <carnet.json | demo> [aujourd'hui AAAA-MM-JJ] [autonome] < cas.json  →  écrit les résultats en JSON.
   cas.json = [{"expr": "cfa('10')"}, …] ; chaque expression est évaluée après chargement des données (charger()). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RACINE = path.join(__dirname, '..');

// objet neutre : toute propriété, tout appel, toute construction rend lui-même ; vaut '' / 0 et s'itère à vide
const neutre = new Proxy(function () {}, {
  get(t, k) {
    if (k === Symbol.toPrimitive) return () => '';
    if (k === Symbol.iterator) return function* () {};
    if (k === 'then') return undefined;              // pas une promesse
    if (k === 'length') return 0;
    if (k === 'style' || k === 'dataset') return {};
    if (k === 'classList') return {add() {}, remove() {}, toggle() {}, contains: () => false};
    return neutre;
  },
  set: () => true,
  apply: () => neutre,
  construct: () => neutre,
});

// éléments par id : gardent ce qu'on leur donne (value, innerHTML, hidden…) ; listes de choix à leur valeur habituelle
const VALEURS = {fNat: 'depense', fCpt: 'especes', fVers: 'especes', fCat: 'autre', devise: 'XAF'};
const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const etat = {id, value: VALEURS[id] ?? '', checked: false, hidden: false, disabled: false, textContent: '', innerHTML: '',
                  style: {setProperty() {}, removeProperty() {}}, dataset: {}, children: [], options: [], offsetHeight: 60, selectedIndex: 0, open: false, scrollTop: 0, offsetWidth: 800, clientWidth: 800,
                  classList: {add() {}, remove() {}, toggle() {}, contains: () => false}};
    elements.set(id, new Proxy(etat, {get: (t, k) => (k in t ? t[k] : neutre[k]), set: (t, k, v) => { t[k] = v; return true; }}));
  }
  return elements.get(id);
}
const docu = new Proxy({getElementById: element, querySelector: s => element('?' + s), querySelectorAll: () => [], createElement: () => element('_' + Math.random()),
                        documentElement: element('_html'), body: element('_body'), head: element('_head'), title: '', visibilityState: 'visible', hidden: false,
                        addEventListener() {}, removeEventListener() {}, activeElement: null, fonts: {ready: Promise.resolve()}},
                       {get: (t, k) => (k in t ? t[k] : neutre[k]), set: (t, k, v) => { t[k] = v; return true; }});
const stockage = new Map();
const localStorage = {getItem: k => (stockage.has(k) ? stockage.get(k) : null), setItem: (k, v) => stockage.set(k, String(v)),
                      removeItem: k => stockage.delete(k)};
const contexte = {
  console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  requestAnimationFrame: () => 0, queueMicrotask, Intl, Promise, URL, URLSearchParams, structuredClone,
  localStorage, sessionStorage: localStorage,
  document: docu, navigator: {userAgent: 'node', serviceWorker: undefined}, location: {search: '', hash: '', hostname: 'localhost', protocol: 'http:', origin: 'http://localhost', href: 'http://localhost/'},
  history: {pushState() {}, replaceState() {}, state: null},
  matchMedia: () => ({matches: false, addEventListener() {}, addListener() {}}),
  addEventListener() {}, removeEventListener() {}, getComputedStyle: () => neutre,
  fetch: () => new Promise(() => {}),              // jamais de réseau : le démarrage reste en attente
  EventSource: function () { return neutre; }, indexedDB: undefined,
  innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, scrollY: 0, scrollX: 0,
};
contexte.window = contexte; contexte.self = contexte; contexte.globalThis = contexte;
vm.createContext(contexte);

// les scripts de la page, dans l'ordre de index.html (scripts classiques : déclarations communes, comme dans le navigateur)
const html = fs.readFileSync(path.join(RACINE, 'app', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (html.includes('<script>')) throw new Error('index.html contient encore un script en ligne : le mettre dans un fichier');
for (const f of scripts) {
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'app', f), 'utf8'), contexte, {filename: f});
  if (f === 'mode.js' && process.argv[4] === 'autonome') { contexte.APPYA_AUTONOME = true; contexte.indexedDB = {}; }   // version téléphone / lien web (req() est remplacé : la base locale n'est pas lue)
}

(async () => {
  // données : par le vrai charger() de la page, req() rendant le carnet donné ; « aujourd'hui » fixé par la 2e option
  if (process.argv[3]) vm.runInContext(`today=${JSON.stringify(process.argv[3])};now=new Date(today+'T12:00:00')`, contexte);
  if (process.argv[2] === 'demo') {   // données de démonstration (app/demo.js, graine fixe) : publiques, toujours les mêmes
    vm.runInContext(fs.readFileSync(path.join(RACINE, 'app', 'demo.js'), 'utf8'), contexte, {filename: 'demo.js'});
    contexte.__D__ = vm.runInContext('AppYaDemo.generer(today)', contexte);
  } else contexte.__D__ = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  vm.runInContext('req=async(m,u)=>{if(m==="GET"&&u.startsWith("/api/info"))return {fichier:"test",sauvegardes:"test"};if(m==="GET"&&u.startsWith("/api/donnees"))return JSON.parse(JSON.stringify(__D__));throw new Error("hors test : "+m+" "+u)}', contexte);
  await vm.runInContext('charger()', contexte);
  if (!vm.runInContext('ready', contexte)) throw new Error('charger() a échoué : données non chargées');
  const cas = JSON.parse(fs.readFileSync(0, 'utf8'));
  const res = cas.map(c => {
    try { return {ok: JSON.parse(JSON.stringify(vm.runInContext(c.expr, contexte), (k, v) => (Number.isNaN(v) ? 'NaN' : v)) ?? null)}; }
    catch (e) { return {erreur: String(e && e.message || e)}; }
  });
  process.stdout.write(JSON.stringify(res));
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
