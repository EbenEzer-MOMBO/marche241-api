/**
 * Test d'intégration HTTP du boost Meta, de bout en bout, contre une base Postgres LOCALE jetable
 * (jamais Neon). Ignoré sauf si BOOST_IT_DATABASE_URL est défini, par ex. :
 *   BOOST_IT_DATABASE_URL=postgres://postgres@localhost:5544/m241_test npm test
 * La base est entièrement réinitialisée (schéma public) à chaque exécution.
 * Meta en mode simulé (META_DRY_RUN=true), eBilling simulé (méthodes du PaiementController et axios.get).
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { AddressInfo } from 'net';
import http from 'http';
import { Client } from 'pg';
import jwt from 'jsonwebtoken';

const URL_BASE_TEST = process.env.BOOST_IT_DATABASE_URL;
const ignorer = !URL_BASE_TEST;

const CLE_SERVICE = 'cle-service-test';
const CLE_CRON = 'cle-cron-test';
const JWT_SECRET = 'secret-test-boost';
const RACINE = path.resolve(__dirname, '..', '..');

let serveur: http.Server;
let base = '';
let jetonVendeur = '';
let jetonAutreVendeur = '';
let ids = { boutique: 0, autreBoutique: 0, produit: 0, commande: 0 };
let etatFactureEbilling = 'paid';
let compteurFactures = 0;
let sql: Client;

async function appel(methode: string, chemin: string, options: { jeton?: string; cle?: string; corps?: unknown } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.jeton) headers.Authorization = `Bearer ${options.jeton}`;
  if (options.cle) headers['x-service-key'] = options.cle;
  const res = await fetch(`${base}${chemin}`, {
    method: methode,
    headers,
    body: options.corps === undefined ? undefined : JSON.stringify(options.corps)
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, json };
}

describe('Boost Meta — intégration HTTP (Postgres local, dry-run)', { skip: ignorer ? 'BOOST_IT_DATABASE_URL non défini' : false }, () => {
  before(async () => {
    if (/neon\.tech/i.test(URL_BASE_TEST!)) throw new Error('Refus : le test d’intégration ne doit jamais viser Neon');

    sql = new Client({ connectionString: URL_BASE_TEST });
    await sql.connect();
    await sql.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const fichier of ['tests/boost/schema-minimal.sql', 'migrations/026_create_boosts_tables.sql', 'migrations/027_extend_transactions_for_boost.sql', 'migrations/028_create_meta_connexion.sql', 'migrations/028_create_meta_connexion.sql', 'migrations/029_boost_frais_encaissement.sql', 'migrations/029_boost_frais_encaissement.sql']) {
      await sql.query(fs.readFileSync(path.join(RACINE, fichier), 'utf8'));
    }
    const v1 = await sql.query(`INSERT INTO vendeurs (telephone, nom, email) VALUES ('24177000001', 'Awa', 'awa@test.ga') RETURNING id`);
    const v2 = await sql.query(`INSERT INTO vendeurs (telephone, nom) VALUES ('24177000002', 'Paul') RETURNING id`);
    const b1 = await sql.query(
      `INSERT INTO boutiques (nom, slug, description, vendeur_id, banniere, telephone) VALUES ('Chez Awa', 'chez-awa', 'Mode et beauté', $1, 'https://cdn.test/banniere.jpg', '+241 77 00 00 01') RETURNING id`,
      [v1.rows[0].id]
    );
    const b2 = await sql.query(`INSERT INTO boutiques (nom, slug, vendeur_id) VALUES ('Chez Paul', 'chez-paul', $1) RETURNING id`, [v2.rows[0].id]);
    const p = await sql.query(
      `INSERT INTO produits (nom, slug, description, boutique_id, images) VALUES ('Robe wax', 'robe-wax', 'Robe en wax', $1, '["https://cdn.test/robe.jpg"]') RETURNING id`,
      [b1.rows[0].id]
    );
    const c = await sql.query(`INSERT INTO commandes (boutique_id, numero_commande) VALUES ($1, 'CMD-1') RETURNING id`, [b1.rows[0].id]);
    await sql.query(
      `INSERT INTO transactions (commande_id, reference_transaction, montant, statut, type_paiement) VALUES ($1, 'CMD-1', 11000, 'paye', 'paiement_complet')`,
      [c.rows[0].id]
    );
    ids = { boutique: b1.rows[0].id, autreBoutique: b2.rows[0].id, produit: p.rows[0].id, commande: c.rows[0].id };

    Object.assign(process.env, {
      DATABASE_URL: URL_BASE_TEST,
      DATABASE_SSL: 'false',
      JWT_SECRET,
      ADMIN_SERVICE_KEY: CLE_SERVICE,
      CRON_SECRET_KEY: CLE_CRON,
      META_DRY_RUN: 'true',
      // Jeton factice sans META_APP_ID / META_APP_SECRET : connexion volontairement incomplète
      META_ACCESS_TOKEN: 'jeton-secret-integration',
      META_APP_ID: '',
      META_APP_SECRET: '',
      FRONTEND_URL: 'https://marche241.ga',
      ALLOWED_ADMIN_IDS: '',
      // Stockage R2 factice (requis à l'import, jamais appelé par le boost)
      STORAGE_ENDPOINT: 'http://127.0.0.1:9',
      STORAGE_ACCESS_KEY_ID: 'test',
      STORAGE_SECRET_ACCESS_KEY: 'test',
      STORAGE_PUBLIC_URL: 'https://cdn.test'
    });
    jetonVendeur = jwt.sign({ id: v1.rows[0].id }, JWT_SECRET);
    jetonAutreVendeur = jwt.sign({ id: v2.rows[0].id }, JWT_SECRET);

    // eBilling simulé
    const { PaiementController } = await import('../controllers/paiement.controller');
    // même instance CommonJS que celle utilisée par le contrôleur (l'import ESM en serait une autre)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const axios = require('axios');
    (PaiementController as any).getAccessToken = async () => 'jeton-ebilling';
    (PaiementController as any).creerFacture = async () => ({ response: { e_bills: [{ bill_id: `BILL-${++compteurFactures}` }] } });
    (PaiementController as any).envoyerUSSDPush = async () => ({ ok: true });
    (axios as any).get = async () => ({ status: 200, data: { state: etatFactureEbilling, ps_transaction_id: `PS-${compteurFactures}`, payment_system_name: 'airtelmoney' } });

    const app = (await import('../app')).default;
    serveur = app.listen(0);
    await new Promise((r) => serveur.once('listening', r));
    base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/v1`;
  });

  after(async () => {
    serveur?.close();
    await sql?.end();
    const { closePool } = await import('../config/database');
    await closePool?.();
  });

  let boostId = 0;

  test('paramètres : packs par défaut et type plateforme désactivé', async () => {
    const r = await appel('GET', '/boosts/parametres', { jeton: jetonVendeur });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.parametres.types, { plateforme: false, meta: true });
    assert.deepEqual(r.json.parametres.packs.map((p: any) => p.total_fcfa), [3000, 7500, 15000, 30000]);
    assert.equal(r.json.parametres.mode_simule, true);
    assert.equal((await appel('GET', '/boosts/parametres')).status, 401);
  });

  test('prefill boutique et produit', async () => {
    const b = await appel('GET', `/boosts/prefill?boutique_id=${ids.boutique}`, { jeton: jetonVendeur });
    assert.equal(b.status, 200);
    assert.equal(b.json.prefill.url_destination, 'https://marche241.ga/chez-awa');
    assert.equal(b.json.prefill.whatsapp_e164, '+24177000001');
    const p = await appel('GET', `/boosts/prefill?boutique_id=${ids.boutique}&produit_id=${ids.produit}`, { jeton: jetonVendeur });
    assert.equal(p.json.prefill.type_cible, 'produit');
    assert.equal(p.json.prefill.image_url, 'https://cdn.test/robe.jpg');
    assert.equal(p.json.prefill.url_destination, `https://marche241.ga/chez-awa/produit/${ids.produit}`);
    assert.equal((await appel('GET', `/boosts/prefill?boutique_id=${ids.boutique}`, { jeton: jetonAutreVendeur })).status, 403);
  });

  test('devis depuis un pack', async () => {
    const r = await appel('POST', '/boosts/devis', { jeton: jetonVendeur, corps: { total_fcfa: 3000, duree_jours: 3 } });
    assert.equal(r.status, 200);
    assert.equal(r.json.devis.budget_media_fcfa, 2000);
    assert.equal(r.json.devis.commission_fcfa, 1000);
    assert.equal(r.json.devis.budget_jour_fcfa, 666);
    const trop = await appel('POST', '/boosts/devis', { jeton: jetonVendeur, corps: { total_fcfa: 900 } });
    assert.equal(trop.status, 400);
    assert.equal(trop.json.code, 'VALIDATION_ERROR');
  });

  test('estimations en mode simulé', async () => {
    const r = await appel('POST', '/boosts/estimation/impressions', { jeton: jetonVendeur, corps: { totaux_fcfa: [3000, 30000], duree_jours: 5 } });
    assert.equal(r.status, 200);
    assert.equal(r.json.impressions.length, 2);
    assert.equal(r.json.impressions[0].source, 'defaut');
    assert.ok(r.json.impressions[1].min > r.json.impressions[0].min);
    const a = await appel('POST', '/boosts/estimation/audience', { jeton: jetonVendeur, corps: { ciblage: { pays: ['GA'] } } });
    assert.equal(a.json.audience.disponible, false);
  });

  test('brouillon : création, accès refusé à un autre vendeur, sauvegarde', async () => {
    const refuse = await appel('POST', '/boosts', { jeton: jetonVendeur, corps: { boutique_id: ids.autreBoutique } });
    assert.equal(refuse.status, 403);
    const r = await appel('POST', '/boosts', { jeton: jetonVendeur, corps: { boutique_id: ids.boutique, nom: 'Boost rentrée', objectif: 'trafic' } });
    assert.equal(r.status, 201);
    boostId = r.json.boost.id;
    assert.equal(r.json.boost.statut, 'brouillon');
    assert.equal(r.json.boost.total_fcfa, 3000);
    assert.equal((await appel('GET', `/boosts/${boostId}`, { jeton: jetonAutreVendeur })).status, 403);

    const maj = await appel('PUT', `/boosts/${boostId}`, {
      jeton: jetonVendeur,
      corps: { total_fcfa: 7500, duree_jours: 5, ciblage: { villes: ['2420605'], interets: ['mode'], sexes: ['femme'], etape_wizard: 2 } }
    });
    assert.equal(maj.status, 200);
    assert.deepEqual(maj.json.boost.ciblage.villes, ['2420605']);
    assert.deepEqual(maj.json.boost.ciblage.pays, ['GA'], 'les champs non envoyés du ciblage sont conservés');
    const invalide = await appel('PUT', `/boosts/${boostId}`, { jeton: jetonVendeur, corps: { ciblage: { interets: ['inconnu'] } } });
    assert.equal(invalide.status, 400);
  });

  test('soumission : erreurs par champ puis devis figé et UTM', async () => {
    const incomplet = await appel('POST', `/boosts/${boostId}/soumettre`, { jeton: jetonVendeur });
    assert.equal(incomplet.status, 400);
    assert.equal(incomplet.json.code, 'VALIDATION_ERROR');
    const champs = incomplet.json.errors.map((e: any) => e.field);
    assert.ok(champs.includes('image_url') && champs.includes('titre') && champs.includes('url_destination'));

    await appel('PUT', `/boosts/${boostId}`, {
      jeton: jetonVendeur,
      corps: {
        titre: 'Chez Awa',
        texte_principal: 'Nouvelle collection wax disponible',
        image_url: 'https://cdn.test/banniere.jpg',
        url_destination: 'https://marche241.ga/chez-awa'
      }
    });
    const ok = await appel('POST', `/boosts/${boostId}/soumettre`, { jeton: jetonVendeur });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.boost.statut, 'en_attente_paiement');
    assert.equal(ok.json.boost.budget_media_fcfa, 6250);
    assert.equal(ok.json.boost.commission_fcfa, 1250);
    assert.match(ok.json.boost.url_destination, /utm_campaign=boost_\d+/);
    assert.equal((await appel('PUT', `/boosts/${boostId}`, { jeton: jetonVendeur, corps: { titre: 'X' } })).status, 409);
  });

  test('budget par jour trop faible refusé', async () => {
    const r = await appel('POST', '/boosts', {
      jeton: jetonVendeur,
      corps: { boutique_id: ids.boutique, total_fcfa: 3000, duree_jours: 14, titre: 'Test', texte_principal: 'Texte test', image_url: 'https://cdn.test/a.jpg', url_destination: 'https://marche241.ga/chez-awa' }
    });
    const s = await appel('POST', `/boosts/${r.json.boost.id}/soumettre`, { jeton: jetonVendeur });
    assert.equal(s.status, 400);
    assert.ok(s.json.errors.some((e: any) => e.field === 'duree_jours'));
    assert.equal((await appel('DELETE', `/boosts/${r.json.boost.id}`, { jeton: jetonVendeur })).status, 200);
  });

  test('paiement mobile eBilling puis confirmation idempotente', async () => {
    const invalide = await appel('POST', `/boosts/${boostId}/paiement`, { jeton: jetonVendeur, corps: { mode: 'mobile' } });
    assert.equal(invalide.status, 400);
    const p = await appel('POST', `/boosts/${boostId}/paiement`, { jeton: jetonVendeur, corps: { mode: 'mobile', operateur: 'airtelmoney', msisdn: '077000001' } });
    assert.equal(p.status, 200);
    const tx = await sql.query(`SELECT * FROM transactions WHERE boost_id = $1`, [boostId]);
    assert.equal(tx.rows.length, 1);
    assert.equal(tx.rows[0].montant, 7500);
    assert.equal(tx.rows[0].type_paiement, 'boost');
    assert.equal(tx.rows[0].commande_id, null);

    const v = await appel('GET', `/paiements/verification/${p.json.bill_id}`);
    assert.equal(v.json.success, true);
    const d = await appel('GET', `/boosts/${boostId}`, { jeton: jetonVendeur });
    assert.equal(d.json.boost.statut, 'en_attente_validation');
    assert.equal(d.json.boost.conformite, undefined, 'champs internes masqués au vendeur');
    assert.ok(d.json.evenements.some((e: any) => e.type_evenement === 'paiement_confirme'));

    const v2 = await appel('GET', `/paiements/verification/${p.json.bill_id}`);
    assert.equal(v2.json.cached, true);
  });

  test('back-office : clé de service obligatoire', async () => {
    assert.equal((await appel('GET', '/boosts/admin')).status, 401);
    assert.equal((await appel('GET', '/boosts/admin', { jeton: jetonVendeur })).status, 403);
    const r = await appel('GET', '/boosts/admin?statut=en_attente_validation', { cle: CLE_SERVICE });
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 1);
    assert.equal(r.json.boosts[0].boutique.slug, 'chez-awa');
    const s = await appel('GET', '/boosts/admin/stats', { cle: CLE_SERVICE });
    assert.equal(s.json.stats.en_attente_validation, 1);
    const sante = await appel('GET', '/boosts/admin/meta/sante', { cle: CLE_SERVICE });
    assert.equal(sante.json.sante.dry_run, true);
    assert.equal(sante.json.sante.ok, false);
    assert.equal(sante.json.sante.secrets.access_token, true);
    assert.match(sante.json.sante.raisons.join('|'), /META_APP_ID, META_APP_SECRET/);
    assert.equal(JSON.stringify(sante.json).includes('jeton-secret-integration'), false, 'aucun secret renvoyé');
  });

  test('connexion Meta : découverte et choix refusés sans secrets, vérification enregistrée', async () => {
    assert.equal((await appel('GET', '/boosts/admin/meta/decouverte', { jeton: jetonVendeur })).status, 403);
    const d = await appel('GET', '/boosts/admin/meta/decouverte', { cle: CLE_SERVICE });
    assert.equal(d.status, 409);
    assert.equal(d.json.code, 'META_SECRETS_MANQUANTS');
    const invalide = await appel('PUT', '/boosts/admin/meta/connexion', { cle: CLE_SERVICE, corps: { ad_account_id: 'abc', page_id: '' } });
    assert.equal(invalide.status, 400);
    assert.equal(invalide.json.code, 'VALIDATION_ERROR');
    const v = await appel('POST', '/boosts/admin/meta/verifier', { cle: CLE_SERVICE });
    assert.equal(v.status, 200);
    assert.ok(v.json.sante.connexion.verifie_le);
    assert.match(v.json.sante.connexion.message_erreur, /META_APP_ID/);
  });

  test('approbation refusée hors mode simulé si Meta n’est pas configuré (boost intact)', async () => {
    process.env.META_DRY_RUN = 'false';
    try {
      const r = await appel('POST', `/boosts/admin/${boostId}/approuver`, { cle: CLE_SERVICE, corps: { conformite: ['interdit', 'allegations', 'ciblage', 'visuel'] } });
      assert.equal(r.status, 409);
      assert.equal(r.json.code, 'META_NON_CONFIGURE');
      assert.match(r.json.message, /Aucun compte publicitaire/);
    } finally {
      process.env.META_DRY_RUN = 'true';
    }
    const d = await appel('GET', `/boosts/admin/${boostId}`, { cle: CLE_SERVICE });
    assert.equal(d.json.boost.statut, 'en_attente_validation');
  });

  test('approbation : checklist, kill switch puis publication simulée', async () => {
    const incomplet = await appel('POST', `/boosts/admin/${boostId}/approuver`, { cle: CLE_SERVICE, corps: { conformite: ['interdit'] } });
    assert.equal(incomplet.status, 400);
    assert.equal(incomplet.json.code, 'CONFORMITE_INCOMPLETE');

    await appel('PUT', '/boosts/admin/parametres', { cle: CLE_SERVICE, corps: { kill_switch: true } });
    const coupe = await appel('POST', `/boosts/admin/${boostId}/approuver`, { cle: CLE_SERVICE, corps: { conformite: ['interdit', 'allegations', 'ciblage', 'visuel'] } });
    assert.equal(coupe.status, 409);
    await appel('PUT', '/boosts/admin/parametres', { cle: CLE_SERVICE, corps: { kill_switch: false } });

    const ok = await appel('POST', `/boosts/admin/${boostId}/approuver`, {
      cle: CLE_SERVICE,
      corps: { conformite: ['interdit', 'allegations', 'ciblage', 'visuel'], valide_par: 'Testeur' }
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.boost.statut, 'actif');
    assert.equal(ok.json.boost.dry_run, true);
    assert.match(ok.json.boost.meta_campaign_id, /^dry_campaign_/);
    assert.equal(ok.json.boost.valide_par, 'Testeur');
    const re = await appel('POST', `/boosts/admin/${boostId}/approuver`, { cle: CLE_SERVICE, corps: { conformite: ['interdit', 'allegations', 'ciblage', 'visuel'] } });
    assert.equal(re.status, 409, 'double approbation refusée');
  });

  test('pause / reprise par le vendeur', async () => {
    const p = await appel('POST', `/boosts/${boostId}/pause`, { jeton: jetonVendeur });
    assert.equal(p.json.boost.statut, 'en_pause');
    assert.equal((await appel('POST', `/boosts/${boostId}/pause`, { jeton: jetonVendeur })).status, 409);
    const r = await appel('POST', `/boosts/${boostId}/reprendre`, { jeton: jetonVendeur });
    assert.equal(r.json.boost.statut, 'actif');
  });

  test('cron de synchro puis clôture admin avec reliquat', async () => {
    assert.equal((await appel('GET', '/cron/boosts/sync')).status, 401);
    const cron = await fetch(`${base}/cron/boosts/sync?key=${CLE_CRON}`).then((r) => r.json() as any);
    assert.equal(cron.resultat.examines, 1);

    await sql.query(
      `INSERT INTO boost_insights_jour (boost_id, date, depense_fcfa, impressions, portee, clics) VALUES ($1, CURRENT_DATE - 1, 1800, 30000, 20000, 150), ($1, CURRENT_DATE, 1200, 20000, 15000, 90)`,
      [boostId]
    );
    const c = await appel('POST', `/boosts/admin/${boostId}/cloturer`, { cle: CLE_SERVICE });
    assert.equal(c.status, 200);
    assert.equal(c.json.boost.statut, 'termine');
    assert.equal(c.json.boost.depense_fcfa, 3000);
    // 7500 payés − 3000 dépensés − commission au prorata 1250 × 3000 / 6250 = 600 − frais d’encaissement 188 (2,5 %)
    assert.equal(c.json.boost.montant_a_rembourser_fcfa, 3712);
    assert.equal(c.json.boost.statut_remboursement, 'a_rembourser');

    const d = await appel('GET', `/boosts/${boostId}`, { jeton: jetonVendeur });
    assert.equal(d.json.totaux.impressions, 50000);
    assert.equal(d.json.insights.length, 2);

    const remb = await appel('POST', `/boosts/admin/${boostId}/rembourse`, { cle: CLE_SERVICE, corps: { note: 'Versement Airtel 3712' } });
    assert.equal(remb.json.boost.statut_remboursement, 'rembourse');
    assert.equal((await appel('POST', `/boosts/admin/${boostId}/rembourse`, { cle: CLE_SERVICE, corps: {} })).status, 409);
  });

  test('refus admin : remboursement intégral hors frais d’encaissement', async () => {
    const b = await appel('POST', '/boosts', {
      jeton: jetonVendeur,
      corps: { boutique_id: ids.boutique, type_cible: 'produit', produit_id: ids.produit, objectif: 'whatsapp', whatsapp_e164: '+24177000001', total_fcfa: 15000, duree_jours: 7, titre: 'Robe wax', texte_principal: 'Écrivez-nous sur WhatsApp', image_url: 'https://cdn.test/robe.jpg' }
    });
    const id = b.json.boost.id;
    assert.equal((await appel('POST', `/boosts/${id}/soumettre`, { jeton: jetonVendeur })).status, 200);
    const p = await appel('POST', `/boosts/${id}/paiement`, { jeton: jetonVendeur, corps: { mode: 'carte', return_url: 'https://marche241.ga/admin/chez-awa/boost' } });
    assert.equal(p.json.redirect, true);
    assert.match(p.json.url, /invoice=BILL-/);
    await appel('GET', `/paiements/verification/${p.json.bill_id}`);
    const sansNote = await appel('POST', `/boosts/admin/${id}/refuser`, { cle: CLE_SERVICE, corps: {} });
    assert.equal(sansNote.status, 400);
    const r = await appel('POST', `/boosts/admin/${id}/refuser`, { cle: CLE_SERVICE, corps: { note: 'Visuel non conforme' } });
    assert.equal(r.json.boost.statut, 'refuse');
    assert.equal(r.json.boost.montant_a_rembourser_fcfa, 14625, '15 000 − 375 de frais d’encaissement (2,5 %)');
  });

  test('retour en brouillon possible tant que rien n’est payé', async () => {
    const b = await appel('POST', '/boosts', {
      jeton: jetonVendeur,
      corps: { boutique_id: ids.boutique, total_fcfa: 7500, duree_jours: 5, titre: 'Test', texte_principal: 'Texte test', image_url: 'https://cdn.test/a.jpg', url_destination: 'https://exemple.com/page' }
    });
    const id = b.json.boost.id;
    const s = await appel('POST', `/boosts/${id}/soumettre`, { jeton: jetonVendeur });
    assert.equal(s.json.boost.url_destination, 'https://exemple.com/page', 'pas d’UTM hors Marché 241');
    const a = await appel('POST', `/boosts/${id}/annuler-soumission`, { jeton: jetonVendeur });
    assert.equal(a.json.boost.statut, 'brouillon');
  });

  test('non-régression : les transactions boost restent hors des transactions de la boutique', async () => {
    const r = await appel('GET', `/transactions/boutique/${ids.boutique}`, { jeton: jetonVendeur });
    assert.equal(r.status, 200);
    const liste = r.json.transactions ?? r.json.data ?? [];
    assert.ok(Array.isArray(liste));
    assert.ok(liste.every((t: any) => t.type_paiement !== 'boost'));
    assert.equal(liste.length, 1);
  });

  test('liste vendeur par boutique', async () => {
    const r = await appel('GET', `/boosts/boutique/${ids.boutique}`, { jeton: jetonVendeur });
    assert.equal(r.status, 200);
    assert.equal(r.json.boosts.length, 3);
    // Détails rapides : produit promu et totaux de diffusion (insights cumulés)
    const parProduit = r.json.boosts.find((b: any) => b.type_cible === 'produit');
    assert.equal(parProduit.produit_nom, 'Robe wax');
    const diffuse = r.json.boosts.find((b: any) => b.id === boostId);
    assert.deepEqual(diffuse.totaux, { impressions: 50_000, clics: 240, messages: 0 });
    assert.equal((await appel('GET', `/boosts/boutique/${ids.boutique}`, { jeton: jetonAutreVendeur })).status, 403);
  });
});
