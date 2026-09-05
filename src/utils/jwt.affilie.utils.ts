import jwt, { SignOptions } from 'jsonwebtoken';
import { Affilie } from '../lib/database-types';

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET manquant dans la configuration serveur');
  }
  return secret;
};

/**
 * Génère un token JWT pour la session du mini dashboard affilié.
 * Session longue durée (~30 jours) : chaque appareil connecté obtient son
 * propre token indépendant, un affilié peut donc être connecté sur plusieurs
 * appareils simultanément.
 */
export const generateAffilieToken = (affilie: Affilie): string => {
  const expiresIn = (process.env.AFFILIE_JWT_EXPIRES_IN || '30d') as SignOptions['expiresIn'];

  return jwt.sign(
    {
      type: 'affilie',
      id: affilie.id,
      email: affilie.email
    },
    getJwtSecret(),
    { expiresIn }
  );
};

export const verifyAffilieToken = (token: string): { type: string; id: number; email: string } | null => {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { type: string; id: number; email: string };
    return decoded.type === 'affilie' ? decoded : null;
  } catch {
    return null;
  }
};
