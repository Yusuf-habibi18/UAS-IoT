import sys
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
import paho.mqtt.client as mqtt
import mysql.connector
import json

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

DEVICE_ID = "ESP32_SmartSocket_Kel2"
DEVICE_OFFLINE_AFTER_SECONDS = 15  # firmware publish tiap 2 detik; >15 detik dianggap OFFLINE

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "db_smart_socket"
}


def get_db():
    return mysql.connector.connect(**DB_CONFIG)


# Fungsi Helper untuk Simpan Log ke Database (Memenuhi Fitur: Event Logging)
def simpan_log(aktivitas, keterangan):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO event_logs (aktivitas, keterangan) VALUES (%s, %s)",
            (aktivitas, keterangan)
        )
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print("⚠️ Gagal mencatat log ke DB:", e)


# Memenuhi Fitur: Device Management & Monitoring status perangkat —
# meng-update baris status perangkat (bukan insert time-series baru).
def update_device_status(**fields):
    try:
        conn = get_db()
        cursor = conn.cursor()
        if fields:
            set_clause = ", ".join(f"{k} = %s" for k in fields)
            values = list(fields.values()) + [DEVICE_ID]
            cursor.execute(
                f"UPDATE devices SET {set_clause}, last_seen = NOW() WHERE device_id = %s",
                values
            )
        else:
            cursor.execute("UPDATE devices SET last_seen = NOW() WHERE device_id = %s", (DEVICE_ID,))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print("⚠️ Gagal update status device:", e)


# =====================================================================
# 2. LOGIKA PROTOKOL MQTT (SUBSCRIBE & DATA STORAGE TO DB)
# =====================================================================
_last_alarm_active = False  # dipakai untuk deteksi transisi alarm (edge-triggered log)


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("✅ MQTT: Sukses Terhubung ke HiveMQ Cloud!")
        client.subscribe(TOPIC_SENSOR)  # Memenuhi Fitur: MQTT Subscribe data sensor
        simpan_log("SYSTEM MQTT", "Backend berhasil terkoneksi ke HiveMQ Broker.")
    else:
        print(f"❌ MQTT: Gagal konek, kode error: {rc}")


def on_disconnect(client, userdata, flags, rc, properties=None):
    print(f"🔌 MQTT: Terputus dari broker, kode: {rc}")


def on_message(client, userdata, msg):
    global _last_alarm_active
    try:
        payload = msg.payload.decode("utf-8")
        print(f"📩 MQTT: Ada data masuk -> {payload}")
        data_sensor = json.loads(payload)

        # A. Status perangkat (relay/buzzer/alarm) — bisa datang dari payload
        #    telemetri penuh maupun payload status-only (event-driven dari ESP32)
        status_fields = {}
        if "relay1_status" in data_sensor:
            status_fields["relay1_status"] = data_sensor["relay1_status"]
        if "buzzer_status" in data_sensor:
            status_fields["buzzer_status"] = data_sensor["buzzer_status"]
        if "alarm" in data_sensor:
            status_fields["alarm_status"] = 1 if data_sensor["alarm"] else 0
            status_fields["alarm_reason"] = data_sensor.get("alarm_reason", "")

        update_device_status(**status_fields)  # selalu update last_seen, walau status_fields kosong

        # B. Event Logging saat alarm baru trip / baru reda (edge-triggered,
        #    supaya tidak spam log tiap 2 detik selama alarm masih aktif)
        if "alarm" in data_sensor:
            alarm_now = bool(data_sensor["alarm"])
            if alarm_now and not _last_alarm_active:
                simpan_log(
                    "ALARM SYSTEM",
                    f"Alarm {data_sensor.get('alarm_reason', 'TIDAK DIKETAHUI')} terdeteksi — relay diputus otomatis."
                )
            elif not alarm_now and _last_alarm_active:
                simpan_log("ALARM SYSTEM", "Kondisi kembali aman, alarm direset.")
            _last_alarm_active = alarm_now

        # C. Penyimpanan data telemetri ke database (cuma ada di payload
        #    periodik tiap 2 detik, bukan di payload status-only)
        if "volt" in data_sensor:
            total_biaya = int(data_sensor.get("kwh", 0) * 1444)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute(
                """INSERT INTO monitoring_data (tegangan, arus, daya, energi, suhu, kelembapan, biaya)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (
                    data_sensor.get("volt", 0),
                    data_sensor.get("ampere", 0),
                    data_sensor.get("watt", 0),
                    data_sensor.get("kwh", 0),
                    data_sensor.get("suhu", 0),
                    data_sensor.get("kelembapan", 0),
                    total_biaya,
                )
            )
            conn.commit()
            cursor.close()
            conn.close()
            print("💾 DB: Data sensor berhasil disimpan!")

    except Exception as e:
        print("⚠️ Error MQTT:", e)


mqtt_client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID)
mqtt_client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
mqtt_client.tls_set()  # Koneksi TLS Terenkripsi Port 8883
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message
mqtt_client.on_disconnect = on_disconnect

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
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM monitoring_data ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row:
            return jsonify({
                "status_alat": "ONLINE",  # Memenuhi Fitur: Monitoring status perangkat
                "tegangan": row['tegangan'],
                "arus": row['arus'],
                "daya": row['daya'],
                "energi": row['energi'],
                "suhu": row['suhu'],
                "kelembapan": row['kelembapan'],
                "biaya": row['biaya'],
                "last_update": row['created_at'].strftime("%Y-%m-%d %H:%M:%S")
            }), 200
        return jsonify({"message": "Belum ada data", "status_alat": "OFFLINE"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- [FITUR C: HISTORI DATA UNTUK GRAFIK / VISUALISASI] ---
@app.route('/api/dashboard/history', methods=['GET'])
def get_history_data():
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM monitoring_data ORDER BY id DESC LIMIT 20")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        rows.reverse()  # Diurutkan dari lama ke baru agar grafik Front-end bergerak ke kanan
        for r in rows:
            r['created_at'] = r['created_at'].strftime("%H:%M:%S")

        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- [FITUR D: KONTROL MINIMAL 2 AKTUATOR LEWAT MQTT] ---
@app.route('/api/device/control', methods=['POST'])
def control_device():
    try:
        data = request.get_json()
        actuator = data.get("actuator")            # "relay1" atau "buzzer"
        command = data.get("command", "").upper()  # "ON" atau "OFF"

        if actuator in ["relay1", "buzzer"] and command in ["ON", "OFF"]:
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


# --- [FITUR E: HALAMAN KONFIGURASI SISTEM] ---
@app.route('/api/device/config', methods=['GET'])
def get_config():
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT batas_daya_watt FROM devices WHERE device_id = %s", (DEVICE_ID,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return jsonify({"max_watt": row['batas_daya_watt'] if row else 2200}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/device/config', methods=['POST'])
def update_config():
    data = request.get_json()
    batas_daya = data.get("max_watt", 2200)

    update_device_status(batas_daya_watt=batas_daya)
    simpan_log("KONFIGURASI ALAT", f"Mengubah batas maksimal daya perangkat menjadi {batas_daya} Watt.")
    return jsonify({"status": "SUCCESS", "message": f"Konfigurasi batas daya {batas_daya}W berhasil disimpan!"}), 200


# --- [FITUR F: DEVICE MANAGEMENT] ---
@app.route('/api/devices', methods=['GET'])
def get_devices():
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM devices")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        now = datetime.now()
        for r in rows:
            last_seen = r.get('last_seen')
            r['is_online'] = bool(last_seen and (now - last_seen).total_seconds() <= DEVICE_OFFLINE_AFTER_SECONDS)
            r['alarm_status'] = bool(r['alarm_status'])
            if last_seen:
                r['last_seen'] = last_seen.strftime("%Y-%m-%d %H:%M:%S")
            r['created_at'] = r['created_at'].strftime("%Y-%m-%d %H:%M:%S")

        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/devices/<device_id>', methods=['PUT'])
def update_device(device_id):
    try:
        data = request.get_json()
        nama = data.get("nama_perangkat")
        lokasi = data.get("lokasi")

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE devices SET nama_perangkat = %s, lokasi = %s WHERE device_id = %s",
            (nama, lokasi, device_id)
        )
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()

        if affected == 0:
            return jsonify({"status": "FAILED", "message": "Perangkat tidak ditemukan."}), 404

        simpan_log("DEVICE MANAGEMENT", f"Info perangkat {device_id} diperbarui menjadi '{nama}' @ '{lokasi}'.")
        return jsonify({"status": "SUCCESS", "message": "Info perangkat berhasil diperbarui."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- [FITUR G: EVENT LOG (dibaca oleh Front-End)] ---
@app.route('/api/events', methods=['GET'])
def get_events():
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM event_logs ORDER BY id DESC LIMIT 50")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        for r in rows:
            r['created_at'] = r['created_at'].strftime("%Y-%m-%d %H:%M:%S")

        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000, use_reloader=False)
