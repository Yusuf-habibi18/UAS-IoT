import sys
from flask import Flask, jsonify, request
from flask_cors import CORS
import paho.mqtt.client as mqtt
import mysql.connector
import json
from datetime import datetime

# Console Windows default-nya cp1252, tidak bisa cetak emoji (✅⚠️📩💾❌) di
# bawah dan akan crash thread MQTT sebelum sempat subscribe. Paksa UTF-8.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

app = Flask(__name__)
CORS(app)

# =====================================================================
# 1. KONFIGURASI PARAMETER (HIVEMQ CLOUD & MYSQL)
# =====================================================================
MQTT_BROKER   = "1cd3ab6781ef422ab1c92882949b0e99.s1.eu.hivemq.cloud"
MQTT_PORT     = 8883
MQTT_USER     = "kelompok2"
MQTT_PASSWORD = "Kelompok2" 
CLIENT_ID     = "Backend_Fachri_Server"
TOPIC_SENSOR  = "itpln/kelompok2/sensor"
TOPIC_CONTROL = "itpln/kelompok2/control"

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "db_smart_socket"
}

# Fungsi Helper untuk Simpan Log ke Database (Memenuhi Fitur: Event Logging)
def simpan_log(aktivitas, keterangan):
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        query = "INSERT INTO event_logs (aktivitas, keterangan) VALUES (%s, %s)"
        cursor.execute(query, (aktivitas, keterangan))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print("⚠️ Gagal mencatat log ke DB:", e)

# =====================================================================
# 2. LOGIKA PROTOKOL MQTT (SUBSCRIBE & DATA STORAGE TO DB)
# =====================================================================
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("✅ MQTT: Sukses Terhubung ke HiveMQ Cloud!")
        client.subscribe(TOPIC_SENSOR) # Memenuhi Fitur: MQTT Subscribe data sensor
        simpan_log("SYSTEM MQTT", "Backend berhasil terkoneksi ke HiveMQ Broker.")
    else:
        print(f"❌ MQTT: Gagal konek, kode error: {rc}")

def on_message(client, userdata, msg):
    try:
        payload = msg.payload.decode("utf-8")
        print(f"📩 MQTT: Ada data masuk -> {payload}")
        data_sensor = json.loads(payload)
        
        # Perhitungan biaya otomatis berdasarkan kWh listrik (tarif Rp 1.444 / kWh)
        total_biaya = int(data_sensor.get("kwh", 0) * 1444)
        
        # Memenuhi Fitur: Penyimpanan data otomatis ke database MySQL
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        query = """INSERT INTO monitoring_data (tegangan, arus, daya, energi, suhu, biaya) 
                   VALUES (%s, %s, %s, %s, %s, %s)"""
        values = (
            data_sensor.get("volt", 0),
            data_sensor.get("ampere", 0),
            data_sensor.get("watt", 0),
            data_sensor.get("kwh", 0),
            data_sensor.get("suhu", 0),
            total_biaya
        )
        cursor.execute(query, values)
        conn.commit()
        cursor.close()
        conn.close()
        print("💾 DB: Data sensor berhasil disimpan!")
        
    except Exception as e:
        print("⚠️ Error MQTT:", e)

mqtt_client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID)
mqtt_client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
mqtt_client.tls_set() # Koneksi TLS Terenkripsi Port 8883
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT)
    mqtt_client.loop_start()
except Exception as e:
    print("⚠️ MQTT: Gagal konek saat startup, REST API tetap berjalan tanpa MQTT:", e)

# =====================================================================
# 3. LOGIKA FLASK REST API (KOMUNIKASI DENGAN FRONT-END DASHBOARD)
# =====================================================================

# --- [FITUR A: LOGIN & AUTENTIKASI] ---
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")
    
    if username == "kelompok2" and password == "kelompok2":
        simpan_log("USER LOGIN", f"Pengguna {username} berhasil login ke dashboard.")
        return jsonify({"status": "SUCCESS", "message": "Login Berhasil", "token": "dummy-token-kelompok2"}), 200
    else:
        simpan_log("LOGIN FAILED", f"Percobaan login gagal dengan username: {username}")
        return jsonify({"status": "FAILED", "message": "Username atau Password Salah"}), 401


# --- [FITUR B: MONITORING STATUS & DATA REALTIME] ---
@app.route('/api/dashboard/realtime', methods=['GET'])
def get_realtime_data():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM monitoring_data ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row:
            return jsonify({
                "status_alat": "ONLINE", # Memenuhi Fitur: Monitoring status perangkat
                "tegangan": row['tegangan'],
                "arus": row['arus'],
                "daya": row['daya'],
                "energi": row['energi'],
                "suhu": row['suhu'],
                "biaya": row['biaya'],
                "last_update": row['created_at'].strftime("%Y-%m-%d %H:%M:%S") # Informasi waktu terakhir data diterima
            }), 200
        return jsonify({"message": "Belum ada data", "status_alat": "OFFLINE"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- [FITUR C: HISTORI DATA UNTUK GRAFIK / VISUALISASI] ---
@app.route('/api/dashboard/history', methods=['GET'])
def get_history_data():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM monitoring_data ORDER BY id DESC LIMIT 20")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        rows.reverse() # Diurutkan dari lama ke baru agar grafik Front-end bergerak ke kanan
        for r in rows:
            r['created_at'] = r['created_at'].strftime("%H:%M:%S")
            
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- [FITUR D: KONTROL MINIMAL 2 AKTUATOR LEWAT MQTT] ---
# 🛠️ FIXED: Sudah disesuaikan untuk mengontrol "relay1" dan "buzzer"
@app.route('/api/device/control', methods=['POST'])
def control_device():
    try:
        data = request.get_json()
        actuator = data.get("actuator")           # Harus bernilai: "relay1" atau "buzzer"
        command = data.get("command", "").upper()   # Harus bernilai: "ON" atau "OFF"
        
        if actuator in ["relay1", "buzzer"] and command in ["ON", "OFF"]:
            # Menyusun JSON Payload untuk dipublish ke ESP32
            payload_msg = json.dumps({actuator: command})
            
            # Memenuhi Fitur: MQTT Publish untuk kirim perintah kontrol
            result = mqtt_client.publish(TOPIC_CONTROL, payload_msg, qos=1)
            result.wait_for_publish()
            
            simpan_log("KONTROL ALAT", f"Mengubah status {actuator} menjadi {command}")
            return jsonify({"status": "SUCCESS", "message": f"Perintah {command} dikirim ke {actuator}"}), 200
        else:
            return jsonify({"status": "FAILED", "message": "Parameter actuator atau command tidak valid!"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- [FITUR E: HALAMAN KONFIGURASI PERANGKAT] ---
@app.route('/api/device/config', methods=['POST'])
def update_config():
    data = request.get_json()
    batas_daya = data.get("max_watt", 2200)
    
    simpan_log("KONFIGURASI ALAT", f"Mengubah batas maksimal daya perangkat menjadi {batas_daya} Watt.")
    return jsonify({"status": "SUCCESS", "message": f"Konfigurasi batas daya {batas_daya}W berhasil disimpan!"}), 200


if __name__ == '__main__':
    app.run(debug=True, port=5000, use_reloader=False)