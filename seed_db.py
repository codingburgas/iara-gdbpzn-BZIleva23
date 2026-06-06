from app import app, db
from models import User, FireVehicle, TeamMember

VEHICLES_DATABASE = [
    ("ПА-Со-01", "Пожарогасителен автомобил", "MAN TGM 18.290", "София Град", "01 РСПБЗН - Триадица", 4000),
    ("АЦ-Со-02", "Автоцистерна за вода", "MAN TGS 26.480", "София Град", "02 РСПБЗН - Средец", 10000),
    ("АЛ-Со-01", "Автомеханична стълба", "MAN TGA 32.460", "София Град", "04 РСПБЗН - Искър", 0),
    ("ПА-Пд-01", "Пожарогасителен автомобил", "MAN TGM 15.250", "Пловдив", "01 РСПБЗН - Пловдив", 3000),
    ("АЦ-Пд-02", "Автоцистерна за вода", "Iveco Stralis", "Пловдив", "01 РСПБЗН - Пловдив", 8000),
    ("ПА-Вн-01", "Пожарогасителен автомобил", "MAN TGM 15.250", "Варна", "01 РСПБЗН - Варна Център", 3000),
    ("ПА-Бс-01", "Пожарогасителен автомобил", "MAN TGM 18.290", "Бургас", "01 РСПБЗН - Бургас", 4000),
    ("ПА-Бл-01", "Пожарогасителен автомобил", "MAN TGM 18.290", "Благоевград", "01 РСПБЗН - Благоевград", 4000),
    ("ПА-ВТ-01", "Пожарогасителен автомобил", "Scania P320", "Велико Търново", "РСПБЗН - В. Търново", 3000),
    ("ПА-Ру-01", "Пожарогасителен автомобил", "Mercedes Atego", "Русе", "01 РСПБЗН - Русе", 3000),
    ("ПА-СЗ-01", "Пожарогасителен автомобил", "MAN TGM", "Стара Загора", "РСПБЗН - Стара Загора", 3500)
]


def run_seeding():
    with app.app_context():
        print("[PHOENIX DB] Изтриване и преналиване на базата данни...")
        db.drop_all()
        db.create_all()

        # 1. Създаване на потребители с РАЗЛИЧНИ роли
        admin = User(username='admin', password='123', role='admin')
        firefighter = User(username='fire', password='123', role='firefighter')
        regular_user = User(username='user', password='123', role='user')

        db.session.add_all([admin, firefighter, regular_user])
        db.session.commit()

        print("✅ Потребители за тест (парола: 123): 'admin' (Админ), 'fire' (Пожарникар), 'user' (Гражданин)")

        # 2. Наливане на автомобилите
        created_vehicles = []
        for call_sign, v_type, model, region, station, water in VEHICLES_DATABASE:
            v = FireVehicle(
                call_sign=call_sign, vehicle_type=v_type, model=model,
                region=region, station=station, status='available', water_cap_l=water
            )
            db.session.add(v)
            created_vehicles.append(v)

        db.session.commit()
        print(f"✅ Вкарани {len(created_vehicles)} пожарни коли.")

        # 3. Автоматично създаване на дежурни служители, закачени за новите коли
        m1 = TeamMember(name="инсп. Димитър Иванов", vehicle_id=created_vehicles[0].id, status="available",
                        user_id=firefighter.id, gps_lat=42.6977, gps_lon=23.3219)
        m2 = TeamMember(name="мл. инсп. Георги Петров", vehicle_id=created_vehicles[3].id, status="available",
                        gps_lat=42.1354, gps_lon=24.7453)
        m3 = TeamMember(name="гл. пожарникар Стефан Тодоров", vehicle_id=created_vehicles[5].id, status="available",
                        gps_lat=43.2141, gps_lon=27.9147)

        db.session.add_all([m1, m2, m3])
        db.session.commit()
        print("✅ Създадени и оборудвани примерни дежурни екипи!")


if __name__ == '__main__':
    run_seeding()