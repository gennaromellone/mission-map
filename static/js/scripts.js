
let selectedMissionId = null;
let trackingInterval = null;
let missionRunning = false;
let drawingMode = false;
let editMode = false;
let drawnLines = [];
let currentLineCoords = [];
let activeMissionLines = [];
let currentLineIndex = 0;
let lastValidAngle = null;

let previousPoint = { lon: 14.284214343900299, lat: 40.855640711460936 };

const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        sources: {
            //"offline-tiles": {
            //    type: "raster",
            //    tiles: ["/api/tiles/{z}/{x}/{y}.webp"],
            //    tileSize: 256,
            //    attribution: "Tiles &copy; Esri"
            //},
            "openmaptiles": {
                type: "vector",
                tiles: ["http://10.42.0.1/api/vector-tiles/{z}/{x}/{y}.pbf"],
                minzoom: 0,
                maxzoom: 14
            },
            "missions": {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] }
            },
            "realtime-path": {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] }
            },
            "direction-line": {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] }
            },
            "direction-line-rotating": {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] }
            },
            "current-line": {
                type: "geojson",
                data: {
                    type: "FeatureCollection",
                    features: []
                }
            },
        },
        layers: [
            //{ id: "offline-layer", type: "raster", source: "offline-tiles" },
            {
                id: "background",
                type: "background",
                paint: { "background-color": "#ddeeff" }
            },
            {
                id: "water",
                type: "fill",
                source: "openmaptiles",
                "source-layer": "water",
                paint: { "fill-color": "#a0c8f0", 
                    "fill-opacity": 0.6
                }
            },
            {
                id: "roads",
                type: "line",
                source: "openmaptiles",
                "source-layer": "transportation",
                paint: {
                    "line-color": "#888888",     // grigio neutro
                    "line-width": 1.5
                }
            },
            {
                id: "ferry-routes",
                type: "line",
                source: "openmaptiles",
                "source-layer": "transportation",
                filter: ["==", "class", "ferry"],
                paint: {
                    "line-color": "#1a75ff",
                    "line-width": 2,
                    "line-dasharray": [2, 2]
            }
            },

            {
                id: "buildings",
                type: "fill",
                source: "openmaptiles",
                "source-layer": "building",
                paint: {
                    "fill-color": "#bbbbbb",
                    "fill-opacity": 0.6
                }
            },
            
            {
                id: "current-line-layer",
                type: "line",
                source: "current-line",
                paint: {
                    "line-color": "pink",
                    "line-width": 3
                }
            },
            {
                id: "mission-path",
                type: "line",
                source: "missions",
                paint: { "line-color": "blue", "line-width": 3 }
            },
            {
                id: "realtime-path-line",
                type: "line",
                source: "realtime-path",
                paint: { "line-color": "red", "line-width": 3 }
            },
            {
                id: "direction-line",
                type: "line",
                source: "direction-line",
                paint: { "line-color": "yellow", "line-width": 5, "line-opacity": 0.9 }
            },
            {
                id: "direction-line-rotating",
                type: "line",
                source: "direction-line-rotating",
                paint: {
                    "line-color": "orange",
                    "line-width": 5,
                    "line-opacity": 0.9
                }
            }
        ]
    },
    minZoom: 10,
    maxZoom: 20,
    center: previousPoint,
    zoom: 14,
    bearing: 0
});

map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
map.on('load', () => {

    updateDirectionLine(previousPoint.lat, previousPoint.lon);
    map.addSource('mission-lines', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });
    
    map.addLayer({
        id: 'mission-lines-layer',
        type: 'line',
        source: 'mission-lines',
        paint: {
            'line-color': 'blue',
            'line-width': 3
        }
    });

    map.addSource('active-line', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });

    map.loadImage('/static/icons/arrow.png', (error, image) => {
        if (error) throw error;
        if (!map.hasImage('arrow-icon')) {
            map.addImage('arrow-icon', image);
        }
    });
    
    map.addLayer({
        id: 'active-line-layer',
        type: 'line',
        source: 'active-line',
        paint: {
            'line-color': 'limegreen',
            'line-width': 5,
            'line-opacity': 0.9
        }
    });
    map.addLayer({
        id: 'active-line-arrow',
        type: 'symbol',
        source: 'active-line',
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 60,
            'icon-image': 'arrow-icon',
            'icon-size': 0.6,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });
    
});

const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
});

map.on('mousemove', 'mission-lines-layer', (e) => {
    const feature = e.features[0];

    if (feature && feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates;
        const pointA = coords[0];
        const pointB = coords[coords.length - 1];
        const lengthMeters = distanceInMeters(pointA, pointB);

        const html = `
            <div style="color: black; font-size: 13px;">
                <strong>Linea</strong><br>
                A: ${pointA[1].toFixed(5)}, ${pointA[0].toFixed(5)}<br>
                B: ${pointB[1].toFixed(5)}, ${pointB[0].toFixed(5)}<br>
                Lunghezza: ${lengthMeters.toFixed(1)} m
            </div>
        `;

        popup.setLngLat(e.lngLat)
             .setHTML(html)
             .addTo(map);
    }
});


map.on('mouseleave', 'mission-lines-layer', () => {
    popup.remove();
});


const boatElement = document.createElement('div');
boatElement.className = 'boat-marker';
boatElement.style.backgroundImage = "url('/static/icons/boat.png')";
boatElement.style.width = '80px';
boatElement.style.height = '80px';
boatElement.style.backgroundSize = 'contain';
boatElement.style.backgroundRepeat = 'no-repeat';
boatElement.style.pointerEvents = 'none';

const boatMarker = new maplibregl.Marker({
    element: boatElement,
    anchor: 'center'
}).setLngLat(previousPoint).addTo(map);

if (!missionRunning) {
    livePosition();
}

document.getElementById('menu-toggle').addEventListener('click', () => {
    let sidebar = document.getElementById('sidebar');
    let menuToggle = document.getElementById('menu-toggle');

    sidebar.classList.toggle('open');

    // Sposta il pulsante assieme al menu
    if (sidebar.classList.contains('open')) {
        menuToggle.style.left = "250px"; // Stessa larghezza del menu
    } else {
        menuToggle.style.left = "20px";
    }
});
map.on('rotate', () => {
    if (previousPoint) {
        updateRotatingDirectionLine(previousPoint.lat, previousPoint.lon);
        updateRotatingDirectionLine(previousPoint.lat, previousPoint.lon);
    }
});

async function displayHistoricalPath(missionId) {
    const response = await fetch(`/api/get_mission_path/${missionId}`);
    const data = await response.json();

    if (data.path && data.path.length > 0) {
        const pathCoords = data.path.map(p => [p.lon, p.lat]);
        const source = map.getSource('realtime-path');

        if (source) {
            source.setData({
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: pathCoords
                        }
                    }
                ]
            });
        }

        // Centro la mappa sull’ultimo punto
        const last = pathCoords[pathCoords.length - 1];
        map.easeTo({
            center: last,
            zoom: 14
        });
    }
}

function distanceInMeters([lon1, lat1], [lon2, lat2]) {
    const R = 6371000; // Raggio terrestre in metri
    const toRad = deg => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function updateLiveBoatData(data, updatePosition = false) {
    if (data.path && data.path.length > 0) {
        const latest = data.path[data.path.length - 1];
        if (latest.lon > 0 && latest.lat > 0) {
            const angle = parseFloat(latest.degrees || 0.0);
            if (angle === 0 && lastValidAngle !== null) {
                angle = lastValidAngle;
            } else if (angle !== 0) {
                lastValidAngle = angle;
            }

            boatMarker.setLngLat([latest.lon, latest.lat]);
            rotateMap(angle);
            updateDirectionLine(latest.lat, latest.lon);
            updateRotatingDirectionLine(latest.lat, latest.lon, angle);

            if (updatePosition) {
                map.easeTo({
                    center: [latest.lon, latest.lat],
                    bearing: map.getBearing(),
                    duration: 500
                });
            }

            previousPoint = { lat: latest.lat, lon: latest.lon };
            document.getElementById('current-lat').textContent = latest.lat + latest.lat_dir;
            document.getElementById('current-lon').textContent = latest.lon + latest.lon_dir;
            document.getElementById('current-depth').textContent = latest.depth.toFixed(2);

            map.getSource('realtime-path').setData({
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: data.path.map(p => [p.lon, p.lat])
                        }
                    }
                ]
            });

            if (activeMissionLines.length > 0 && currentLineIndex < activeMissionLines.length) {
                const currentLine = activeMissionLines[currentLineIndex];
                const boatPoint = [latest.lon, latest.lat];
                const distanceElement = document.getElementById('current-distance');
                const progressElement = document.getElementById('line-progress');

                const distance = distanceFromPointToLine(boatPoint, currentLine);
                const meters = degreesToMeters(distance);
                const progress = getProjectionProgress(boatPoint, currentLine);

                distanceElement.textContent = meters.toFixed(1) + " m";
                distanceElement.style.color = meters < 20 ? 'limegreen' : 'orange';

                const progressPercent = Math.max(0, Math.min(100, (progress * 100)));
                progressElement.textContent = `Progress: ${progressPercent.toFixed(1)}%`;
            }
        
            if (updatePosition) {
                await fetch('/api/update_position', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        latitude: latest.lat,
                        longitude: latest.lon,
                        depth: latest.depth,
                        mission_id: selectedMissionId
                    })
                });
            }
        }
    }
}


function livePosition(updatePosition = false) {
    setInterval(async () => {
        updateDirectionLine(previousPoint.lat, previousPoint.lon);
        updateRotatingDirectionLine(previousPoint.lat, previousPoint.lon);
        const response = await fetch('/api/position');
        const data = await response.json();
        await updateLiveBoatData(data, updatePosition);
    }, 1000);
}


document.getElementById('start-mission').addEventListener('click', async () => {
    const button = document.getElementById('start-mission');

    if (!missionRunning) {
        if (!selectedMissionId) {
            alert("⚠️ Nessuna missione selezionata! Crea o carica una missione prima di iniziare.");
            return;
        }
        activeMissionLines = [...drawnLines];
        currentLineIndex = 0;
        highlightActiveLine(currentLineIndex);
        highlightButton('start-mission');
        document.getElementById('live-mission-controls').style.display = 'block';
        document.getElementById('mission-status').style.display = 'block';

        await displayHistoricalPath(selectedMissionId);

        if (trackingInterval) clearInterval(trackingInterval);

        trackingInterval = setInterval(async () => {
            const response = await fetch('/api/position');
            const data = await response.json();
            await updateLiveBoatData(data, true);
        }, 1000);

        missionRunning = true;
        button.textContent = "Stop Mission";
    } else {
        if (trackingInterval) {
            clearInterval(trackingInterval);
            trackingInterval = null;
        }
        // Reset linea evidenziata (verde)
        const activeSource = map.getSource('active-line');
        if (activeSource) {
            activeSource.setData({
                type: 'FeatureCollection',
                features: []
            });
        }
        document.getElementById('live-mission-controls').style.display = 'none';
        document.getElementById('mission-status').style.display = 'none';
        document.getElementById('current-distance').style.color = '#fff';

        missionRunning = false;
        button.textContent = "Start Mission";
        resetButtons();
    }
});

function degreesToMeters(d) {
    return d * 111320;
}

function distanceFromPointToLine(point, line) {
    const [x, y] = point;
    const [[x1, y1], [x2, y2]] = line;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

function getProjectionProgress(point, line) {
    const [x, y] = point;
    const [[x1, y1], [x2, y2]] = line;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    return len_sq !== 0 ? dot / len_sq : 0;
}

document.getElementById("deleteMissionBtn").addEventListener("click", function() {
    const missionName = prompt("Enter the mission name to delete:");
    if (missionName) {
        fetch(`/api/delete_mission/${encodeURIComponent(missionName)}`, { method: 'DELETE' })
        .then(response => response.json())
        .then(data => alert(data.message))
        .catch(error => console.error('Error:', error));
    }
});

let planActive = false;

document.getElementById('plan-mission').addEventListener('click', () => {
    if (planActive) {
        document.getElementById('mission-controls').style.display = 'none';
        planActive = false;
    } else {
        document.getElementById('mission-controls').style.display = 'block';
        planActive = true;
    }
});

function rotateMap(bearingDegrees) {
    map.rotateTo(bearingDegrees, { duration: 500 });
    boatElement.style.transform = `rotate(${bearingDegrees}deg)`;
}

function updateRotatingDirectionLine(lat, lon, bearing = null) {
    const length = 0.2; // distanza (in gradi) da usare per la linea (puoi regolarla)
    const usedBearing = (bearing !== null) ? bearing : map.getBearing();
    // Convert bearing in radianti e calcola il secondo punto
    const angleRad = (usedBearing * Math.PI) / 180;
    const destLat = lat + length * Math.cos(angleRad);
    const destLon = lon + length * Math.sin(angleRad);

    const geojson = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [lon, lat],
                        [destLon, destLat]
                    ]
                }
            }
        ]
    };

    const source = map.getSource('direction-line-rotating');
    if (source) source.setData(geojson);
}


function updateDirectionLine(lat, lon) {
    if (!map || !map.isStyleLoaded()) {
        return;
    }

    const bounds = map.getBounds();
    const north = bounds.getNorth(); // Latitudine del bordo superiore

    const geojson = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [lon, lat],
                        [lon, north]
                    ]
                }
            }
        ]
    };
    const source = map.getSource('direction-line');
    if (source) source.setData(geojson);
}

function highlightButton(buttonId) {
    let buttons = document.querySelectorAll(".button");

    buttons.forEach(button => {

        if (button.id === buttonId || button.id === 'complete-line') {
            button.style.backgroundColor = "red"; 
        } else {
            button.disabled = true;
        }
    });
}

function resetButtons() {
    let buttons = document.querySelectorAll(".button");

    buttons.forEach(button => {
        button.style.backgroundColor = ""; 
        button.disabled = false;
    });
}

document.getElementById('recenter-map').addEventListener('click', () => {
    if (previousPoint) {
        map.easeTo({
            center: [previousPoint.lon, previousPoint.lat],
            bearing: map.getBearing(), // conserva la rotazione attuale
            duration: 1000
        });
    }
});

document.getElementById('add-line').addEventListener('click', () => {
    drawingMode = true;
    currentLineCoords = [];
    pointsCount = 0;

    map.getCanvas().style.cursor = 'crosshair';
    map.on('click', addPointToSegment);
});


function addPointToSegment(e) {
    const coord = [e.lngLat.lng, e.lngLat.lat];
    currentLineCoords.push(coord);
    pointsCount++;

    // Aggiorna la linea corrente
    const geojson = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: currentLineCoords
                }
            }
        ]
    };

    const source = map.getSource('current-line');
    if (source) source.setData(geojson);

    // Se abbiamo due punti, salviamo e chiudiamo il disegno
    if (pointsCount === 2) {
        //console.log("Linea aggiornata:", geojson);

        finalizeCurrentLine();
    }
}
function finalizeCurrentLine() {
    map.off('click', addPointToSegment);
    map.getCanvas().style.cursor = '';
    drawingMode = false;

    if (currentLineCoords.length === 2) {
        drawnLines.push([...currentLineCoords]);

        // Recupera la source mission-lines e aggiorna
        const missionSource = map.getSource('mission-lines');
        if (missionSource) {
            const existing = missionSource._data || {
                type: 'FeatureCollection',
                features: []
            };

            const newFeature = {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: currentLineCoords
                },
                properties: {
                    id: Date.now()  // o un contatore univoco
                }
            };

            const updated = {
                type: 'FeatureCollection',
                features: [...existing.features, newFeature]
            };

            missionSource.setData(updated);
        }
    }

    // Reset della linea attiva
    currentLineCoords = [];
    pointsCount = 0;
    map.getSource('current-line').setData({
        type: "FeatureCollection",
        features: []
    });
}

function updateMissionLinesSource() {
    const features = drawnLines.map(coords => ({
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: coords
        }
    }));

    const source = map.getSource('mission-lines');
    if (source) {
        source.setData({
            type: 'FeatureCollection',
            features: features
        });
    }
}


let removingMode = false;

function enableRemovingMode() {
    removingMode = true;
    map.getCanvas().style.cursor = 'pointer';
    map.on('click', removeLineOnClick);
}

function disableRemovingMode() {
    removingMode = false;
    map.getCanvas().style.cursor = '';
    map.off('click', removeLineOnClick);
}

function removeLineOnClick(e) {
    const clickPoint = [e.lngLat.lng, e.lngLat.lat];

    // Soglia di distanza in gradi (~10m): puoi regolarla
    const tolerance = 0.0001;

    let lineToRemove = -1;

    drawnLines.forEach((line, idx) => {
        for (let i = 0; i < line.length - 1; i++) {
            const segment = [line[i], line[i + 1]];
            if (isPointNearSegment(clickPoint, segment, tolerance)) {
                lineToRemove = idx;
                break;
            }
        }
    });

    if (lineToRemove !== -1) {
        drawnLines.splice(lineToRemove, 1);
        updateMissionLinesSource();
    }
}

function isPointNearSegment(p, seg, tol) {
    const [x, y] = p;
    const [[x1, y1], [x2, y2]] = seg;

    // distanza punto-segmento (2D, in coordinate gradi)
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;

    return (dx * dx + dy * dy) < (tol * tol);
}

document.getElementById('edit-lines').addEventListener('click', () => {
    editMode = !editMode;

    if (editMode) {
        enableRemovingMode();
        document.getElementById('edit-lines').textContent = "Stop Editing";
        document.getElementById('add-line').disabled = true;
        document.getElementById('clear-line').disabled = true;
    } else {
        disableRemovingMode();
        document.getElementById('edit-lines').textContent = "Edit Lines";
        document.getElementById('add-line').disabled = false;
        document.getElementById('clear-line').disabled = false;
    }
});




document.getElementById('create-mission').addEventListener('click', async () => {
    document.getElementById('save-popup').style.display = 'block';

    const response = await fetch('/api/get-users-boats');
    const data = await response.json();
    
    const userSelect = document.getElementById('mission-user');
    const boatSelect = document.getElementById('mission-boat');

    userSelect.innerHTML = data.users.map(user => `<option value="${user.id}">${user.name}</option>`).join('');
    boatSelect.innerHTML = data.boats.map(boat => `<option value="${boat.id}">${boat.name}</option>`).join('');
});

document.getElementById('save-mission').addEventListener('click', async () => {
    document.getElementById('save-popup').style.display = 'block';
    updateSaveButtonText();

    const response = await fetch('/api/get-users-boats');
    const data = await response.json();
    
    const userSelect = document.getElementById('mission-user');
    const boatSelect = document.getElementById('mission-boat');

    userSelect.innerHTML = data.users.map(user => `<option value="${user.id}">${user.name}</option>`).join('');
    boatSelect.innerHTML = data.boats.map(boat => `<option value="${boat.id}">${boat.name}</option>`).join('');
});

document.getElementById('confirm-save').addEventListener('click', async () => {
    const name = document.getElementById('mission-name-input').value;
    const userId = document.getElementById('mission-user').value;
    const boatId = document.getElementById('mission-boat').value;

    const missionData = {
        name: name,
        user_id: parseInt(userId),
        boat_id: parseInt(boatId),
        path: JSON.stringify(drawnLines)
    };

    const url = selectedMissionId 
        ? `/api/update-mission/${selectedMissionId}`  // Endpoint di update
        : `/api/save-mission`; 

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(missionData)
    })
    .then(response => response.json()) 
    .then(data => {
        if (data.mission_id) {
            selectedMissionId = data.mission_id;
            alert(`Mission '${name}' salvata con successo!\nMission ID: ${data.mission_id}`);
        } else {
            alert("Missione aggiornata con successo!");
        }
    })
    .catch(error => console.error('Error:', error));

    document.getElementById('save-popup').style.display = 'none';
    document.getElementById('mission-name').innerText = `Mission: ${missionData.name}`;

    updateSaveButtonText(); 
});

function updateSaveButtonText() {
    const saveButton = document.getElementById('save-mission');
    saveButton.textContent = selectedMissionId ? "Update" : "Save";
}

// LOAD MISSION
document.getElementById('load-mission').addEventListener('click', async () => {
    document.getElementById('load-popup').style.display = 'block';

    const response = await fetch('/api/get-missions');
    const missions = await response.json();

    const missionSelect = document.getElementById('mission-select');
    missionSelect.innerHTML = missions.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
});


document.getElementById('confirm-load').addEventListener('click', async () => {
    selectedMissionId = document.getElementById('mission-select').value;
    if (!selectedMissionId) return;

    const response = await fetch(`/api/get-mission/${selectedMissionId}`);
    const mission = await response.json();

    document.getElementById('mission-name').innerText = `Mission: ${mission.name}`;

    if (mission.path) {
        drawnLines = JSON.parse(mission.path);
        updateMissionLinesSource();
    }

    await displayHistoricalPath(selectedMissionId);

    document.getElementById('load-popup').style.display = 'none';
});

document.getElementById('cancel-load').addEventListener('click', () => {
    document.getElementById('load-popup').style.display = 'none';
});

document.getElementById('cancel-save').addEventListener('click', () => {
    document.getElementById('save-popup').style.display = 'none';
});

document.getElementById('export-mission').addEventListener('click', async () => {
    if (!selectedMissionId) {
        alert("⚠️ Nessuna missione selezionata! Crea o carica una missione prima di esportare.");
        return;
    }

    window.location.href = `/api/export_mission/${selectedMissionId}`;
});

function setSelectedMission(missionId) {
    selectedMissionId = missionId;
    console.log(`Missione selezionata: ${selectedMissionId}`);
}

function highlightActiveLine(index) {
    if (activeMissionLines.length === 0 || index >= activeMissionLines.length) return;

    const current = activeMissionLines[index];

    const geojson = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: current
                }
            }
        ]
    };

    const source = map.getSource('active-line');
    if (source) {
        source.setData(geojson);
    }
}

document.getElementById('complete-line').addEventListener('click', () => {
    forceCompleteCurrentLine();
});

function forceCompleteCurrentLine() {
    if (activeMissionLines.length === 0 || currentLineIndex >= activeMissionLines.length) return;

    console.log(`⚠️ Forzato completamento linea ${currentLineIndex + 1}`);
    currentLineIndex++;

    if (currentLineIndex < activeMissionLines.length) {
        highlightActiveLine(currentLineIndex);
    } else {
        map.getSource('active-line').setData({
            type: 'FeatureCollection',
            features: []
        });
        console.log("🎉 Missione completata (forzata)!");
    }

    saveLineAsSubMission(currentLineIndex - 1); // Salva la linea appena completata
}

async function saveLineAsSubMission(index) {
    if (!selectedMissionId || !activeMissionLines[index]) return;

    const missionName = document.getElementById('mission-name').innerText.replace('Mission: ', '');
    const subMissionName = `${missionName}_linea_${index + 1}`;

    const userId = document.getElementById('mission-user')?.value;
    const boatId = document.getElementById('mission-boat')?.value;

    const missionData = {
        name: subMissionName,
        user_id: parseInt(userId || 0),
        boat_id: parseInt(boatId || 0),
        path: JSON.stringify([activeMissionLines[index]])
    };

    const response = await fetch('/api/save-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(missionData)
    });

    const result = await response.json();
    console.log(`✅ Salvata sotto-missione: ${subMissionName}`, result);

    // Duplicazione coordinate dalla missione principale
    if (selectedMissionId && result.mission_id) {
        await fetch('/api/duplicate-mission-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_id: selectedMissionId,
                target_id: result.mission_id
            })
        });
    }

}

// Mostra popup quando clicchi su "Add Manual Line"
document.getElementById('add-manual-line').addEventListener('click', () => {
    document.getElementById('manual-line-popup').style.display = 'block';
});

// Chiudi il popup
document.getElementById('cancel-manual-line').addEventListener('click', () => {
    document.getElementById('manual-line-popup').style.display = 'none';
});

// Pulsante per passare manualmente alla linea successiva
document.getElementById('next-line').addEventListener('click', () => {
    if (currentLineIndex < activeMissionLines.length) {
        saveLineAsSubMission(currentLineIndex);
        currentLineIndex++;
        if (currentLineIndex < activeMissionLines.length) {
            highlightActiveLine(currentLineIndex);
        } else {
            map.getSource('active-line').setData({
                type: 'FeatureCollection',
                features: []
            });
            console.log("🎉 Missione completata (manuale)!");
        }
    }
});

// Conferma e aggiungi la linea alla mappa
document.getElementById('confirm-manual-line').addEventListener('click', () => {
    const lat1 = parseFloat(document.getElementById('manual-lat1').value);
    const lon1 = parseFloat(document.getElementById('manual-lon1').value);
    const lat2 = parseFloat(document.getElementById('manual-lat2').value);
    const lon2 = parseFloat(document.getElementById('manual-lon2').value);

    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
        alert("⚠️ Inserisci tutte le coordinate valide.");
        return;
    }

    const newLine = [
        [lon1, lat1],
        [lon2, lat2]
    ];

    // Aggiungila alle linee disegnate
    drawnLines.push(newLine);
    updateMissionLinesSource();

    // Chiudi il popup
    document.getElementById('manual-line-popup').style.display = 'none';
});

function isBoatNearLine(boatPoint, line, thresholdDeg = 0.001) {
    const bbox = [
        Math.min(line[0][0], line[1][0]),
        Math.min(line[0][1], line[1][1]),
        Math.max(line[0][0], line[1][0]),
        Math.max(line[0][1], line[1][1])
    ];

    return !(boatPoint[0] < bbox[0] - thresholdDeg || 
             boatPoint[0] > bbox[2] + thresholdDeg ||
             boatPoint[1] < bbox[1] - thresholdDeg || 
             boatPoint[1] > bbox[3] + thresholdDeg);
}