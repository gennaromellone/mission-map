const startPos = [40.855640711460936, 14.284214343900299]

const map = L.map('map').setView(startPos, 15);

//L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
L.tileLayer('/api/tiles/{z}/{x}/{y}.webp' ,{
    maxZoom: 20,
    minZoom: 15,
    attribution: 'Tiles &copy; Esri'
}).addTo(map);

const boatIcon = L.icon({
    iconUrl: 'static/icons/boat.png',
    iconSize: [80, 80],
    iconAnchor: [40, 40]
});

let boatMarker = L.marker(startPos, 
    {
    icon: boatIcon,
    rotationAngle: 0, 
    rotationOrigin: 'center'
}).addTo(map);
map.zoomControl.setPosition('topright');

let selectedMissionId = null;
let trackingInterval = null;
let directionLine = L.polyline([], { color: 'yellow', weight: 2, opacity: 0.5}).addTo(map);

updateDirectionLine(startPos[0], startPos[1], 0);

let pathLine = L.polyline([], { color: 'blue' }).addTo(map);
let realTimePath = L.polyline([], { color: 'red' }).addTo(map);

let drawnLines = []; 
let currentLine = null; 
let removingMode = false;
let pointsCount = 0;
let previousPoint = null;

let missionRunning = false;

document.getElementById('start-mission').addEventListener('click', async () => {
    const button = document.getElementById('start-mission');

    if (!missionRunning) {
        if (!selectedMissionId) {
            alert("⚠️ Nessuna missione selezionata! Crea o carica una missione prima di iniziare.");
            return;
        }
        highlightButton('start-mission')
        const historyResponse = await fetch(`/api/get_mission_path/${selectedMissionId}`);
        const historyData = await historyResponse.json();

        if (historyData.path && historyData.path.length > 0) {
            realTimePath.setLatLngs(historyData.path.map(p => [p.lat, p.lon]));
            map.setView(historyData.path[historyData.path.length - 1], 12);
        }

        if (trackingInterval) clearInterval(trackingInterval);

        trackingInterval = setInterval(async () => {
            const response = await fetch('/api/position');
            const data = await response.json();
        
            if (data.path && data.path.length > 0) {
                const latest = data.path[data.path.length - 1];
        
                if (previousPoint) {
                    const deltaX = latest.lon - previousPoint.lon;
                    const deltaY = latest.lat - previousPoint.lat;
                    const angle = (Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 360) % 360;
        
                    boatMarker.setLatLng([latest.lat, latest.lon]);
                    boatMarker.setRotationAngle(angle);
                    
                    map.panTo([latest.lat, latest.lon]);

                    // Aggiorna la linea direzionale per coprire l'intera finestra
                    updateDirectionLine(latest.lat, latest.lon, angle);
                }
        
                previousPoint = { lat: latest.lat, lon: latest.lon };
                document.getElementById('current-lat').textContent = latest.lat.toFixed(6) + latest.lat_dir;
                document.getElementById('current-lon').textContent = latest.lon.toFixed(6) + latest.lon_dir;
                document.getElementById('current-depth').textContent = latest.depth.toFixed(2);

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
        }, 1000);

        missionRunning = true;
        button.textContent = "Stop Mission";
    } else {
        if (trackingInterval) {
            clearInterval(trackingInterval);
            trackingInterval = null;
        }
        missionRunning = false;
        button.textContent = "Start Mission";
        resetButtons();
    }
});

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

document.getElementById('add-line').addEventListener('click', () => {
    removingMode = false;
    map.off('click', removeLine);

    if (currentLine) {
        drawnLines.push(currentLine);
        currentLine = null;
    }

    currentLine = L.polyline([], { color: 'orange' }).addTo(map);
    pointsCount = 0;
    map.on('click', addPointToSegment);
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
        path: JSON.stringify(drawnLines.map(line => line.getLatLngs())) // Salviamo le coordinate delle linee
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
        drawnLines.forEach(line => map.removeLayer(line));
        drawnLines = [];

        const lines = JSON.parse(mission.path);
        lines.forEach(lineCoords => {
            let polyline = L.polyline(lineCoords, { color: 'blue', draggable: true }).addTo(map);
            drawnLines.push(polyline);
        });
    }

    // Recupera il percorso storico della missione selezionata
    const historyResponse = await fetch(`/api/get_mission_path/${selectedMissionId}`);
    const historyData = await historyResponse.json();

    if (historyData.path && historyData.path.length > 0) {
        realTimePath.setLatLngs(historyData.path.map(p => [p.lat, p.lon]));
        map.setView(historyData.path[historyData.path.length - 1], 12);
    }

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

let editMode = false;
let vertexMarkers = [];

document.getElementById('edit-lines').addEventListener('click', () => {

    editMode = !editMode;
    if (editMode) {
        enableEditing();
        document.getElementById('add-line').disabled = editMode;
        document.getElementById('clear-line').disabled = editMode;
        document.getElementById('edit-lines').textContent = "Stop Editing";
    } else {
        disableEditing();
        document.getElementById('edit-lines').textContent = "Edit Lines";

        document.getElementById('add-line').disabled = false;
        document.getElementById('clear-line').disabled = false;
    }
});

document.getElementById('clear-line').addEventListener('click', () => {
    showClearConfirmation();
});

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

function showClearConfirmation() {
    const confirmation = confirm("⚠️ Sei sicuro di voler eliminare tutte le linee? Questa operazione non può essere annullata.");
    if (confirmation) {
        clearAllLines();
    }
}

function updateSaveButtonText() {
    const saveButton = document.getElementById('save-mission');
    saveButton.textContent = selectedMissionId ? "Update" : "Save";
}

function clearAllLines() {
    drawnLines.forEach(line => map.removeLayer(line));
    drawnLines = [];

    vertexMarkers.forEach(marker => map.removeLayer(marker));
    vertexMarkers = [];

}


function enableEditing() {
    // Rimuove i vecchi marcatori dei vertici
    vertexMarkers.forEach(marker => map.removeLayer(marker));
    vertexMarkers = [];

    drawnLines.forEach(line => {
        const latLngs = line.getLatLngs();
        latLngs.forEach((latlng, index) => {
            let vertex = L.marker(latlng, {
                draggable: true,
                icon: L.divIcon({
                    className: "vertex-marker",
                    html: "⬤",
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                })
            }).addTo(map);

            // Quando si trascina il vertice, aggiorna la linea
            vertex.on('drag', function (e) {
                latLngs[index] = e.target.getLatLng();
                line.setLatLngs(latLngs);
            });

            // Rimuove il vertice al doppio clic
            vertex.on('dblclick', function () {
                if (!editMode) return;
                map.removeLayer(vertex);
                latLngs.splice(index, 1);
                line.setLatLngs(latLngs);
            });

            vertexMarkers.push(vertex);
        });
    });
}

function disableEditing() {
    vertexMarkers.forEach(marker => map.removeLayer(marker));
    vertexMarkers = [];
}

function setSelectedMission(missionId) {
    selectedMissionId = missionId;
    console.log(`Missione selezionata: ${selectedMissionId}`);
}

async function fetchMissionName() {
    if (!selectedMissionId) return;

    try {
        const response = await fetch(`/api/get_mission_name/${selectedMissionId}`);
        const data = await response.json();

        if (data.name) {
            document.getElementById('mission-name').innerText = `Mission: ${data.name}`;
        } else {
            document.getElementById('mission-name').innerText = "Mission: Unknown";
        }
    } catch (error) {
        console.error("Errore nel recupero del nome della missione:", error);
    }
}


function addPointToSegment(e) {
    if (!currentLine || removingMode) return; // Blocca l'aggiunta in modalità rimozione

    const { lat, lng } = e.latlng;
    let latLngs = currentLine.getLatLngs();

    latLngs.push([lat, lng]);
    currentLine.setLatLngs(latLngs);
    pointsCount++;

    if (pointsCount === 2) {
        drawnLines.push(currentLine);
        currentLine = null;
        map.off('click', addPointToSegment);
    }
}

function removeLine(e) {
    let closestLine = null;
    let minDistance = Infinity;

    drawnLines.forEach(line => {
        const latLngs = line.getLatLngs();
        if (latLngs.length === 2) {
            const distance = pointToSegmentDistance(e.latlng, latLngs[0], latLngs[1]);
            if (distance < minDistance) {
                minDistance = distance;
                closestLine = line;
            }
        }
    });

    if (closestLine && minDistance < 20) {
        map.removeLayer(closestLine);
        drawnLines = drawnLines.filter(line => line !== closestLine);
    }
}

function pointToSegmentDistance(point, segmentStart, segmentEnd) {
    const A = point.lat - segmentStart.lat;
    const B = point.lng - segmentStart.lng;
    const C = segmentEnd.lat - segmentStart.lat;
    const D = segmentEnd.lng - segmentStart.lng;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;

    let closest;
    if (param < 0) {
        closest = segmentStart;
    } else if (param > 1) {
        closest = segmentEnd;
    } else {
        closest = {
            lat: segmentStart.lat + param * C,
            lng: segmentStart.lng + param * D
        };
    }

    return map.distance(point, closest);
}

function highlightButton(buttonId) {
    let buttons = document.querySelectorAll(".button");

    buttons.forEach(button => {
        if (button.id === buttonId) {
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
function updateDirectionLine(lat, lon, angle) {
    const bounds = map.getBounds();
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();

    const maxDistance = Math.max(
        Math.abs(northEast.lat - southWest.lat),
        Math.abs(northEast.lng - southWest.lng)
    );

    const lineLength = maxDistance * 1.2; // Estensione oltre lo schermo

    const directionEndLat = lat + (lineLength * Math.cos(angle * Math.PI / 180));
    const directionEndLon = lon + (lineLength * Math.sin(angle * Math.PI / 180));

    directionLine.setLatLngs([[lat, lon], [directionEndLat, directionEndLon]]);
}
