import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Vérifier que les variables d'environnement nécessaires sont définies
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error('Les variables d\'environnement Supabase ne sont pas définies');
}

// Créer un client Supabase avec la clé anonyme (pour les requêtes côté client)
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Créer un client Supabase avec la clé de service (pour les opérations administratives)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
