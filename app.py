from flask import Flask, render_template
import folium
from models import Incident

app = Flask(__name__)

@app.route('/')
def index():
    # Примерни данни за ГДПБЗН
    incidents_data = [
        Incident("Горски пожар", 42.635, 23.290, "Витоша, район Бистрица"),
        Incident("ПТП", 42.145, 24.750, "АМ Тракия, км 120")
    ]

    # Създаване на карта
    m = folium.Map(location=[42.7, 24.5], zoom_start=7)
    for inc in incidents_data:
        folium.Marker([inc.lat, inc.lon], popup=inc.title).add_to(m)

    map_html = m._repr_html_()
    return render_template('index.html', incidents=incidents_data, map_html=map_html)

if __name__ == '__main__':
    app.run(debug=True)