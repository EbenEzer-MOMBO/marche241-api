import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoostService } from './boost.service';
import { Boost } from '../lib/database-types';

test('rafraîchissement à la demande : rien pour un boost hors diffusion ou synchronisé récemment', async () => {
  const base = { id: 1, meta_campaign_id: 'c1', statut: 'actif', date_derniere_synchro: new Date() } as unknown as Boost;
  assert.equal(await BoostService.rafraichirSiPerime(base), base, 'synchro de moins de 15 min');
  const brouillon = { ...base, statut: 'brouillon', date_derniere_synchro: null } as unknown as Boost;
  assert.equal(await BoostService.rafraichirSiPerime(brouillon), brouillon, 'hors diffusion');
  const sansCampagne = { ...base, meta_campaign_id: null, date_derniere_synchro: null } as unknown as Boost;
  assert.equal(await BoostService.rafraichirSiPerime(sansCampagne), sansCampagne, 'pas encore publié');
});
