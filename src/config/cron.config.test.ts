import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPingActif, cronInterneActif } from './cron.config';

test('les tâches internes sont actives par défaut', () => {
  assert.equal(cronInterneActif({}), true);
  assert.equal(cronInterneActif({ CRON_INTERNE_ACTIVE: '' }), true);
  assert.equal(cronInterneActif({ CRON_INTERNE_ACTIVE: 'true' }), true);
});

test('CRON_INTERNE_ACTIVE=false coupe les tâches internes', () => {
  assert.equal(cronInterneActif({ CRON_INTERNE_ACTIVE: 'false' }), false);
  assert.equal(cronInterneActif({ CRON_INTERNE_ACTIVE: ' FALSE ' }), false);
});

test('0, off et no coupent aussi les tâches internes', () => {
  for (const valeur of ['0', 'off', 'OFF', 'no', 'non']) {
    assert.equal(cronInterneActif({ CRON_INTERNE_ACTIVE: valeur }), false, valeur);
    assert.equal(autoPingActif({ MONITOR_AUTOPING_ACTIVE: valeur }), false, valeur);
  }
});

test('l\'auto-ping est indépendant des tâches internes', () => {
  assert.equal(autoPingActif({}), true);
  assert.equal(autoPingActif({ MONITOR_AUTOPING_ACTIVE: 'false' }), false);
  assert.equal(autoPingActif({ CRON_INTERNE_ACTIVE: 'false' }), true);
});
