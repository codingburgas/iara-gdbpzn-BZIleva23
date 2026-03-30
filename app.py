from flask import Flask, render_template, request, redirect, url_for, session, flash
from models import db, User, Incident
import folium

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fire_system.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'dev-key-123'

db.init_app(app)

with app.app_context():
    db.create_all()


@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    incidents_list = Incident.query.all()
    folium_map = folium.Map(location=[42.7, 24.5], zoom_start=7)

    for inc in incidents_list:
        folium.Marker(
            location=[inc.lat, inc.lon],
            popup=inc.title,
            icon=folium.Icon(color='red', icon='fire', prefix='fa')
        ).add_to(folium_map)

    map_html = folium_map._repr_html_()
    return render_template('index.html', incidents=incidents_list, map_html=map_html, user=session['username'])


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username'], password=request.form['password']).first()
        if user:
            session['user_id'] = user.id
            session['username'] = user.username
            return redirect(url_for('index'))
        flash('Грешни данни!')
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        if User.query.filter_by(username=request.form['username']).first():
            flash('Името е заето!')
        else:
            new_user = User(username=request.form['username'], password=request.form['password'])
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