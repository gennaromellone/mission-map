import os
import math
import requests
from PIL import Image
from io import BytesIO
from tqdm import tqdm

def lonlat_to_tile(lon, lat, zoom):
    x = int((lon + 180.0) / 360.0 * (2**zoom))
    y = int((1.0 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2.0 * (2**zoom))
    return x, y

# NAPOLI
# maxLat, minLat, maxLon, minLon = 40.86090466063033, 40.5955272756763, 14.522593628901848, 14.056968960393801

# FULL GLOB
maxLat, minLat = 85.05112878, -85.05112878
maxLon, minLon = 180.0, -180.0

zoom_min = 10
zoom_max = 11

TILE_URL = "https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
TILE_FOLDER = "/home/navigation/tiles"

for z in range(zoom_min, zoom_max):
    x_min, y_min = lonlat_to_tile(minLon, minLat, z)
    x_max, y_max = lonlat_to_tile(maxLon, maxLat, z)
    
    total_tiles = (x_max - x_min + 1) * (y_min - y_max + 1)
    with tqdm(total=total_tiles, desc=f"Downloading tiles for zoom {z}") as pbar:
        for x in range(x_min, x_max + 1):
            for y in range(y_max, y_min + 1):
                url = f"https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                tile_path = os.path.join(TILE_FOLDER, str(z), str(x))
                
                if not os.path.exists(tile_path):
                    os.makedirs(tile_path)
                
                tile_file = os.path.join(tile_path, f"{y}.webp")
                
                if not os.path.exists(tile_file):
                    response = requests.get(url, stream=True)
                    if response.status_code == 200:
                        img = Image.open(BytesIO(response.content))
                        img = img.convert("RGB")
                        img.save(tile_file, "WEBP", quality=50)
                
                pbar.update(1)
