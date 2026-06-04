import rateLimit from 'express-rate-limit';

/**
 * Limiteur de débit global standard (100 requêtes par 15 minutes par IP)
 */
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limite chaque IP à 100 requêtes par windowMs
  standardHeaders: true, // Retourne les infos de limite dans les headers `RateLimit-*`
  legacyHeaders: false, // Désactive les headers `X-RateLimit-*`
  message: {
    success: false,
    message: 'Trop de requêtes effectuées depuis cette adresse IP, veuillez réessayer plus tard.',
    code: 'TOO_MANY_REQUESTS'
  }
});

/**
 * Limiteur de débit strict pour la création de commandes (5 requêtes par 15 minutes par IP)
 * Évite les attaques d'injection de fausses commandes en boucle.
 */
export const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limite chaque IP à 5 créations de commande par windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Nombre maximal de commandes atteint pour cette adresse IP. Veuillez patienter avant de réessayer.',
    code: 'TOO_MANY_COMMANDS'
  }
});

/**
 * Limiteur de débit strict pour l'initialisation de paiements (5 requêtes par 15 minutes par IP)
 */
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limite chaque IP à 5 initiations de paiement par windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Nombre maximal de tentatives de paiement atteint pour cette adresse IP. Veuillez patienter avant de réessayer.',
    code: 'TOO_MANY_PAYMENT_ATTEMPTS'
  }
});

/**
 * Limiteur de débit strict pour l'envoi de messages et vérifications WhatsApp anonymes (3 requêtes par 15 minutes par IP)
 */
export const whatsappLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limite à 3 requêtes par windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de requêtes de messagerie WhatsApp pour cette adresse IP. Veuillez réessayer dans 15 minutes.',
    code: 'TOO_MANY_WHATSAPP_REQUESTS'
  }
});

