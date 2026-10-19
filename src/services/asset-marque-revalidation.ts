import { logger } from '../utils/logger';

export async function revaliderFront(): Promise<void> {
  const secret = process.env.FRONT_REVALIDATE_SECRET;
  const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (!secret || !base) {
    logger.warn('Revalidation front ignorée : FRONT_REVALIDATE_SECRET ou FRONTEND_URL absent');
    return;
  }
  try {
    const reponse = await fetch(`${base}/api/revalidate`, {
      method: 'POST',
      headers: { 'x-revalidate-secret': secret },
    });
    if (!reponse.ok) {
      logger.warn('Revalidation front refusée', reponse.status);
    }
  } catch (error) {
    logger.warn('Revalidation front échouée', error instanceof Error ? error.message : error);
  }
}
