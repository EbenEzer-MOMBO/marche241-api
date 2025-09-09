import jwt, { SignOptions } from 'jsonwebtoken';
import { Vendeur } from '../lib/database-types';

/**
 * Génère un token JWT pour un vendeur
 * @param vendeur Le vendeur pour lequel générer le token
 * @returns Le token JWT
 */
export const generateToken = (vendeur: Vendeur): string => {
  const secret = process.env.JWT_SECRET || 'default_secret';
  
  // Utiliser une valeur par défaut sans passer par process.env pour éviter les problèmes de type
  const options: SignOptions = {
    expiresIn: '7d'
  };
  
  return jwt.sign(
    {
      id: vendeur.id,
      telephone: vendeur.telephone,
      nom: vendeur.nom
    },
    secret,
    options
  );
};

/**
 * Vérifie un token JWT
 * @param token Le token à vérifier
 * @returns Les données décodées du token ou null si invalide
 */
export const verifyToken = (token: string): any | null => {
  try {
    const secret = process.env.JWT_SECRET || 'default_secret';
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
};
