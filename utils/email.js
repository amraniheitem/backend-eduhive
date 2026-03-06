// utils/email.js
require('dotenv').config();

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendVerificationEmail = async (email, verificationCode, firstName) => {
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: {
                    name: 'EduHive',
                    email: process.env.SENDER_EMAIL
                },
                to: [{ email: email, name: firstName }],
                subject: 'Votre code de vérification EduHive',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Bonjour ${firstName},</h2>
                        <p>Votre code de vérification est :</p>
                        <h1 style="color: #4CAF50; font-size: 32px; letter-spacing: 5px; text-align: center;">
                            ${verificationCode}
                        </h1>
                        <p>Ce code expire dans 10 minutes.</p>
                        <p style="color: #666; font-size: 12px;">
                            Si vous n'avez pas demandé ce code, ignorez cet email.
                        </p>
                    </div>
                `
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Erreur Brevo:', data);
            throw new Error(`Échec de l'envoi de l'email : ${data.message || 'Erreur inconnue'}`);
        }

        console.log('✅ Email envoyé avec succès à:', email);
        return data;

    } catch (error) {
        console.error('❌ Erreur envoi email:', error);
        throw new Error(`Échec de l'envoi de l'email : ${error.message}`);
    }
};

module.exports = {
    sendVerificationEmail,
    generateVerificationCode
};
