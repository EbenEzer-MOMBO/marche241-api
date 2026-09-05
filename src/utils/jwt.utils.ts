import jwt, { SignOptions } from 'jsonwebtoken';
import { Vendeur } from '../lib/database-types';

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET manquant dans la configuration serveur');
  }
  return secret;
};

/**
 * Génère un token JWT pour un vendeur
 */
export const generateToken = (vendeur: Vendeur): string => {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

  return jwt.sign(
    {
      type: 'vendeur',
      id: vendeur.id,
      telephone: vendeur.telephone,
      nom: vendeur.nom,
      email: vendeur.email
    },
    getJwtSecret(),
    { expiresIn }
  );
};

/**
 * Vérifie un token JWT
 */
export const verifyToken = (token: string): any | null => {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
};
