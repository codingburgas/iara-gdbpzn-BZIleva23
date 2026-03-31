from flask import Flask, render_template, request, redirect, url_for, session, abort
from models import db, User, Incident
import folium
import json

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fire_system.db'
app.config['SECRET_KEY'] = 'phoenix-2026-final'
db.init_app(app)

with app.app_context():
    db.create_all()


@app.route('/')
def index():
    if 'user_id' not in session: return redirect(url_for('login'))

    incidents = Incident.query.order_by(Incident.timestamp.desc()).all()
    users = User.query.all()

    m = folium.Map(location=[42.7, 24.5], zoom_start=7, tiles=None, zoom_control=False)
    dark = folium.TileLayer('CartoDB dark_matter', name='dark', control=False).add_to(m)
    light = folium.TileLayer('CartoDB positron', name='light', control=False).add_to(m)

    incidents_data = []
    for inc in incidents:
        marker = folium.Marker(
            [inc.lat, inc.lon],
            popup=f"<b>{inc.title}</b><br>{inc.description}",
            icon=folium.Icon(color='red', icon='fire', prefix='fa')
        )
        marker.add_to(m)

        incidents_data.append({
            'id': inc.id,
            'title': inc.title,
            'lat': inc.lat,
            'lon': inc.lon,
            'marker_id': marker.get_name()  # Връзката между JS и Маркера
        })

    m.get_root().html.add_child(folium.Element(f"""
        <script>
            window.mapObj = {m.get_name()};
            window.darkLayer = {dark.get_name()};
            window.lightLayer = {light.get_name()};
            window.incData = {json.dumps(incidents_data)};
        </script>
    """))

    return render_template('index.html', incidents=incidents, users=users,
                           map_html=m._repr_html_(), user=session['username'], role=session.get('role'))


@app.route('/promote/<int:user_id>')
def promote(user_id):
    if session.get('role') not in ['admin', 'firefighter']: abort(403)
    u = User.query.get(user_id)
    if u:
        u.role = 'firefighter'
        db.session.commit()
    return redirect(url_for('index'))


@app.route('/add_incident', methods=['POST'])
def add_incident():
    if session.get('role') not in ['admin', 'firefighter']: abort(403)
    new_inc = Incident(title=request.form.get('title'), description=request.form.get('description'),
                       lat=float(request.form.get('lat')), lon=float(request.form.get('lon')))
    db.session.add(new_inc)
    db.session.commit()
    return redirect(url_for('index'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username'], password=request.form['password']).first()
        if user:
            session['user_id'], session['username'], session['role'] = user.id, user.username, user.role
            return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        role = 'admin' if User.query.count() == 0 else 'user'
        db.session.add(User(username=request.form['username'], password=request.form['password'], role=role))
        db.session.commit()
        return redirect(url_for('login'))
    return render_template('register.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


if __name__ == '__main__':
    app.run(debug=True)