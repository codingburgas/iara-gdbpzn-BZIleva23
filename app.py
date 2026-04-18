from flask import Flask, render_template, request, redirect, url_for, session, abort, jsonify
from models import db, User, Incident, Task, ChatMessage, TeamMember
import folium
import json
from datetime import datetime

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fire_system.db'
app.config['SECRET_KEY'] = 'phoenix-2026-secure'
db.init_app(app)

with app.app_context():
    db.create_all()
    # Ако няма нито един admin потребител, създай default
    if not User.query.filter_by(role='admin').first():
        admin = User(username='admin', password='admin123', role='admin')
        db.session.add(admin)
        db.session.commit()
        print("[PHOENIX] Default admin създаден: admin / admin123")


# ══════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════

def require_login():
    return 'user_id' in session

def require_role(*roles):
    return session.get('role') in roles


# ══════════════════════════════════════════════════════════
#  ГЛАВНА СТРАНИЦА
# ══════════════════════════════════════════════════════════

@app.route('/')
def index():
    if not require_login():
        return redirect(url_for('login'))

    incidents = Incident.query.order_by(Incident.timestamp.desc()).all()
    users = User.query.all()
    members = TeamMember.query.all()

    m = folium.Map(location=[42.7, 24.5], zoom_start=7, tiles=None, zoom_control=False)
    dark = folium.TileLayer('CartoDB dark_matter', name='dark', control=False).add_to(m)
    light = folium.TileLayer('CartoDB positron', name='light', control=False).add_to(m)

    incidents_data = []
    for inc in incidents:
        color = 'red' if inc.status == 'active' else 'gray'
        marker = folium.Marker(
            [inc.lat, inc.lon],
            popup=f"<b>{inc.title}</b><br>{inc.description or ''}",
            icon=folium.Icon(color=color, icon='fire', prefix='fa')
        )
        marker.add_to(m)
        incidents_data.append({
            'id': inc.id,
            'title': inc.title,
            'lat': inc.lat,
            'lon': inc.lon,
            'marker_id': marker.get_name()
        })

    m.get_root().html.add_child(folium.Element(f"""
        <script>
            window.mapObj = {m.get_name()};
            window.darkLayer = {dark.get_name()};
            window.lightLayer = {light.get_name()};
            window.incData = {json.dumps(incidents_data)};
        </script>
    """))

    return render_template('index.html',
                           incidents=incidents,
                           users=users,
                           members=members,
                           map_html=m._repr_html_(),
                           user=session['username'],
                           role=session.get('role'))


# ══════════════════════════════════════════════════════════
#  ПРОИЗШЕСТВИЯ
# ══════════════════════════════════════════════════════════

@app.route('/add_incident', methods=['POST'])
def add_incident():
    if not require_role('admin', 'firefighter'):
        abort(403)
    try:
        new_inc = Incident(
            title=request.form.get('title', 'Без заглавие'),
            description=request.form.get('description', ''),
            lat=float(request.form.get('lat', 42.7)),
            lon=float(request.form.get('lon', 24.5))
        )
        db.session.add(new_inc)
        db.session.commit()
    except Exception as e:
        print(f"[ERROR] add_incident: {e}")
    return redirect(url_for('index'))


@app.route('/resolve_incident/<int:inc_id>', methods=['POST'])
def resolve_incident(inc_id):
    if not require_role('admin', 'firefighter'):
        abort(403)
    inc = Incident.query.get_or_404(inc_id)
    inc.status = 'resolved'
    db.session.commit()
    return jsonify({'status': 'ok'})


# ══════════════════════════════════════════════════════════
#  ЗАДАЧИ
# ══════════════════════════════════════════════════════════

@app.route('/tasks/<int:incident_id>')
def get_tasks(incident_id):
    if not require_login():
        abort(401)
    tasks = Task.query.filter_by(incident_id=incident_id).order_by(Task.created_at).all()
    return jsonify([{
        'id': t.id,
        'title': t.title,
        'status': t.status,
        'assigned_to': t.assigned_to or '',
        'task_type': t.task_type,
    } for t in tasks])


@app.route('/tasks/add', methods=['POST'])
def add_task():
    if not require_role('admin', 'firefighter'):
        abort(403)
    data = request.get_json()
    if not data or not data.get('incident_id') or not data.get('title'):
        return jsonify({'error': 'missing data'}), 400
    task = Task(
        incident_id=int(data['incident_id']),
        title=data['title'].strip(),
        assigned_to=data.get('assigned_to', ''),
        task_type=data.get('task_type', 'operative')
    )
    db.session.add(task)
    db.session.commit()
    return jsonify({'status': 'ok', 'id': task.id})


@app.route('/tasks/<int:task_id>/complete', methods=['POST'])
def complete_task(task_id):
    if not require_login():
        abort(401)
    task = Task.query.get_or_404(task_id)
    task.status = 'done'
    task.completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'ok'})


# ══════════════════════════════════════════════════════════
#  ЧАТ КАНАЛ
# ══════════════════════════════════════════════════════════

@app.route('/chat/<int:incident_id>')
def get_chat(incident_id):
    if not require_login():
        abort(401)
    msgs = ChatMessage.query.filter_by(incident_id=incident_id)\
                            .order_by(ChatMessage.timestamp)\
                            .limit(100).all()
    return jsonify([{
        'user': m.user,
        'text': m.text,
        'time': m.timestamp.strftime('%H:%M')
    } for m in msgs])


@app.route('/chat/send', methods=['POST'])
def send_chat():
    if not require_login():
        abort(401)
    data = request.get_json()
    if not data or not data.get('incident_id') or not data.get('text'):
        return jsonify({'error': 'missing data'}), 400
    msg = ChatMessage(
        incident_id=int(data['incident_id']),
        user=session['username'],
        text=data['text'].strip()
    )
    db.session.add(msg)
    db.session.commit()
    return jsonify({'status': 'ok'})


# ══════════════════════════════════════════════════════════
#  ЕКИПИ / СЛУЖИТЕЛИ
# ══════════════════════════════════════════════════════════

@app.route('/members')
def get_members():
    if not require_login():
        abort(401)
    members = TeamMember.query.all()
    return jsonify([{
        'id': m.id,
        'name': m.name,
        'vehicle': m.vehicle or '',
        'status': m.status,
        'shift_active': m.shift_active
    } for m in members])


@app.route('/members/add', methods=['POST'])
def add_member():
    if not require_role('admin'):
        abort(403)
    data = request.get_json()
    m = TeamMember(
        name=data['name'],
        vehicle=data.get('vehicle', ''),
        status=data.get('status', 'available'),
        shift_active=data.get('shift_active', True)
    )
    db.session.add(m)
    db.session.commit()
    return jsonify({'status': 'ok', 'id': m.id})


@app.route('/members/<int:member_id>/status', methods=['POST'])
def update_member_status(member_id):
    if not require_role('admin', 'firefighter'):
        abort(403)
    data = request.get_json()
    m = TeamMember.query.get_or_404(member_id)
    m.status = data.get('status', m.status)
    db.session.commit()
    return jsonify({'status': 'ok'})


# ══════════════════════════════════════════════════════════
#  SOS
# ══════════════════════════════════════════════════════════

@app.route('/sos', methods=['POST'])
def sos():
    if not require_login():
        abort(401)
    data = request.get_json()
    print(f"[🆘 SOS] {session['username']} @ lat={data.get('lat')}, lon={data.get('lon')}")
    return jsonify({'status': 'ok'})


# ══════════════════════════════════════════════════════════
#  УПРАВЛЕНИЕ НА ПОТРЕБИТЕЛИ (само admin)
# ══════════════════════════════════════════════════════════

@app.route('/promote/<int:user_id>', methods=['POST'])
def promote(user_id):
    if not require_role('admin'):
        abort(403)
    data = request.get_json() or {}
    new_role = data.get('role', 'firefighter')
    if new_role not in ('admin', 'firefighter', 'user'):
        return jsonify({'error': 'invalid role'}), 400
    u = User.query.get_or_404(user_id)
    u.role = new_role
    db.session.commit()
    return jsonify({'status': 'ok', 'new_role': new_role})


# ══════════════════════════════════════════════════════════
#  АВТЕНТИКАЦИЯ
# ══════════════════════════════════════════════════════════

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        user = User.query.filter_by(username=username, password=password).first()
        if user:
            session['user_id'] = user.id
            session['username'] = user.username
            session['role'] = user.role
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
            # Първият регистриран е admin, останалите са 'user'
            role = 'admin' if User.query.count() == 0 else 'user'
            db.session.add(User(username=username, password=password, role=role))
            db.session.commit()
            return redirect(url_for('login'))
    return render_template('register.html', error=error)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


if __name__ == '__main__':
    app.run(debug=True)