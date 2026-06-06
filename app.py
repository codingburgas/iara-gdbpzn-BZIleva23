from flask import (Flask, render_template, request, redirect,
                   url_for, session, abort, jsonify)
from models import (db, User, Incident, TeamMember, Shift, FireVehicle, AssignedTeam)
import folium, json, os

app = Flask(__name__)

# Задаваме твърд, абсолютен път до базата данни в папката на проекта
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'fire_system.db')
app.config['SECRET_KEY'] = 'phoenix-2026-super-secure-key'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

# АВТОМАТИЧНО НАЛИВАНЕ НА ДАННИ (SEED) ПРИ СТАРТ СИСТЕМАТА
with app.app_context():
    db.create_all()

    # Проверяваме дали вече има потребители, ако няма - създаваме всичко автоматично
    if User.query.first() is None:
        print("[PHOENIX] Базата данни е празна! Автоматично наливане на данни...")

        # 1. Създаване на потребители за трите нива на достъп
        admin_user = User(username='admin', password='123', role='admin')
        fire_user = User(username='fire', password='123', role='firefighter')
        reg_user = User(username='user', password='123', role='user')

        db.session.add_all([admin_user, fire_user, reg_user])
        db.session.commit()

        # 2. Създаване на национален списък с автомобили
        vehicles_data = [
            ("ПА-Со-01", "Пожарогасителен автомобил", "MAN TGM 18.290", "София Град", "01 РСПБЗН - Триадица", 4000),
            ("АЦ-Со-02", "Автоцистерна за вода", "MAN TGS 26.480", "София Град", "02 РСПБЗН - Средец", 10000),
            ("ПА-Пд-01", "Пожарогасителен автомобил", "MAN TGM 15.250", "Пловдив", "01 РСПБЗН - Пловдив", 3000),
            ("ПА-Вн-01", "Пожарогасителен автомобил", "MAN TGM 15.250", "Варна", "01 РСПБЗН - Варна Център", 3000),
            ("ПА-Бс-01", "Пожарогасителен автомобил", "MAN TGM 18.290", "Бургас", "01 РСПБЗН - Бургас", 4000)
        ]

        created_vehicles = []
        for call_sign, v_type, model, region, station, water in vehicles_data:
            v = FireVehicle(call_sign=call_sign, vehicle_type=v_type, model=model, region=region, station=station,
                            status='available', water_cap_l=water)
            db.session.add(v)
            created_vehicles.append(v)
        db.session.commit()

        # 3. Създаване на примерни дежурни служители
        m1 = TeamMember(name="инсп. Димитър Иванов", vehicle_id=created_vehicles[0].id, status="available",
                        user_id=fire_user.id, gps_lat=42.6977, gps_lon=23.3219)
        m2 = TeamMember(name="мл. инсп. Георги Петров", vehicle_id=created_vehicles[2].id, status="available",
                        gps_lat=42.1354, gps_lon=24.7453)

        db.session.add_all([m1, m2])
        db.session.commit()
        print("[PHOENIX] Базата данни е налята успешно наготово!")


def ok():     return 'user_id' in session


def role(*r): return session.get('role') in r


@app.route('/')
def index():
    if not ok(): return redirect(url_for('login'))

    incidents = Incident.query.order_by(Incident.timestamp.desc()).all()
    users = User.query.all()
    members = TeamMember.query.all()
    vehicles = FireVehicle.query.order_by(FireVehicle.region, FireVehicle.call_sign).all()

    m = folium.Map(location=[42.7, 24.5], zoom_start=7, tiles=None, zoom_control=False)
    dark = folium.TileLayer('CartoDB dark_matter', name='dark', control=False).add_to(m)
    light = folium.TileLayer('CartoDB positron', name='light', control=False).add_to(m)

    inc_data = []
    for inc in incidents:
        color = 'red' if inc.status == 'active' else 'gray'
        icon_name = 'fire' if inc.source != 'citizen' else 'exclamation-circle'

        popup_html = f"""
            <b>{inc.title}</b><br>{inc.description or ''}<br>
            <hr style='margin:8px 0; border-color:#444;'>
            <div style='display:flex; gap:5px;'>
                <a href='http://maps.google.com/?q={inc.lat},{inc.lon}' target='_blank' style='background:#4285F4; color:white; padding:4px 6px; border-radius:4px; text-decoration:none; font-size:11px; font-weight:bold;'>🗺️ Google</a>
                <a href='https://waze.com/ul?ll={inc.lat},{inc.lon}&navigate=yes' target='_blank' style='background:#33CCFF; color:black; padding:4px 6px; border-radius:4px; text-decoration:none; font-size:11px; font-weight:bold;'>🚙 Waze</a>
            </div>
        """
        folium.Marker([inc.lat, inc.lon], popup=folium.Popup(popup_html, max_width=250),
                      icon=folium.Icon(color=color, icon=icon_name, prefix='fa')).add_to(m)

    for mem in members:
        if mem.gps_lat and mem.gps_lon:
            folium.CircleMarker([mem.gps_lat, mem.gps_lon], radius=7, color='#3b82f6', fill=True,
                                popup=f"🚒 {mem.name} ({mem.status})").add_to(m)

    m.get_root().html.add_child(folium.Element(f"<script>window.mapObj={m.get_name()};</script>"))
    return render_template('index.html', incidents=incidents, users=users, members=members, vehicles=vehicles,
                           map_html=m._repr_html_(), user=session['username'], role=session.get('role'))


@app.route('/incidents/list')
def list_active_incidents():
    if not ok(): abort(401)
    active = Incident.query.filter_by(status='active').all()
    return jsonify([{'id': i.id, 'title': i.title} for i in active])


@app.route('/incident/<int:inc_id>/assign', methods=['POST'])
def assign_member(inc_id):
    # Достъпно само за Админ и Пожарникар
    if not role('admin', 'firefighter'): abort(403)
    data = request.get_json(silent=True) or {}
    member_id = data.get('member_id')

    a = AssignedTeam(incident_id=inc_id, member_id=int(member_id), assigned_by=session.get('username', ''),
                     status='dispatched')
    db.session.add(a)

    member = TeamMember.query.get(member_id)
    if member: member.status = 'on_incident'
    db.session.commit()
    return jsonify({'status': 'ok'})


@app.route('/add_incident', methods=['POST'])
def add_incident():
    # Сигнали може да добавя ЕДИНСТВЕНО Администраторът
    if not role('admin'): abort(403)
    try:
        inc = Incident(title=request.form.get('title', 'Без заглавие'), description=request.form.get('description', ''),
                       lat=float(request.form.get('lat', 42.7)), lon=float(request.form.get('lon', 24.5)),
                       source='operator', status='active')
        db.session.add(inc)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
    return redirect(url_for('index'))


@app.route('/members/<int:mid>/shift', methods=['POST'])
def toggle_shift(mid):
    if not role('admin', 'firefighter'): abort(403)
    data = request.get_json(silent=True) or {}
    member = TeamMember.query.get_or_404(mid)
    if data.get('action') == 'start':
        db.session.add(Shift(member_id=mid, is_active=True))
        member.status = 'available'
    else:
        for s in member.shifts: s.is_active = False
        member.status = 'off_duty'
    db.session.commit()
    return jsonify({'status': 'ok'})


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        u_name = request.form.get('username')
        p_word = request.form.get('password')

        u = User.query.filter_by(username=u_name, password=p_word).first()
        if u:
            session['user_id'] = u.id
            session['username'] = u.username
            session['role'] = u.role
            return redirect(url_for('index'))
        else:
            return "<h1 style='color:red; text-align:center; font-family:sans-serif; margin-top:50px;'>❌ Грешно име или парола! <a href='/login'>Опитай пак</a></h1>"
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        if User.query.filter_by(username=username).first():
            return "<h1 style='color:red; text-align:center; font-family:sans-serif; margin-top:50px;'>❌ Потребителското име вече е заето! <a href='/register'>Опитай пак</a></h1>"

        # Новорегистрираните потребители получават базова роля 'user'
        new_user = User(username=username, password=password, role='user')
        db.session.add(new_user)
        db.session.commit()
        return redirect(url_for('login'))
    return render_template('register.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


if __name__ == '__main__':
    app.run(debug=True)