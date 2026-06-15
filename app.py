from flask import (Flask, render_template, request, redirect,
                   url_for, session, abort, jsonify)
from models import (db, User, Incident, TeamMember, Shift, FireVehicle, AssignedTeam, IncidentPhoto)
import folium, os
from datetime import datetime

app = Flask(__name__)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'fire_system.db')
app.config['SECRET_KEY'] = 'phoenix-2026-mega-secure-key'
app.config['UPLOAD_FOLDER'] = os.path.join(BASE_DIR, 'static/uploads')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
db.init_app(app)

# НАЦИОНАЛНА БАЗА ДАННИ С АДРЕСИ - ЦЯЛА БЪЛГАРИЯ
BULGARIA_ADDRESS_BOOK = [
    {"name": "гр. София, Център - пл. Княз Александър I", "lat": 42.6965, "lon": 23.3260},
    {"name": "гр. София, ж.к. Люлин 5, бул. Панчо Владигеров", "lat": 42.7152, "lon": 23.2435},
    {"name": "гр. Пловдив, Старият град - Античен театър", "lat": 42.1469, "lon": 24.7510},
    {"name": "гр. Пловдив, Промишлена зона Тракия", "lat": 42.1245, "lon": 24.7932},
    {"name": "гр. Варна, Морска градина - Летен театър", "lat": 43.2081, "lon": 27.9284},
    {"name": "гр. Варна, Западна промишлена зона (Пристанище)", "lat": 43.1995, "lon": 27.8720},
    {"name": "гр. Бургас, Център - ул. Александровска 2", "lat": 42.4938, "lon": 27.4725},
    {"name": "гр. Бургас, Промишлена Зона Север (Нефтохим)", "lat": 42.5284, "lon": 27.4429},
    {"name": "гр. Русе, Площад Свобода (Център)", "lat": 43.8487, "lon": 25.9534},
    {"name": "гр. Стара Загора, бул. Цар Симеон Велики", "lat": 42.4258, "lon": 25.6269},
    {"name": "гр. Плевен, Сторгозия (Промишлена зона)", "lat": 43.4215, "lon": 24.5942},
    {"name": "гр. Благоевград, Център - пл. Георги Измирлиев", "lat": 42.0211, "lon": 23.0942},
    {"name": "гр. Велико Търново, Архитектурен резерват Царевец", "lat": 43.0836, "lon": 25.6521}
]

with app.app_context():
    db.create_all()
    if User.query.first() is None:
        db.session.add_all([
            User(username='admin', password='123', role='admin'),
            User(username='fire', password='123', role='firefighter'),
            User(username='user', password='123', role='user')
        ])
        v1 = FireVehicle(call_sign="ПА-Сф-01", vehicle_type="Пожарна", model="MAN TGM", region="София",
                         station="01 РСПБЗН", status='available', water_cap_l=4000)
        v2 = FireVehicle(call_sign="ПА-Бс-02", vehicle_type="Пожарна", model="Iveco Eurocargo", region="Бургас",
                         station="01 РСПБЗН", status='available', water_cap_l=3000)
        db.session.add_all([v1, v2])
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
    vehicles = FireVehicle.query.order_by(FireVehicle.region, FireVehicle.call_sign).all()

    # Центрираме картата автоматично, за да обхване цяла България
    m = folium.Map(location=[42.7339, 25.4858], zoom_start=7, zoom_control=True)
    folium.TileLayer('CartoDB dark_matter', name='Dark Mode').add_to(m)

    for inc in incidents:
        color = 'red' if inc.status == 'active' else 'gray'
        icon_type = 'fire' if inc.source == 'operator' else 'bullhorn'
        photo = IncidentPhoto.query.filter_by(incident_id=inc.id).first()
        photo_html = ""

        if photo and role('admin', 'firefighter'):
            img_url = url_for('static', filename=f'uploads/{photo.filename}')
            photo_html = f"""<div style='margin-top:8px;'><button onclick='window.parent.showImageModal("{img_url}")' style='background:#10b981; color:white; border:0; padding:4px 8px; border-radius:4px; font-weight:bold; width:100%; cursor:pointer;'>👁️ Виж прикачената снимка</button></div>"""

        services = []
        if inc.injured: services.append(f"⚠️ Ранени: {inc.injured_count} лица")
        if "[ИЗИСКВА ЛИНЕЙКА]" in (inc.description or ""): services.append("🚑 Линейка")
        if "[ИЗИСКВА ПОЛИЦИЯ]" in (inc.description or ""): services.append("Police")
        services_html = "<br>".join(services) if services else "Няма критични сигнали"

        popup_html = f"""<div style="font-family: sans-serif; font-size:12px; color:#333; min-width:210px;"><b style="color:#e11d48; font-size:14px;">🔥 {inc.title}</b><br><p style="margin:4px 0;">{inc.description or ''}</p><div style="background:#f1f5f9; padding:5px; border-radius:4px; font-weight:bold;">{services_html}</div>{photo_html}</div>"""
        folium.Marker([inc.lat, inc.lon], popup=folium.Popup(popup_html, max_width=280),
                      icon=folium.Icon(color=color, icon=icon_type, prefix='fa')).add_to(m)

    m.get_root().html.add_child(folium.Element("""
        <script>
            document.addEventListener("DOMContentLoaded", function() {
                setTimeout(function() {
                    let activeMap = window.mapObj || map_;
                    if (activeMap) {
                        activeMap.on('click', function(e) {
                            let lat = e.latlng.lat.toFixed(6);
                            let lon = e.latlng.lng.toFixed(6);
                            if(document.getElementById('form-lat')) document.getElementById('form-lat').value = lat;
                            if(document.getElementById('form-lon')) document.getElementById('form-lon').value = lon;
                            if(document.getElementById('user-lat')) document.getElementById('user-lat').value = lat;
                            if(document.getElementById('user-lon')) document.getElementById('user-lon').value = lon;
                        });
                    }
                }, 1000);
            });
        </script>
    """))
    return render_template('index.html', incidents=incidents, users=users, members=members, vehicles=vehicles,
                           map_html=m._repr_html_(), user=session['username'], role=session.get('role'),
                           chat=GLOBAL_CHAT_ROOM, addresses=BULGARIA_ADDRESS_BOOK)


@app.route('/incidents/list')
def list_active_incidents():
    if not ok(): abort(401)
    return jsonify([{'id': i.id, 'title': i.title} for i in Incident.query.filter_by(status='active').all()])


@app.route('/incident/<int:inc_id>/assign', methods=['POST'])
def assign_member(inc_id):
    if not role('admin', 'firefighter'): abort(403)
    data = request.get_json(silent=True) or {}
    member_id = data.get('member_id')
    db.session.add(AssignedTeam(incident_id=inc_id, member_id=int(member_id), assigned_by=session.get('username'),
                                status='dispatched'))
    member = TeamMember.query.get(member_id)
    if member: member.status = 'on_incident'
    db.session.commit()
    return jsonify({'status': 'ok'})


@app.route('/add_incident', methods=['POST'])
def add_incident():
    if not role('admin'): abort(403)
    try:
        db.session.add(Incident(title=request.form.get('title'), description=request.form.get('description', ''),
                                lat=float(request.form.get('lat')), lon=float(request.form.get('lon')),
                                source='operator', status='active'))
        db.session.commit()
    except:
        db.session.rollback()
    return redirect(url_for('index'))


@app.route('/report_incident_user', methods=['POST'])
def report_incident_user():
    if not role('user', 'admin', 'firefighter'): abort(403)
    try:
        desc_parts = [request.form.get('description', '')]
        if request.form.get('need_ambulance'): desc_parts.append("[ИЗИСКВА ЛИНЕЙКА]")
        if request.form.get('need_police'): desc_parts.append("[ИЗИСКВА ПОЛИЦИЯ]")
        inc = Incident(title=request.form.get('title', 'Граждански сигнал'), description=" | ".join(desc_parts),
                       lat=float(request.form.get('lat')), lon=float(request.form.get('lon')), source='citizen',
                       status='active', injured=(request.form.get('injured') == 'yes'),
                       injured_count=int(request.form.get('injured_count', 0) or 0))
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
    if not role('admin', 'firefighter'): abort(403)
    text = request.form.get('text')
    if text: GLOBAL_CHAT_ROOM.append({"user": session.get('username'), "role": session.get('role'), "text": text,
                                      "ts": datetime.now().strftime("%H:%M")})
    return redirect(url_for('index'))


@app.route('/user/<int:uid>/role', methods=['POST'])
def change_role(uid):
    if not role('admin'): abort(403)
    data = request.get_json(silent=True) or {}
    User.query.get_or_404(uid).role = data.get('role')
    db.session.commit()
    return jsonify({'status': 'ok'})


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        # Поддържаме два режима: стандартен FORM submit и AJAX (за pop-up проверка)
        u = User.query.filter_by(username=request.form.get('username'), password=request.form.get('password')).first()
        if u:
            session['user_id'], session['username'], session['role'] = u.id, u.username, u.role
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'success': True})
            return redirect(url_for('index'))
        else:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'success': False, 'message': '❌ Грешно потребителско име или парола!'})
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