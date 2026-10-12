/**
 * `marquerTentative` contre une base Postgres LOCALE jetable (jamais Neon).
 * Ignoré sauf si AVIS_IT_DATABASE_URL est défini, par ex. :
 *   AVIS_IT_DATABASE_URL=postgresql://ubuntu@/avis_it?host=/var/run/postgresql npm test
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const URL_BASE_TEST = process.env.AVIS_IT_DATABASE_URL;

interface LigneInvitation {
  canal: string | null;
  envoyee_le: Date | null;
  tentatives: number;
  derniere_tentative_le: Date | null;
}

describe('AvisInvitationModel.marquerTentative', { skip: URL_BASE_TEST ? false : 'AVIS_IT_DATABASE_URL non défini' }, () => {
  let sql: Client;

  before(async () => {
    if (/neon\.tech/i.test(URL_BASE_TEST!)) throw new Error('Refus : le test ne doit jamais viser Neon');
    process.env.DATABASE_URL = URL_BASE_TEST;
    process.env.DATABASE_SSL = 'false';

    sql = new Client({ connectionString: URL_BASE_TEST });
    await sql.connect();
    await sql.query('DROP TABLE IF EXISTS avis_invitations');
    await sql.query(`CREATE TABLE avis_invitations (
      id SERIAL PRIMARY KEY,
      canal VARCHAR(20),
      envoyee_le TIMESTAMPTZ,
      tentatives SMALLINT NOT NULL DEFAULT 0,
      derniere_tentative_le TIMESTAMPTZ,
      CONSTRAINT avis_invitations_canal_valide CHECK (canal IS NULL OR canal IN ('meta', 'green_api', 'echec'))
    )`);
    await sql.query('INSERT INTO avis_invitations (id) VALUES (1)');
  });

  after(async () => {
    await sql?.query('DROP TABLE IF EXISTS avis_invitations');
    await sql?.end();
    if (URL_BASE_TEST) {
      const { closePool } = await import('../config/database');
      await closePool();
    }
  });

  test('échec laisse envoyee_le inchangé, succès le renseigne, tentatives toujours incrémentées', async () => {
    const { AvisInvitationModel } = await import('./avis.model');

    await AvisInvitationModel.marquerTentative(1, 'echec');
    const echec = await lire(sql);
    assert.equal(echec.canal, 'echec');
    assert.equal(echec.envoyee_le, null);
    assert.equal(echec.tentatives, 1);
    assert.ok(echec.derniere_tentative_le instanceof Date);

    await AvisInvitationModel.marquerTentative(1, 'meta');
    const meta = await lire(sql);
    assert.equal(meta.canal, 'meta');
    assert.ok(meta.envoyee_le instanceof Date);
    assert.equal(meta.tentatives, 2);
    const envoyeeApresMeta = meta.envoyee_le;

    await AvisInvitationModel.marquerTentative(1, 'echec');
    const echecApresEnvoi = await lire(sql);
    assert.equal(echecApresEnvoi.canal, 'echec');
    assert.equal(echecApresEnvoi.envoyee_le?.toISOString(), envoyeeApresMeta?.toISOString());
    assert.equal(echecApresEnvoi.tentatives, 3);

    await AvisInvitationModel.marquerTentative(1, 'green_api');
    const green = await lire(sql);
    assert.equal(green.canal, 'green_api');
    assert.ok(green.envoyee_le instanceof Date);
    assert.ok(green.envoyee_le.getTime() >= envoyeeApresMeta!.getTime());
    assert.equal(green.tentatives, 4);
  });
});

async function lire(sql: Client): Promise<LigneInvitation> {
  const { rows } = await sql.query<LigneInvitation>(
    `SELECT canal, envoyee_le, tentatives, derniere_tentative_le
     FROM avis_invitations WHERE id = 1`
  );
  return rows[0];
}
