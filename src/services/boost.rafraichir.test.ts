import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoostService, estEchu } from './boost.service';
import { Boost } from '../lib/database-types';

test('rafraîchissement à la demande : rien pour un boost hors diffusion ou synchronisé récemment', async () => {
  const base = { id: 1, meta_campaign_id: 'c1', statut: 'actif', date_derniere_synchro: new Date() } as unknown as Boost;
  assert.equal(await BoostService.rafraichirSiPerime(base), base, 'synchro de moins de 15 min');
  const brouillon = { ...base, statut: 'brouillon', date_derniere_synchro: null } as unknown as Boost;
  assert.equal(await BoostService.rafraichirSiPerime(brouillon), brouillon, 'hors diffusion');
  const sansCampagne = { ...base, meta_campaign_id: null, date_derniere_synchro: null } as unknown as Boost;
  assert.equal(await BoostService.rafraichirSiPerime(sansCampagne), sansCampagne, 'pas encore publié');
});

test('boost échu : date de fin dépassée, quelle que soit la fraîcheur des stats', () => {
  const maintenant = Date.parse('2026-10-15T22:00:00Z');
  assert.equal(estEchu({ date_fin: new Date('2026-10-15T21:49:29Z') } as any, maintenant), true);
  assert.equal(estEchu({ date_fin: new Date('2026-10-16T21:49:29Z') } as any, maintenant), false);
  assert.equal(estEchu({ date_fin: null } as any, maintenant), false);
});
