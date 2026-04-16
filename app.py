from flask import Flask, render_template, request, redirect, url_for, session, abort, jsonify
from models import db, User, Incident, Task, ChatMessage, TeamMember
import folium
import json
from datetime import datetime

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fire_system.db'
app.config['SECRET_KEY'] = 'phoenix-2026-final'
db.init_app(app)

with app.app_context():
    db.create_all()


# ══════════════════════════════════════════════════════════
#  ГЛАВНА СТРАНИЦА
# ══════════════════════════════════════════════════════════

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    incidents = Incident.query.order_by(Incident.timestamp.desc()).all()
    users = User.query.all()

    m = folium.Map(location=[42.7, 24.5], zoom_start=7, tiles=None, zoom_control=False)
    dark = folium.TileLayer('CartoDB dark_matter', name='dark', control=False).add_to(m)
    light = folium.TileLayer('CartoDB positron', name='light', control=False).add_to(m)

    incidents_data = []
    for inc in incidents:
        color = 'red' if inc.status == 'active' else 'gray'
        marker = folium.Marker(
            [inc.lat, inc.lon],
            popup=f"<b>{inc.title}</b><br>{inc.description}",
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
                           map_html=m._repr_html_(),
                           user=session['username'],
                           role=session.get('role'))


# ══════════════════════════════════════════════════════════
#  ПРОИЗШЕСТВИЯ
# ══════════════════════════════════════════════════════════

@app.route('/add_incident', methods=['POST'])
def add_incident():
    if session.get('role') not in ['admin', 'firefighter']:
        abort(403)
    new_inc = Incident(
        title=request.form.get('title'),
        description=request.form.get('description'),
        lat=float(request.form.get('lat')),
        lon=float(request.form.get('lon'))
    )
    db.session.add(new_inc)
    db.session.commit()
    return redirect(url_for('index'))


# ══════════════════════════════════════════════════════════
#  ЗАДАЧИ
# ══════════════════════════════════════════════════════════

@app.route('/tasks/<int:incident_id>')
def get_tasks(incident_id):
    if 'user_id' not in session:
        abort(401)
    tasks = Task.query.filter_by(incident_id=incident_id).order_by(Task.created_at).all()
    return jsonify([{
        'id': t.id,
        'title': t.title,
        'status': t.status,
        'assigned_to': t.assigned_to,
        'task_type': t.task_type,
    } for t in tasks])


@app.route('/tasks/add', methods=['POST'])
def add_task():
    if session.get('role') not in ['admin', 'firefighter']:
        abort(403)
    data = request.get_json()
    task = Task(
        incident_id=data['incident_id'],
        title=data['title'],
        assigned_to=data.get('assigned_to'),
        task_type=data.get('task_type', 'operative')
    )
    db.session.add(task)
    db.session.commit()
    return jsonify({'status': 'ok', 'id': task.id})


@app.route('/tasks/<int:task_id>/complete', methods=['POST'])
def complete_task(task_id):
    if 'user_id' not in session:
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
    if 'user_id' not in session:
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
    if 'user_id' not in session:
        abort(401)
    data = request.get_json()
    msg = ChatMessage(
        incident_id=data['incident_id'],
        user=session['username'],
        text=data['text']
    )
    db.session.add(msg)
    db.session.commit()
    return jsonify({'status': 'ok'})


# ══════════════════════════════════════════════════════════
#  SOS СИГНАЛ
# ══════════════════════════════════════════════════════════

@app.route('/sos', methods=['POST'])
def sos():
    if 'user_id' not in session:
        abort(401)
    data = request.get_json()
    # Изпраща съобщение в чата на всички активни произшествия
    # (в реална система — push notification до оперативния център)
    print(f"[SOS] {session['username']} @ lat={data['lat']}, lon={data['lon']}")
    return jsonify({'status': 'ok'})


# ══════════════════════════════════════════════════════════
#  АВТЕНТИКАЦИЯ
# ══════════════════════════════════════════════════════════

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(
            username=request.form['username'],
            password=request.form['password']
        ).first()
        if user:
            session['user_id'] = user.id
            session['username'] = user.username
            session['role'] = user.role
            return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        role = 'admin' if User.query.count() == 0 else 'user'
        db.session.add(User(
            username=request.form['username'],
            password=request.form['password'],
            role=role
        ))
        db.session.commit()
        return redirect(url_for('login'))
    return render_template('register.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/promote/<int:user_id>')
def promote(user_id):
    if session.get('role') not in ['admin', 'firefighter']:
        abort(403)
    u = User.query.get(user_id)
    if u:
        u.role = 'firefighter'
        db.session.commit()
    return redirect(url_for('index'))


if __name__ == '__main__':
    app.run(debug=True)