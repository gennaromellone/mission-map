import serial
import serial.tools.list_ports
import re
import json
import pynmea2
import threading

class Device:
    def __init__(self, device_config):
        self.device_config = device_config
        self.port = device_config.get("port")
        self.baudrate = device_config.get("baudrate", 9600)
        self.description = device_config.get("description", "")
        self.type = device_config.get("type", "Sconosciuto")
        self.latest_data = None
        self.running = True
        self.thread = threading.Thread(target=self.read_loop, daemon=True)
        self.thread.start()

    @staticmethod
    def list_serial_ports():
        """Trova tutte le porte seriali disponibili."""
        return {port.device: port.description for port in serial.tools.list_ports.comports()}

    def find_device_port(self, available_ports):
        """Trova la porta seriale del dispositivo confrontando il nome atteso con le porte disponibili."""
        for port, description in available_ports.items():
            if self.description.lower() in description.lower():
                self.port = port
                return port
        return None

    def read_loop(self):
        """Ciclo continuo di lettura per mantenere aggiornati i dati."""
        if not self.port:
            print(f"[ERRORE] Nessuna porta specificata per il dispositivo {self.description}")
            return
        
        try:
            with serial.Serial(self.port, self.baudrate, timeout=1) as ser:
                print(f"[INFO] Connessione a {self.port} aperta.")
                while self.running:                    
                    line = ser.readline().decode(errors='ignore').strip()
                    if line:
                        processed = self.process_data(line)
                        if processed != None:
                            self.latest_data = processed
        except serial.SerialException as e:
            print(f"[ERRORE] Impossibile connettersi a {self.port}: {e}")

    def process_data(self, packet):
        """Metodo generico da sovrascrivere nelle sottoclassi."""
        raise NotImplementedError("Questo metodo deve essere implementato nelle sottoclassi.")

    def get_latest_data(self):
        """Restituisce l'ultimo dato letto."""
        return self.latest_data or {"msg": {"error": f"{self.type}: Nessun dato disponibile"}}

    def stop(self):
        """Ferma il thread di lettura."""
        self.running = False
        self.thread.join()

class NMEA0183(Device):
    PATTERN = r"^\$[A-Z]{2}[A-Z0-9]{3},.*\*[0-9A-F]{2}$"
    
    def __init__(self, device_config):
        super().__init__(device_config)
        self.pattern = self.PATTERN
        self.gga_data = {}
        self.vtg_data = {}

    def process_data(self, packet):
        """Effettua il parsing di un pacchetto NMEA0183 e restituisce i dati disponibili."""
        try:
            parsed_data = pynmea2.parse(packet)

            if "GGA" in str(parsed_data):
                self.gga_data = {
                    'lat': 0.0000 if parsed_data.latitude == "" else float("{:.6f}".format(parsed_data.latitude)),
                    'lat_dir': parsed_data.lat_dir,
                    'lon_dir': parsed_data.lon_dir,
                    'lon': 0.0000 if parsed_data.longitude == "" else float("{:.6f}".format(parsed_data.longitude)),
                }

            elif "VTG" in str(parsed_data):
                data = str(parsed_data).split(',')
                degrees = 0.0 if data[1] == "" else float(data[1])
                self.vtg_data = {'degrees': degrees}

            # Costruiamo un unico dizionario da restituire
            combined_data = {}
            if self.gga_data:
                combined_data.update(self.gga_data)
            if self.vtg_data:
                combined_data.update(self.vtg_data)

            if combined_data:
                return {'msg': combined_data}

        except pynmea2.ParseError:
            return {"msg": {"error": "Parsing NMEA fallito"}}

        return None


class Depth(Device):
    PATTERN = r"^[0-9]+\s[0-9]+\.[0-9]+.*$"
    
    def __init__(self, device_config):
        super().__init__(device_config)
        self.pattern = self.PATTERN

    def process_data(self, packet):
        """Estrae il valore della profondità dalla stringa di dati."""
        values = packet.split()
        if len(values) > 5:
            try:
                return {"msg": {"depth": float(values[1])}}
            except ValueError:
                return {"msg": {"error": "Valore DEPTH non corretto!"}}
        return {"msg": {"error": "Pacchetto DEPTH non corretto!"}}
