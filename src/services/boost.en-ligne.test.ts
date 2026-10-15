import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doitNotifierMiseEnLigne } from './boost.service';
import { buildBoostEnLigneComponents, TEMPLATE_BOOST_EN_LIGNE } from './whatsapp-templates-boost';
import { vendeurBoostEnLigneTemplate } from './email-templates';

test('mise en ligne : prévenir une seule fois, au passage en revue → ACTIVE', () => {
  assert.equal(doitNotifierMiseEnLigne('PENDING_REVIEW', 'ACTIVE', false), true);
  assert.equal(doitNotifierMiseEnLigne('IN_PROCESS', 'ACTIVE', false), true);
  // première synchro après validation : statut encore inconnu, validation récente
  const maintenant = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(doitNotifierMiseEnLigne(null, 'ACTIVE', false, '2026-10-16T10:00:00Z', maintenant), true);
  // statut jamais lu sur un boost validé il y a 3 jours : pas de notification tardive
  assert.equal(doitNotifierMiseEnLigne(null, 'ACTIVE', false, '2026-10-13T10:00:00Z', maintenant), false);
  assert.equal(doitNotifierMiseEnLigne(null, 'ACTIVE', false, null, maintenant), false);
  // déjà en ligne (synchro suivante, boosts diffusés avant le déploiement) : rien
  assert.equal(doitNotifierMiseEnLigne('ACTIVE', 'ACTIVE', false), false);
  // toujours en revue, rejetée, ou mode simulé : rien
  assert.equal(doitNotifierMiseEnLigne(null, 'PENDING_REVIEW', false), false);
  assert.equal(doitNotifierMiseEnLigne('PENDING_REVIEW', 'DISAPPROVED', false), false);
  assert.equal(doitNotifierMiseEnLigne('PENDING_REVIEW', 'ACTIVE', true), false);
});

test('WhatsApp boost_en_ligne_vendeur : corps (vendeur, titre, fin) et bouton vers le suivi', () => {
  assert.equal(TEMPLATE_BOOST_EN_LIGNE.name, 'boost_en_ligne_vendeur');
  const composants = buildBoostEnLigneComponents({ vendeur: 'Awa', titre: 'Savon à l’hysope\nPromo', dateFin: '18 octobre', slug: 'kalia', boostId: 15 });
  assert.deepEqual(composants[0], {
    type: 'body',
    parameters: [
      { type: 'text', text: 'Awa' },
      { type: 'text', text: 'Savon à l’hysope Promo' },
      { type: 'text', text: '18 octobre' }
    ]
  });
  assert.deepEqual(composants[1], { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'kalia/boost/15' }] });
});

test('e-mail de mise en ligne : HTML échappé, lien de suivi et version texte', () => {
  const { subject, html, text } = vendeurBoostEnLigneTemplate({
    vendeurNom: 'Awa <b>',
    boutiqueNom: 'KALIA & Co',
    titrePub: 'Savon',
    objectif: 'Messages WhatsApp',
    budget: '4 000 FCFA',
    dateDebut: '15 octobre',
    dateFin: '18 octobre',
    lienSuivi: 'https://marche241.ga/admin/kalia/boost/15'
  });
  assert.match(subject, /Savon/);
  assert.ok(html.includes('Awa &lt;b&gt;'));
  assert.ok(html.includes('KALIA &amp; Co'));
  assert.ok(!html.includes('<b>,'));
  assert.ok(html.includes('https://marche241.ga/admin/kalia/boost/15'));
  assert.match(text, /du 15 octobre au 18 octobre/);
});
