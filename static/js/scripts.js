const startPos = [40.855640711460936, 14.284214343900299]

const map = L.map('map').setView(startPos, 10);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
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

let selectedMissionId = null;
let trackingInterval = null;

let pathLine = L.polyline([], { color: 'blue' }).addTo(map);
let realTimePath = L.polyline([], { color: 'red' }).addTo(map);

let drawnLines = []; // Array per memorizzare i segmenti
let currentLine = null; // Linea attuale in fase di disegno
let removingMode = false; // Modalità di rimozione
let pointsCount = 0; // Contatore per i punti della linea
let previousPoint = null;


document.getElementById('start-mission').addEventListener('click', async () => {

    if (!selectedMissionId) {
        alert("⚠️ Nessuna missione selezionata! Crea o carica una missione prima di iniziare.");
        return;
    }
    else{
        // Recupera il percorso storico della missione selezionata
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
                    const angle = Math.atan2(-deltaY, deltaX) * (180 / Math.PI) + 90;
                    boatMarker.setRotationAngle(angle);
                }

                boatMarker.setLatLng([latest.lat, latest.lon]);
                pathLine.setLatLngs(data.path.map(point => [point.lat, point.lon]));
                // Aggiorna il percorso in tempo reale
                let realTimeCoords = realTimePath.getLatLngs();
                realTimeCoords.push([latest.lat, latest.lon]);
                realTimePath.setLatLngs(realTimeCoords);

                map.setView([latest.lat, latest.lon]);

                document.getElementById('current-lat').textContent = latest.lat.toFixed(6);
                document.getElementById('current-lon').textContent = latest.lon.toFixed(6);
                document.getElementById('current-depth').textContent = latest.depth.toFixed(2);

                previousPoint = { lat: latest.lat, lon: latest.lon };

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
    }
});

document.getElementById('stop-mission').addEventListener('click', () => {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
        console.log("Tracking interrotto.");
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

document.getElementById('remove-line').addEventListener('click', () => {
    if (currentLine) {
        currentLine.remove();
        currentLine = null;
        pointsCount = 0;
        map.off('click', addPointToSegment);
    }

    removingMode = !removingMode;

    if (removingMode) {
        map.on('click', removeLine);
    } else {
        map.off('click', removeLine);
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
        path: JSON.stringify(drawnLines.map(line => line.getLatLngs()))
    };

    const url = selectedMissionId 
        ? `/api/update-mission/${selectedMissionId}`
        : `/api/save-mission`;

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(missionData)
    })
    .then(response => response.json()) // Converti la risposta in JSON
    .then(data => {
        
        if (data.mission_id) {
            console.log(data);
            selectedMissionId = data.mission_id;
            alert(`Mission '${missionName}' created successfully!\nMission ID: ${data.mission_id}`);
        } else {
            alert("Updated Mission!");
        }
    })
    .catch(error => console.error('Error:', error));

    document.getElementById('save-popup').style.display = 'none';
    document.getElementById('mission-name').innerText = `Mission: ${missionData.name}`;

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
