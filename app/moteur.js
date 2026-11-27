/* Daftar — moteur local (version autonome : téléphone ou navigateur seul, sans ordinateur).
   Portage fidèle des règles de serveur.py : validation des opérations (nettoyer), réglages (postes, budgets,
   comptes, biens, parités), reclassement, repère de vidange automatique, carnet vide de départ.
   TOUTE MODIFICATION DES RÈGLES DANS serveur.py DOIT ÊTRE REPORTÉE ICI (et inversement). */
(function () {
  'use strict';
  const POSTES_DEFAUT = [
    {id: 'foyer', label: 'Foyer, vivres', pour: 'foyer', couleur: '#2f6fa8',
     mots: ['riz', 'huile', 'savon', 'sucre', 'farine', 'alimentaire', 'vivres', 'lait', 'pain', 'viande', 'poisson', 'légumes', 'marché', 'famille']},
    {id: 'loyer', label: 'Loyer, logement', couleur: '#c58b2a', mots: ['loyer', 'contribution', 'logement']},
    {id: 'aides', label: 'Aides et dons', couleur: '#c0533a',
     mots: ['aide', 'aumône', 'aumone', 'prestation', 'baptême', 'mariage', 'funéraire', 'don']},
    {id: 'enfants', label: 'Enfants, école', pour: 'foyer', couleur: '#2e8a57', mots: ['scolarité', 'école', 'fourniture', 'enfant']},
    {id: 'sante', label: 'Santé', couleur: '#d9772f', mots: ['médic', 'soin', 'examen', 'pharmacie', 'hôpital', 'analyse', 'clinique']},
    {id: 'voiture', label: 'Voiture', couleur: '#6b7b90',
     mots: ['carburant', 'essence', 'gasoil', 'assurance', 'fiche technique', 'amende', 'vidange', 'lavage', 'garage', 'pneu', 'mécan', 'voiture']},
    {id: 'tel', label: 'Téléphone, internet', pour: 'moi', couleur: '#2f97ad', mots: ['crédit', 'forfait', 'internet', 'téléphone']},
    {id: 'transport', label: 'Transport', couleur: '#8a9a2e', mots: ['transport', 'taxi', 'moto', 'clando', 'bus']},
    {id: 'repas', label: 'Repas, boissons', pour: 'moi', couleur: '#9363b0',
     mots: ['dej', 'déj', 'diner', 'dîner', 'café', 'jus', 'boisson', 'repas']},
    // 2026-11-27 : habillement et coiffure séparés de « Perso » (dépenses ciblées sur un membre du foyer)
    {id: 'habillement', label: 'Habillement', couleur: '#4f6dbf', mots: ['vêtement', 'habit', 'chaussure', 'tissu', 'pagne', 'couture', 'tailleur']},
    {id: 'coiffure', label: 'Coiffure, parfumerie', couleur: '#a0663c', mots: ['coiff', 'tresse', 'mèche', 'parfum', 'crème', 'cosmétique']},
    {id: 'perso', label: 'Perso', pour: 'moi', couleur: '#cc5f86', mots: ['cadeau']},
    {id: 'autre', label: 'Autre', couleur: '#9a968c', mots: []},
  ];
  const COMPTES_DEFAUT = [{id: 'especes', nom: 'Espèces', type: 'especes', mots: ['espèces', 'especes', 'cash', 'liquide'], releves: []}];
  // courant / exceptionnel : mêmes valeurs que REVENUS_DEFAUT et TYPES_EVENEMENT dans serveur.py
  const REVENUS_DEFAUT = [
    {id: 'salaire', label: 'Salaire', courant: true, mots: ['salaire', 'paie', 'traitement', 'salary']},
    {id: 'prime', label: 'Primes et indemnités', courant: true, mots: ['prime', 'indemnité', 'indemnite']},
    {id: 'interets', label: 'Intérêts', courant: true, mots: ['intérêt', 'interet', 'intérêts', 'interets']},
    {id: 'mission', label: 'Frais de mission', courant: false, mots: ['frais de mission', 'mission', 'perdiem', 'per diem']},
    {id: 'atelier', label: 'Ateliers, séminaires', courant: false, mots: ['atelier', 'séminaire', 'seminaire', 'colloque', 'formation']},
    {id: 'consultance', label: 'Consultance, expertise', courant: false, mots: ['consultance', 'consultant', 'expertise', 'consultation']},
    {id: 'enseignement', label: 'Enseignement, vacations', courant: false, mots: ['vacation', 'cours', 'enseignement', 'heures complémentaires']},
    {id: 'jury', label: 'Jury, soutenance, correction', courant: false, mots: ['jury', 'soutenance', 'correction', 'surveillance']},
    {id: 'autre', label: 'Autre revenu', courant: false, mots: []},
  ];
  const TYPES_EVENEMENT = ['mariage', 'bapteme', 'circoncision', 'funerailles', 'fete', 'voyage-tourisme', 'voyage-mission',
                           'voyage-vacances', 'sante', 'projet', 'autre'];
  const NATURES = ['depense', 'revenu', 'virement', 'pret', 'remboursement', 'investissement'];
  const TYPES_COMPTE = ['especes', 'courant', 'epargne', 'carte', 'mobile', 'tiers'];   // tiers : compte géré pour quelqu'un d'autre
  const TYPES_BIEN = ['actif', 'passif'];
  const CAT_VEHICULE = ['carburant', 'entretien', 'reparation', 'service', 'achat', 'investissement', 'autre'];
  const CAT_MAISON = ['terrain', 'administratif', 'arrosage', 'eau', 'maconnerie', 'materiaux', 'electricite', 'main-oeuvre', 'autre'];
  const MOTS_CAT_MAISON = [
    ['terrain', ['achat terrain', 'bornage', 'lotissement']],
    ['administratif', ['titre foncier', 'permis', 'notaire', 'mairie', 'cadastre', 'dossier', 'timbre']],
    ['main-oeuvre', ['main d', 'main-d', 'ouvrier', 'gardien', 'manoeuvre', 'manœuvre', 'tâcheron', 'tacheron']],
    ['arrosage', ['arrosage', 'arroser']],
    ['eau', ['pompe', 'forage', 'puits', 'citerne', 'robinet', 'eau']],
    ['maconnerie', ['fondation', 'maçon', 'macon', 'brique', 'parpaing', 'béton', 'beton', 'dalle', 'mur', 'trou', 'fouille']],
    ['materiaux', ['ciment', 'sable', 'gravier', 'fer ', 'tôle', 'tole', 'bois', 'planche', 'matériau', 'materiau']],
    ['electricite', ['électric', 'electric', 'câble', 'cable', 'solaire', 'panneau']],
  ];
  const RE_ID = /^[a-z0-9_-]{1,40}$/, RE_COULEUR = /^#[0-9a-fA-F]{6}$/, RE_DATE = /^\d{4}-\d{2}-\d{2}$/, RE_DEVISE = /^[A-Z]{3}$/;
  const copie = x => JSON.parse(JSON.stringify(x));
  const erreur = m => { throw new Error(m); };
  const horodatage = () => new Date().toISOString();
  const texte = (v, n) => String(v == null ? '' : v).split(/\s+/).filter(Boolean).join(' ').slice(0, n);
  const ids = (d, cle) => new Set(((d.parametres || {})[cle] || []).map(x => x.id));
  // « Pour » d'une dépense (2026-11-27) : {id: 'foyer' | 'membre'} des foyers et de leurs membres (même règle que serveur.py)
  const idsPour = d => { const out = {moi: 'moi'}; for (const f of (d.parametres || {}).foyers || []) { out[f.id] = 'foyer'; for (const m of f.membres || []) out[m.id] = 'membre'; } return out; };
  const idsPostes = d => { const s = ids(d, 'postes'); return s.size ? s : new Set(POSTES_DEFAUT.map(x => x.id)); };
  const biens = d => (d.parametres || {}).biens || [];
  const idsRevenus = d => { const s = ids(d, 'revenus'); return s.size ? s : new Set(REVENUS_DEFAUT.map(x => x.id)); };
  const idsMaisons = d => biens(d).filter(b => b.maison).map(b => b.id);
  const idsVehicules = d => biens(d).filter(b => b.vehicule).map(b => b.id);

  function montantPositif(v, quoi = 'Montant', zero = false) {
    const m = typeof v === 'number' ? v : (v === '' || v == null ? NaN : Number(v));
    if (Number.isNaN(m)) erreur(`${quoi} invalide.`);   // illisible (serveur.py : float() échoue)
    if (!Number.isFinite(m) || m < 0 || (m === 0 && !zero)) erreur(`${quoi} invalide : il doit être positif.`);
    return Number.isInteger(m) ? m : Math.round(m * 100) / 100;
  }
  // comptes supprimés depuis plus de DELAI_CORBEILLE jours : effacés pour de bon avec leurs opérations (même règle que serveur.py)
  const DELAI_CORBEILLE = 30;
  function purgerCorbeille(d, aujourdhui) {
    const jour = aujourdhui || new Date().toISOString().slice(0, 10), prm = d.parametres || {};
    const jours = a => Math.round((Date.parse(jour) - Date.parse(a)) / 864e5);
    const perimes = new Set((prm.comptes || []).filter(c => c.supprime && jours(c.supprime) > DELAI_CORBEILLE).map(c => c.id));
    if (!perimes.size) return false;
    d.supprimees = d.supprimees || [];
    d.operations = (d.operations || []).filter(o => {
      if (perimes.has(o.compte) || perimes.has(o.vers)) { d.supprimees = d.supprimees.filter(t => t.id !== o.id).concat([marquer(d, {id: o.id})]); return false; }
      if (perimes.has(o.tiers)) { delete o.tiers; marquer(d, o); }
      return true;
    });
    prm.comptes = (prm.comptes || []).filter(c => !perimes.has(c.id));
    prm.programmees = (prm.programmees || []).filter(p => !perimes.has(p.compte));
    marquerParametres(d);
    return true;
  }
  function montantSigne(v, quoi = 'Solde') {   // solde noté : peut être négatif
    const m = typeof v === 'number' ? v : (v === '' || v == null ? NaN : Number(v));
    if (!Number.isFinite(m)) erreur(`${quoi} invalide.`);
    return Number.isInteger(m) ? m : Math.round(m * 100) / 100;
  }
  const idsTiers = d => new Set(((d.parametres || {}).comptes || []).filter(c => c.type === 'tiers').map(c => c.id));
  function devinerCatMaison(libelle) {
    const lib = String(libelle || '').toLowerCase();
    for (const [cat, mots] of MOTS_CAT_MAISON) if (mots.some(m => lib.includes(m))) return cat;
    return 'autre';
  }
  function marquer(d, o, maj) { d.rev = (+d.rev || 0) + 1; o.rev = d.rev; o.maj = maj || horodatage(); return o; }
  function marquerParametres(d) { d.rev = (+d.rev || 0) + 1; (d.parametres = d.parametres || {}).rev = d.rev; }

  function vide() {
    return {version: 5, rev: 1, operations: [], supprimees: [],
            parametres: {rev: 1, budgets: {}, postes: copie(POSTES_DEFAUT), comptes: copie(COMPTES_DEFAUT), biens: []}};
  }

  function nettoyer(doc, d) {
    if (!doc || typeof doc !== 'object') erreur('Corps de requête invalide.');
    const date = String(doc.date || '');
    if (!RE_DATE.test(date)) erreur('Date invalide (format attendu AAAA-MM-JJ).');
    const montant = montantPositif(doc.montant);
    const libelle = texte(doc.libelle, 200);
    if (!libelle) erreur('Le libellé est obligatoire.');
    const nature = doc.nature || 'depense';
    if (!NATURES.includes(nature)) erreur("Nature d'opération inconnue : " + nature);
    let comptes = ids(d, 'comptes'); if (!comptes.size) comptes = new Set(['especes']);
    const compte = doc.compte || 'especes';
    if (!comptes.has(compte)) erreur('Compte inconnu : ' + compte);
    const out = {date, montant, libelle, nature, compte};
    if (nature === 'depense') out.categorie = idsPostes(d).has(doc.categorie) ? doc.categorie : 'autre';
    else if (nature === 'virement') {
      if (!comptes.has(doc.vers)) erreur('Compte de destination du virement inconnu : ' + doc.vers);
      if (doc.vers === compte) erreur("Un virement doit aller d'un compte à un autre.");
      out.vers = doc.vers;
    } else if (nature === 'pret' || nature === 'remboursement') {
      const personne = texte(doc.personne, 60);
      if (!personne) erreur('Indiquez la personne concernée par le prêt.');
      out.personne = personne;
      const ech = String(doc.echeance || '');
      if (nature === 'pret' && ech) { if (!RE_DATE.test(ech)) erreur('Échéance invalide (format attendu AAAA-MM-JJ).'); out.echeance = ech; }
    } else if (nature === 'investissement') {
      if (!ids(d, 'biens').has(doc.bien)) erreur("Choisissez le bien concerné par l'investissement.");
      out.bien = doc.bien;
    }
    if (nature === 'revenu') {
      out.cat_revenu = idsRevenus(d).has(doc.cat_revenu) ? doc.cat_revenu : 'autre';
      if (![undefined, null, '', 0].includes(doc.ponctuel)) {
        // « dont ponctuel » : part exceptionnelle d'un revenu courant reçu en un seul virement (même règle que serveur.py)
        const part = montantPositif(doc.ponctuel, 'Part ponctuelle');
        if (part >= montant) erreur('La part ponctuelle doit être inférieure au montant.');
        out.ponctuel = part;
        out.cat_ponctuel = idsRevenus(d).has(doc.cat_ponctuel) ? doc.cat_ponctuel : 'autre';
      }
    }
    if (nature === 'depense' && doc.tiers) {   // votre dépense versée au compte d'un tiers
      if (!idsTiers(d).has(doc.tiers) || doc.tiers === compte) erreur('Compte du tiers inconnu : ' + doc.tiers);
      out.tiers = doc.tiers;
    }
    if (nature === 'depense' && doc.pour && (!Array.isArray(doc.pour) || doc.pour.length)) {
      // pour qui : un foyer (dépense commune) OU un ou plusieurs membres (part égale de chacun)
      const pour = Array.isArray(doc.pour) ? doc.pour : [doc.pour], connus = idsPour(d), vus = [];
      for (const p of pour) { if (!(p in connus)) erreur('Membre du foyer inconnu : ' + p); if (!vus.includes(p)) vus.push(p); }
      if (vus.length > 1 && vus.some(p => connus[p] === 'foyer' || connus[p] === 'moi')) erreur('Une dépense pour vous ou commune au foyer ne vise pas en plus un membre.');
      out.pour = vus;
    }
    if ((nature === 'depense' || nature === 'revenu') && doc.evenement) {
      if (!ids(d, 'evenements').has(doc.evenement)) erreur('Événement inconnu : ' + doc.evenement);
      out.evenement = doc.evenement;
    }
    if (doc.prog && ids(d, 'programmees').has(doc.prog) && RE_DATE.test(String(doc.prog_date || ''))) { out.prog = doc.prog; out.prog_date = doc.prog_date; }
    if (nature === 'investissement' && idsMaisons(d).includes(out.bien))
      out.cat_maison = CAT_MAISON.includes(doc.cat_maison) ? doc.cat_maison : devinerCatMaison(libelle);
    if ((nature === 'depense' || nature === 'investissement') && doc.vehicule) {
      if (!idsVehicules(d).includes(doc.vehicule)) erreur('Véhicule inconnu : ' + doc.vehicule);
      out.vehicule = doc.vehicule;
      out.cat_vehicule = CAT_VEHICULE.includes(doc.cat_vehicule) ? doc.cat_vehicule : 'autre';
      for (const [champ, quoi] of [['km', 'Kilométrage'], ['quantite', 'Quantité']])
        if (![undefined, null, '', 0].includes(doc[champ])) out[champ] = montantPositif(doc[champ], quoi);
      if ('quantite' in out) out.unite = ['L', 'u'].includes(doc.unite) ? doc.unite : (out.cat_vehicule === 'carburant' ? 'L' : 'u');
    }
    out.cree = String(doc.cree || new Date().toISOString().slice(0, 19) + 'Z');
    const rem = texte(doc.remarque, 300);
    if (rem) out.remarque = rem;
    return out;
  }

  function vidangeAuto(d, o) {
    const lib = String(o.libelle || '').toLowerCase();
    if (!(o.vehicule && o.km && lib.includes('vidange') && !lib.includes('boîte') && !lib.includes('boite'))) return false;
    for (const b of biens(d)) if (b.id === o.vehicule) {
      const vd = b.vidange = b.vidange || {intervalle: 3000, dernier: 0, prochain: 0};
      if (o.km > (vd.dernier || 0)) { vd.dernier = Math.trunc(o.km); vd.prochain = Math.trunc(o.km) + Math.trunc(vd.intervalle || 3000); return true; }
    }
    return false;
  }

  function nettoyerMots(liste) {
    const mots = [];
    for (let m of (liste || []).slice(0, 300)) { m = texte(m, 80); if (m && !mots.some(k => k.toLowerCase() === m.toLowerCase())) mots.push(m); }
    return mots;
  }
  function nettoyerDevises(liste) {
    const out = [], vus = new Set();
    for (const x of liste || []) {
      const code = String(x.code || '').trim().toUpperCase();
      if (!RE_DEVISE.test(code)) erreur(`Code de devise invalide : ${code} (3 lettres, par exemple USD).`);
      if (vus.has(code)) erreur('Devise en double : ' + code);
      vus.add(code);
      let taux = 1;
      if (code !== 'XAF') {
        taux = x.taux == null || x.taux === '' ? NaN : Number(x.taux);
        if (Number.isNaN(taux)) erreur(`Parité invalide pour ${code}.`);
        if (!(taux > 0 && taux < 1e9)) erreur(`Parité invalide pour ${code} : elle doit être positive.`);
        taux = Math.round(taux * 1e6) / 1e6;
      }
      const dv = {code, nom: texte(x.nom, 40) || code, symbole: texte(x.symbole, 6) || code, taux};
      const maj = String(x.maj || '');
      if (maj) { if (!RE_DATE.test(maj)) erreur('Date de parité invalide pour ' + code + '.'); dv.maj = maj; }
      out.push(dv);
    }
    if (!vus.has('XAF')) out.unshift({code: 'XAF', nom: 'Franc CFA', symbole: 'FCFA', taux: 1});
    return out;
  }
  function nettoyerRevenus(liste) {
    const out = [], vus = new Set(), noms = new Set();
    for (const x of liste || []) {
      const rid = String(x.id || '').trim(), label = texte(x.label, 60);
      if (!RE_ID.test(rid)) erreur('Identifiant de type de revenu invalide : ' + rid);
      if (!label) erreur('Chaque type de revenu doit avoir un nom.');
      if (vus.has(rid) || noms.has(label.toLowerCase())) erreur('Deux types de revenus portent le même nom : ' + label);
      vus.add(rid); noms.add(label.toLowerCase());
      out.push({id: rid, label, courant: !!x.courant, mots: rid !== 'autre' ? nettoyerMots(x.mots) : []});
    }
    if (!vus.has('autre')) out.push(copie(REVENUS_DEFAUT[REVENUS_DEFAUT.length - 1]));
    return out.filter(x => x.id !== 'autre').concat(out.filter(x => x.id === 'autre'));
  }
  function nettoyerEvenements(liste, d) {
    const out = [], vus = new Set();
    for (const x of liste || []) {
      const eid = String(x.id || '').trim(), nom = texte(x.nom, 60);
      if (!RE_ID.test(eid)) erreur("Identifiant d'événement invalide : " + eid);
      if (!nom || vus.has(eid)) erreur('Chaque événement doit avoir un nom unique.');
      vus.add(eid);
      const ev = {id: eid, nom, type: TYPES_EVENEMENT.includes(x.type) ? x.type : 'autre',
                  budget: montantPositif(x.budget || 0, 'Budget de ' + nom, true), mots: nettoyerMots(x.mots), note: texte(x.note, 300)};
      for (const k of ['debut', 'fin']) { const v = String(x[k] || ''); if (v && !RE_DATE.test(v)) erreur('Date invalide pour ' + nom + '.'); ev[k] = v; }
      if (ev.debut && ev.fin && ev.fin < ev.debut) erreur(nom + ' : la fin précède le début.');
      out.push(ev);
    }
    const manquants = [...new Set(d.operations.map(o => o.evenement).filter(Boolean))].filter(e => !vus.has(e));
    if (manquants.length) erreur('Impossible de supprimer un événement qui a des opérations : ' + manquants.sort().join(', '));
    return out;
  }
  const PERIODES_PROG = [1, 2, 3, 6, 12];
  function nettoyerProgrammees(liste, d) {
    const out = [], vus = new Set();
    const cs = Object.fromEntries(((d.parametres || {}).comptes || []).map(c => [c.id, c]));
    if (!Object.keys(cs).length) cs.especes = {};
    for (const x of liste || []) {
      const pid = String(x.id || '').trim(), lib = texte(x.libelle, 200);
      if (!RE_ID.test(pid)) erreur("Identifiant d'opération programmée invalide : " + pid);
      if (!lib || vus.has(pid)) erreur('Chaque opération programmée doit avoir un libellé unique.');
      vus.add(pid);
      const nature = ['depense', 'revenu'].includes(x.nature) ? x.nature : 'depense';
      const mode = x.mode === 'interets' ? 'interets' : 'fixe';
      const compte = x.compte in cs ? x.compte : null;
      if (!compte) erreur(lib + ' : compte inconnu.');
      if (mode === 'interets' && [undefined, null, ''].includes(cs[compte].taux))
        erreur(`${lib} : le compte ${cs[compte].nom || compte} n'a pas de taux d'intérêt (Comptes et biens).`);
      const periode = parseInt(x.periode || 1, 10), jour = parseInt(x.jour || 1, 10);
      if (!PERIODES_PROG.includes(periode) || !(jour >= 1 && jour <= 31)) erreur(lib + ' : périodicité ou jour invalide.');
      const debut = String(x.debut || ''), fin = String(x.fin || '');
      if (!RE_DATE.test(debut) || (fin && !RE_DATE.test(fin))) erreur(lib + ' : date de début (obligatoire) ou de fin invalide.');
      const p = {id: pid, libelle: lib, nature, mode, compte, periode, jour, debut, fin, actif: x.actif !== false,
                 montant: montantPositif(x.montant || 0, 'Montant de ' + lib, mode === 'interets'),
                 ignorees: [...new Set((x.ignorees || []).map(String).filter(v => RE_DATE.test(v)))].sort().slice(-60)};
      if (nature === 'depense') p.categorie = idsPostes(d).has(x.categorie) ? x.categorie : 'autre';
      else p.cat_revenu = idsRevenus(d).has(x.cat_revenu) ? x.cat_revenu : (mode === 'interets' ? 'interets' : 'autre');
      out.push(p);
    }
    return out;
  }
  function nettoyerComptes(liste, d) {
    const comptes = [], vus = new Set(), noms = new Set();
    for (const x of liste || []) {
      const cid = String(x.id || '').trim(), nom = texte(x.nom, 60);
      if (!RE_ID.test(cid)) erreur('Identifiant de compte invalide : ' + cid);
      if (!nom) erreur('Chaque compte doit avoir un nom.');
      if (vus.has(cid) || noms.has(nom.toLowerCase())) erreur('Deux comptes portent le même nom : ' + nom);
      vus.add(cid); noms.add(nom.toLowerCase());
      const rel = {};
      for (const r of x.releves || []) {
        if (!RE_DATE.test(String(r.date || ''))) erreur('Date de relevé invalide pour ' + nom + '.');
        rel[r.date] = {date: r.date, solde: montantSigne(r.solde, 'Solde du relevé de ' + nom)};
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(r.heure || ''))) rel[r.date].heure = r.heure;   // heure où le solde a été noté
      }
      const c = {id: cid, nom, type: TYPES_COMPTE.includes(x.type) ? x.type : 'courant', mots: nettoyerMots(x.mots),
                 releves: Object.keys(rel).sort().map(k => rel[k])};
      if (RE_COULEUR.test(String(x.couleur || ''))) c.couleur = x.couleur;
      if (![undefined, null, ''].includes(x.taux)) {
        c.taux = montantPositif(x.taux, "Taux d'intérêt de " + nom, true);
        c.periode = Math.trunc(montantPositif(x.periode || 12, 'Période des intérêts'));
      }
      if (cid !== 'especes' && RE_DATE.test(String(x.supprime || ''))) c.supprime = x.supprime;   // rétablissable 30 jours
      if (c.type === 'tiers') {
        c.titulaire = texte(x.titulaire, 60) || nom; c.morale = !!x.morale;
        c.moi = nettoyerMots(x.moi); c.contrib = nettoyerMots(x.contrib);
        if (x.sourdine) c.sourdine = true;   // avance non comptée dans le patrimoine
      }
      comptes.push(c);
    }
    if (!vus.has('especes')) comptes.unshift(copie(COMPTES_DEFAUT[0]));
    const garde = new Set(comptes.map(c => c.id));
    const manquants = [...new Set(d.operations.flatMap(o => [o.compte, o.vers, o.tiers]).filter(Boolean))].filter(c => !garde.has(c));
    if (manquants.length) erreur('Impossible de supprimer un compte qui a des opérations : ' + manquants.sort().join(', '));
    return comptes;
  }
  function nettoyerBiens(liste, d) {
    const out = [], vus = new Set(), postes = idsPostes(d);
    for (const x of liste || []) {
      const bid = String(x.id || '').trim(), nom = texte(x.nom, 60);
      if (!RE_ID.test(bid)) erreur('Identifiant de bien invalide : ' + bid);
      if (!nom || vus.has(bid)) erreur('Chaque bien doit avoir un nom unique.');
      vus.add(bid);
      const da = String(x.date_achat || '');
      if (da && !RE_DATE.test(da)) erreur("Date d'achat invalide pour " + nom + '.');
      const est = {};
      for (const e of x.estimations || []) {
        if (!RE_DATE.test(String(e.date || ''))) erreur("Date d'estimation invalide pour " + nom + '.');
        est[e.date] = montantPositif(e.valeur, 'Valeur estimée de ' + nom, true);
      }
      const b = {id: bid, nom, type: TYPES_BIEN.includes(x.type) ? x.type : 'actif', date_achat: da,
                 prix_achat: montantPositif(x.prix_achat || 0, "Prix d'achat de " + nom, true),
                 poste: postes.has(x.poste) ? x.poste : '', mots: nettoyerMots(x.mots),
                 estimations: Object.keys(est).sort().map(k => ({date: k, valeur: est[k]}))};
      if (x.vehicule) {
        const vg = x.vidange || {};
        const km = (k, defaut = 0) => { const v = Number(vg[k] || defaut); if (!Number.isFinite(v)) erreur('Repère de vidange invalide pour ' + nom + '.'); return Math.max(0, Math.trunc(v)); };
        b.vehicule = true;
        b.engin = ['voiture', 'moto', 'bus', 'camion', 'groupe', 'autre'].includes(x.engin) ? x.engin : 'voiture';
        b.vidange = {intervalle: km('intervalle', 3000) || 3000, dernier: km('dernier'), prochain: km('prochain')};
      }
      if (x.maison || x.projet) {
        // projet : toujours pour une maison ; pour tout autre bien s'il en a un (même règle que serveur.py)
        const pj = x.projet || {}, ech = String(pj.echeance || '');
        if (ech && !RE_DATE.test(ech)) erreur('Échéance du projet invalide pour ' + nom + '.');
        if (x.maison) b.maison = true;
        b.projet = {budget: montantPositif(pj.budget || 0, 'Budget du projet', true), echeance: ech, note: texte(pj.note, 300)};
      }
      out.push(b);
    }
    const manquants = [...new Set(d.operations.filter(o => o.nature === 'investissement').map(o => o.bien)
      .concat(d.operations.filter(o => o.vehicule).map(o => o.vehicule)))].filter(b => b && !vus.has(b));
    if (manquants.length) erreur('Impossible de supprimer un bien qui a des investissements : ' + manquants.sort().join(', '));
    return out;
  }

  // réglages et retour en arrière : mêmes règles que regler() dans serveur.py (historique des 20 derniers changements)
  const ROLES_MEMBRE = ['epouse', 'enfant', 'autre'];
  function nettoyerFoyers(liste, d) {
    const out = [], vus = new Set(), noms = new Set();
    for (const f of liste || []) {
      const fid = String(f.id || '').trim(), nom = texte(f.nom, 60);
      if (!RE_ID.test(fid) || vus.has(fid)) erreur('Identifiant de foyer invalide : ' + fid);
      if (!nom || noms.has(nom.toLowerCase())) erreur('Chaque foyer doit avoir un nom unique.');
      vus.add(fid); noms.add(nom.toLowerCase());
      const membres = [];
      for (const m of f.membres || []) {
        const mid = String(m.id || '').trim(), mnom = texte(m.nom, 60);
        if (!RE_ID.test(mid) || vus.has(mid)) erreur('Identifiant de membre invalide : ' + mid);
        if (!mnom) erreur('Chaque membre du foyer doit avoir un prénom.');
        vus.add(mid);
        const nais = String(m.naissance || '');
        if (nais && !RE_DATE.test(nais)) erreur('Date de naissance invalide pour ' + mnom + '.');
        membres.push({id: mid, nom: mnom, role: ROLES_MEMBRE.includes(m.role) ? m.role : 'autre', naissance: nais, mots: nettoyerMots(m.mots)});
      }
      out.push({id: fid, nom, membres});
    }
    const manquants = [...new Set(d.operations.flatMap(o => o.pour || []))].filter(p => !vus.has(p) && p !== 'moi');
    if (manquants.length) erreur('Impossible de supprimer un foyer ou un membre qui a des dépenses : ' + manquants.sort().join(', '));
    return out;
  }
  const SECTIONS_REGLAGES = ['postes', 'budgets', 'revenus', 'evenements', 'programmees', 'comptes', 'biens', 'devises', 'foyers'];
  const NOMS_SECTIONS = {foyers: 'foyers', postes: 'postes', budgets: 'budgets', revenus: 'types de revenus', evenements: 'événements',
                         programmees: 'opérations programmées', comptes: 'comptes', biens: 'biens', devises: 'parités'};
  const GARDER_HISTORIQUE = 20;
  function regler(d, corps, resume) {
    if (corps.origine)
      return regler(d, {postes: copie(POSTES_DEFAUT), budgets: {}, revenus: copie(REVENUS_DEFAUT), devises: null}, "retour aux réglages d'origine");
    if (corps.restaurer !== undefined && corps.restaurer !== null) {
      const e = (d.historique || [])[parseInt(corps.restaurer, 10)];
      if (!e) erreur('Point de restauration introuvable.');
      const snap = e.parametres || {}, defauts = {postes: POSTES_DEFAUT, budgets: {}, revenus: REVENUS_DEFAUT, evenements: [], programmees: [],
                                                  comptes: COMPTES_DEFAUT, biens: [], devises: null,
                                                  foyers: (d.parametres || {}).foyers || []};   // point d'avant les foyers : on les garde
      const c2 = {}; for (const k of SECTIONS_REGLAGES) c2[k] = copie(k in snap ? snap[k] : defauts[k]);
      c2.retablir = e.ops || {};
      return regler(d, c2, 'retour en arrière');
    }
    const prm = d.parametres = d.parametres || {};
    const avant = copie(Object.fromEntries(Object.entries(prm).filter(([k]) => k !== 'rev')));
    const modifs = {}, noter = (x, champ) => { const m = modifs[x.id] = modifs[x.id] || {}; if (!(champ in m)) m[champ] = x[champ]; };
    if ('postes' in corps) {
      let postes = []; const vus = new Set(), noms = new Set();
      for (const x of corps.postes || []) {
        const pid = String(x.id || '').trim(), label = String(x.label || '').trim().slice(0, 60);
        if (!RE_ID.test(pid)) erreur('Identifiant de poste invalide : ' + pid);
        if (!label) erreur('Chaque poste doit avoir un nom.');
        if (vus.has(pid) || noms.has(label.toLowerCase())) erreur('Deux postes portent le même nom : ' + label);
        vus.add(pid); noms.add(label.toLowerCase());
        const coul = String(x.couleur || '#9a968c');
        postes.push({id: pid, label, couleur: RE_COULEUR.test(coul) ? coul : '#9a968c', mots: pid !== 'autre' ? nettoyerMots(x.mots) : []});
        if (x.pour === 'moi' || x.pour === 'foyer') postes[postes.length - 1].pour = x.pour;   // pour qui, par défaut (même règle que serveur.py)
      }
      if (!vus.has('autre')) postes.push(copie(POSTES_DEFAUT[POSTES_DEFAUT.length - 1]));
      else postes = postes.filter(x => x.id !== 'autre').concat(postes.filter(x => x.id === 'autre'));
      prm.postes = postes;
    }
    const lesIds = idsPostes(d), deplacer = corps.deplacer || {};
    let n = 0;
    for (const x of d.operations) {
      if (x.nature !== 'depense') continue;
      const c = x.categorie; let cible = c in deplacer ? String(deplacer[c]) : c;
      if (!lesIds.has(cible)) cible = 'autre';
      if (cible !== c) { noter(x, 'categorie'); x.categorie = cible; marquer(d, x); n++; }
    }
    if ('budgets' in corps) {
      const budgets = {};
      for (const [k, v0] of Object.entries(corps.budgets || {})) {
        if (!lesIds.has(k)) continue;
        const v = Math.round(Number(v0));
        if (!Number.isFinite(v)) erreur('Budget invalide pour ' + k + '.');
        if (v > 0) budgets[k] = v;
      }
      prm.budgets = budgets;
    } else prm.budgets = Object.fromEntries(Object.entries(prm.budgets || {}).filter(([k]) => lesIds.has(k)));
    if ('revenus' in corps) {
      prm.revenus = nettoyerRevenus(corps.revenus);
      const rids = idsRevenus(d);
      for (const x of d.operations)
        if (x.nature === 'revenu' && x.cat_revenu && !rids.has(x.cat_revenu)) { noter(x, 'cat_revenu'); x.cat_revenu = 'autre'; marquer(d, x); n++; }
      for (const x of d.operations)
        if (x.nature === 'revenu' && x.cat_ponctuel && !rids.has(x.cat_ponctuel)) { noter(x, 'cat_ponctuel'); x.cat_ponctuel = 'autre'; marquer(d, x); n++; }
    }
    if ('evenements' in corps) prm.evenements = nettoyerEvenements(corps.evenements, d);
    if ('programmees' in corps) prm.programmees = nettoyerProgrammees(corps.programmees, d);
    if ('foyers' in corps) prm.foyers = nettoyerFoyers(corps.foyers, d);
    if ('comptes' in corps) prm.comptes = nettoyerComptes(corps.comptes, d);
    if ('biens' in corps) prm.biens = nettoyerBiens(corps.biens, d);
    if ('devises' in corps) { if (corps.devises === null) delete prm.devises; else prm.devises = nettoyerDevises(corps.devises); }
    for (const b of prm.biens || []) if (b.poste && !lesIds.has(b.poste)) b.poste = '';
    for (const [oid, vals] of Object.entries(corps.retablir || {})) {
      const x = d.operations.find(o => o.id === oid); if (!x) continue;
      if (x.nature === 'depense' && idsPostes(d).has(vals.categorie) && x.categorie !== vals.categorie) { x.categorie = vals.categorie; marquer(d, x); }
      if (x.nature === 'revenu' && 'cat_revenu' in vals && (!vals.cat_revenu || idsRevenus(d).has(vals.cat_revenu))) { x.cat_revenu = vals.cat_revenu || 'autre'; marquer(d, x); }
    }
    marquerParametres(d);
    const h = d.historique = d.historique || [];
    h.push({date: horodatage(), resume: resume || SECTIONS_REGLAGES.filter(k => k in corps).map(k => NOMS_SECTIONS[k]).join(', ') || 'réglages', parametres: avant, ops: modifs});
    h.splice(0, Math.max(0, h.length - GARDER_HISTORIQUE));
    return {parametres: prm, deplacees: n};
  }

  function reclasser(d, corps) {
    const lesIds = idsPostes(d), voulu = {};
    for (const c of (corps.changements || [])) {
      if (!lesIds.has(c.categorie)) erreur('Poste inconnu : ' + c.categorie);
      voulu[String(c.id)] = c.categorie;
    }
    let n = 0;
    for (const x of d.operations)
      if (x.id in voulu && x.nature === 'depense' && x.categorie !== voulu[x.id]) { x.categorie = voulu[x.id]; marquer(d, x); n++; }
    return {modifiees: n};
  }

  /* Synchronisation : réglage fait sur le téléphone (moi, à partir de base) fusionné avec l'état reçu de l'ordinateur
     (eux), élément par élément (« id », ou « code » des devises) et champ par champ. Mêmes règles que fusion3 /
     fusionner_reglages dans serveur.py. ABSENT = clé ou élément inexistant. */
  const ABSENT = Symbol('absent');
  function egal(a, b) {
    if (a === b) return true;
    if (a === ABSENT || b === ABSENT || a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => egal(x, b[i]));
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && egal(a[k], b[k]));
  }
  const estObjet = x => x !== null && x !== ABSENT && typeof x === 'object' && !Array.isArray(x);
  function cleListe(...listes) {
    const elems = listes.filter(Array.isArray).flat();
    for (const k of ['id', 'code'])
      if (elems.length && elems.every(x => estObjet(x) && typeof x[k] === 'string')) return k;
    return null;
  }
  function fusion3(base, moi, eux, conflits, chemin) {
    chemin = chemin || '';
    if (egal(moi, base)) return eux;
    if (egal(eux, base) || egal(eux, moi)) return moi;
    if (estObjet(moi) && estObjet(eux)) {
      const b = estObjet(base) ? base : {}, out = {};
      for (const k of Object.keys(eux).concat(Object.keys(moi).filter(k => !(k in eux)))) {
        const v = fusion3(k in b ? b[k] : ABSENT, k in moi ? moi[k] : ABSENT, k in eux ? eux[k] : ABSENT, conflits, chemin + '/' + k);
        if (v !== ABSENT) out[k] = v;
      }
      return out;
    }
    const cle = Array.isArray(moi) && Array.isArray(eux) ? cleListe(Array.isArray(base) ? base : [], moi, eux) : null;
    if (cle) {
      const carte = l => new Map(l.map(x => [x[cle], x]));
      const b = Array.isArray(base) ? carte(base) : new Map(), m = carte(moi), e = carte(eux);
      const communsB = [...b.keys()].filter(k => m.has(k));
      let ordre, autre;
      if (!egal(moi.map(x => x[cle]).filter(k => b.has(k)), communsB)) { ordre = moi.map(x => x[cle]); autre = eux.map(x => x[cle]); }
      else { ordre = eux.map(x => x[cle]); autre = moi.map(x => x[cle]); }
      autre.forEach((k, i) => {
        if (ordre.includes(k)) return;
        let prec = null;
        for (let j = i - 1; j >= 0; j--) if (ordre.includes(autre[j])) { prec = autre[j]; break; }
        ordre.splice(prec !== null ? ordre.indexOf(prec) + 1 : 0, 0, k);
      });
      const out = [];
      for (const k of ordre) {
        const v = fusion3(b.has(k) ? b.get(k) : ABSENT, m.has(k) ? m.get(k) : ABSENT, e.has(k) ? e.get(k) : ABSENT, conflits, chemin + '/' + k);
        if (v !== ABSENT) out.push(v);
      }
      return out;
    }
    conflits.push(chemin || '/');
    return moi;
  }
  /* rend {corps, conflits} : chaque section présente dans corps ET dans base est fusionnée avec prm */
  function fusionnerReglages(prm, base, corps) {
    const out = Object.assign({}, corps), conflits = [];
    for (const k of SECTIONS_REGLAGES)
      if (k in corps && base && k in base) {
        const v = fusion3(base[k], corps[k], k in prm ? prm[k] : ABSENT, conflits, k);
        if (v === ABSENT) delete out[k]; else out[k] = v;
      }
    return {corps: copie(out), conflits};
  }

  /* contrôle d'un fichier importé (« Importer mes données ») : même format que donnees/carnet.json */
  function verifierImport(d) {
    if (!d || typeof d !== 'object' || d.version !== 5 || !Array.isArray(d.operations) || !d.parametres)
      erreur("Ce fichier n'est pas une sauvegarde Daftar (format 5).");
    const prm = d.parametres;
    if (!Array.isArray(prm.postes) || !Array.isArray(prm.comptes)) erreur('Sauvegarde incomplète : postes ou comptes absents.');
    prm.biens = prm.biens || []; prm.budgets = prm.budgets || {}; d.supprimees = d.supprimees || [];
    for (const o of d.operations) if (!o.id) erreur('Sauvegarde abîmée : une ligne sans identifiant.');
    return d;
  }

  window.AppYaMoteur = {fusionnerReglages, vide, purgerCorbeille, DELAI_CORBEILLE, nettoyer, vidangeAuto, regler, reclasser, marquer, verifierImport, POSTES_DEFAUT, COMPTES_DEFAUT, REVENUS_DEFAUT, TYPES_EVENEMENT};
})();
