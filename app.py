from flask import Flask, render_template, request, jsonify, Response
from flask_sqlalchemy import SQLAlchemy

import time
import random
import csv
import re

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///argo_mission.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

saved_lines = []

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

@app.route('/')
def index():
    return render_template('index.html')

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

@app.route('/api/position', methods=['GET'])
def get_position():
    lat_min, lat_max = 40.6, 40.9  # Limiti di latitudine
    lon_min, lon_max = 13.9, 14.5  # Limiti di longitudine
    depth_min, depth_max = 10, 200  # Profondità tra 10m e 200m

    random_position = {
        "lat": round(random.uniform(lat_min, lat_max), 6),
        "lon": round(random.uniform(lon_min, lon_max), 6),
        "depth": round(random.uniform(depth_min, depth_max), 2)
    }

    return jsonify({"path": [random_position]})

@app.route('/api/save_plan', methods=['POST'])
def save_plan():
    data = request.get_json()
    user_id = data['user_id']
    name = data['name']
    path = data['path']
    plan = MissionPlan(name=name, path=path, user_id=user_id)
    db.session.add(plan)
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/load_plans/<int:user_id>', methods=['GET'])
def load_plans(user_id):
    plans = MissionPlan.query.filter_by(user_id=user_id).all()
    return jsonify({
        'plans': [{'id': p.id, 'name': p.name, 'path': p.path} for p in plans]
    })

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
    
    mission_name = re.sub(r'\W+', '_', mission.name)  # Sostituisce caratteri speciali con "_"

    def generate():
        yield "timestamp,latitude,longitude,depth\n"  # Intestazione CSV
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
    new_user = User(name="Captain Jack")
    db.session.add(new_user)
    new_boat = Boat(name="Black Pearl")
    db.session.add(new_boat)

    db.session.commit()

    return jsonify({"message": "Random user and boat added!"})


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5001, debug=True)
