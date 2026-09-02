// Doit être importé avant tout autre module de l'application.
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Charger les variables d'environnement avant l'initialisation de Sentry,
// afin que SENTRY_DSN défini dans .env soit bien pris en compte.
dotenv.config();

const sentryDsn = process.env.SENTRY_DSN;

if (!sentryDsn) {
  console.warn('⚠️  SENTRY_DSN manquant : aucun événement ne sera envoyé à Sentry.');
} else {
  console.log('📡 Sentry initialisé');
}

Sentry.init({
  dsn: sentryDsn,
  integrations: [
    nodeProfilingIntegration(),
  ],
  environment: process.env.NODE_ENV || 'development',
  enableLogs: true,
  tracesSampleRate: 1.0,
  profileSessionSampleRate: 1.0,
  profileLifecycle: 'trace',
});
