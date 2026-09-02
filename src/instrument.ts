// Doit être importé avant tout autre module de l'application.
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://a77be31c6f31600e0f0d78ab9fd7cc04@o4512016336814080.ingest.de.sentry.io/4512016359948368',
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
