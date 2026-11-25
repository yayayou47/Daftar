/* Daftar — service hors ligne (téléphone).
   v4 (2026-11-16) : la PAGE aussi est servie « cache d'abord » : elle s'ouvre tout de suite, sans attendre le réseau
   (avant : jusqu'à 3 s d'attente à chaque ouverture via Tailscale ou les données mobiles). La version du réseau est
   chargée en arrière-plan et rangée dans le cache ; si elle diffère, la page est prévenue (« daftar-maj ») et propose
   de recharger. Sans copie en cache (premier lancement), on attend le réseau.
   La page et ses fichiers sont gardés en cache : Daftar s'ouvre sans réseau. Stratégie « réseau d'abord » :
   connecté, on prend toujours la dernière version (et on met le cache à jour) ; hors ligne, on sert le cache.
   Les appels /api/ ne passent jamais par le cache : les données sont gérées par la page (stockage local + synchronisation).

   v3 (2026-11-14) : chemins relatifs (servi aussi sous /Daftar/ sur GitHub Pages) ; mode.js et moteur.js en cache.
   v2 (2026-11-14) : la page est rangée sous une seule clé, '/index.html', à l'écriture comme à la lecture.
   En v1, l'installation rangeait aussi '/', et la lecture hors ligne de '/' retombait sur cette copie
   figée au jour de l'installation : hors ligne, le téléphone montrait une vieille version (sans les icônes).
   Si l'ordinateur ne répond pas (éteint, Tailscale coupé), on n'attend pas plus de DELAI ms avant de
   servir le cache (la page) ; les icônes et le tableur sont servis du cache sans attendre. La réponse du réseau, si elle arrive plus tard, met quand même le cache à jour. */
// nom du cache tiré de la version (app/version.js) : une nouvelle version renouvelle le cache. Ancien schéma : appya-v26.
importScripts('version.js');
const CACHE = 'appya-' + self.DAFTAR_VERSION.numero;
// chemins relatifs au dossier du service : '/' sur l'ordinateur, '/Daftar/' sur GitHub Pages
const BASE = new URL('./', self.location).pathname;
const FICHIERS = ['index.html', 'style.css', 'noyau.js', 'vues.js', 'saisie.js', 'stats.js', 'reglages.js', 'demarrage.js', 'version.js', 'mode.js', 'moteur.js', 'releve.js', 'demo.js', 'pdf.min.js', 'pdf.worker.min.js', 'xlsx.full.min.js', 'daftar.svg', 'manifest.webmanifest', 'daftar-192.png', 'daftar-512.png', 'daftar-512-masque.png'].map(f => BASE + f);

function cle(req) {
  const url = new URL(req.url);
  if (req.mode === 'navigate' || url.pathname === BASE || url.pathname === BASE + 'index.html') return BASE + 'index.html';
  return url.pathname;
}

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FICHIERS.map(f => new Request(f, {cache: 'reload'}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// la page, une fois chargée, demande si une version plus récente est arrivée pendant son ouverture
let majDispo = false;
self.addEventListener('message', ev => {
  if (ev.data === 'daftar-maj?' && majDispo && ev.source) { majDispo = false; ev.source.postMessage({type: 'daftar-maj'}); }
});
// version du réseau différente de la copie en cache : prévenir les pages ouvertes (bandeau « Recharger »)
async function comparer(enCache, rep) {
  if (!rep.ok) return;
  const [avant, apres] = await Promise.all([enCache.text(), rep.clone().text()]);
  if (avant !== apres) { majDispo = true; (await self.clients.matchAll({type: 'window'})).forEach(cl => cl.postMessage({type: 'daftar-maj'})); }
}
self.addEventListener('fetch', ev => {
  const req = ev.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const k = cle(req);
  // Le service reste éveillé jusqu'à la fin de la mise à jour du cache, même si la page a déjà été servie.
  let finMaj; ev.waitUntil(new Promise(r => { finMaj = r; }));
  const reseau = fetch(req, {cache: 'no-store'}).then(rep => {
    if (rep.ok && rep.type === 'basic') { const copie = rep.clone(); caches.open(CACHE).then(c => c.put(k, copie)).catch(e => console.warn('[Daftar] cache non mis à jour :', e)).then(finMaj); }
    else finMaj();
    return rep;
  }, err => { finMaj(); throw err; });
  if (k !== BASE + 'index.html') {
    // Fichiers d'accompagnement (icônes, tableur) : le cache tout de suite s'il les a, mis à jour en arrière-plan.
    // Scripts et styles (la page est découpée en plusieurs fichiers depuis 2026-11-25) : un changement prévient aussi la
    // page, comme pour index.html, pour ne pas garder une page et des scripts de versions différentes.
    ev.respondWith(caches.open(CACHE).then(c => c.match(k)).then(r => {
      if (!r) return reseau;
      if (/\.(js|css)$/.test(k) && !/\.min\.js$/.test(k)) {
        const copie = r.clone();
        ev.waitUntil(reseau.then(rep => comparer(copie, rep)).catch(() => { /* hors ligne : la copie en cache suffit */ }));
      } else reseau.catch(() => { /* hors ligne : la copie en cache suffit */ });
      return r;
    }));
    return;
  }
  ev.respondWith(caches.open(CACHE).then(c => c.match(k)).then(enCache => {
    if (!enCache) return reseau.catch(() => Response.error());
    // page servie du cache ; si la version du réseau est différente, prévenir la page (bandeau « Recharger »).
    // La copie de comparaison est prise AVANT de rendre la réponse (son contenu ne peut être lu qu'une fois).
    const copieCache = enCache.clone();
    ev.waitUntil(reseau.then(rep => comparer(copieCache, rep)).catch(() => { /* hors ligne : la copie en cache suffit */ }));
    return enCache;
  }));
});
