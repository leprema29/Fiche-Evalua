"""
email_service.py — Service d'envoi d'emails via SMTP
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import os


import logging

logger = logging.getLogger(__name__)


def _connect_smtp(smtp_config, timeout=15):
    """
    Tente une connexion SMTP intelligente basée sur le port :
    - Port 465 → SSL direct
    - Port 587/25/autre → STARTTLS
    Si la première méthode échoue, essaie l'autre.

    Returns:
        smtplib.SMTP: connexion SMTP authentifiée
    Raises:
        Exception si les deux méthodes échouent
    """
    server_addr = smtp_config['server']
    port = smtp_config['port']
    username = smtp_config['username']
    password = smtp_config['password']

    # Auto-détection basée sur le port (plus fiable que le checkbox TLS)
    if port == 465:
        methods = ['ssl', 'starttls']
    else:
        # Port 587, 25, ou autre → STARTTLS d'abord
        methods = ['starttls', 'ssl']

    last_error = None
    for method in methods:
        try:
            logger.info(f"SMTP: tentative {method} sur {server_addr}:{port}")
            if method == 'starttls':
                server = smtplib.SMTP(server_addr, port, timeout=timeout)
                server.ehlo()
                server.starttls()
                server.ehlo()
            else:
                server = smtplib.SMTP_SSL(server_addr, port, timeout=timeout)

            server.login(username, password)
            logger.info(f"SMTP: connexion {method} réussie sur {server_addr}:{port}")
            return server
        except (smtplib.SMTPAuthenticationError, smtplib.SMTPRecipientsRefused):
            raise  # Ne pas fallback pour les erreurs d'auth
        except Exception as e:
            logger.warning(f"SMTP: {method} échoué sur {server_addr}:{port} — {e}")
            last_error = e
            continue

    raise last_error or Exception(f'Impossible de se connecter à {server_addr}:{port} (SSL et STARTTLS échoués)')


def send_email(smtp_config, recipient_email, subject, body_text, attachment_path=None, attachment_name=None):
    """
    Envoie un email avec pièce jointe optionnelle.

    Args:
        smtp_config: dict avec server, port, username, password, use_tls, sender_email, sender_name
        recipient_email: adresse du destinataire
        subject: sujet de l'email
        body_text: corps du message (texte brut)
        attachment_path: chemin vers le fichier à joindre
        attachment_name: nom du fichier joint dans l'email

    Returns:
        dict: {'success': bool, 'error': str|None}
    """
    try:
        msg = MIMEMultipart()
        msg['From'] = f"{smtp_config['sender_name']} <{smtp_config['sender_email']}>"
        msg['To'] = recipient_email
        msg['Subject'] = subject

        msg.attach(MIMEText(body_text, 'plain', 'utf-8'))

        # Pièce jointe
        if attachment_path and os.path.exists(attachment_path):
            with open(attachment_path, 'rb') as f:
                part = MIMEBase('application', 'vnd.openxmlformats-officedocument.wordprocessingml.document')
                part.set_payload(f.read())
                encoders.encode_base64(part)
                fname = attachment_name or os.path.basename(attachment_path)
                part.add_header('Content-Disposition', f'attachment; filename="{fname}"')
                msg.attach(part)

        server = _connect_smtp(smtp_config, timeout=30)
        server.send_message(msg)
        server.quit()

        return {'success': True, 'error': None}

    except smtplib.SMTPAuthenticationError:
        return {'success': False, 'error': 'Échec d\'authentification SMTP. Vérifiez le nom d\'utilisateur et le mot de passe.'}
    except smtplib.SMTPRecipientsRefused:
        return {'success': False, 'error': f'Adresse destinataire refusée : {recipient_email}'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def test_smtp_connection(smtp_config):
    """
    Teste la connexion SMTP sans envoyer d'email.

    Returns:
        dict: {'success': bool, 'error': str|None}
    """
    try:
        server = _connect_smtp(smtp_config, timeout=15)
        server.quit()
        return {'success': True, 'error': None}

    except smtplib.SMTPAuthenticationError:
        return {'success': False, 'error': 'Échec d\'authentification. Vérifiez le nom d\'utilisateur et le mot de passe.'}
    except Exception as e:
        return {'success': False, 'error': str(e)}
