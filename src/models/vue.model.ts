import { supabaseAdmin } from '../config/supabase';

export type TypeEntiteVue = 'boutique' | 'produit';

export interface VueTracking {
  id: number;
  type_entite: TypeEntiteVue;
  entite_id: number;
  ip_address: string;
  user_agent?: string;
  referer?: string;
  date_vue: Date;
}

export interface StatsVues {
  vues_totales: number;
  vues_aujourd_hui: number;
  vues_7_jours: number;
  vues_30_jours: number;
}

export class VueModel {
  private static readonly TABLE_NAME = 'vues_tracking';

  /**
   * Enregistre une vue pour une entité (boutique ou produit)
   * Retourne true si c'est une nouvelle vue, false si déjà vue aujourd'hui
   */
  static async enregistrerVue(
    typeEntite: TypeEntiteVue,
    entiteId: number,
    ipAddress: string,
    userAgent?: string,
    referer?: string
  ): Promise<boolean> {
    console.log(`[VueModel] Enregistrement vue ${typeEntite} ${entiteId} depuis IP ${ipAddress}`);
    
    try {
      // Appeler la fonction SQL pour enregistrer la vue
      const { data, error } = await supabaseAdmin.rpc('enregistrer_vue', {
        p_type_entite: typeEntite,
        p_entite_id: entiteId,
        p_ip_address: ipAddress,
        p_user_agent: userAgent || null,
        p_referer: referer || null
      });

      if (error) {
        console.error(`[VueModel] Erreur RPC enregistrer_vue:`, error);
        // Fallback: essayer d'insérer directement
        return await this.enregistrerVueDirecte(typeEntite, entiteId, ipAddress, userAgent, referer);
      }

      console.log(`[VueModel] Nouvelle vue enregistrée: ${data}`);
      return data === true;
    } catch (error) {
      console.error(`[VueModel] Exception dans enregistrerVue:`, error);
      // Fallback: essayer d'insérer directement
      return await this.enregistrerVueDirecte(typeEntite, entiteId, ipAddress, userAgent, referer);
    }
  }

  /**
   * Méthode de fallback pour enregistrer une vue directement sans fonction RPC
   */
  private static async enregistrerVueDirecte(
    typeEntite: TypeEntiteVue,
    entiteId: number,
    ipAddress: string,
    userAgent?: string,
    referer?: string
  ): Promise<boolean> {
    console.log(`[VueModel] Tentative d'enregistrement direct de la vue`);
    
    try {
      // Vérifier si une vue existe déjà pour aujourd'hui
      const today = new Date().toISOString().split('T')[0];
      
      const { data: existingVue, error: checkError } = await supabaseAdmin
        .from(this.TABLE_NAME)
        .select('id')
        .eq('type_entite', typeEntite)
        .eq('entite_id', entiteId)
        .eq('ip_address', ipAddress)
        .gte('date_vue', `${today}T00:00:00`)
        .lt('date_vue', `${today}T23:59:59`)
        .maybeSingle();

      if (checkError) {
        console.error(`[VueModel] Erreur lors de la vérification:`, checkError);
        return false;
      }

      // Si déjà vue aujourd'hui, ne pas enregistrer
      if (existingVue) {
        console.log(`[VueModel] Vue déjà enregistrée aujourd'hui pour cette IP`);
        return false;
      }

      // Insérer la nouvelle vue
      const { error: insertError } = await supabaseAdmin
        .from(this.TABLE_NAME)
        .insert({
          type_entite: typeEntite,
          entite_id: entiteId,
          ip_address: ipAddress,
          user_agent: userAgent,
          referer: referer
        });

      if (insertError) {
        // Si erreur de contrainte unique, c'est que la vue existe déjà
        if (insertError.code === '23505') {
          console.log(`[VueModel] Vue déjà existante (contrainte unique)`);
          return false;
        }
        console.error(`[VueModel] Erreur lors de l'insertion:`, insertError);
        return false;
      }

      // Incrémenter le compteur de vues
      await this.incrementerCompteurVues(typeEntite, entiteId);
      
      console.log(`[VueModel] Vue enregistrée avec succès`);
      return true;
    } catch (error) {
      console.error(`[VueModel] Exception dans enregistrerVueDirecte:`, error);
      return false;
    }
  }

  /**
   * Incrémente le compteur de vues d'une entité
   */
  private static async incrementerCompteurVues(
    typeEntite: TypeEntiteVue,
    entiteId: number
  ): Promise<void> {
    const tableName = typeEntite === 'boutique' ? 'boutiques' : 'produits';
    
    try {
      // Récupérer le nombre actuel de vues
      const { data: entity, error: fetchError } = await supabaseAdmin
        .from(tableName)
        .select('nombre_vues')
        .eq('id', entiteId)
        .single();

      if (fetchError) {
        console.error(`[VueModel] Erreur lors de la récupération de ${tableName}:`, fetchError);
        return;
      }

      const nombreVuesActuel = entity?.nombre_vues || 0;

      // Mettre à jour le compteur
      const { error: updateError } = await supabaseAdmin
        .from(tableName)
        .update({ nombre_vues: nombreVuesActuel + 1 })
        .eq('id', entiteId);

      if (updateError) {
        console.error(`[VueModel] Erreur lors de l'incrémentation:`, updateError);
      }
    } catch (error) {
      console.error(`[VueModel] Exception dans incrementerCompteurVues:`, error);
    }
  }

  /**
   * Récupère les statistiques de vues pour une entité
   */
  static async getStatsVues(
    typeEntite: TypeEntiteVue,
    entiteId: number
  ): Promise<StatsVues> {
    console.log(`[VueModel] Récupération stats vues ${typeEntite} ${entiteId}`);
    
    try {
      // Essayer d'utiliser la fonction RPC
      const { data, error } = await supabaseAdmin.rpc('stats_vues', {
        p_type_entite: typeEntite,
        p_entite_id: entiteId
      });

      if (error) {
        console.error(`[VueModel] Erreur RPC stats_vues:`, error);
        // Fallback: calculer manuellement
        return await this.getStatsVuesDirectes(typeEntite, entiteId);
      }

      if (data && data.length > 0) {
        return {
          vues_totales: data[0].vues_totales || 0,
          vues_aujourd_hui: data[0].vues_aujourd_hui || 0,
          vues_7_jours: data[0].vues_7_jours || 0,
          vues_30_jours: data[0].vues_30_jours || 0
        };
      }

      return { vues_totales: 0, vues_aujourd_hui: 0, vues_7_jours: 0, vues_30_jours: 0 };
    } catch (error) {
      console.error(`[VueModel] Exception dans getStatsVues:`, error);
      return await this.getStatsVuesDirectes(typeEntite, entiteId);
    }
  }

  /**
   * Méthode de fallback pour calculer les stats directement
   */
  private static async getStatsVuesDirectes(
    typeEntite: TypeEntiteVue,
    entiteId: number
  ): Promise<StatsVues> {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Total
      const { count: total } = await supabaseAdmin
        .from(this.TABLE_NAME)
        .select('*', { count: 'exact', head: true })
        .eq('type_entite', typeEntite)
        .eq('entite_id', entiteId);

      // Aujourd'hui
      const { count: aujourdhui } = await supabaseAdmin
        .from(this.TABLE_NAME)
        .select('*', { count: 'exact', head: true })
        .eq('type_entite', typeEntite)
        .eq('entite_id', entiteId)
        .gte('date_vue', `${today}T00:00:00`);

      // 7 jours
      const { count: septJours } = await supabaseAdmin
        .from(this.TABLE_NAME)
        .select('*', { count: 'exact', head: true })
        .eq('type_entite', typeEntite)
        .eq('entite_id', entiteId)
        .gte('date_vue', sevenDaysAgo);

      // 30 jours
      const { count: trenteJours } = await supabaseAdmin
        .from(this.TABLE_NAME)
        .select('*', { count: 'exact', head: true })
        .eq('type_entite', typeEntite)
        .eq('entite_id', entiteId)
        .gte('date_vue', thirtyDaysAgo);

      return {
        vues_totales: total || 0,
        vues_aujourd_hui: aujourdhui || 0,
        vues_7_jours: septJours || 0,
        vues_30_jours: trenteJours || 0
      };
    } catch (error) {
      console.error(`[VueModel] Exception dans getStatsVuesDirectes:`, error);
      return { vues_totales: 0, vues_aujourd_hui: 0, vues_7_jours: 0, vues_30_jours: 0 };
    }
  }

  /**
   * Récupère les vues récentes pour une entité
   */
  static async getVuesRecentes(
    typeEntite: TypeEntiteVue,
    entiteId: number,
    limite: number = 100
  ): Promise<VueTracking[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.TABLE_NAME)
        .select('*')
        .eq('type_entite', typeEntite)
        .eq('entite_id', entiteId)
        .order('date_vue', { ascending: false })
        .limit(limite);

      if (error) {
        console.error(`[VueModel] Erreur lors de la récupération des vues récentes:`, error);
        return [];
      }

      return data as VueTracking[];
    } catch (error) {
      console.error(`[VueModel] Exception dans getVuesRecentes:`, error);
      return [];
    }
  }

  /**
   * Nettoie les anciennes vues (à appeler périodiquement)
   */
  static async nettoyerAnciennesVues(joursRetention: number = 90): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin.rpc('nettoyer_anciennes_vues', {
        p_jours_retention: joursRetention
      });

      if (error) {
        console.error(`[VueModel] Erreur lors du nettoyage:`, error);
        return 0;
      }

      console.log(`[VueModel] ${data} anciennes vues supprimées`);
      return data || 0;
    } catch (error) {
      console.error(`[VueModel] Exception dans nettoyerAnciennesVues:`, error);
      return 0;
    }
  }
}
