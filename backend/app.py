"""
app.py — Application Flask principale
Gère l'API REST pour l'envoi d'emails et la planification automatique.
"""
import os
import tempfile
import logging
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from apscheduler.schedulers.background import BackgroundScheduler

from models import db, Admin, SmtpConfig, Employee, TaskTemplate, TaskAssignment, EmailLog
from email_service import send_email, test_smtp_connection
from docx_service import generate_fiche

# === CONFIG ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)

app = Flask(__name__, static_folder=PARENT_DIR, static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'fiche-eval-secret-key-change-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(BASE_DIR, "instance", "fiche_eval.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

CORS(app)
db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# === SCHEDULER ===
scheduler = BackgroundScheduler()


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(Admin, int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({'error': 'Non authentifié'}), 401


# === INITIALISATION ===
def init_db():
    """Crée les tables et le compte admin par défaut."""
    os.makedirs(os.path.join(BASE_DIR, 'instance'), exist_ok=True)
    db.create_all()
    if not Admin.query.first():
        admin = Admin(username='admin')
        admin.set_password('admin')
        db.session.add(admin)
        db.session.commit()
        logger.info("Compte admin créé (login: admin / mdp: admin)")
    if not SmtpConfig.query.first():
        db.session.add(SmtpConfig())
        db.session.commit()


# === ROUTES STATIQUES ===
@app.route('/')
def index():
    return send_from_directory(PARENT_DIR, 'index.html')


@app.route('/css/<path:filename>')
def css(filename):
    return send_from_directory(os.path.join(PARENT_DIR, 'css'), filename)


@app.route('/js/<path:filename>')
def js(filename):
    return send_from_directory(os.path.join(PARENT_DIR, 'js'), filename)


# === AUTH API ===
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json()
    admin = Admin.query.filter_by(username=data.get('username', '')).first()
    if admin and admin.check_password(data.get('password', '')):
        login_user(admin)
        return jsonify({'success': True, 'username': admin.username})
    return jsonify({'error': 'Identifiants incorrects'}), 401


@app.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    logout_user()
    return jsonify({'success': True})


@app.route('/api/auth/status')
def api_auth_status():
    if current_user.is_authenticated:
        return jsonify({'authenticated': True, 'username': current_user.username})
    return jsonify({'authenticated': False})


@app.route('/api/auth/change-password', methods=['POST'])
@login_required
def api_change_password():
    data = request.get_json()
    if not current_user.check_password(data.get('current_password', '')):
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 400
    current_user.set_password(data['new_password'])
    db.session.commit()
    return jsonify({'success': True})


# === SMTP CONFIG API ===
@app.route('/api/smtp', methods=['GET'])
@login_required
def get_smtp():
    config = SmtpConfig.query.first()
    return jsonify(config.to_dict() if config else {})


@app.route('/api/smtp', methods=['POST'])
@login_required
def update_smtp():
    data = request.get_json()
    config = SmtpConfig.query.first()
    if not config:
        config = SmtpConfig()
        db.session.add(config)

    config.server = data.get('server', config.server)
    config.port = data.get('port', config.port)
    config.username = data.get('username', config.username)
    if data.get('password'):  # Ne mettre à jour que si fourni
        config.password = data['password']
    config.use_tls = data.get('use_tls', config.use_tls)
    config.sender_email = data.get('sender_email', config.sender_email)
    config.sender_name = data.get('sender_name', config.sender_name)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/smtp/test', methods=['POST'])
@login_required
def test_smtp():
    config = SmtpConfig.query.first()
    if not config:
        return jsonify({'error': 'Configuration SMTP non trouvée. Sauvegardez d\'abord.'}), 400
    if not config.server:
        return jsonify({'error': 'Serveur SMTP manquant'}), 400
    if not config.username:
        return jsonify({'error': 'Nom d\'utilisateur SMTP manquant'}), 400
    if not config.password:
        return jsonify({'error': 'Mot de passe SMTP manquant'}), 400
    result = test_smtp_connection({
        'server': config.server,
        'port': config.port,
        'username': config.username,
        'password': config.password,
        'use_tls': config.use_tls
    })
    return jsonify(result)


# === EMPLOYEE SYNC API ===
@app.route('/api/employees/sync', methods=['POST'])
@login_required
def sync_employees():
    """Synchronise les agents depuis le frontend vers la BDD backend."""
    data = request.get_json()
    agents = data.get('agents', [])

    frontend_ids = set()
    for agent in agents:
        fid = agent['id']
        frontend_ids.add(fid)
        emp = Employee.query.filter_by(frontend_id=fid).first()
        if emp:
            emp.nom = agent['nom']
            emp.categorie = agent.get('categorie', '')
            emp.structure = agent.get('structure', '')
        else:
            emp = Employee(
                frontend_id=fid,
                nom=agent['nom'],
                categorie=agent.get('categorie', ''),
                structure=agent.get('structure', '')
            )
            db.session.add(emp)
    db.session.commit()
    return jsonify({'success': True, 'synced': len(agents)})


@app.route('/api/employees', methods=['GET'])
@login_required
def get_employees():
    employees = Employee.query.all()
    return jsonify([e.to_dict() for e in employees])


@app.route('/api/employees/<int:emp_id>', methods=['PUT'])
@login_required
def update_employee(emp_id):
    emp = db.session.get(Employee, emp_id)
    if not emp:
        return jsonify({'error': 'Employé non trouvé'}), 404
    data = request.get_json()
    if 'email' in data:
        emp.email = data['email']
    if 'schedule_enabled' in data:
        emp.schedule_enabled = data['schedule_enabled']
    if 'schedule_day' in data:
        emp.schedule_day = data['schedule_day']
    if 'schedule_hour' in data:
        emp.schedule_hour = data['schedule_hour']
    if 'schedule_minute' in data:
        emp.schedule_minute = data['schedule_minute']
    db.session.commit()
    _reschedule_jobs()
    return jsonify(emp.to_dict())


# === TASK SYNC API ===
@app.route('/api/tasks/sync', methods=['POST'])
@login_required
def sync_tasks():
    """Synchronise les templates de tâches depuis le frontend."""
    data = request.get_json()
    templates = data.get('templates', [])
    assignments = data.get('assignments', {})

    for tpl in templates:
        fid = tpl['id']
        t = TaskTemplate.query.filter_by(frontend_id=fid).first()
        if t:
            t.designation = tpl['designation']
            t.taches = tpl.get('taches', '')
        else:
            t = TaskTemplate(
                frontend_id=fid,
                designation=tpl['designation'],
                taches=tpl.get('taches', '')
            )
            db.session.add(t)
    db.session.commit()

    # Sync assignments
    if assignments:
        # assignments est un dict: { "agentId:templateId": true/false }
        for key, assigned in assignments.items():
            parts = key.split(':')
            if len(parts) != 2:
                continue
            agent_fid, tpl_fid = parts
            emp = Employee.query.filter_by(frontend_id=agent_fid).first()
            tpl = TaskTemplate.query.filter_by(frontend_id=tpl_fid).first()
            if not emp or not tpl:
                continue
            existing = TaskAssignment.query.filter_by(
                employee_id=emp.id, task_template_id=tpl.id
            ).first()
            if assigned and not existing:
                db.session.add(TaskAssignment(employee_id=emp.id, task_template_id=tpl.id))
            elif not assigned and existing:
                db.session.delete(existing)
    db.session.commit()
    return jsonify({'success': True})


# === EMAIL SENDING API ===
@app.route('/api/email/send', methods=['POST'])
@login_required
def send_email_manual():
    """Envoie un email avec le fichier .docx en pièce jointe."""
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier fourni'}), 400

    file = request.files['file']
    recipient = request.form.get('recipient_email', '')
    agent_name = request.form.get('agent_name', '')
    week_start = request.form.get('week_start', '')
    week_end = request.form.get('week_end', '')

    if not recipient:
        return jsonify({'error': 'Adresse email destinataire manquante'}), 400

    # Sauvegarder le fichier temporairement
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.docx')
    file.save(tmp.name)
    tmp.close()

    smtp_config = SmtpConfig.query.first()
    if not smtp_config or not smtp_config.password:
        os.unlink(tmp.name)
        return jsonify({'error': 'Configuration SMTP incomplète. Configurez d\'abord les paramètres SMTP.'}), 400

    subject = f"Fiche d'évaluation hebdomadaire - {agent_name} - Semaine du {week_start} au {week_end}"
    body = (
        f"Bonjour,\n\n"
        f"Veuillez trouver ci-joint la fiche d'évaluation hebdomadaire de {agent_name} "
        f"pour la semaine du {week_start} au {week_end}.\n\n"
        f"Cordialement,\n{smtp_config.sender_name}"
    )

    result = send_email(
        smtp_config={
            'server': smtp_config.server,
            'port': smtp_config.port,
            'username': smtp_config.username,
            'password': smtp_config.password,
            'use_tls': smtp_config.use_tls,
            'sender_email': smtp_config.sender_email,
            'sender_name': smtp_config.sender_name
        },
        recipient_email=recipient,
        subject=subject,
        body_text=body,
        attachment_path=tmp.name,
        attachment_name=file.filename
    )

    # Log
    emp = Employee.query.filter(Employee.nom.ilike(f'%{agent_name}%')).first()
    log = EmailLog(
        employee_id=emp.id if emp else None,
        recipient_email=recipient,
        subject=subject,
        filename=file.filename,
        status='sent' if result['success'] else 'failed',
        error_message=result.get('error'),
        is_scheduled=False
    )
    db.session.add(log)
    db.session.commit()

    os.unlink(tmp.name)

    if result['success']:
        return jsonify({'success': True, 'message': f'Email envoyé à {recipient}'})
    else:
        return jsonify({'error': result['error']}), 500


@app.route('/api/email/logs', methods=['GET'])
@login_required
def get_email_logs():
    logs = EmailLog.query.order_by(EmailLog.sent_at.desc()).limit(50).all()
    return jsonify([l.to_dict() for l in logs])


# === SCHEDULED GENERATION ===
def _run_scheduled_generation(employee_id):
    """Exécute la génération et l'envoi planifié pour un employé."""
    with app.app_context():
        emp = db.session.get(Employee, employee_id)
        if not emp or not emp.email:
            logger.warning(f"Scheduled: employé {employee_id} introuvable ou sans email")
            return

        # Récupérer les tâches assignées
        assignments = TaskAssignment.query.filter_by(employee_id=emp.id).all()
        tasks = []
        for a in assignments:
            tpl = db.session.get(TaskTemplate, a.task_template_id)
            if tpl:
                tasks.append({'designation': tpl.designation, 'taches': tpl.taches})

        if not tasks:
            logger.warning(f"Scheduled: aucune tâche assignée pour {emp.nom}")
            return

        # Générer le .docx
        logo_path = os.path.join(BASE_DIR, 'instance', 'logo.png')
        if not os.path.exists(logo_path):
            logo_path = None

        try:
            filepath, filename = generate_fiche(
                employee={'nom': emp.nom, 'categorie': emp.categorie, 'structure': emp.structure},
                tasks=tasks,
                logo_path=logo_path
            )
        except Exception as e:
            logger.error(f"Scheduled: erreur génération fiche pour {emp.nom}: {e}")
            db.session.add(EmailLog(
                employee_id=emp.id, recipient_email=emp.email,
                subject=f"Fiche auto - {emp.nom}", filename="erreur",
                status='failed', error_message=str(e), is_scheduled=True
            ))
            db.session.commit()
            return

        # Envoyer l'email
        smtp_config = SmtpConfig.query.first()
        if not smtp_config or not smtp_config.password:
            logger.error("Scheduled: config SMTP manquante")
            return

        from docx_service import get_week_dates, _format_date_fr
        week = get_week_dates()
        subject = f"Fiche d'évaluation hebdomadaire - {emp.nom} - Semaine du {_format_date_fr(week[0])} au {_format_date_fr(week[4])}"
        body = (
            f"Bonjour {emp.nom},\n\n"
            f"Veuillez trouver ci-joint votre fiche d'évaluation hebdomadaire "
            f"pour la semaine du {_format_date_fr(week[0])} au {_format_date_fr(week[4])}.\n\n"
            f"Cordialement,\n{smtp_config.sender_name}"
        )

        result = send_email(
            smtp_config={
                'server': smtp_config.server, 'port': smtp_config.port,
                'username': smtp_config.username, 'password': smtp_config.password,
                'use_tls': smtp_config.use_tls, 'sender_email': smtp_config.sender_email,
                'sender_name': smtp_config.sender_name
            },
            recipient_email=emp.email,
            subject=subject,
            body_text=body,
            attachment_path=filepath,
            attachment_name=filename
        )

        db.session.add(EmailLog(
            employee_id=emp.id, recipient_email=emp.email,
            subject=subject, filename=filename,
            status='sent' if result['success'] else 'failed',
            error_message=result.get('error'), is_scheduled=True
        ))
        db.session.commit()

        # Nettoyer le fichier temporaire
        try:
            os.unlink(filepath)
        except OSError:
            pass

        status = "envoyé" if result['success'] else f"échoué: {result.get('error')}"
        logger.info(f"Scheduled: {emp.nom} → {emp.email} — {status}")


def _reschedule_jobs():
    """Reconfigure tous les jobs planifiés."""
    # Supprimer les anciens jobs
    for job in scheduler.get_jobs():
        if job.id.startswith('fiche_'):
            scheduler.remove_job(job.id)

    # Recréer les jobs actifs
    with app.app_context():
        employees = Employee.query.filter_by(schedule_enabled=True).all()
        day_map = {1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 0: 'sun'}
        for emp in employees:
            if emp.email:
                day_name = day_map.get(emp.schedule_day, 'mon')
                scheduler.add_job(
                    _run_scheduled_generation,
                    'cron',
                    args=[emp.id],
                    id=f'fiche_{emp.id}',
                    day_of_week=day_name,
                    hour=emp.schedule_hour,
                    minute=emp.schedule_minute,
                    replace_existing=True
                )
                logger.info(f"Planifié: {emp.nom} chaque {day_name} à {emp.schedule_hour:02d}:{emp.schedule_minute:02d}")


@app.route('/api/schedules', methods=['GET'])
@login_required
def get_schedules():
    employees = Employee.query.all()
    return jsonify([{
        **e.to_dict(),
        'has_tasks': TaskAssignment.query.filter_by(employee_id=e.id).count() > 0
    } for e in employees])


# === DÉMARRAGE ===
with app.app_context():
    init_db()
    _reschedule_jobs()

if not scheduler.running:
    scheduler.start()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
