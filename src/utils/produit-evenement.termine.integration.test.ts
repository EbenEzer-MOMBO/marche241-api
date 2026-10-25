/**
 * Cohérence SQL / TypeScript de la règle « événement terminé » : applique la migration 045 sur une base
 * Postgres LOCALE jetable et compare `evenement_fin()` à `isEvenementTermine()`. Ignoré sauf si
 * EVENEMENT_IT_DATABASE_URL est défini, par ex. :
 *   EVENEMENT_IT_DATABASE_URL=postgres://postgres@localhost:5599/postgres npm test
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { isEvenementTermine } from './produit-evenement';

const URL_BASE_TEST = process.env.EVENEMENT_IT_DATABASE_URL;

const CAS: Array<Record<string, unknown>> = [
  { type: 'evenement', meta: { date_debut: '2026-10-25T08:00', date_fin: '2026-10-25T12:00' } },
  { type: 'evenement', meta: { date_debut: '2026-10-25T08:00', date_fin: '2026-10-25T12:01' } },
  { type: 'evenement', meta: { date_debut: '2026-10-25T08:00' } },
  { type: 'evenement', meta: { date_debut: '2026-10-24T23:59' } },
  { type: 'evenement', meta: { date_debut: '2026-10-25T10:00', date_fin: '2026-10-25T09:00' } },
  { type: 'evenement', meta: { date_debut: '2026-10-25T10:00', date_fin: '2026-02-31T10:00' } },
  { type: 'evenement', meta: { date_fin: '2026-10-25T25:99' } },
  { type: 'evenement', meta: { date_fin: '2026-10-25 09:00' } },
  { type: 'evenement', meta: { date_fin: '2026-10-25T09:00:00Z' } },
  { type: 'evenement', meta: { date_fin: '2026-10-25T09:00:00+01:00' } },
  { type: 'evenement', meta: {} },
  { meta: { date_fin: '2020-01-01T00:00' } }
];

describe('evenement_fin (SQL) = isEvenementTermine (TS)', { skip: !URL_BASE_TEST }, () => {
  let client: Client;
  before(async () => {
    client = new Client({ connectionString: URL_BASE_TEST });
    await client.connect();
    const migration = fs.readFileSync(path.join(__dirname, '../../migrations/045_evenement_fin_fonction.sql'), 'utf8');
    await client.query(migration);
  });
  after(async () => {
    await client?.end();
  });

  test('même verdict pour chaque cas, sans erreur SQL', async () => {
    const maintenant = Date.parse('2026-10-25T11:00:00Z');
    for (const variants of CAS) {
      const { rows } = await client.query<{ termine: boolean | null }>(
        `SELECT (evenement_fin($1::json) <= $2::timestamptz) AS termine`,
        [JSON.stringify(variants), new Date(maintenant).toISOString()]
      );
      assert.equal(rows[0].termine === true, isEvenementTermine({ variants }, maintenant), JSON.stringify(variants));
    }
  });
});
