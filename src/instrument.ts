// Doit être importé avant tout autre module de l'application.
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Charger les variables d'environnement avant l'initialisation de Sentry,
// afin que SENTRY_DSN défini dans .env soit bien pris en compte.
dotenv.config();

// Sans SENTRY_DSN défini, le SDK reste désactivé (aucun envoi d'événement).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  environment: process.env.NODE_ENV || 'development',
  // Tracing
  tracesSampleRate: 1.0,
  // Set sampling rate for profiling - this is evaluated only once per SDK.init call
  profileSessionSampleRate: 1.0,
  // Trace lifecycle automatically enables profiling during active traces
  profileLifecycle: 'trace',
});
