from flask import (Flask, render_template, request, redirect,
                   url_for, session, abort, jsonify)
from models import (db, User, Incident, Task, ChatMessage,
                    GlobalMessage, TeamMember, Shift, FireVehicle)
from datetime import datetime
import folium, json

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fire_system.db'
app.config['SECRET_KEY'] = 'phoenix-2026-secure'
db.init_app(app)

with app.app_context():
    db.create_all()
    if not User.query.filter_by(username='admin').first():
        db.session.add(User(username='admin', password='admin123', role='admin'))
        db.session.commit()
        print('[PHOENIX] ✅ admin / admin123')


# ── helpers ─────────────────────────────────────────────────────────────────

def ok():      return 'user_id' in session
def role(*r):  return session.get('role') in r


# ── INDEX ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    if not ok(): return redirect(url_for('login'))

    incidents = Incident.query.order_by(Incident.timestamp.desc()).all()
    users     = User.query.all()
    members   = TeamMember.query.all()
    vehicles  = FireVehicle.query.order_by(FireVehicle.region, FireVehicle.call_sign).all()

    m     = folium.Map(location=[42.7, 24.5], zoom_start=7, tiles=None, zoom_control=False)
    dark  = folium.TileLayer('CartoDB dark_matter', name='dark',  control=False).add_to(m)
    light = folium.TileLayer('CartoDB positron',    name='light', control=False).add_to(m)

    inc_data = []
    for inc in incidents:
        color  = 'red' if inc.status == 'active' else 'gray'
        # Иконка за граждански сигнали
        icon_name = 'fire' if inc.source != 'citizen' else 'exclamation-circle'
        marker = folium.Marker(
            [inc.lat, inc.lon],
            popup=f"""<b>{inc.title}</b><br>
                {inc.description or ''}<br>
                {'⚠️ РАНЕНИ: '+str(inc.injured_count) if inc.injured else ''}
                {'☢️ ОПАСНИ ВЕЩЕСТВА' if inc.hazmat else ''}""",
            icon=folium.Icon(color=color, icon=icon_name, prefix='fa')
        )
        marker.add_to(m)
        inc_data.append({
            'id': inc.id, 'title': inc.title,
            'lat': inc.lat, 'lon': inc.lon,
            'marker_id': marker.get_name(),
            'source': inc.source,
            'injured': inc.injured,
        })

    # GPS маркери на екипите
    for mem in members:
        if mem.gps_lat and mem.gps_lon:
            folium.CircleMarker(
                [mem.gps_lat, mem.gps_lon],
                radius=7, color='#3b82f6', fill=True, fill_color='#3b82f6',
                popup=f"🚒 {mem.name}"
            ).add_to(m)

    m.get_root().html.add_child(folium.Element(f"""
        <script>
            window.mapObj     = {m.get_name()};
            window.darkLayer  = {dark.get_name()};
            window.lightLayer = {light.get_name()};
            window.incData    = {json.dumps(inc_data)};
        </script>
    """))

    return render_template('index.html',
                           incidents=incidents, users=users,
                           members=members, vehicles=vehicles,
                           map_html=m._repr_html_(),
                           user=session['username'],
                           role=session.get('role'))


# ── INCIDENTS ────────────────────────────────────────────────────────────────

@app.route('/add_incident', methods=['POST'])
def add_incident():
    if not role('admin', 'firefighter'): abort(403)
    try:
        db.session.add(Incident(
            title=request.form.get('title', 'Без заглавие'),
            description=request.form.get('description', ''),
            lat=float(request.form.get('lat', 42.7)),
            lon=float(request.form.get('lon', 24.5)),
            source='operator'
        ))
        db.session.commit()
    except Exception as e:
        print(f'[ERROR] add_incident: {e}')
    return redirect(url_for('index'))


@app.route('/citizen_report', methods=['POST'])
def citizen_report():
    """Граждански сигнал — достъпен за всички (и user)."""
    if not ok(): abort(401)
    try:
        data = request.get_json(silent=True) or {}
        inc = Incident(
            title=data.get('incident_type', 'Граждански сигнал'),
            description=data.get('description', ''),
            lat=float(data.get('lat', 42.7)),
            lon=float(data.get('lon', 24.5)),
            source='citizen',
            injured=bool(data.get('injured', False)),
            injured_count=int(data.get('injured_count', 0)),
            hazmat=bool(data.get('hazmat', False)),
            reporter_name=data.get('reporter_name', ''),
            reporter_phone=data.get('reporter_phone', ''),
            status='active'
        )
        db.session.add(inc)
        db.session.commit()
        return jsonify({'status': 'ok', 'id': inc.id})
    except Exception as e:
        print(f'[ERROR] citizen_report: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/resolve_incident/<int:inc_id>', methods=['POST'])
def resolve_incident(inc_id):
    if not role('admin', 'firefighter'): abort(403)
    inc = Incident.query.get_or_404(inc_id)
    inc.status = 'resolved'
    db.session.commit()
    return jsonify({'status': 'ok'})


@app.route('/incidents/new_since/<int:since_id>')
def new_since(since_id):
    """Polling за нови произшествия — за нотификации."""
    if not ok(): abort(401)
    new = Incident.query.filter(Incident.id > since_id).all()
    return jsonify([{'id': i.id, 'title': i.title, 'source': i.source} for i in new])


# ── TASKS ────────────────────────────────────────────────────────────────────

@app.route('/tasks/<int:incident_id>')
def get_tasks(incident_id):
    if not ok(): abort(401)
    tasks = Task.query.filter_by(incident_id=incident_id).order_by(Task.created_at).all()
    return jsonify([{
        'id': t.id, 'title': t.title, 'status': t.status,
        'assigned_to': t.assigned_to or '', 'task_type': t.task_type,
    } for t in tasks])


@app.route('/tasks/add', methods=['POST'])
def add_task():
    if not role('admin', 'firefighter'): abort(403)
    data = request.get_json(silent=True) or {}
    if not data.get('incident_id') or not data.get('title'):
        return jsonify({'error': 'missing data'}), 400
    t = Task(
        incident_id=int(data['incident_id']),
        title=data['title'].strip(),
        assigned_to=data.get('assigned_to', ''),
        task_type=data.get('task_type', 'operative')
    )
    db.session.add(t)
    db.session.commit()
    return jsonify({'status': 'ok', 'id': t.id})


@app.route('/tasks/<int:task_id>/complete', methods=['POST'])
def complete_task(task_id):
    if not ok(): abort(401)
    t = Task.query.get_or_404(task_id)
    t.status = 'done'
    t.completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'ok'})


# ── INCIDENT CHAT ─────────────────────────────────────────────────────────────

@app.route('/chat/<int:incident_id>')
def get_chat(incident_id):
    if not ok(): abort(401)
    msgs = (ChatMessage.query.filter_by(incident_id=incident_id)
            .order_by(ChatMessage.ts).limit(100).all())
    return jsonify([{'user': m.user, 'text': m.text,
                     'time': m.ts.strftime('%H:%M')} for m in msgs])


@app.route('/chat/send', methods=['POST'])
def send_chat():
    if not role('admin', 'firefighter'): abort(403)   # само опер. персонал
    data = request.get_json(silent=True) or {}
    if not data.get('incident_id') or not data.get('text'):
        return jsonify({'error': 'missing data'}), 400
    db.session.add(ChatMessage(
        incident_id=int(data['incident_id']),
        user=session['username'],
        text=data['text'].strip()
    ))
    db.session.commit()
    return jsonify({'status': 'ok'})


# ── GLOBAL CHAT (само admin + firefighter) ────────────────────────────────────

@app.route('/gchat')
def get_gchat():
    if not role('admin', 'firefighter'): abort(403)
    msgs = (GlobalMessage.query.order_by(GlobalMessage.ts).limit(100).all())
    return jsonify([{
        'user': m.user, 'role': m.role,
        'text': m.text, 'time': m.ts.strftime('%H:%M')
    } for m in msgs])


@app.route('/gchat/send', methods=['POST'])
def send_gchat():
    if not role('admin', 'firefighter'): abort(403)
    data = request.get_json(silent=True) or {}
    if not data.get('text'):
        return jsonify({'error': 'missing text'}), 400
    db.session.add(GlobalMessage(
        user=session['username'],
        role=session.get('role', 'user'),
        text=data['text'].strip()
    ))
    db.session.commit()
    return jsonify({'status': 'ok'})


# ── MEMBERS ──────────────────────────────────────────────────────────────────

@app.route('/members')
def get_members():
    if not ok(): abort(401)
    members = TeamMember.query.all()
    result = []
    for m in members:
        active_shift = next((s for s in m.shifts if s.is_active), None)
        result.append({
            'id': m.id, 'name': m.name, 'status': m.status,
            'vehicle': m.vehicle.call_sign if m.vehicle else '',
            'vehicle_id': m.vehicle_id,
            'on_shift': active_shift is not None,
            'shift_notes': active_shift.notes if active_shift else '',
            'gps_lat': m.gps_lat, 'gps_lon': m.gps_lon,
        })
    return jsonify(result)


@app.route('/members/add', methods=['POST'])
def add_member():
    if not role('admin'): abort(403)
    data = request.get_json(silent=True) or {}
    m = TeamMember(
        name=data.get('name', '').strip(),
        vehicle_id=data.get('vehicle_id') or None,
        status='available'
    )
    db.session.add(m)
    db.session.commit()
    if data.get('start_shift'):
        db.session.add(Shift(member_id=m.id, is_active=True))
        db.session.commit()
    return jsonify({'status': 'ok', 'id': m.id})


@app.route('/members/<int:mid>/status', methods=['POST'])
def update_member_status(mid):
    if not role('admin', 'firefighter'): abort(403)
    data = request.get_json(silent=True) or {}
    m = TeamMember.query.get_or_404(mid)
    m.status = data.get('status', m.status)
    db.session.commit()
    return jsonify({'status': 'ok'})


@app.route('/members/<int:mid>/gps', methods=['POST'])
def update_gps(mid):
    """Пожарникарят изпраща позицията си от мобилното устройство."""
    if not ok(): abort(401)
    data = request.get_json(silent=True) or {}
    m = TeamMember.query.get_or_404(mid)
    m.gps_lat = data.get('lat')
    m.gps_lon = data.get('lon')
    m.gps_updated = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'ok'})


@app.route('/members/<int:mid>/shift', methods=['POST'])
def toggle_shift(mid):
    if not role('admin'): abort(403)
    data   = request.get_json(silent=True) or {}
    member = TeamMember.query.get_or_404(mid)
    action = data.get('action')
    if action == 'start':
        for s in member.shifts:
            if s.is_active:
                s.is_active = False; s.end_time = datetime.utcnow()
        db.session.add(Shift(member_id=mid, is_active=True, notes=data.get('notes', '')))
        member.status = 'available'
    elif action == 'end':
        for s in member.shifts:
            if s.is_active:
                s.is_active = False; s.end_time = datetime.utcnow()
        member.status = 'off_duty'
    db.session.commit()
    return jsonify({'status': 'ok'})


# ── VEHICLES ─────────────────────────────────────────────────────────────────

@app.route('/vehicles')
def get_vehicles():
    if not ok(): abort(401)
    region = request.args.get('region', '')
    q = FireVehicle.query
    if region: q = q.filter_by(region=region)
    return jsonify([{
        'id': v.id, 'call_sign': v.call_sign, 'vehicle_type': v.vehicle_type,
        'model': v.model, 'region': v.region, 'station': v.station,
        'status': v.status, 'water_cap_l': v.water_cap_l,
        'crew_count': len(v.crew)
    } for v in q.order_by(FireVehicle.region, FireVehicle.call_sign).all()])


@app.route('/vehicles/<int:vid>/status', methods=['POST'])
def update_vehicle_status(vid):
    if not role('admin', 'firefighter'): abort(403)
    data = request.get_json(silent=True) or {}
    v = FireVehicle.query.get_or_404(vid)
    v.status = data.get('status', v.status)
    db.session.commit()
    return jsonify({'status': 'ok'})


# ── SOS ──────────────────────────────────────────────────────────────────────

@app.route('/sos', methods=['POST'])
def sos():
    if not ok(): abort(401)
    data = request.get_json(silent=True) or {}
    print(f'[🆘 SOS] {session["username"]} @ {data.get("lat")}, {data.get("lon")}')
    return jsonify({'status': 'ok'})


# ── ADMIN / USERS ─────────────────────────────────────────────────────────────

@app.route('/promote/<int:user_id>', methods=['POST'])
def promote(user_id):
    if not role('admin'): abort(403)
    data     = request.get_json(silent=True) or {}
    new_role = data.get('role', 'firefighter')
    if new_role not in ('admin', 'firefighter', 'user'):
        return jsonify({'error': 'invalid role'}), 400
    u = User.query.get_or_404(user_id)
    u.role = new_role
    db.session.commit()
    return jsonify({'status': 'ok', 'new_role': new_role})


# ── AUTH ─────────────────────────────────────────────────────────────────────

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        u = User.query.filter_by(
            username=request.form.get('username', '').strip(),
            password=request.form.get('password', '')
        ).first()
        if u:
            session['user_id']  = u.id
            session['username'] = u.username
            session['role']     = u.role
            return redirect(url_for('index'))
        error = 'Грешно потребителско име или парола'
    return render_template('login.html', error=error)


@app.route('/register', methods=['GET', 'POST'])
def register():
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        if User.query.filter_by(username=username).first():
            error = 'Потребителят вече съществува'
        else:
            role_val = 'admin' if User.query.count() == 0 else 'user'
            db.session.add(User(username=username, password=password, role=role_val))
            db.session.commit()
            return redirect(url_for('login'))
    return render_template('register.html', error=error)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


if __name__ == '__main__':
    app.run(debug=True)