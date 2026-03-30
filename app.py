from flask import Flask, render_template, request, redirect, url_for, session
from models import db, User, Incident
import folium

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fire_system.db'
app.config['SECRET_KEY'] = 'fire-secure-key'
db.init_app(app)

with app.app_context():
    db.create_all()

@app.route('/')
def index():
    if 'user_id' not in session: return redirect(url_for('login'))
    incidents_list = Incident.query.order_by(Incident.timestamp.desc()).all()
    # Тъмна карта за модерен вид
    m = folium.Map(location=[42.7, 24.5], zoom_start=7, tiles='CartoDB dark_matter', zoom_control=False)
    for inc in incidents_list:
        folium.Marker([inc.lat, inc.lon], popup=inc.title).add_to(m)
    return render_template('index.html', incidents=incidents_list, map_html=m._repr_html_(), user=session['username'])

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username'], password=request.form['password']).first()
        if user:
            session['user_id'], session['username'] = user.id, user.username
            return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        new_user = User(username=request.form['username'], password=request.form['password'])
        db.session.add(new_user)
        db.session.commit()
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/add_incident', methods=['POST'])
def add_incident():
    if 'user_id' not in session: return redirect(url_for('login'))
    new_inc = Incident(title=request.form.get('title'), description=request.form.get('description'),
                       lat=float(request.form.get('lat')), lon=float(request.form.get('lon')))
    db.session.add(new_inc)
    db.session.commit()
    return redirect(url_for('index'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(debug=True)