"""
models.py — Modèles SQLAlchemy pour la base de données
"""
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()


class Admin(UserMixin, db.Model):
    """Compte administrateur"""
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class SmtpConfig(db.Model):
    """Configuration SMTP (singleton — une seule ligne)"""
    id = db.Column(db.Integer, primary_key=True)
    server = db.Column(db.String(256), nullable=False, default='smtp.gmail.com')
    port = db.Column(db.Integer, nullable=False, default=587)
    username = db.Column(db.String(256), nullable=False, default='')
    password = db.Column(db.String(256), nullable=False, default='')
    use_tls = db.Column(db.Boolean, nullable=False, default=True)
    sender_email = db.Column(db.String(256), nullable=False, default='')
    sender_name = db.Column(db.String(256), nullable=False, default='ANTIC')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'server': self.server,
            'port': self.port,
            'username': self.username,
            'use_tls': self.use_tls,
            'sender_email': self.sender_email,
            'sender_name': self.sender_name,
            # password intentionnellement omis
        }


class Employee(db.Model):
    """Employé avec email et paramètres de planification"""
    id = db.Column(db.Integer, primary_key=True)
    frontend_id = db.Column(db.String(64), unique=True, nullable=False)
    nom = db.Column(db.String(256), nullable=False)
    email = db.Column(db.String(256), nullable=False, default='')
    categorie = db.Column(db.String(128), nullable=False, default='')
    structure = db.Column(db.String(256), nullable=False, default='')
    # Planification
    schedule_enabled = db.Column(db.Boolean, default=False)
    schedule_day = db.Column(db.Integer, default=1)  # 1=Lundi ... 5=Vendredi
    schedule_hour = db.Column(db.Integer, default=8)
    schedule_minute = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    assignments = db.relationship('TaskAssignment', backref='employee', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'frontend_id': self.frontend_id,
            'nom': self.nom,
            'email': self.email,
            'categorie': self.categorie,
            'structure': self.structure,
            'schedule_enabled': self.schedule_enabled,
            'schedule_day': self.schedule_day,
            'schedule_hour': self.schedule_hour,
            'schedule_minute': self.schedule_minute
        }


class TaskTemplate(db.Model):
    """Modèle de tâche"""
    id = db.Column(db.Integer, primary_key=True)
    frontend_id = db.Column(db.String(64), unique=True, nullable=False)
    designation = db.Column(db.String(512), nullable=False)
    taches = db.Column(db.Text, nullable=False, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    assignments = db.relationship('TaskAssignment', backref='task_template', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'frontend_id': self.frontend_id,
            'designation': self.designation,
            'taches': self.taches
        }


class TaskAssignment(db.Model):
    """Association employé ↔ tâche"""
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)
    task_template_id = db.Column(db.Integer, db.ForeignKey('task_template.id'), nullable=False)

    __table_args__ = (db.UniqueConstraint('employee_id', 'task_template_id'),)


class EmailLog(db.Model):
    """Journal des emails envoyés"""
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=True)
    recipient_email = db.Column(db.String(256), nullable=False)
    subject = db.Column(db.String(512), nullable=False)
    filename = db.Column(db.String(256), nullable=False)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(32), nullable=False, default='sent')  # sent, failed
    error_message = db.Column(db.Text, nullable=True)
    is_scheduled = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'recipient_email': self.recipient_email,
            'subject': self.subject,
            'filename': self.filename,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'status': self.status,
            'error_message': self.error_message,
            'is_scheduled': self.is_scheduled
        }
