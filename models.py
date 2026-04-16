from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20))  # 'admin', 'firefighter', 'user'


class Incident(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='active')  # active / resolved

    tasks = db.relationship('Task', backref='incident', lazy=True)
    messages = db.relationship('ChatMessage', backref='incident', lazy=True)


class Task(db.Model):
    """Оперативна задача, обвързана с произшествие."""
    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey('incident.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    assigned_to = db.Column(db.String(50))          # username на отговорника
    status = db.Column(db.String(20), default='open')  # open / done
    task_type = db.Column(db.String(30), default='operative')  # operative / logistics / admin
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)


class ChatMessage(db.Model):
    """Съобщение в чат канала на произшествие."""
    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey('incident.id'), nullable=False)
    user = db.Column(db.String(50), nullable=False)
    text = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


class TeamMember(db.Model):
    """Служител / пожарникар с текущ статус на смяна."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    vehicle = db.Column(db.String(50))              # напр. "ПА-01"
    status = db.Column(db.String(20), default='available')  # available / on_incident / leave / sick
    shift_active = db.Column(db.Boolean, default=False)