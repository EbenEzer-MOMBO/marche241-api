import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Charger les variables d'environnement
dotenv.config();

const rawConnectionString = process.env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('La variable d\'environnement DATABASE_URL n\'est pas définie');
}

/**
 * Le paramètre `sslmode` de la chaîne est retiré au profit de l'option `ssl`
 * ci-dessous : `pg` prévoit d'en changer la sémantique dans une version
 * majeure future, et l'option explicite lève toute ambiguïté (TLS obligatoire
 * avec vérification complète du certificat, requis par Neon).
 */
const buildConnectionString = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');

    return parsed.toString();
  } catch {
    return url;
  }
};

const connectionString = buildConnectionString(rawConnectionString);

/**
 * Pool de connexions Postgres (Neon).
 * Utiliser la chaîne de connexion "pooled" de Neon (hôte contenant `-pooler`).
 */
export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: true },
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (error: Error): void => {
  logger.error('Erreur inattendue sur une connexion Postgres inactive:', error);
});

/**
 * Exécute une requête SQL sur le pool.
 * @param text Requête SQL paramétrée
 * @param params Valeurs des paramètres ($1, $2, ...)
 */
export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> => {
  return pool.query<T>(text, params);
};

/**
 * Exécute une série d'opérations dans une transaction SQL.
 * Le client passé au callback doit être utilisé pour toutes les requêtes
 * de la transaction, sinon l'atomicité est perdue.
 * @param fn Callback recevant le client dédié à la transaction
 */
export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Vérifie que la connexion à la base est fonctionnelle.
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    const { rows } = await query<{ now: Date }>('SELECT NOW() AS now');
    logger.info('Connexion Postgres établie:', rows[0]?.now);

    return true;
  } catch (error) {
    logger.error('Impossible de se connecter à Postgres:', error);

    return false;
  }
};

/**
 * Ferme proprement le pool de connexions.
 */
export const closePool = async (): Promise<void> => {
  await pool.end();
};
