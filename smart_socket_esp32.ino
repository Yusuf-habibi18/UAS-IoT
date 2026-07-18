#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <PZEM004Tv30.h>
#include <Wire.h>                  // Library bawaan untuk I2C
#include <LiquidCrystal_I2C.h>     // Library untuk LCD I2C

// ==========================================
// 1. KONFIGURASI WI-FI & HIVEMQ CLOUD BROKER
// ==========================================
// ⚠️ GANTI dengan Nama Wi-Fi dan Password Hotspot HP kalian!
const char* ssid     = "realme 12 Pro+ 5G v26c";
const char* password = "zbdb5267";

const char* mqtt_broker   = "1cd3ab6781ef422ab1c92882949b0e99.s1.eu.hivemq.cloud";
const int mqtt_port       = 8883; // Port TLS Terenkripsi
const char* mqtt_user     = "kelompok2";
const char* mqtt_password = "Kelompok2";

const char* TOPIC_SENSOR  = "itpln/kelompok2/sensor";
const char* TOPIC_CONTROL = "itpln/kelompok2/control";

// ==========================================
// 2. DEKLARASI PIN HARDWARE (3 INPUT & 2 OUTPUT)
// ==========================================
#define RELAY_PIN   25 // Output 1: Jalur Beban Utama (Lampu)
#define BUZZER_PIN  26 // Output 2: Kaki Panjang (+) Buzzer 2-pin
#define BUTTON_PIN  14 // Input 3: Tombol Saklar Manual Lokal
#define DHTPIN      4  // Input 1: Sensor Suhu & Kelembapan
#define DHTTYPE     DHT11

DHT dht(DHTPIN, DHTTYPE);
PZEM004Tv30 pzem(Serial2, 16, 17); // Input 2: RX=16, TX=17

// Inisialisasi LCD: Alamat I2C standar 0x27, ukuran 16 kolom x 2 baris
LiquidCrystal_I2C lcd(0x27, 16, 2);

WiFiClientSecure espClient;
PubSubClient mqtt_client(espClient);

unsigned long lastMsg = 0;
const long interval = 2000; // Siklus kirim data & update LCD setiap 2 detik
bool lastButtonState = HIGH;

// ==========================================
// 2B. KONFIGURASI PROTEKSI OTOMATIS (SAFETY)
// ==========================================
// ⚠️ Sesuaikan ambang batas ini dengan kebutuhan pengujian kalian.
const float OVERHEAT_THRESHOLD   = 45.0;  // Celsius — di atas ini, trip alarm
const float OVERHEAT_RESET       = 42.0;  // Celsius — di bawah ini, alarm reda otomatis (hysteresis)
const float OVERCURRENT_THRESHOLD = 2.0;  // Ampere — di atas ini, trip alarm
const float OVERCURRENT_RESET     = 1.7;  // Ampere — di bawah ini, alarm reda otomatis (hysteresis)
const long  BUZZER_ALARM_BLINK_MS = 200;  // Kecepatan kedip buzzer saat alarm aktif

bool alarmActive = false;
String alarmReason = ""; // "OVERHEAT" | "OVERCURRENT" | ""
unsigned long lastBuzzerBlink = 0;
bool buzzerBlinkState = false;
bool buzzerManualState = false; // status buzzer yang diminta manual (MQTT), dipakai lagi setelah alarm reda

// Forward declaration — publishStatus() dipakai oleh callback() & checkSafety()
// sebelum definisi aslinya muncul di bawah (lihat bagian 3C).
void publishStatus();

// ==========================================
// 3. FUNGSI CALLBACK (MENERIMA PERINTAH BACKEND SINKRON 100%)
// ==========================================
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("📩 Pesan masuk pada topik [");
  Serial.print(topic);
  Serial.println("] ");

  String messageTemp;
  for (int i = 0; i < length; i++) {
    messageTemp += (char)payload[i];
  }
  Serial.println("Payload: " + messageTemp);

  // Parsing JSON dari Backend Fachri
  JsonDocument doc;
  deserializeJson(doc, messageTemp);

  // A. Eksekusi Perintah untuk Relay 1
  if (doc.containsKey("relay1")) {
    String cmd = doc["relay1"].as<String>();
    if (cmd == "ON") {
      if (alarmActive) {
        // 🛡️ Proteksi: selama alarm aktif, perintah ON dari jarak jauh diabaikan
        Serial.println("⛔ Perintah Relay ON ditolak — alarm keamanan masih aktif (" + alarmReason + ")");
      } else {
        digitalWrite(RELAY_PIN, HIGH);
        Serial.println("🎛️ Perintah: Relay Lampu -> ON");
        publishStatus();
      }
    } else if (cmd == "OFF") {
      digitalWrite(RELAY_PIN, LOW);
      Serial.println("🎛️ Perintah: Relay Lampu -> OFF");
      publishStatus();
    }
  }

  // B. Eksekusi Perintah untuk Buzzer (Aktuator 2)
  if (doc.containsKey("buzzer")) {
    String cmd = doc["buzzer"].as<String>();
    buzzerManualState = (cmd == "ON");
    if (!alarmActive) { // selama alarm aktif, pola kedip otomatis yang berkuasa atas buzzer
      digitalWrite(BUZZER_PIN, buzzerManualState ? HIGH : LOW);
    }
    Serial.println(String("🔊 Perintah: Buzzer -> ") + (buzzerManualState ? "ON" : "OFF"));
    publishStatus();
  }
}

// ==========================================
// 3B. LOGIKA PROTEKSI OTOMATIS (OVERHEAT / OVERCURRENT)
// ==========================================
void checkSafety(float suhu, float current) {
  if (!alarmActive) {
    if (suhu > OVERHEAT_THRESHOLD) {
      alarmActive = true;
      alarmReason = "OVERHEAT";
      digitalWrite(RELAY_PIN, LOW); // 🛑 Auto-cutoff
      Serial.println("🚨 ALARM: Suhu berlebih (" + String(suhu, 1) + "C) — Relay diputus otomatis!");
      publishStatus();
    } else if (current > OVERCURRENT_THRESHOLD) {
      alarmActive = true;
      alarmReason = "OVERCURRENT";
      digitalWrite(RELAY_PIN, LOW); // 🛑 Auto-cutoff
      Serial.println("🚨 ALARM: Arus berlebih (" + String(current, 2) + "A) — Relay diputus otomatis!");
      publishStatus();
    }
  } else {
    // Sedang alarm — cek apakah kondisi sudah aman kembali (pakai hysteresis)
    bool suhuAman = suhu < OVERHEAT_RESET;
    bool arusAman = current < OVERCURRENT_RESET;
    if (suhuAman && arusAman) {
      alarmActive = false;
      alarmReason = "";
      digitalWrite(BUZZER_PIN, buzzerManualState ? HIGH : LOW); // kembalikan buzzer ke status manual terakhir
      Serial.println("✅ Kondisi aman kembali — alarm direset. Relay tetap OFF, nyalakan manual lagi kalau perlu.");
      publishStatus();
    }
  }
}

void updateAlarmBuzzer() {
  if (!alarmActive) return;
  unsigned long now = millis();
  if (now - lastBuzzerBlink >= BUZZER_ALARM_BLINK_MS) {
    lastBuzzerBlink = now;
    buzzerBlinkState = !buzzerBlinkState;
    digitalWrite(BUZZER_PIN, buzzerBlinkState ? HIGH : LOW);
  }
}

// ==========================================
// 3C. PUBLISH STATUS SEGERA (dipanggil tiap ada perubahan, di luar siklus telemetri 2 detik)
// ==========================================
void publishStatus() {
  JsonDocument doc;
  doc["relay1_status"] = digitalRead(RELAY_PIN) ? "ON" : "OFF";
  doc["buzzer_status"]  = alarmActive ? "ON" : (buzzerManualState ? "ON" : "OFF");
  doc["alarm"]          = alarmActive;
  doc["alarm_reason"]   = alarmReason;

  char jsonBuffer[192];
  serializeJson(doc, jsonBuffer);
  mqtt_client.publish(TOPIC_SENSOR, jsonBuffer);
  Serial.print("🚀 Publish Status (event): ");
  Serial.println(jsonBuffer);
}

// ==========================================
// 4. FUNGSI KONEKSI KE HIVEMQ MQTT CLOUD
// ==========================================
void reconnect() {
  while (!mqtt_client.connected()) {
    Serial.print("🔄 Menghubungkan ke HiveMQ Cloud...");
    String clientId = "ESP32_SmartSocket_Kel2_" + String(random(0, 1000));

    if (mqtt_client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
      Serial.println("✅ Terhubung!");
      mqtt_client.subscribe(TOPIC_CONTROL); // Langsung subscribe topik kontrol
      publishStatus(); // lapor status awal begitu tersambung
    } else {
      Serial.print("❌ Gagal, rc=");
      Serial.print(mqtt_client.state());
      Serial.println(" Mencoba kembali dalam 5 detik...");
      delay(5000);
    }
  }
}

// ==========================================
// 5. SETUP AWAL PERANGKAT
// ==========================================
void setup() {
  Serial.begin(115200);

  // Konfigurasi Input & Output I/O
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP); // Mengaktifkan internal pull-up untuk tombol

  digitalWrite(RELAY_PIN, LOW);  // Kondisi awal mati aman
  digitalWrite(BUZZER_PIN, LOW); // Kondisi awal diam

  // Inisialisasi Layar LCD Fisik
  Wire.begin(21, 22); // Mengunci pin I2C (SDA=21, SCL=22)
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Smart Socket L2");
  lcd.setCursor(0, 1);
  lcd.print("Connecting...");

  dht.begin();

  // Memulai Koneksi Wi-Fi
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ Wi-Fi Terkoneksi!");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected!");

  espClient.setInsecure(); // Mengabaikan validasi root CA penuh agar handshake SSL ESP32 ringan
  mqtt_client.setServer(mqtt_broker, mqtt_port);
  mqtt_client.setCallback(callback);
}

// ==========================================
// 6. LOOPING UTAMA PROGRAM
// ==========================================
void loop() {
  if (!mqtt_client.connected()) {
    reconnect();
  }
  mqtt_client.loop();
  updateAlarmBuzzer(); // kedipkan buzzer non-blocking selama alarm aktif

  // ------------------------------------------------------------------
  // LOGIKA MANUAL: KONTROL RELAY LEWAT TOMBOL FISIK LOKAL (DEBOUNCE)
  // ------------------------------------------------------------------
  bool currentButtonState = digitalRead(BUTTON_PIN);
  if (currentButtonState == LOW && lastButtonState == HIGH) {
    delay(50); // Debounce delay mencegah pembacaan ganda akibat getaran mekanis
    if (digitalRead(BUTTON_PIN) == LOW) {
      if (alarmActive) {
        // 🛡️ Selama alarm aktif, tombol fisik tidak bisa menyalakan ulang relay
        Serial.println("⛔ Tombol fisik diabaikan — alarm keamanan masih aktif (" + alarmReason + ")");
      } else {
        digitalWrite(RELAY_PIN, !digitalRead(RELAY_PIN)); // Toggle status relay
        Serial.print("🔘 Tombol Fisik Ditekan! Relay saat ini: ");
        Serial.println(digitalRead(RELAY_PIN) ? "ON" : "OFF");
        publishStatus(); // lapor balik status relay yang berubah lewat tombol fisik
      }
    }
  }
  lastButtonState = currentButtonState;

  // ------------------------------------------------------------------
  // CYCLE TELEMETRI: BACA SENSOR & PUBLISH DATA PERIODIK (TIAP 2 DETIK)
  // ------------------------------------------------------------------
  unsigned long now = millis();
  if (now - lastMsg > interval) {
    lastMsg = now;

    // Membaca Data Parameter Listrik dari PZEM-004T
    float voltage = pzem.voltage();
    float current = pzem.current();
    float power   = pzem.power();
    float energy  = pzem.energy();

    // Membaca Data Suhu & Kelembapan dari DHT11
    float suhuInternal = dht.readTemperature();
    float kelembapan   = dht.readHumidity();

    // Fallback data simulasi otomatis jika sensor belum dialiri listrik AC 220V PLN
    if (isnan(voltage)) voltage = 220.5;
    if (isnan(current)) current = 0.34;
    if (isnan(power)) power = 75.2;
    if (isnan(energy)) energy = 0.012;
    if (isnan(suhuInternal)) suhuInternal = 29.0;
    if (isnan(kelembapan)) kelembapan = 60.0;

    // 🛡️ Cek kondisi bahaya SEBELUM publish, supaya status relay yang dikirim sudah yang terbaru
    checkSafety(suhuInternal, current);

    // A. UPDATE TAMPILAN MONITORING PADA LAYAR LCD FISIK
    lcd.clear();
    if (alarmActive) {
      lcd.setCursor(0, 0);
      lcd.print("WARNING: ");
      lcd.print(alarmReason == "OVERHEAT" ? "OVERHEAT!" : "OVERCURRENT!");
      lcd.setCursor(0, 1);
      lcd.print("Relay Diputus!");
    } else {
      // Baris 1: Menampilkan Tegangan (V) dan Daya (W)
      lcd.setCursor(0, 0);
      lcd.print("V:"); lcd.print(voltage, 1); lcd.print("V");
      lcd.setCursor(9, 0);
      lcd.print("W:"); lcd.print(power, 1); lcd.print("W");

      // Baris 2: Menampilkan Suhu & Kelembapan
      lcd.setCursor(0, 1);
      lcd.print("T:"); lcd.print(suhuInternal, 1); lcd.print("C");
      lcd.setCursor(9, 1);
      lcd.print("H:"); lcd.print(kelembapan, 0); lcd.print("%");
    }

    // B. PUBLISH PAYLOAD JSON DATA SENSOR KE BROKER HIVEMQ CLOUD
    JsonDocument outDoc;
    outDoc["volt"]         = voltage;
    outDoc["ampere"]       = current;
    outDoc["watt"]         = power;
    outDoc["kwh"]          = energy;
    outDoc["suhu"]         = suhuInternal;
    outDoc["kelembapan"]   = kelembapan;
    outDoc["relay1_status"] = digitalRead(RELAY_PIN) ? "ON" : "OFF";
    outDoc["buzzer_status"] = digitalRead(BUZZER_PIN) ? "ON" : "OFF";
    outDoc["alarm"]         = alarmActive;
    outDoc["alarm_reason"]  = alarmReason;

    char jsonBuffer[320];
    serializeJson(outDoc, jsonBuffer);

    mqtt_client.publish(TOPIC_SENSOR, jsonBuffer);
    Serial.print("🚀 Publish Sensor ke HiveMQ: ");
    Serial.println(jsonBuffer);
  }
}
