-- =====================================================================
-- Schema database untuk server.py (Flask + MySQL)
-- Jalankan file ini di MySQL sebelum menjalankan server.py, misal:
--   mysql -u root -p < database.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS db_smart_socket
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE db_smart_socket;

-- Menyimpan data sensor yang masuk lewat MQTT (on_message di server.py)
CREATE TABLE IF NOT EXISTS monitoring_data (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  tegangan   FLOAT NOT NULL DEFAULT 0,
  arus       FLOAT NOT NULL DEFAULT 0,
  daya       FLOAT NOT NULL DEFAULT 0,
  energi     FLOAT NOT NULL DEFAULT 0,
  suhu       FLOAT NOT NULL DEFAULT 0,
  biaya      INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Menyimpan event log (login, kontrol aktuator, konfigurasi, status MQTT)
CREATE TABLE IF NOT EXISTS event_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  aktivitas  VARCHAR(100) NOT NULL,
  keterangan VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Index untuk mempercepat query "ORDER BY id DESC LIMIT n" yang dipakai
-- di /api/dashboard/realtime dan /api/dashboard/history
-- (dibungkus prosedur supaya aman dijalankan berkali-kali tanpa error
-- "Duplicate key name" jika index sudah ada)
DROP PROCEDURE IF EXISTS create_index_if_not_exists;
DELIMITER //
CREATE PROCEDURE create_index_if_not_exists()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = 'db_smart_socket' AND table_name = 'monitoring_data' AND index_name = 'idx_monitoring_created_at'
  ) THEN
    ALTER TABLE monitoring_data ADD INDEX idx_monitoring_created_at (created_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = 'db_smart_socket' AND table_name = 'event_logs' AND index_name = 'idx_event_logs_created_at'
  ) THEN
    ALTER TABLE event_logs ADD INDEX idx_event_logs_created_at (created_at);
  END IF;
END //
DELIMITER ;
CALL create_index_if_not_exists();
DROP PROCEDURE create_index_if_not_exists;
