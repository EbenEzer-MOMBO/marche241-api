import dns from 'dns';

/**
 * Vérifie qu'un domaine email possède au moins un enregistrement MX valide.
 * Permet de rejeter les domaines inexistants (ex: test.com) avant d'envoyer
 * un email et de risquer un bounce qui pourrait déclencher une limitation
 * anti-spam chez le fournisseur SMTP.
 * @param email Adresse email à vérifier
 * @returns true si le domaine possède un MX, false sinon
 */
export const hasValidMxRecord = async (email: string): Promise<boolean> => {
  const domain = email.split('@')[1];

  if (!domain) {
    return false;
  }

  try {
    const addresses = await dns.promises.resolveMx(domain);
    return addresses.length > 0;
  } catch (error) {
    return false;
  }
};
