import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { Vendeur } from '../lib/database-types';
import { VendeurPasskeyModel } from '../models/vendeur-passkey.model';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function getWebAuthnConfig() {
  const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
  const rpName = process.env.WEBAUTHN_RP_NAME || 'Marché 241';
  const origin =
    process.env.WEBAUTHN_ORIGIN ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000';

  return { rpID, rpName, origin: origin.replace(/\/$/, '') };
}

export class PasskeyService {
  static async createRegistrationOptions(vendeur: Vendeur) {
    const { rpID, rpName } = getWebAuthnConfig();
    const existantes = await VendeurPasskeyModel.listByVendeurId(vendeur.id);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: vendeur.email || vendeur.telephone,
      userDisplayName: vendeur.nom,
      userID: new Uint8Array(Buffer.from(String(vendeur.id), 'utf8')),
      attestationType: 'none',
      excludeCredentials: existantes.map((passkey) => ({
        id: passkey.credential_id,
        transports: (passkey.transports ?? undefined) as AuthenticatorTransport[] | undefined
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      }
    });

    await VendeurPasskeyModel.saveChallenge({
      vendeur_id: vendeur.id,
      challenge: options.challenge,
      type: 'register',
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS)
    });

    return options;
  }

  static async verifyRegistration(
    vendeur: Vendeur,
    response: RegistrationResponseJSON,
    deviceName?: string
  ) {
    const { rpID, origin } = getWebAuthnConfig();
    const consumed = await VendeurPasskeyModel.consumeLatestForVendeur(vendeur.id, 'register');

    if (!consumed || Number(consumed.vendeur_id) !== Number(vendeur.id)) {
      throw new Error('Défi de clé d\'accès invalide ou expiré');
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: consumed.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Enregistrement de la clé d\'accès refusé');
    }

    const { credential } = verification.registrationInfo;
    const passkey = await VendeurPasskeyModel.create({
      vendeur_id: vendeur.id,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey),
      counter: credential.counter,
      device_name: deviceName?.slice(0, 255) || null,
      transports: credential.transports ? [...credential.transports] : null
    });

    return {
      id: passkey.id,
      device_name: passkey.device_name,
      created_at: passkey.created_at
    };
  }

  static async createAuthenticationOptions(vendeur: Vendeur) {
    const { rpID } = getWebAuthnConfig();
    const existantes = await VendeurPasskeyModel.listByVendeurId(vendeur.id);

    if (existantes.length === 0) {
      throw new Error('Aucune clé d\'accès enregistrée pour ce compte');
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: existantes.map((passkey) => ({
        id: passkey.credential_id,
        transports: (passkey.transports ?? undefined) as AuthenticatorTransport[] | undefined
      }))
    });

    await VendeurPasskeyModel.saveChallenge({
      vendeur_id: vendeur.id,
      challenge: options.challenge,
      type: 'login',
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS)
    });

    return options;
  }

  static async verifyAuthentication(response: AuthenticationResponseJSON) {
    const { rpID, origin } = getWebAuthnConfig();
    const passkey = await VendeurPasskeyModel.findByCredentialId(response.id);
    if (!passkey) {
      throw new Error('Clé d\'accès inconnue');
    }

    const consumed = await VendeurPasskeyModel.consumeLatestForVendeur(passkey.vendeur_id, 'login');
    if (!consumed || Number(consumed.vendeur_id) !== Number(passkey.vendeur_id)) {
      throw new Error('Défi de clé d\'accès invalide ou expiré');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: consumed.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkey.credential_id,
        publicKey: new Uint8Array(passkey.public_key),
        counter: Number(passkey.counter),
        transports: (passkey.transports ?? undefined) as AuthenticatorTransport[] | undefined
      }
    });

    if (!verification.verified) {
      throw new Error('Vérification de la clé d\'accès refusée');
    }

    await VendeurPasskeyModel.updateCounter(
      passkey.id,
      verification.authenticationInfo.newCounter
    );

    return passkey.vendeur_id;
  }
}
