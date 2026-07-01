# PHOENIX - National Dispatch and Emergency Management System

PHOENIX is a real-time tactical dispatch and emergency coordination platform designed for civil protection, first responders, and citizens. It features a responsive dark-themed interface, interactive maps, and localized data gathering.

---

## Key Features by Role

### Admin (Dispatcher)
* **Scrollable Workspace:** Independent scrolling panels ensure all management forms remain visible.
* **Incident Management:** Deploy incidents with specific Hazardous Materials (HAZMAT) data.
* **Role Controls:** Switch permissions between User, Firefighter, and Admin.
* **Task Allocation:** Dispatch tactical instructions directly to field teams.

### Firefighter (First Responder)
* **SOS Beacon:** Immediate distress signal broadcasting.
* **Resource Monitoring:** Live status updates for vehicle water and foam supply tanks.
* **Weather and Environment:** Displays field wind data and localized threat levels.
* **Infrastructure Locators:** Quick references for the nearest fire hydrants and water sources.

### User (Citizen)
* **GPS Reporting:** One-tap geolocation retrieval using browser GPS APIs.
* **Media Uploads:** Send photo attachments directly to dispatchers.
* **Survival Handbook:** Access to built-in emergency evacuation guides.
* **Emergency Hot-dial:** System emulation for the national 112 hotline.

---

## Tech Stack

* **Backend:** Python (Flask)
* **Frontend:** HTML5, Tailwind CSS, JavaScript
* **Mapping Engine:** Folium integration

---

## Installation and Setup

1. **Install dependencies:**
   ```bash
   pip install flask folium

