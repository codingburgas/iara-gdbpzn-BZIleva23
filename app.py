from flask import Flask, render_template, request, redirect, url_for, session, abort
from models import db, User, Incident
import folium

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fire_system.db'
app.config['SECRET_KEY'] = 'fire-secure-key-2026'
db.init_app(app)

with app.app_context():
    db.create_all()


@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    incidents_list = Incident.query.order_by(Incident.timestamp.desc()).all()
    # Проверка за привилегии (admin или firefighter от твоята БД) [cite: 80]
    is_privileged = session.get('role') in ['admin', 'firefighter']
    all_users = User.query.all() if session.get('role') == 'admin' else []

    m = folium.Map(location=[42.7, 24.5], zoom_start=7, tiles=None, zoom_control=False)

    dark = folium.TileLayer('CartoDB dark_matter', name='dark', control=False).add_to(m)
    light = folium.TileLayer('CartoDB positron', name='light', control=False).add_to(m)

    map_id = m.get_name()
    m.get_root().html.add_child(folium.Element(f"""
        <script>
            window.mapInstance = {map_id};
            window.layers = {{ "dark": {dark.get_name()}, "light": {light.get_name()} }};
        </script>
    """))

    for inc in incidents_list:
        folium.Marker(
            [inc.lat, inc.lon],
            popup=f"{inc.title}: {inc.description}",
            icon=folium.Icon(color='red', icon='fire', prefix='fa')
        ).add_to(m)

    return render_template('index.html', incidents=incidents_list, users=all_users,
                           map_html=m._repr_html_(), user=session['username'], role=session.get('role'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username'], password=request.form['password']).first()
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
        new_user = User(username=request.form['username'], password=request.form['password'], role=role)
        db.session.add(new_user)
        db.session.commit()
        return redirect(url_for('login'))
    return render_template('register.html')


@app.route('/add_incident', methods=['POST'])
def add_incident():
    if session.get('role') not in ['admin', 'firefighter']: abort(403)
    new_inc = Incident(
        title=request.form.get('title'),
        description=request.form.get('description'),
        lat=float(request.form.get('lat')),
        lon=float(request.form.get('lon'))
    )
    db.session.add(new_inc)
    db.session.commit()
    return redirect(url_for('index'))


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


if __name__ == '__main__':
    app.run(debug=True)