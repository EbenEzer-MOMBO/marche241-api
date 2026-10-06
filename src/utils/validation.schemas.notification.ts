import Joi from 'joi';
import { CODES_EVENEMENTS } from '../config/notifications.config';

/** Schémas Joi des notifications Telegram (messages en français). */

const evenement = Joi.string().valid(...CODES_EVENEMENTS).messages({
  'any.only': 'Événement de notification inconnu',
  'string.base': 'Événement de notification invalide'
});

export const notificationsTelegramSchema = Joi.object({
  chat_id: Joi.string()
    .trim()
    .pattern(/^(@[A-Za-z0-9_]{5,32}|-?\d{5,20})$/)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Le canal doit être un nom du type @mon_canal ou un identifiant numérique (ex. -1001234567890)',
      'string.base': 'Le canal est invalide'
    }),
  actif: Joi.boolean().required().messages({
    'any.required': 'Indiquez si les notifications sont actives',
    'boolean.base': 'L’activation doit être vrai ou faux'
  }),
  evenements: Joi.array().items(evenement).unique().required().messages({
    'any.required': 'La liste des événements est obligatoire',
    'array.base': 'La liste des événements est invalide',
    'array.unique': 'Un événement est en double'
  }),
  modifie_par: Joi.string().trim().max(120).allow(null, '').messages({
    'string.max': 'Le nom ne doit pas dépasser 120 caractères'
  })
});

export const notificationEvenementSchema = Joi.object({
  evenement: evenement.required().messages({ 'any.required': "L'événement est obligatoire" }),
  titre: Joi.string().trim().min(2).max(200).required().messages({
    'any.required': 'Le titre est obligatoire',
    'string.empty': 'Le titre est obligatoire',
    'string.min': 'Le titre doit contenir au moins 2 caractères',
    'string.max': 'Le titre ne doit pas dépasser 200 caractères'
  }),
  lignes: Joi.array().items(Joi.string().trim().max(500).allow('')).max(15).default([]).messages({
    'array.max': '15 lignes maximum',
    'string.max': 'Une ligne ne doit pas dépasser 500 caractères'
  }),
  lien: Joi.string().trim().pattern(/^\/[^\s]*$/).max(300).allow(null, '').messages({
    'string.pattern.base': 'Le lien doit être un chemin du back-office commençant par /'
  })
});
