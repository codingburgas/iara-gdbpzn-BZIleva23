import datetime

class Firefighter:
    def __init__(self, name, status="Available"):
        self.name = name
        self.status = status  # Available, On Duty, Sick

class FireTruck:
    def __init__(self, plate_number, truck_type):
        self.plate_number = plate_number
        self.truck_type = truck_type
        self.crew = []

    def add_firefighter(self, firefighter):
        self.crew.append(firefighter)
        print(f"Служител {firefighter.name} е зачислен към автомобил {self.plate_number}")

class Incident:
    def __init__(self, title, description="Няма описание"):
        self.title = title
        self.description = description
        self.timestamp = datetime.datetime.now()
        self.status = "New" # New, Active, Resolved

    def display_info(self):
        print(f"--- НОВО ПРОИЗШЕСТВИЕ ---")
        print(f"Заглавие: {self.title}")
        print(f"Час на регистриране: {self.timestamp.strftime('%H:%M:%S')}")
        print(f"Статус: {self.status}")