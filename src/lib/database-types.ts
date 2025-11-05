// Types TypeScript correspondant au schéma de base de données
// Modèle Logique de Données pour Marché 241

// Énumérations
export type StatutVendeur = 'actif' | 'inactif' | 'suspendu' | 'en_attente_verification';
export type Sexe = 'M' | 'F' | 'Autre';
export type StatutBoutique = 'active' | 'inactive' | 'en_attente' | 'suspendue';
export type StatutCategorie = 'active' | 'inactive';
export type StatutProduit = 'actif' | 'inactif' | 'brouillon' | 'archive';
export type StatutCommande = 'en_attente' | 'confirmee' | 'en_preparation' | 'expedie' | 'livree' | 'annulee' | 'remboursee';
export type StatutPaiement = 'en_attente' | 'paye' | 'echec' | 'rembourse';
export type MethodePaiement = 'mobile_money' | 'airtel_money' | 'moov_money' | 'especes' | 'virement';
export type StatutAvis = 'en_attente' | 'approuve' | 'rejete';

// Interface pour les dimensions
export interface Dimensions {
  longueur: number;
  largeur: number;
  hauteur: number;
}

// Interface pour les variantes de produit
export interface VarianteProduit {
  label: string;
  options: string[];
  required: boolean;
}

// Interface pour les variantes sélectionnées
export interface VariantesSelectionnees {
  [key: string]: string;
}

// Table vendeurs
export interface Vendeur {
  id: number;
  telephone: string; // Identifiant principal unique
  nom: string;
  email?: string; // Optionnel
  
  // Système d'authentification par code WhatsApp
  code_verification?: string; // Code à 4 chiffres
  code_expiration?: Date; // Date d'expiration du code
  tentatives_code: number; // Nombre de tentatives de saisie
  derniere_tentative?: Date; // Dernière tentative de connexion
  
  date_creation: Date;
  date_modification: Date;
  statut: StatutVendeur;
  photo_profil?: string;
  ville?: string;
  verification_telephone: boolean;
  verification_email: boolean;
  derniere_connexion?: Date;
}

// Table boutiques
export interface Boutique {
  id: number;
  nom: string;
  slug: string; // URL-friendly name
  description?: string;
  vendeur_id: number;
  logo?: string;
  couleur_primaire: string;
  couleur_secondaire: string;
  adresse?: string;
  telephone?: string;
  statut: StatutBoutique;
  date_creation: Date;
  date_modification: Date;
  nombre_produits: number;
  note_moyenne: number;
  nombre_avis: number;
  
  // Relations
  vendeur?: Vendeur;
}

// Table catégories
export interface Categorie {
  id: number;
  nom: string;
  slug: string;
  description?: string;
  parent_id?: number;
  ordre_affichage: number;
  statut: StatutCategorie;
  date_creation: Date;
  date_modification: Date;
  boutique_id?: number;
  
  // Relations
  parent?: Categorie;
  enfants?: Categorie[];
}

// Table produits
export interface Produit {
  id: number;
  nom: string;
  slug: string;
  description?: string;
  description_courte?: string;
  prix: number; // En centimes
  prix_original?: number; // En centimes
  sku?: string;
  boutique_id: number;
  categorie_id: number;
  images?: any; // JSON dans la base de données
  image_principale?: string;
  variants?: any; // JSON dans la base de données
  en_stock: boolean;
  quantite_stock: number;
  poids?: number; // En grammes
  dimensions?: any; // JSON dans la base de données
  tags?: any; // JSON dans la base de données
  note_moyenne: number;
  nombre_avis: number;
  nombre_vues: number;
  nombre_ventes: number;
  est_nouveau: boolean;
  est_en_promotion: boolean;
  est_featured: boolean;
  statut: StatutProduit;
  date_creation: Date;
  date_modification: Date;
  date_publication?: Date;
  
  // Relations
  boutique?: Boutique;
  categorie?: Categorie;
}

// Table commandes
export interface Commande {
  id: number;
  numero_commande: string; // Format: CMD-2024-001234
  boutique_id: number;
  
  // Informations client
  client_nom: string;
  client_telephone: string;
  client_adresse: string;
  client_ville: string;
  client_commune: string;
  client_instructions?: string;
  
  // Montants (en centimes)
  sous_total: number;
  frais_livraison: number;
  taxes: number;
  remise: number;
  total: number;
  
  // Statuts et paiement
  statut: StatutCommande;
  statut_paiement: StatutPaiement;
  methode_paiement?: MethodePaiement;
  
  // Dates
  date_commande: Date;
  date_confirmation?: Date;
  date_expedition?: Date;
  date_livraison?: Date;
  date_modification: Date;
  
  // Relations
  boutique?: Boutique;
  articles?: CommandeArticle[];
  transactions?: Transaction[];
}

// Table commande_articles
export interface CommandeArticle {
  id: number;
  commande_id: number;
  produit_id: number;
  nom_produit: string; // Sauvegarde du nom au moment de la commande
  prix_unitaire: number; // En centimes
  quantite: number;
  variants_selectionnes?: any; // JSON dans la base de données
  sous_total: number; // En centimes
  
  // Relations
  commande?: Commande;
  produit?: Produit;
}

// Table transactions
export interface Transaction {
  id: number;
  commande_id: number;
  reference_transaction: string; // Référence unique de la transaction
  montant: number; // Montant en centimes
  methode_paiement: MethodePaiement;
  statut: StatutPaiement;
  
  // Informations de paiement mobile
  numero_telephone?: string; // Numéro utilisé pour le paiement mobile
  reference_operateur?: string; // Référence fournie par l'opérateur (Airtel/Moov)
  
  // Dates
  date_creation: Date;
  date_confirmation?: Date; // Date de confirmation du paiement
  date_modification: Date;
  
  // Informations supplémentaires
  notes?: string; // Notes internes
  
  // Relations
  commande?: Commande;
}

// Table avis_produits
export interface AvisProduit {
  id: number;
  produit_id: number;
  commande_id?: number;
  nom_client: string;
  email_client?: string;
  telephone_client?: string;
  note: number; // 1-5
  commentaire?: string;
  statut: StatutAvis;
  date_creation: Date;
  date_moderation?: Date;
  
  // Relations
  produit?: Produit;
  commande?: Commande;
}

// Table paniers
export interface Panier {
  id: number;
  session_id: string;
  boutique_id: number;
  produit_id: number;
  quantite: number;
  variants_selectionnes?: any; // JSON dans la base de données
  date_creation: Date;
  date_modification: Date;
  
  // Relations
  boutique?: Boutique;
  produit?: Produit;
}

// Vues
export interface ProduitComplet extends Produit {
  nom_boutique: string;
  slug_boutique: string;
  logo_boutique?: string;
  nom_categorie: string;
  slug_categorie: string;
  nom_vendeur: string;
  telephone_vendeur: string;
}

export interface CommandeResume extends Commande {
  nom_boutique: string;
  nom_vendeur: string;
  telephone_vendeur: string;
  nombre_articles: number;
  quantite_totale: number;
}

// Types pour les formulaires et API
export interface CreateVendeurData {
  telephone: string;
  nom: string;
  email?: string;
  ville?: string;
}

// ===================================
// Interface pour les communes de livraison
// ===================================

export interface CommuneLivraison {
  id: number;
  boutique_id: number;
  nom_commune: string;
  code_postal?: string;
  tarif_livraison: number;
  delai_livraison_min: number;
  delai_livraison_max: number;
  est_active: boolean;
  date_creation: Date;
  date_modification: Date;
}

export interface CreateCommuneLivraison {
  boutique_id: number;
  nom_commune: string;
  code_postal?: string;
  tarif_livraison: number;
  delai_livraison_min?: number;
  delai_livraison_max?: number;
  est_active?: boolean;
}

export interface UpdateCommuneLivraison {
  nom_commune?: string;
  code_postal?: string;
  tarif_livraison?: number;
  delai_livraison_min?: number;
  delai_livraison_max?: number;
  est_active?: boolean;
}

// ===================================
// Interfaces pour l'authentification
// ===================================

// Types pour l'authentification par code email
export interface DemandeCodeVerification {
  email?: string;
  phone?: string;
}

export interface VerificationCode {
  email?: string;
  phone?: string;
  code: string;
}

export interface ConnexionVendeur {
  telephone: string;
  code: string;
}

export interface ReponseAuthentification {
  success: boolean;
  vendeur?: Vendeur;
  token?: string;
  message?: string;
  tentatives_restantes?: number;
}

export interface CreateBoutiqueData {
  nom: string;
  slug: string;
  description?: string;
  vendeur_id: number;
  logo?: string;
  couleur_primaire?: string;
  couleur_secondaire?: string;
  adresse?: string;
  telephone?: string;
}

export interface CreateProduitData {
  nom: string;
  slug: string;
  description?: string;
  description_courte?: string;
  prix: number;
  prix_original?: number;
  sku?: string;
  boutique_id: number;
  categorie_id: number;
  images?: any; // JSON dans la base de données
  image_principale?: string;
  variants?: any; // JSON dans la base de données
  quantite_stock?: number;
  poids?: number;
  dimensions?: any; // JSON dans la base de données
  tags?: any; // JSON dans la base de données
  est_nouveau?: boolean;
  est_en_promotion?: boolean;
  est_featured?: boolean;
}

export interface CreateCommandeData {
  boutique_id: number;
  client_nom: string;
  client_telephone: string;
  client_adresse: string;
  client_ville: string;
  client_commune: string;
  client_instructions?: string;
  articles: {
    produit_id: number;
    quantite: number;
    variants_selectionnes?: any; // JSON dans la base de données
  }[];
  frais_livraison?: number;
  methode_paiement?: MethodePaiement;
}

// Types pour les statistiques
export interface StatistiquesBoutique {
  nombre_produits: number;
  nombre_commandes: number;
  chiffre_affaires: number; // En centimes
  note_moyenne: number;
  nombre_avis: number;
  produits_populaires: Produit[];
  commandes_recentes: Commande[];
}

export interface StatistiquesVendeur {
  nombre_boutiques: number;
  chiffre_affaires_total: number; // En centimes
  nombre_commandes_total: number;
  boutiques: (Boutique & { statistiques: StatistiquesBoutique })[];
}

// Types pour les filtres et recherche
export interface FiltresProduits {
  categorie_id?: number;
  prix_min?: number;
  prix_max?: number;
  en_stock?: boolean;
  est_nouveau?: boolean;
  est_en_promotion?: boolean;
  note_min?: number;
  boutique_id?: number;
  recherche?: string;
  tags?: string[];
}

export interface FiltresCommandes {
  statut?: StatutCommande;
  statut_paiement?: StatutPaiement;
  date_debut?: Date;
  date_fin?: Date;
  boutique_id?: number;
  client_telephone?: string;
  numero_commande?: string;
}

// Types pour la pagination
export interface OptionsPagination {
  page: number;
  limite: number;
  tri_par?: string;
  ordre?: 'ASC' | 'DESC';
}

export interface ResultatPagine<T> {
  donnees: T[];
  total: number;
  page: number;
  limite: number;
  total_pages: number;
}