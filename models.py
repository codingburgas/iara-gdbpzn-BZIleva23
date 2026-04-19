from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'user'
    id       = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role     = db.Column(db.String(20), default='user')  # admin / firefighter / user


class Incident(db.Model):
    __tablename__ = 'incident'
    id          = db.Column(db.Integer, primary_key=True)
    title       = db.Column(db.String(100), nullable=False)
    lat         = db.Column(db.Float, nullable=False)
    lon         = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text, default='')
    timestamp   = db.Column(db.DateTime, default=datetime.utcnow)
    status      = db.Column(db.String(20), default='active')  # active / resolved
    # Граждански сигнали
    injured        = db.Column(db.Boolean, default=False)
    injured_count  = db.Column(db.Integer, default=0)
    hazmat         = db.Column(db.Boolean, default=False)   # опасни вещества
    reporter_phone = db.Column(db.String(30), default='')
    reporter_name  = db.Column(db.String(100), default='')
    source         = db.Column(db.String(20), default='operator')  # operator / citizen / 112

    tasks    = db.relationship('Task',        backref='incident', lazy=True, cascade='all, delete-orphan')
    messages = db.relationship('ChatMessage', backref='incident', lazy=True, cascade='all, delete-orphan')


class Task(db.Model):
    __tablename__ = 'task'
    id           = db.Column(db.Integer, primary_key=True)
    incident_id  = db.Column(db.Integer, db.ForeignKey('incident.id'), nullable=False)
    title        = db.Column(db.String(200), nullable=False)
    assigned_to  = db.Column(db.String(50),  default='')
    status       = db.Column(db.String(20),  default='open')
    task_type    = db.Column(db.String(30),  default='operative')
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)


class ChatMessage(db.Model):
    """Чат по конкретно произшествие."""
    __tablename__ = 'chat_message'
    id          = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey('incident.id'), nullable=False)
    user        = db.Column(db.String(50), nullable=False)
    text        = db.Column(db.Text, nullable=False)
    ts          = db.Column(db.DateTime, default=datetime.utcnow)


class GlobalMessage(db.Model):
    """Оперативен чат — само admin + firefighter, не е обвързан с произшествие."""
    __tablename__ = 'global_message'
    id   = db.Column(db.Integer, primary_key=True)
    user = db.Column(db.String(50), nullable=False)
    role = db.Column(db.String(20), nullable=False)   # за цветово различаване
    text = db.Column(db.Text, nullable=False)
    ts   = db.Column(db.DateTime, default=datetime.utcnow)


class FireVehicle(db.Model):
    __tablename__ = 'fire_vehicle'
    id           = db.Column(db.Integer, primary_key=True)
    call_sign    = db.Column(db.String(30),  nullable=False)
    vehicle_type = db.Column(db.String(60),  nullable=False)
    model        = db.Column(db.String(100), default='')
    region       = db.Column(db.String(100), nullable=False)
    station      = db.Column(db.String(150), default='')
    status       = db.Column(db.String(20),  default='available')
    water_cap_l  = db.Column(db.Integer, default=0)
    notes        = db.Column(db.String(200), default='')


class TeamMember(db.Model):
    __tablename__ = 'team_member'
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(100), nullable=False)
    vehicle_id = db.Column(db.Integer, db.ForeignKey('fire_vehicle.id'), nullable=True)
    status     = db.Column(db.String(20), default='available')
    user_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    # GPS позиция (актуализира се от мобилното устройство)
    gps_lat    = db.Column(db.Float, nullable=True)
    gps_lon    = db.Column(db.Float, nullable=True)
    gps_updated = db.Column(db.DateTime, nullable=True)

    vehicle = db.relationship('FireVehicle', backref='crew', lazy=True)
    shifts  = db.relationship('Shift', backref='member', lazy=True, cascade='all, delete-orphan')


class Shift(db.Model):
    __tablename__ = 'shift'
    id         = db.Column(db.Integer, primary_key=True)
    member_id  = db.Column(db.Integer, db.ForeignKey('team_member.id'), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    end_time   = db.Column(db.DateTime, nullable=True)
    is_active  = db.Column(db.Boolean, default=True)
    notes      = db.Column(db.String(200), default='')