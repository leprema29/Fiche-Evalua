"""
email_service.py — Service d'envoi d'emails via SMTP
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import os


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

        # Connexion SMTP
        if smtp_config.get('use_tls', True):
            server = smtplib.SMTP(smtp_config['server'], smtp_config['port'], timeout=30)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(smtp_config['server'], smtp_config['port'], timeout=30)

        server.login(smtp_config['username'], smtp_config['password'])
        server.send_message(msg)
        server.quit()

        return {'success': True, 'error': None}

    except smtplib.SMTPAuthenticationError:
        return {'success': False, 'error': 'Échec d\'authentification SMTP. Vérifiez le nom d\'utilisateur et le mot de passe.'}
    except smtplib.SMTPConnectError:
        return {'success': False, 'error': f'Impossible de se connecter au serveur {smtp_config["server"]}:{smtp_config["port"]}'}
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
        if smtp_config.get('use_tls', True):
            server = smtplib.SMTP(smtp_config['server'], smtp_config['port'], timeout=15)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(smtp_config['server'], smtp_config['port'], timeout=15)

        server.login(smtp_config['username'], smtp_config['password'])
        server.quit()
        return {'success': True, 'error': None}

    except smtplib.SMTPAuthenticationError:
        return {'success': False, 'error': 'Échec d\'authentification. Vérifiez le nom d\'utilisateur et le mot de passe.'}
    except smtplib.SMTPConnectError:
        return {'success': False, 'error': f'Impossible de se connecter à {smtp_config["server"]}:{smtp_config["port"]}'}
    except Exception as e:
        return {'success': False, 'error': str(e)}
