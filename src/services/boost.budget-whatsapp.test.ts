import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageBudgetInsuffisant } from './boost.service';
import { PARAMETRES_BOOST_DEFAUT } from '../models/boost.model';

const p = { ...PARAMETRES_BOOST_DEFAUT, commission_bps: 3000, commission_min_fcfa: 1000, budget_jour_min_fcfa: 600, budget_jour_min_whatsapp_fcfa: 1300 };

test('budget WhatsApp : le pack Découverte (3 000 FCFA, 3 jours) est refusé avec le montant minimum', () => {
  const message = messageBudgetInsuffisant(3000, 3, 'whatsapp', p);
  assert.ok(message);
  assert.match(message!, /messages WhatsApp/);
  assert.match(message!, /5\s?100\s?FCFA pour 3 jours/);
  assert.match(message!, /« Visites »/);
});

test('budget : le même pack reste valable pour les objectifs Visites et Notoriété', () => {
  assert.equal(messageBudgetInsuffisant(3000, 3, 'trafic', p), null);
  assert.equal(messageBudgetInsuffisant(3000, 3, 'notoriete', p), null);
});

test('budget WhatsApp : un montant suffisant passe', () => {
  assert.equal(messageBudgetInsuffisant(5100, 3, 'whatsapp', p), null);
  assert.equal(messageBudgetInsuffisant(15_000, 7, 'whatsapp', p), null);
});
