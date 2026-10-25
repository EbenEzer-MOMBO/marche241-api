import test from 'node:test';
import assert from 'node:assert/strict';
import { isEvenementTermine } from './produit-evenement';

const evt = (meta: Record<string, unknown>) => ({ variants: { type: 'evenement', meta } });
// 2026-10-25 12:00 à Libreville (UTC+1) = 11:00 UTC
const MAINTENANT = Date.parse('2026-10-25T11:00:00Z');

test('termine quand date_fin (heure du Gabon) est dépassée', () => {
  assert.equal(isEvenementTermine(evt({ date_debut: '2026-10-25T08:00', date_fin: '2026-10-25T12:01' }), MAINTENANT), false);
  assert.equal(isEvenementTermine(evt({ date_debut: '2026-10-25T08:00', date_fin: '2026-10-25T12:00' }), MAINTENANT), true);
});

test('sans date_fin : début + 12 h', () => {
  assert.equal(isEvenementTermine(evt({ date_debut: '2026-10-25T01:00' }), MAINTENANT), false);
  assert.equal(isEvenementTermine(evt({ date_debut: '2026-10-24T23:59' }), MAINTENANT), true);
});

test('date_fin avant le début ignorée', () => {
  assert.equal(isEvenementTermine(evt({ date_debut: '2026-10-25T10:00', date_fin: '2026-10-25T09:00' }), MAINTENANT), false);
});

test('non-événement ou sans date : jamais terminé', () => {
  assert.equal(isEvenementTermine({ variants: { meta: { date_fin: '2020-01-01T00:00' } } }, MAINTENANT), false);
  assert.equal(isEvenementTermine(evt({}), MAINTENANT), false);
  assert.equal(isEvenementTermine(null, MAINTENANT), false);
});
