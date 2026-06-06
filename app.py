from flask import (Flask, render_template, request, redirect,
                   url_for, session, abort, jsonify, send_from_directory)
from models import (db, User, Incident, Task, ChatMessage, GlobalMessage,
                    TeamMember, Shift, FireVehicle, IncidentPhoto, AssignedTeam)
from datetime import datetime
import folium, json, os

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fire_system.db'
app.config['SECRET_KEY'] = 'phoenix-2026-secure'
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
db.init_app(app)

with app.app_context():
    db.create_all()
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


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

        # GPS Навигационни бутони, интегрирани в картата
        popup_html = f"""
            <b>{inc.title}</b><br>{inc.description or ''}<br>
            {'⚠️ РАНЕНИ: ' + str(inc.injured_count) if inc.injured else ''}
            <hr style='margin:8px 0; border-color:#444;'>
            <div style='display:flex; gap:5px;'>
                <a href='https://www.google.com/maps/search/?api=1&query={inc.lat},{inc.lon}' target='_blank' style='background:#4285F4; color:white; padding:4px 6px; border-radius:4px; text-decoration:none; font-size:11px; font-weight:bold;'>🗺️ Google</a>
                <a href='https://waze.com/ul?ll={inc.lat},{inc.lon}&navigate=yes' target='_blank' style='background:#33CCFF; color:black; padding:4px 6px; border-radius:4px; text-decoration:none; font-size:11px; font-weight:bold;'>🚙 Waze</a>
            </div>
        """

        marker = folium.Marker(
            [inc.lat, inc.lon],
            popup=folium.Popup(popup_html, max_width=250),
            icon=folium.Icon(color=color, icon=icon_name, prefix='fa')
        )
        marker.add_to(m)
        inc_data.append({
            'id': inc.id, 'title': inc.title, 'lat': inc.lat, 'lon': inc.lon,
            'marker_id': marker.get_name(), 'source': inc.source, 'status': inc.status
        })

    for mem in members:
        if mem.gps_lat and mem.gps_lon:
            folium.CircleMarker(
                [mem.gps_lat, mem.gps_lon], radius=7, color='#3b82f6', fill=True,
                popup=f"🚒 {mem.name} ({mem.status})"
            ).add_to(m)

    m.get_root().html.add_child(folium.Element(f"""
        <script>
            window.mapObj={m.get_name()}; window.darkLayer={dark.get_name()};
            window.lightLayer={light.get_name()}; window.incData={json.dumps(inc_data)};
        </script>
    """))

    return render_template('index.html', incidents=incidents, users=users, members=members, vehicles=vehicles,
                           map_html=m._repr_html_(), user=session['username'], role=session.get('role'))


@app.route('/incidents/list')
def list_active_incidents():
    if not ok(): abort(401)
    active = Incident.query.filter_by(status='active').all()
    return jsonify([{'id': i.id, 'title': i.title} for i in active])


@app.route('/incident/<int:inc_id>/assign', methods=['POST'])
def assign_member(inc_id):
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
    if not role('admin', 'firefighter'): abort(403)
    try:
        inc = Incident(
            title=request.form.get('title', 'Без заглавие'),
            description=request.form.get('description', ''),
            lat=float(request.form.get('lat', 42.7)),
            lon=float(request.form.get('lon', 24.5)),
            source='operator',
            status='active'
        )
        db.session.add(inc)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
    return redirect(url_for('index'))


@app.route('/resolve_incident/<int:inc_id>', methods=['POST'])
def resolve_incident(inc_id):
    if not role('admin', 'firefighter'): abort(403)
    inc = Incident.query.get_or_404(inc_id)
    inc.status = 'resolved'
    for a in AssignedTeam.query.filter_by(incident_id=inc_id).all():
        a.status = 'returned'
        a.member.status = 'available'
    db.session.commit()
    return jsonify({'status': 'ok'})


@app.route('/vehicles')
def get_vehicles():
    if not ok(): abort(401)
    region = request.args.get('region', '')
    q = FireVehicle.query
    if region: q = q.filter_by(region=region)
    return jsonify([{'id': v.id, 'call_sign': v.call_sign, 'vehicle_type': v.vehicle_type, 'model': v.model,
                     'region': v.region, 'station': v.station, 'status': v.status, 'water_cap_l': v.water_cap_l} for v
                    in q.all()])


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
        u = User.query.filter_by(username=request.form.get('username'), password=request.form.get('password')).first()
        if u:
            session['user_id'], session['username'], session['role'] = u.id, u.username, u.role
            return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        if User.query.filter_by(username=username).first():
            return "Потребителското име е заето!", 400

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