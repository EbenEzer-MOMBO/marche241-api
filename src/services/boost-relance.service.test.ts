import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heureLibreville,
  jetonDesinscription,
  relanceDue,
  resumeBoosts,
  verifierJeton
} from './boost-relance.service';
import { parserParametres, serialiserParametres, PARAMETRES_BOOST_DEFAUT } from '../models/boost.model';

test('échéance : délai initial, intervalle, maximum, et remise à zéro du compteur', () => {
  const modifie = new Date('2026-01-01T00:00:00Z');
  const delai = 24;
  const intervalle = 48;
  const max = 2;

  assert.equal(relanceDue(modifie, 0, delai, intervalle, max, new Date('2026-01-01T23:00:00Z')), false);
  assert.equal(relanceDue(modifie, 0, delai, intervalle, max, new Date('2026-01-02T00:00:00Z')), true);
  assert.equal(relanceDue(modifie, 1, delai, intervalle, max, new Date('2026-01-02T00:00:00Z')), false);
  assert.equal(relanceDue(modifie, 1, delai, intervalle, max, new Date('2026-01-04T00:00:00Z')), true);
  assert.equal(relanceDue(modifie, 2, delai, intervalle, max, new Date('2026-01-10T00:00:00Z')), false);

  const apresModification = new Date('2026-01-05T00:00:00Z');
  assert.equal(relanceDue(apresModification, 0, delai, intervalle, max, new Date('2026-01-05T12:00:00Z')), false);
  assert.equal(relanceDue(apresModification, 0, delai, intervalle, max, new Date('2026-01-06T00:00:00Z')), true);
});

test('résumé au pluriel neutre, parties nulles omises', () => {
  assert.equal(
    resumeBoosts([{ statut: 'brouillon' }, { statut: 'brouillon' }, { statut: 'en_attente_paiement' }]),
    '2 boost(s) en brouillon et 1 boost(s) en attente de paiement'
  );
  assert.equal(resumeBoosts([{ statut: 'brouillon' }]), '1 boost(s) en brouillon');
  assert.equal(resumeBoosts([{ statut: 'en_attente_paiement' }]), '1 boost(s) en attente de paiement');
});

test('jeton HMAC : valide, altéré, autre secret', () => {
  process.env.RELANCE_DESINSCRIPTION_SECRET = 'secret-test-relance';
  const jeton = jetonDesinscription(42);
  assert.equal(verifierJeton(jeton), 42);
  const [charge] = jeton.split('.');
  assert.equal(verifierJeton(`${charge}.alteree`), null);
  assert.equal(verifierJeton('pas-un-jeton'), null);
  process.env.RELANCE_DESINSCRIPTION_SECRET = 'autre-secret';
  assert.equal(verifierJeton(jeton), null);
  delete process.env.RELANCE_DESINSCRIPTION_SECRET;
});

test('filtre d’heure de Libreville (UTC+1)', () => {
  assert.equal(heureLibreville(new Date('2026-10-12T09:30:00Z')), 10);
  assert.equal(heureLibreville(new Date('2026-10-12T08:30:00Z')), 9);
  assert.equal(heureLibreville(new Date('2026-10-12T22:15:00Z')), 23);
});

test('paramètres de relance : booléens et textes ne passent pas par Number()', () => {
  const parses = parserParametres([
    { cle: 'relance_active', valeur: 'false' },
    { cle: 'relance_whatsapp_active', valeur: 'true' },
    { cle: 'relance_email_objet', valeur: 'Objet {boutique}' },
    { cle: 'relance_max', valeur: '3' },
    { cle: 'relance_email_message', valeur: 'pas-un-nombre' }
  ]);
  assert.equal(parses.relance_active, false);
  assert.equal(parses.relance_whatsapp_active, true);
  assert.equal(parses.relance_email_objet, 'Objet {boutique}');
  assert.equal(parses.relance_max, 3);
  assert.equal(parses.relance_email_message, 'pas-un-nombre');
  assert.equal(parses.kill_switch, PARAMETRES_BOOST_DEFAUT.kill_switch);

  const serialise = Object.fromEntries(serialiserParametres({ relance_active: false, relance_email_objet: 'Bonjour' }));
  assert.equal(serialise.relance_active, 'false');
  assert.equal(serialise.relance_email_objet, 'Bonjour');
});
