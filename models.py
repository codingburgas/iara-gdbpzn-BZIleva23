from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), default='user')  # admin, firefighter, user

class Incident(db.Model):
    __tablename__ = 'incident'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)
    source = db.Column(db.String(20))  # operator, citizen
    status = db.Column(db.String(20), default='active')  # active, resolved
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    injured = db.Column(db.Boolean, default=False)
    injured_count = db.Column(db.Integer, default=0)

class FireVehicle(db.Model):
    __tablename__ = 'fire_vehicle'
    id = db.Column(db.Integer, primary_key=True)
    call_sign = db.Column(db.String(20), unique=True, nullable=False)
    vehicle_type = db.Column(db.String(50))
    model = db.Column(db.String(50))
    region = db.Column(db.String(50))
    station = db.Column(db.String(50))
    status = db.Column(db.String(20), default='available')
    water_cap_l = db.Column(db.Integer, default=0)

class TeamMember(db.Model):
    __tablename__ = 'team_member'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    vehicle_id = db.Column(db.Integer, db.ForeignKey('fire_vehicle.id'))
    status = db.Column(db.String(20), default='available')
    gps_lat = db.Column(db.Float)
    gps_lon = db.Column(db.Float)
    vehicle = db.relationship('FireVehicle', backref=db.backref('members', lazy=True))

class AssignedTeam(db.Model):
    __tablename__ = 'assigned_team'
    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey('incident.id'), nullable=False)
    member_id = db.Column(db.Integer, db.ForeignKey('team_member.id'), nullable=False)
    assigned_by = db.Column(db.String(50))
    status = db.Column(db.String(20), default='dispatched')
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class IncidentPhoto(db.Model):
    __tablename__ = 'incident_photo'
    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey('incident.id'), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    uploaded_by = db.Column(db.String(50))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# НОВИ МОДЕЛИ ОТ ИЗИСКВАНИЯТА В image.png
class Task(db.Model):
    __tablename__ = 'task'
    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey('incident.id'), nullable=False)
    task_type = db.Column(db.String(50))  # Логистична, Оперативна, Административна
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending, completed

class TacticalMarker(db.Model):
    __tablename__ = 'tactical_marker'
    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey('incident.id'), nullable=False)
    marker_type = db.Column(db.String(50))  # Фронт на огъня, Посока на вятъра
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)
    details = db.Column(db.String(100))