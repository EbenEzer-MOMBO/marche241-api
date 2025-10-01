import nodemailer from 'nodemailer';

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  static initialize() {
    if (!process.env.MAIL_USERNAME || !process.env.MAIL_PASSWORD) {
      console.log('⚠️ Configuration Gmail SMTP non configurée - Emails désactivés');
      console.log('   Veuillez configurer MAIL_USERNAME et MAIL_PASSWORD dans votre fichier .env');
      return;
    }
    
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT || '587'),
      secure: false, // true pour 465, false pour autres ports
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    console.log('✅ Service email Gmail SMTP configuré');
    
    // Vérifier la connexion
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Erreur de connexion Gmail SMTP:', error);
      } else {
        console.log('✅ Connexion Gmail SMTP vérifiée avec succès');
      }
    });
  }

  /**
   * Envoie un code de vérification par email
   * @param email Email du destinataire
   * @param code Code de vérification
   * @param nom Nom du destinataire (optionnel)
   */
  static async envoyerCodeVerification(email: string, code: string, nom?: string): Promise<void> {
    try {
      if (!this.transporter) {
        this.initialize();
      }

      // Si Gmail SMTP n'est pas configuré, simuler l'envoi
      if (!this.transporter) {
        console.log('📧 Simulation envoi email (Gmail SMTP non configuré)');
        console.log(`📧 Code de vérification pour: ${email}`);
        console.log(`📧 Code: ${code}`);
        return;
      }

      const fromEmail = process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME;
      const fromName = process.env.MAIL_FROM_NAME || 'Marché 241';
      
      console.log(`[EmailService] Envoi d'email de ${fromEmail} vers ${email}`);

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: 'Code de vérification - Marché 241',
        html: this.generateVerificationEmailTemplate(nom, code),
        text: `Votre code de vérification pour Marché 241 est : ${code}. Ce code expire dans 10 minutes.`
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log('[EmailService] Email envoyé avec succès:', info.messageId);
      console.log('[EmailService] Aperçu:', nodemailer.getTestMessageUrl(info));
    } catch (error: any) {
      console.error('[EmailService] Exception lors de l\'envoi de l\'email:', error);
      throw new Error(`Erreur lors de l'envoi de l'email: ${error.message}`);
    }
  }

  /**
   * Génère le template HTML pour l'email de code de vérification
   * @param nom Nom du vendeur
   * @param code Code de vérification
   */
  private static generateVerificationEmailTemplate(nom: string | undefined, code: string): string {
    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Code de vérification - Marché 241</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                background-color: #f5f5f5;
                padding: 20px 0;
            }
            .email-container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .header {
                background-color: #000000;
                color: #ffffff;
                padding: 30px 40px;
                text-align: center;
            }
            .header img {
                max-height: 50px;
                width: auto;
                margin-bottom: 15px;
            }
            .header h1 {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
            }
            .content {
                background-color: #ffffff;
                padding: 40px;
                color: #333333;
            }
            .greeting {
                font-size: 18px;
                margin-bottom: 20px;
            }
            .code-section {
                text-align: center;
                margin: 30px 0;
            }
            .code-label {
                font-size: 16px;
                color: #666666;
                margin-bottom: 15px;
            }
            .code {
                background: linear-gradient(135deg,rgb(0, 10, 57) 0%, #764ba2 100%);
                color: #ffffff;
                font-size: 36px;
                font-weight: bold;
                padding: 20px 40px;
                border-radius: 12px;
                display: inline-block;
                letter-spacing: 8px;
                margin: 10px 0;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            }
            .warning {
                background-color: #fff8e1;
                border-left: 4px solid #ffc107;
                padding: 20px;
                margin: 25px 0;
                border-radius: 4px;
            }
            .warning-title {
                color: #f57c00;
                font-weight: 600;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
            }
            .warning-title::before {
                content: "⚠️";
                margin-right: 8px;
            }
            .warning ul {
                margin-left: 20px;
                color: #e65100;
            }
            .warning li {
                margin-bottom: 5px;
            }
            .footer {
                background-color: #000000;
                color: #ffffff;
                padding: 30px 40px;
                text-align: center;
            }
            .footer p {
                margin: 5px 0;
                font-size: 14px;
                opacity: 0.8;
            }
            .footer .copyright {
                margin-top: 15px;
                font-weight: 600;
            }
            .highlight {
                color: #667eea;
                font-weight: 600;
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <img src="${process.env.APP_URL || 'http://localhost:3000'}/images/site-logo.png" alt="Marché 241" />
                <h1>Code de vérification</h1>
            </div>
            
            <!-- Content -->
            <div class="content">
                <div class="greeting">
                    Bonjour <span class="highlight">${nom || 'cher utilisateur'}</span>,
                </div>
                
                <p>Voici votre code de vérification pour accéder à votre compte Marché 241 :</p>
                
                <div class="code-section">
                    <div class="code-label">Votre code de vérification :</div>
                    <div class="code">${code}</div>
                </div>
                
                <div class="warning">
                    <div class="warning-title">Important</div>
                    <ul>
                        <li>Ce code expire dans <strong>30 minutes</strong></li>
                        <li>Ne partagez jamais ce code avec personne</li>
                        <li>Si vous n'avez pas demandé ce code, ignorez cet email</li>
                        <li>Utilisez ce code pour finaliser votre connexion</li>
                    </ul>
                </div>
                
                <p>Si vous avez des questions ou besoin d'aide, n'hésitez pas à nous contacter.</p>
                
                <p>Merci de faire confiance à <span class="highlight">Marché 241</span> !</p>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
                <p>Pour toute question, contactez-nous à support@marche241.ga</p>
                <p class="copyright">&copy; 2025 Marché 241. Tous droits réservés.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Envoie un email de bienvenue à un nouveau vendeur
   * @param email Email du vendeur
   * @param nom Nom du vendeur
   */
  static async envoyerEmailBienvenue(email: string, nom: string): Promise<void> {
    try {
      if (!this.transporter) {
        this.initialize();
      }

      // Si Gmail SMTP n'est pas configuré, simuler l'envoi
      if (!this.transporter) {
        console.log('📧 Simulation envoi email de bienvenue (Gmail SMTP non configuré)');
        console.log(`📧 Email de bienvenue pour: ${email}`);
        return;
      }

      const fromEmail = process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME;
      const fromName = process.env.MAIL_FROM_NAME || 'Marché 241';
      
      console.log(`[EmailService] Envoi d'email de bienvenue de ${fromEmail} vers ${email}`);

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: 'Bienvenue sur Marché 241 !',
        html: this.generateWelcomeEmailTemplate(nom),
        text: `Bienvenue sur Marché 241, ${nom} ! Votre compte vendeur a été créé avec succès.`
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log('[EmailService] Email de bienvenue envoyé avec succès:', info.messageId);
    } catch (error: any) {
      console.error('[EmailService] Exception lors de l\'envoi de l\'email de bienvenue:', error);
      throw new Error(`Erreur lors de l'envoi de l'email de bienvenue: ${error.message}`);
    }
  }

  /**
   * Génère le template HTML pour l'email de bienvenue
   * @param nom Nom du vendeur
   */
  private static generateWelcomeEmailTemplate(nom: string): string {
    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bienvenue sur Marché 241</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                background-color: #f5f5f5;
                padding: 20px 0;
            }
            .email-container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .header {
                background-color: #000000;
                color: #ffffff;
                padding: 30px 40px;
                text-align: center;
            }
            .header img {
                max-height: 50px;
                width: auto;
                margin-bottom: 15px;
            }
            .header h1 {
                font-size: 28px;
                font-weight: 600;
                margin: 0;
            }
            .content {
                background-color: #ffffff;
                padding: 40px;
                color: #333333;
            }
            .greeting {
                font-size: 18px;
                margin-bottom: 20px;
                text-align: center;
            }
            .welcome-badge {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #ffffff;
                padding: 20px 40px;
                border-radius: 50px;
                display: inline-block;
                margin: 25px 0;
                font-weight: bold;
                font-size: 18px;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            }
            .welcome-section {
                text-align: center;
                margin: 30px 0;
            }
            .features {
                background-color: #f8f9fa;
                padding: 30px;
                border-radius: 12px;
                margin: 30px 0;
                border: 1px solid #e9ecef;
            }
            .features h3 {
                color: #000000;
                margin-bottom: 20px;
                font-size: 20px;
                text-align: center;
            }
            .features ul {
                list-style-type: none;
                padding: 0;
            }
            .features li {
                padding: 12px 0;
                border-bottom: 1px solid #e9ecef;
                font-size: 16px;
                display: flex;
                align-items: center;
            }
            .features li:last-child {
                border-bottom: none;
            }
            .features li::before {
                content: "✅";
                margin-right: 15px;
                font-size: 18px;
            }
            .cta {
                text-align: center;
                margin: 40px 0;
            }
            .cta-button {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #ffffff;
                padding: 18px 40px;
                text-decoration: none;
                border-radius: 12px;
                font-weight: bold;
                font-size: 16px;
                display: inline-block;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                transition: transform 0.2s ease;
            }
            .cta-button:hover {
                transform: translateY(-2px);
            }
            .support-section {
                background-color: #fff8e1;
                border-left: 4px solid #ffc107;
                padding: 20px;
                margin: 25px 0;
                border-radius: 4px;
            }
            .support-title {
                color: #f57c00;
                font-weight: 600;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
            }
            .support-title::before {
                content: "💬";
                margin-right: 8px;
            }
            .footer {
                background-color: #000000;
                color: #ffffff;
                padding: 30px 40px;
                text-align: center;
            }
            .footer p {
                margin: 5px 0;
                font-size: 14px;
                opacity: 0.8;
            }
            .footer .copyright {
                margin-top: 15px;
                font-weight: 600;
            }
            .highlight {
                color: #667eea;
                font-weight: 600;
            }
            .emoji {
                font-size: 24px;
                margin: 0 5px;
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <img src="${process.env.APP_URL || 'http://localhost:3000'}/images/site-logo.png" alt="Marché 241" />
                <h1>Bienvenue sur Marché 241 ! <span class="emoji">🎉</span></h1>
            </div>
            
            <!-- Content -->
            <div class="content">
                <div class="greeting">
                    Félicitations <span class="highlight">${nom}</span> !
                </div>
                
                <div class="welcome-section">
                    <div class="welcome-badge">
                        <span class="emoji">🚀</span> Votre compte vendeur est maintenant actif !
                    </div>
                </div>
                
                <p>Nous sommes ravis de vous accueillir sur <span class="highlight">Marché 241</span>, la plateforme de commerce électronique qui connecte les vendeurs et les acheteurs au Gabon.</p>
                
                <div class="features">
                    <h3>Ce que vous pouvez faire maintenant :</h3>
                    <ul>
                        <li>Créer votre boutique personnalisée avec votre identité</li>
                        <li>Ajouter vos produits avec photos et descriptions détaillées</li>
                        <li>Gérer vos commandes et stocks en temps réel</li>
                        <li>Suivre vos ventes et analyser vos performances</li>
                        <li>Communiquer directement avec vos clients</li>
                        <li>Recevoir vos paiements de manière sécurisée</li>
                    </ul>
                </div>
                
                <div class="cta">
                    <a href="${process.env.FRONTEND_URL || 'https://marche241.ga'}/dashboard" class="cta-button">
                        Commencer à vendre <span class="emoji">🛍️</span>
                    </a>
                </div>
                
                <div class="support-section">
                    <div class="support-title">Besoin d'aide ?</div>
                    <p>Notre équipe support est là pour vous accompagner dans vos premiers pas. N'hésitez pas à nous contacter si vous avez des questions !</p>
                </div>
                
                <p>Merci de faire confiance à <span class="highlight">Marché 241</span> pour développer votre activité commerciale.</p>
                
                <p><strong>Bonne vente et bienvenue dans la communauté Marché 241 !</strong> <span class="emoji">🎯</span></p>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
                <p>Pour toute question, contactez-nous à support@marche241.ga</p>
                <p class="copyright">&copy; 2025 Marché 241. Tous droits réservés.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }
}
