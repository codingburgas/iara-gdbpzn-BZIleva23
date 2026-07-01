from flask import (Flask, render_template, request, redirect,
                   url_for, session, abort, jsonify)
from models import (db, User, Incident, TeamMember, FireVehicle, AssignedTeam, IncidentPhoto, Task, TacticalMarker)
import folium, os
from datetime import datetime

app = Flask(__name__)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'fire_system.db')
app.config['SECRET_KEY'] = 'phoenix-2026-mega-secure-key'
app.config['UPLOAD_FOLDER'] = os.path.join(BASE_DIR, 'static/uploads')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
db.init_app(app)

BULGARIA_ADDRESS_BOOK = [
    {"name": "гр. София, Център - пл. Княз Александър I", "lat": 42.6965, "lon": 23.3260},
    {"name": "гр. Пловдив, Старият град - Античен театър", "lat": 42.1469, "lon": 24.7510},
    {"name": "гр. Варна, Морска градина - Летен театър", "lat": 43.2081, "lon": 27.9284},
    {"name": "гр. Бургас, Център - ул. Александровска 2", "lat": 42.4938, "lon": 27.4725},
    {"name": "гр. Бургас, Промишлена Зона Север (Нефтохим)", "lat": 42.5284, "lon": 27.4429}
]

with app.app_context():
    db.create_all()
    admin_user = User.query.filter_by(username='admin').first()
    if not admin_user:
        db.session.add_all([
            User(username='admin', password='123', role='admin'),
            User(username='fire', password='123', role='firefighter'),
            User(username='user', password='123', role='user')
        ])
        db.session.commit()

    if FireVehicle.query.first() is None:
        v1 = FireVehicle(call_sign="ПА-Сф-01", vehicle_type="Пожарна", model="MAN TGM", region="София",
                         station="01 РСПБЗН", status='available', water_cap_l=4000)
        db.session.add(v1)
        db.session.commit()
        db.session.add(TeamMember(name="гл. инсп. Стойчев", vehicle_id=v1.id, status="available", gps_lat=42.6965,
                                  gps_lon=23.3260))
        db.session.commit()

GLOBAL_CHAT_ROOM = [
    {"user": "Система", "role": "admin", "text": "Националната система Phoenix България е онлайн.", "ts": "08:00"}]


def ok():     return 'user_id' in session


def role(*r): return session.get('role') in r


@app.route('/')
def index():
    if not ok(): return redirect(url_for('login'))
    incidents = Incident.query.order_by(Incident.timestamp.desc()).all()
    users = User.query.order_by(User.username).all()
    members = TeamMember.query.all()
    tasks = Task.query.all()
    tactical_markers = TacticalMarker.query.all()

    m = folium.Map(location=[42.7339, 25.4858], zoom_start=7, zoom_control=True)
    folium.TileLayer('CartoDB dark_matter', name='Dark Mode').add_to(m)

    current_role = session.get('role')

    for inc in incidents:
        color = 'red' if inc.status == 'active' else 'gray'
        photo = IncidentPhoto.query.filter_by(incident_id=inc.id).first()
        photo_html = f"""<div style='margin-top:8px;'><button onclick='window.parent.showImageModal("{url_for('static', filename=f'uploads/{photo.filename}')}")' style='background:#10b981; color:white; border:0; padding:4px; border-radius:4px; width:100%; cursor:pointer; font-size:11px;'>👁️ Преглед Снимка</button></div>""" if photo and role(
            'admin', 'firefighter') else ""

        # ДОБАВЯНЕ НА НАВИГАЦИОННИ БУТОНИ САМО ЗА АДМИН И ПОЖАРНИКАР
        nav_html = ""
        if current_role in ['admin', 'firefighter']:
            nav_html = f"""
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 5px;">
                <b style="color: #f59e0b; font-size: 11px; display:block; margin-bottom:2px;">🗺️ МАРШРУТ ДО ТЕРЕН:</b>
                <a href="https://www.google.com/maps/search/?api=1&query={inc.lat},{inc.lon}" target="_blank" style="background: #2563eb; color: white; border: 0; padding: 6px; border-radius: 4px; text-align: center; text-decoration: none; font-weight: bold; font-size: 11px; display: block;">
                     Google Maps
                </a>
                <a href="https://waze.com/ul?ll={inc.lat},{inc.lon}&navigate=yes" target="_blank" style="background: #33b5e5; color: black; border: 0; padding: 6px; border-radius: 4px; text-align: center; text-decoration: none; font-weight: bold; font-size: 11px; display: block;">
                     Waze Навигация
                </a>
            </div>
            """

        popup_html = f"""
        <div style="font-family: sans-serif; font-size: 12px; min-width: 220px; color: #1e293b;">
            <b style="color: #dc2626; font-size: 14px;">🔥 {inc.title}</b><br>
            <p style="margin: 6px 0;">{inc.description or ''}</p>
            {photo_html}
            {nav_html}
        </div>
        """
        folium.Marker([inc.lat, inc.lon], popup=folium.Popup(popup_html, max_width=300),
                      icon=folium.Icon(color=color, icon='fire', prefix='fa')).add_to(m)

    for tm in tactical_markers:
        icon_color = 'orange' if tm.marker_type == 'Фронт на огъня' else 'info'
        icon_shape = 'exclamation-triangle' if tm.marker_type == 'Фронт на огъня' else 'wind'
        folium.Marker([tm.lat, tm.lon], popup=f"<b>{tm.marker_type}</b>: {tm.details}",
                      icon=folium.Icon(color=icon_color, icon=icon_shape, prefix='fa')).add_to(m)

    m.get_root().html.add_child(folium.Element("""
        <script>
            document.addEventListener("DOMContentLoaded", function() {
                setTimeout(function() {
                    let activeMap = window.mapObj || map_;
                    if (activeMap) {
                        activeMap.on('click', function(e) {
                            let lat = e.latlng.lat.toFixed(6);
                            let lon = e.latlng.lng.toFixed(6);
                            ['form-lat', 'user-lat', 'tac-lat'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = lat; });
                            ['form-lon', 'user-lon', 'tac-lon'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = lon; });
                        });
                    }
                }, 1000);
            });
        </script>
    """))
    return render_template('index.html', incidents=incidents, users=users, members=members, map_html=m._repr_html_(),
                           user=session['username'], role=session.get('role'), chat=GLOBAL_CHAT_ROOM,
                           addresses=BULGARIA_ADDRESS_BOOK, tasks=tasks, tactical_markers=tactical_markers)


@app.route('/user/<int:uid>/role', methods=['POST'])
def change_role(uid):
    if not role('admin'): abort(403)
    data = request.get_json(silent=True) or {}
    user = User.query.get_or_404(uid)
    if 'role' in data:
        user.role = data.get('role')
        db.session.commit()
        return jsonify({'status': 'ok'})
    return jsonify({'status': 'error'}), 400


@app.route('/add_task', methods=['POST'])
def add_task():
    if not role('admin'): abort(403)
    db.session.add(Task(incident_id=request.form.get('incident_id'), task_type=request.form.get('task_type'),
                        description=request.form.get('description')))
    db.session.commit()
    return redirect(url_for('index'))


@app.route('/task/<int:tid>/complete', methods=['POST'])
def complete_task(tid):
    if not role('admin', 'firefighter'): abort(403)
    task = Task.query.get_or_404(tid)
    task.status = 'completed'
    db.session.commit()
    return redirect(url_for('index'))


@app.route('/add_tactical', methods=['POST'])
def add_tactical():
    if not role('admin', 'firefighter'): abort(403)
    db.session.add(
        TacticalMarker(incident_id=request.form.get('incident_id'), marker_type=request.form.get('marker_type'),
                       lat=float(request.form.get('lat')), lon=float(request.form.get('lon')),
                       details=request.form.get('details')))
    db.session.commit()
    return redirect(url_for('index'))


@app.route('/sos', methods=['POST'])
def sos_signal():
    if not role('firefighter', 'admin'): abort(403)
    GLOBAL_CHAT_ROOM.append({"user": f"🚨 SOS - {session.get('username')}", "role": "firefighter",
                             "text": "ПОСТРАДАЛ ПОЖАРНИКАР! Нужда от незабавна евакуация!",
                             "ts": datetime.now().strftime("%H:%M")})
    return redirect(url_for('index'))


@app.route('/add_incident', methods=['POST'])
def add_incident():
    if not role('admin'): abort(403)
    try:
        desc = f"{request.form.get('description')} | Опасни Вещества: {request.form.get('hazmat', 'Няма')}"
        db.session.add(Incident(title=request.form.get('title'), description=desc, lat=float(request.form.get('lat')),
                                lon=float(request.form.get('lon')), source='operator', status='active'))
        db.session.commit()
    except:
        db.session.rollback()
    return redirect(url_for('index'))


@app.route('/report_incident_user', methods=['POST'])
def report_incident_user():
    if not role('user', 'admin', 'firefighter'): abort(403)
    try:
        inc = Incident(title=request.form.get('title'), description=request.form.get('description'),
                       lat=float(request.form.get('lat')), lon=float(request.form.get('lon')), source='citizen',
                       status='active')
        db.session.add(inc)
        db.session.commit()
        file = request.files.get('photo')
        if file and file.filename != '':
            filename = f"inc_{inc.id}_{file.filename}"
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            db.session.add(IncidentPhoto(incident_id=inc.id, filename=filename, uploaded_by=session.get('username')))
            db.session.commit()
    except:
        db.session.rollback()
    return redirect(url_for('index'))


@app.route('/chat/send', methods=['POST'])
def chat_send():
    text = request.form.get('text')
    if text: GLOBAL_CHAT_ROOM.append({"user": session.get('username'), "role": session.get('role'), "text": text,
                                      "ts": datetime.now().strftime("%H:%M")})
    return redirect(url_for('index'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        u = User.query.filter_by(username=request.form.get('username'), password=request.form.get('password')).first()
        if u:
            session['user_id'], session['username'], session['role'] = u.id, u.username, u.role
            return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        db.session.add(User(username=request.form.get('username'), password=request.form.get('password'), role='user'))
        db.session.commit()
        return redirect(url_for('login'))
    return render_template('register.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


if __name__ == '__main__':
    app.run(debug=True)