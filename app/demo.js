/* Daftar — données de démonstration : trois années simulées (graine fixe, toujours les mêmes données).
   Comptes (espèces, banque, épargne avec intérêts, mobile money), dépenses courantes, salaire et primes,
   retraits et épargne, engins (voiture, moto, groupe électrogène avec vidanges), construction d'une maison,
   événements (mariage, mission, baptême), revenus ponctuels, prêts, frais bancaires programmés, relevés de solde.
   Les noms sont fictifs. Utilisé seulement dans la version démo (adresse « ?demo »). */
(function () {
  'use strict';
  function generer(aujourdhui) {
    const M = window.AppYaMoteur;
    let graine = 20261114;
    const rnd = () => { graine |= 0; graine = graine + 0x6D2B79F5 | 0; let t = Math.imul(graine ^ graine >>> 15, 1 | graine);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const arr = (v, p = 50) => Math.max(p, Math.round(v / p) * p);
    const pick = l => l[Math.floor(rnd() * l.length)];
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fin = new Date(aujourdhui + 'T12:00:00'), debut = new Date(fin.getFullYear() - 3, fin.getMonth(), 1, 12);
    const D0 = iso(debut);

    const d = M.vide();
    const P = d.parametres;
    P.debut_suivi = D0;
    P.comptes = [
      {id: 'especes', nom: 'Espèces', type: 'especes', mots: ['espèces', 'especes', 'cash', 'liquide'], releves: [{date: D0, solde: 25000}]},
      {id: 'banque', nom: 'Banque', type: 'courant', mots: ['banque', 'carte'], releves: [{date: D0, solde: 600000}], couleur: '#1f6fb2'},
      {id: 'epargne', nom: 'Épargne', type: 'epargne', mots: ['épargne', 'epargne', 'livret'], releves: [{date: D0, solde: 1000000}], taux: 1.5, periode: 6, couleur: '#2e8a57'},
      {id: 'mobile', nom: 'Mobile money', type: 'mobile', mots: ['mobile', 'momo'], releves: [{date: D0, solde: 10000}], couleur: '#d9772f'},
    ];
    P.biens = [
      {id: 'corolla', nom: 'Toyota Corolla', type: 'passif', date_achat: D0, prix_achat: 4500000, poste: 'voiture', mots: ['pneu', 'batterie', 'amortisseur'], estimations: [],
       vehicule: true, engin: 'voiture', vidange: {intervalle: 5000, dernier: 0, prochain: 0}},
      {id: 'yamaha', nom: 'Moto Yamaha', type: 'passif', date_achat: D0, prix_achat: 650000, poste: 'transport', mots: [], estimations: [],
       vehicule: true, engin: 'moto', vidange: {intervalle: 2000, dernier: 0, prochain: 0}},
      {id: 'groupe', nom: 'Groupe électrogène 5 kVA', type: 'passif', date_achat: D0, prix_achat: 900000, poste: 'foyer', mots: [], estimations: [],
       vehicule: true, engin: 'groupe', vidange: {intervalle: 250, dernier: 0, prochain: 0}},
      {id: 'villa', nom: 'Villa (construction)', type: 'actif', date_achat: D0, prix_achat: 3000000, poste: '', mots: ['ciment', 'brique', 'fer', 'sable', 'maçon', 'fondation', 'dalle', 'tôle', 'villa'], estimations: [],
       maison: true, projet: {budget: 18000000, echeance: iso(new Date(fin.getFullYear() + 1, 11, 31)), note: 'Villa 4 pièces, clôture, forage'}},
    ];
    const ev = (id, nom, type, k, mots, budget) => { const a = new Date(debut); a.setMonth(a.getMonth() + k); const b = new Date(a); b.setDate(b.getDate() + 6);
      return {id, nom, type, debut: iso(a), fin: iso(b), budget, mots, note: ''}; };
    P.evenements = [ev('mariage-awa', 'Mariage de Awa', 'mariage', 7, ['mariage', 'dot'], 600000),
                    ev('mission-dakar', 'Mission à Dakar', 'voyage-mission', 16, ['dakar'], 0),
                    ev('bapteme', 'Baptême de Moussa', 'bapteme', 28, ['baptême', 'bapteme', 'mouton'], 250000)];
    // foyer (2026-11-27) : épouse et deux enfants ; certaines dépenses leur sont destinées (« pour »)
    P.foyers = [{id: 'foyer1', nom: 'Foyer 1', membres: [
      {id: 'halima', nom: 'Halima', role: 'epouse', naissance: '', mots: []},
      {id: 'adam', nom: 'Adam', role: 'enfant', naissance: iso(new Date(fin.getFullYear() - 9, 2, 14)), mots: []},
      {id: 'zara', nom: 'Zara', role: 'enfant', naissance: iso(new Date(fin.getFullYear() - 6, 7, 2)), mots: []}]}];
    // à qui va la prochaine dépense ciblée : tour à tour l'épouse, les enfants, soi-même ('') — sans tirage au sort,
    // pour garder la suite des tirages (et donc toute la démo) inchangée
    let nCible = 0; const cible = () => ['halima', 'adam', 'zara', ''][nCible++ % 4];
    P.programmees = [{id: 'frais-banque', libelle: 'Frais de tenue de compte', nature: 'depense', mode: 'fixe', montant: 3500, compte: 'banque',
                      categorie: 'autre', periode: 1, jour: 30, debut: D0, fin: '', actif: true, ignorees: []}];

    const ops = [], solde = {especes: 25000, banque: 600000, epargne: 1000000, mobile: 10000};
    const SENS = {depense: -1, revenu: 1, pret: -1, remboursement: 1, investissement: -1};
    let n = 0;
    function op(o) {
      const doc = M.nettoyer({...o, cree: o.date + 'T08:00:00Z'}, d);
      doc.id = 'demo' + (++n).toString(36);
      if (o.prog) { doc.prog = o.prog; doc.prog_date = o.prog_date; }
      ops.push(doc);
      if (doc.nature === 'virement') { solde[doc.compte] -= doc.montant; solde[doc.vers] += doc.montant; }
      else solde[doc.compte] += SENS[doc.nature] * doc.montant;
    }
    const cash = (date, m) => { if (solde.especes < m + 5000) op({date, montant: arr(Math.max(150000, m + 50000), 5000), libelle: 'retrait banque', nature: 'virement', compte: 'banque', vers: 'especes'}); };
    const dep = (date, m, libelle, categorie, compte = 'especes', extra = {}) => { if (compte === 'especes') cash(date, m); op({date, montant: m, libelle, nature: 'depense', compte, categorie, ...extra}); };
    const km = {corolla: 82000, yamaha: 15000, groupe: 400}, prochVid = {corolla: 85000, yamaha: 16500, groupe: 600};
    const vd = {corolla: 5000, yamaha: 2000, groupe: 250};
    function plein(date, id, mt, prix, pas, lib) {
      km[id] += pas;
      dep(date, mt, lib, P.biens.find(b => b.id === id).poste, 'especes', {vehicule: id, cat_vehicule: 'carburant', km: km[id], quantite: Math.round(mt / prix * 10) / 10, unite: 'L'});
      if (km[id] >= prochVid[id]) {
        dep(date, {corolla: 25000, yamaha: 6000, groupe: 15000}[id], 'vidange huile ' + {corolla: 'corolla', yamaha: 'moto', groupe: 'groupe'}[id], P.biens.find(b => b.id === id).poste, 'especes',
          {vehicule: id, cat_vehicule: 'entretien', km: km[id]});
        const b = P.biens.find(x => x.id === id); b.vidange = {intervalle: vd[id], dernier: km[id], prochain: km[id] + vd[id]}; prochVid[id] = km[id] + vd[id];
      }
    }

    const salaireBase = 650000;
    for (let j = new Date(debut); iso(j) <= aujourdhui; j.setDate(j.getDate() + 1)) {
      const date = iso(j), jour = j.getDate(), mois = j.getMonth(), an = j.getFullYear() - debut.getFullYear(), dow = j.getDay();
      const k = (j.getFullYear() - debut.getFullYear()) * 12 + mois - debut.getMonth();
      const finMois = new Date(j.getFullYear(), mois + 1, 0).getDate();
      // revenus
      if (jour === 27) op({date, montant: salaireBase + an * 15000, libelle: 'salaire', nature: 'revenu', compte: 'banque', cat_revenu: 'salaire'});
      if (jour === 28 && mois % 3 === 2) op({date, montant: 200000, libelle: 'prime trimestrielle', nature: 'revenu', compte: 'banque', cat_revenu: 'prime'});
      if (jour === finMois && (mois === 5 || mois === 11)) op({date, montant: Math.round(solde.epargne * 0.015), libelle: 'intérêts épargne', nature: 'revenu', compte: 'epargne', cat_revenu: 'interets'});
      if (jour === 15 && k % 6 === 3) op({date, montant: 50000, libelle: 'jury de soutenance', nature: 'revenu', compte: 'banque', cat_revenu: 'jury'});
      if (jour === 20 && k % 12 === 9) op({date, montant: 350000, libelle: 'consultance étude', nature: 'revenu', compte: 'banque', cat_revenu: 'consultance'});
      // banque : frais programmés, épargne, recharge mobile
      if (jour === Math.min(30, finMois)) op({date, montant: 3500, libelle: 'Frais de tenue de compte', nature: 'depense', compte: 'banque', categorie: 'autre', prog: 'frais-banque', prog_date: date});
      if (jour === 28 && solde.banque > 300000) op({date, montant: 50000, libelle: 'épargne banque > épargne', nature: 'virement', compte: 'banque', vers: 'epargne'});
      if (jour === 3) op({date, montant: 15000, libelle: 'recharge mobile money', nature: 'virement', compte: 'banque', vers: 'mobile'});
      // dépenses courantes
      if (jour === 5) dep(date, 60000, 'contribution loyer', 'loyer');
      if (dow === 3 || dow === 6) dep(date, arr(entre(6000, 18000), 500), pick(['marché', 'vivres', 'riz et huile', 'viande', 'poisson', 'légumes']), 'foyer');
      if (rnd() < .6) dep(date, arr(entre(1000, 3500), 250), pick(['dej', 'café', 'jus', 'repas']), 'repas');
      if (rnd() < .3) dep(date, arr(entre(500, 2000), 250), pick(['taxi', 'transport', 'clando']), 'transport');
      if (dow === 1 && solde.mobile > 3000) op({date, montant: pick([2000, 3000, 5000]), libelle: 'crédit téléphone mobile', nature: 'depense', compte: 'mobile', categorie: 'tel'});
      if (rnd() < .035) { const m = arr(entre(3000, 25000), 500), l = pick(['pharmacie', 'consultation clinique', 'analyse labo']), q = cible();
        dep(date, m, q ? l + ' ' + q : l, 'sante', 'especes', q ? {pour: [q]} : {}); }
      if (rnd() < .06) dep(date, arr(entre(2000, 10000), 500), pick(['aide famille', 'aumône', 'don']), 'aides');
      if (rnd() < .03) { const m = arr(entre(5000, 30000), 500), l = pick(['chaussures', 'vêtement', 'coiffure', 'parfum']), q = cible();
        dep(date, m, q ? l + ' ' + q : l, /chauss|vêt/.test(l) ? 'habillement' : 'coiffure', 'especes', q ? {pour: [q]} : {}); }
      if ((mois === 8 || mois === 0 || mois === 3) && jour === 10) dep(date, 75000, 'scolarité enfants', 'enfants', 'banque', {pour: ['adam', 'zara']});
      if (mois === 8 && jour === 12) dep(date, 35000, 'fournitures scolaires', 'enfants', 'especes', {pour: ['adam', 'zara']});
      // engins
      if (dow === 2) plein(date, 'corolla', arr(entre(15000, 25000), 500), entre(680, 720), entre(250, 420), 'carburant corolla');
      if (dow === 0) plein(date, 'yamaha', arr(entre(3000, 5000), 250), entre(680, 720), entre(90, 150), 'essence moto');
      if (dow === 4) plein(date, 'groupe', arr(entre(8000, 15000), 500), entre(690, 730), entre(15, 30), 'gasoil groupe');
      if (rnd() < .012) dep(date, arr(entre(15000, 80000), 1000), pick(['réparation garage', 'mécanicien', 'vulcanisateur']), 'voiture', 'especes', {vehicule: 'corolla', cat_vehicule: 'reparation', km: km.corolla});
      if (mois === 0 && jour === 15) dep(date, 120000, 'assurance corolla', 'voiture', 'banque', {vehicule: 'corolla', cat_vehicule: 'service'});
      // maison : travaux à partir de la 2e année
      if (k >= 12 && jour === 18 && solde.banque > 450000) {
        const lib = pick(['ciment villa', 'brique villa', 'fer à béton villa', 'sable villa', 'main d\'oeuvre maçon villa', 'tôle villa']);
        op({date, montant: arr(entre(150000, 400000), 5000), libelle: lib, nature: 'investissement', compte: 'banque', bien: 'villa'});
      }
      // événements (exceptionnels)
      for (const e of P.evenements) if (date === e.debut) {
        if (e.id === 'mariage-awa') { dep(date, 200000, 'dot mariage', 'aides', 'banque', {evenement: e.id}); dep(date, 60000, 'tenue mariage', 'perso', 'especes', {evenement: e.id}); dep(date, 40000, 'cadeau mariage', 'aides', 'especes', {evenement: e.id}); }
        if (e.id === 'mission-dakar') { op({date, montant: 450000, libelle: 'frais de mission dakar', nature: 'revenu', compte: 'banque', cat_revenu: 'mission', evenement: e.id});
          dep(date, 250000, 'billet avion dakar', 'transport', 'banque', {evenement: e.id}); dep(date, 150000, 'hôtel dakar', 'autre', 'banque', {evenement: e.id}); }
        if (e.id === 'bapteme') { dep(date, 90000, 'mouton baptême', 'foyer', 'especes', {evenement: e.id}); dep(date, 45000, 'repas baptême', 'repas', 'especes', {evenement: e.id}); }
      }
    }
    // prêts (dates fixes dans la période)
    const jourK = (k, j) => iso(new Date(debut.getFullYear(), debut.getMonth() + k, j, 12));
    op({date: jourK(4, 8), montant: 100000, libelle: 'prêt Ali', nature: 'pret', compte: 'banque', personne: 'Ali', echeance: jourK(10, 30)});
    op({date: jourK(7, 2), montant: 50000, libelle: 'remb Ali', nature: 'remboursement', compte: 'banque', personne: 'Ali'});
    op({date: jourK(20, 9), montant: 200000, libelle: 'prêt Fatimé', nature: 'pret', compte: 'banque', personne: 'Fatimé', echeance: jourK(40, 30)});
    op({date: jourK(26, 3), montant: 100000, libelle: 'remb Fatimé', nature: 'remboursement', compte: 'banque', personne: 'Fatimé'});
    // relevés de solde (fin de trimestre) : la banque confirme les soldes calculés
    for (let k = 3; ; k += 3) { const r = jourK(k, 0); if (r > aujourdhui) break;
      for (const c of P.comptes) if (c.id !== 'especes') c.releves.push({date: r, solde: 0, _calcul: true}); }
    ops.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    for (const c of P.comptes) for (const r of c.releves) if (r._calcul) {
      delete r._calcul; const base = c.releves[0];
      r.solde = base.solde + ops.filter(o => o.date > base.date && o.date <= r.date)
        .reduce((s, o) => s + (o.nature === 'virement' ? (o.vers === c.id ? o.montant : 0) - (o.compte === c.id ? o.montant : 0) : (o.compte === c.id ? SENS[o.nature] * o.montant : 0)), 0);
    }
    d.operations = ops;
    reduire(d, ECHELLE);
    for (const o of ops) M.marquer(d, o, o.cree);
    return d;
  }
  /* Tous les montants de la démo sont ramenés à ECHELLE (0,4 = 60 % de moins) : soldes, patrimoine, prix d'achat,
     budgets, opérations. Les données sont simulées à l'échelle d'origine puis réduites d'un même facteur, de sorte que
     chaque total (patrimoine, solde, dépenses du mois…) est exactement réduit de 60 %. Les litres suivent les montants
     (le prix du litre reste réaliste) ; kilomètres, heures et dates ne changent pas. */
  const ECHELLE = 0.4;
  function reduire(d, f) {
    const r = v => Math.round(v * f), P = d.parametres;
    for (const c of P.comptes) for (const x of c.releves) x.solde = r(x.solde);
    for (const b of P.biens) { b.prix_achat = r(b.prix_achat); if (b.projet) b.projet.budget = r(b.projet.budget); }
    for (const e of P.evenements) if (e.budget) e.budget = r(e.budget);
    for (const p of P.programmees) if (p.montant) p.montant = r(p.montant);
    for (const o of d.operations) { o.montant = r(o.montant); if (o.quantite) o.quantite = Math.round(o.quantite * f * 10) / 10; }
  }
  window.AppYaDemo = {generer, version: 2};
})();
