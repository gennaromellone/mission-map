from flask import Flask, render_template, request, jsonify, Response, send_from_directory, abort
from flask_sqlalchemy import SQLAlchemy

import time
import random
import json
import re
import os

import serial.tools.list_ports

from broadcaster_v2 import Device, NMEA0183, Depth
from broadcaster import MsgReceiver

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///mission_map.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
broadcast = MsgReceiver()
saved_lines = []
devices = {}

last_position = {
    'lat': 40.855640711460936,
    'lon':  14.284214343900299,
    'depth': 0.0
    }
TILE_FOLDER = "/home/navigation/tiles"

# Database models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)

class Boat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)

class MissionPlan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    path = db.Column(db.Text, nullable=False)  # GeoJSON string
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    boat_id = db.Column(db.Integer)

class USVData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    mission_id = db.Column(db.Integer)
    timestamp = db.Column(db.Float, default=time.time)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    depth = db.Column(db.Float, nullable=False)

def initialize_devices():
    """Inizializza i dispositivi basandosi sul file di configurazione."""
    global devices
    devices.clear()
    try:
        with open("config.json", "r") as file:
            config = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        print("[ERRORE] Impossibile caricare il file di configurazione.")
        config = {}
    
    available_ports = Device.list_serial_ports()
    
    for device_name, device_config in config.items():
        device_type = device_config.get("type", "Sconosciuto")
        
        if device_type == "NMEA0183":
            device = NMEA0183(device_config)
        else:
            device = Depth(device_config)
        
        device.find_device_port(available_ports)
        devices[device_name] = device
        print(devices)

initialize_devices()

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/configuration')
def configuration():
    return render_template('config.html')

@app.route("/devices", methods=["GET"])
def get_devices():
    """Restituisce la lista dei dispositivi inizializzati."""
    return jsonify({"devices": list(devices.keys())})

@app.route("/device/<device_name>", methods=["GET"])
def read_device(device_name):
    """Restituisce i dati più recenti letti da un dispositivo."""
    device = devices.get(device_name)
    if device:
        return jsonify(device.get_latest_data())
    return jsonify({"error": "Dispositivo non trovato"}), 404

def list_available_ports():
    """Restituisce un elenco delle porte seriali disponibili."""
    ports = {port.device: port.description for port in serial.tools.list_ports.comports()}
    return ports
@app.route("/available_ports", methods=["GET"])
def get_available_ports():
    """Endpoint per ottenere le porte seriali disponibili."""
    return jsonify(list_available_ports())

@app.route("/config", methods=["GET"])
def get_config():
    """Restituisce il file di configurazione."""
    try:
        with open("config.json", "r") as file:
            config = json.load(file)
        return jsonify(config)
    except (FileNotFoundError, json.JSONDecodeError):
        return jsonify({"error": "Impossibile caricare la configurazione"}), 500

@app.route("/config", methods=["POST"])
def update_config():
    """Aggiorna il file di configurazione e reinizializza i dispositivi."""
    try:
        new_config = request.json
        with open("config.json", "w") as file:
            json.dump(new_config, file, indent=4)
        initialize_devices()
        return jsonify({"message": "Configurazione aggiornata e dispositivi reinizializzati"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/update_position', methods=['POST'])
def update_position():
    data = request.get_json()
    if data['mission_id'] != None:
        new_data = USVData(latitude=data['latitude'], longitude=data['longitude'], depth=data['depth'], mission_id=data['mission_id'])
    else:
        new_data = USVData(latitude=data['latitude'], longitude=data['longitude'], depth=data['depth'])

    db.session.add(new_data)
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/simulate_position', methods=['GET'])
def get_simulated_position():
    lat_min, lat_max = 40.6, 40.9  # Limiti di latitudine
    lon_min, lon_max = 13.9, 14.5  # Limiti di longitudine
    depth_min, depth_max = 10, 200  # Profondità tra 10m e 200m

    random_position = {
        "lat": round(random.uniform(lat_min, lat_max), 6),
        "lon": round(random.uniform(lon_min, lon_max), 6),
        "depth": round(random.uniform(depth_min, depth_max), 2)
    }

    return jsonify({"path": [random_position]})


last_valid_position = {
    'lat': 0.0,
    'lon': 0.0,
    'lat_dir': 'X',
    'lon_dir': 'X',
    'depth': 0.0,
    'degrees': 0
}

@app.route('/api/position', methods=['GET'])
def get_position():
    global last_valid_position
    last_position = last_valid_position.copy()

    for device_name, device in devices.items():
        data = device.get_latest_data()
        if "msg" in data:
            if device_name.lower().startswith("gps"):
                statusGPS = 'err'
                if 'error' not in data['msg']:
                    lat = float(data.get("msg", {}).get("lat", 0.0))
                    lon = float(data.get("msg", {}).get("lon", 0.0))
                    lat_dir = data.get("msg", {}).get("lat_dir", "")
                    lon_dir = data.get("msg", {}).get("lon_dir", "")
                    degrees = data.get("msg", {}).get("degrees", "")
                    if lat != 0.0 and lon != 0.0:
                        statusGPS = 'ok'
                        last_valid_position['lat'] = lat
                        last_valid_position['lon'] = lon
                        last_valid_position['degrees'] = degrees
                        last_valid_position['lat_dir'] = lat_dir
                        last_valid_position['lon_dir'] = lon_dir
                    
                last_valid_position['statusGPS'] = statusGPS

            elif device_name.lower().startswith("depth"):
                statusDepth = 'err'
                if 'error' not in data['msg']:
                    depth = data.get("msg", {}).get("depth", 0.0)
                    if depth != 0.0:
                        last_valid_position['depth'] = depth
                        statusDepth = 'ok'
                last_valid_position['statusDepth'] = statusDepth
    return jsonify({"path": [last_valid_position]})

@app.route('/api/save-mission', methods=['POST'])
def save_mission():
    data = request.json
    new_mission = MissionPlan(
        name=data['name'],
        path=data['path'],
        user_id=data['user_id'],
        boat_id=data['boat_id']
    )
    db.session.add(new_mission)
    db.session.commit()
    return jsonify({"message": "Mission saved successfully!", "mission_id": new_mission.id})

@app.route('/api/get-missions', methods=['GET'])
def get_missions():
    missions = MissionPlan.query.all()
    return jsonify([{"id": m.id, "name": m.name, "path": m.path} for m in missions])

@app.route('/api/get-users-boats', methods=['GET'])
def get_users_boats():
    users = User.query.all()
    boats = Boat.query.all()
    return jsonify({
        "users": [{"id": u.id, "name": u.name} for u in users],
        "boats": [{"id": b.id, "name": b.name} for b in boats]
    })

@app.route('/api/get-mission/<int:mission_id>', methods=['GET'])
def get_mission(mission_id):
    mission = MissionPlan.query.get(mission_id)
    if not mission:
        return jsonify({"error": "Mission not found"}), 404
    return jsonify({
        "id": mission.id,
        "name": mission.name,
        "path": mission.path
    })

@app.route('/api/get_mission_path/<int:mission_id>', methods=['GET'])
def get_mission_path(mission_id):
    path_data = USVData.query.filter_by(mission_id=mission_id).order_by(USVData.timestamp).all()
    
    path = [{"lat": d.latitude, "lon": d.longitude} for d in path_data]

    return jsonify({"path": path})

@app.route('/api/update-mission/<int:mission_id>', methods=['POST'])
def update_mission(mission_id):
    mission = MissionPlan.query.get(mission_id)
    if not mission:
        return jsonify({"error": "Mission not found"}), 404
    
    data = request.json
    mission.name = data['name']
    mission.path = data['path']
    mission.user_id = data['user_id']
    mission.boat_id = data['boat_id']
    
    db.session.commit()
    return jsonify({"message": "Mission updated successfully!"})

@app.route('/api/export_mission/<int:mission_id>', methods=['GET'])
def export_mission(mission_id):
    mission_data = USVData.query.filter_by(mission_id=mission_id).order_by(USVData.timestamp).all()
    
    if not mission_data:
        return jsonify({"error": "Nessun dato trovato per questa missione"}), 404
    
    mission = MissionPlan.query.get(mission_id)
    if not mission:
        return jsonify({"error": "Missione non trovata"}), 404
    
    mission_name = re.sub(r'\W+', '_', mission.name)

    def generate():
        yield "timestamp,latitude,longitude,depth\n"
        for data in mission_data:
            yield f"{data.timestamp},{data.latitude},{data.longitude},{data.depth}\n"

    return Response(generate(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=mission_{mission_name}.csv"})

@app.route('/api/get_mission_name/<int:mission_id>', methods=['GET'])
def get_mission_name(mission_id):
    mission = MissionPlan.query.get(mission_id)
    if mission:
        return jsonify({"name": mission.name})
    return jsonify({"error": "Missione non trovata"}), 404


@app.route('/api/delete_mission/<string:mission_name>', methods=['DELETE'])
def delete_mission(mission_name):
    mission = MissionPlan.query.filter_by(name=mission_name).first()

    if not mission:
        return jsonify({"error": "Mission not found"}), 404

    db.session.delete(mission)
    db.session.commit()

    return jsonify({"message": f"Mission '{mission_name}' deleted successfully"})

@app.route('/api/populateDB', methods=['GET'])
def populate():
    new_user = User(name="IMTG")
    db.session.add(new_user)
    new_boat = Boat(name="Boat1")
    db.session.add(new_boat)

    db.session.commit()

    return jsonify({"message": "User and boat added!"})


@app.route("/api/gps_status")
def gps_status():
    # Logica per controllare se il GPS USB è connesso (mock o reale)
    has_gps = check_usb_gps()  # <-- funzione da implementare
    return jsonify({"usb_gps": has_gps})

@app.route('/api/tiles/<int:z>/<int:x>/<int:y>.webp')
def get_tile(z, x, y):
    
    response = send_from_directory(TILE_FOLDER, f"{z}/{x}/{y}.webp")
    return response


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=80, threaded=False)
