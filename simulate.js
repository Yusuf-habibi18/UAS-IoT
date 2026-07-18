/* =========================================================
   DASHBOARD MONITORING ENERGI — simulate.js
   Simulator data untuk MODE DEMO — dipakai saat backend Flask
   / broker MQTT / MySQL belum tersedia, supaya UI tetap bisa
   dicoba & didemokan secara mandiri (data sintetis, bukan asli).
   Dimuat SEBELUM app.jsx.
   ========================================================= */

window.PMSimulator = (function () {
  "use strict";

  let t = 0;
  let relay1 = false;
  let buzzer = false;
  let energiAcc = 12.4; // baseline energi kumulatif awal, seolah alat sudah lama menyala
  let lastTick = Date.now();
  const TARIF_PER_KWH = 1444; // selaras dengan tarif di server.py

  function getRealtime() {
    t += 0.15;
    const now = Date.now();
    const dtHours = (now - lastTick) / 1000 / 3600;
    lastTick = now;

    // Beban dasar naik signifikan kalau relay lampu / buzzer disimulasikan aktif
    const baseLoad = relay1 ? 85 : 8;
    const buzzLoad = buzzer ? 4 : 0;
    const wave = Math.sin(t) * 10;
    const noise = (Math.random() - 0.5) * 6;
    const daya = Math.max(1.5, baseLoad + buzzLoad + wave + noise);

    const tegangan = 218 + Math.sin(t * 0.6) * 3 + (Math.random() - 0.5) * 1.2;
    const arus = (daya / tegangan) * 1000; // mA
    const suhu = 27 + (daya / 110) * 15 + Math.sin(t * 0.2) * 1.1 + (Math.random() - 0.5) * 0.5;

    energiAcc += (daya / 1000) * dtHours;
    const biaya = energiAcc * TARIF_PER_KWH;

    return {
      status_alat: "ONLINE",
      tegangan: tegangan.toFixed(2),
      arus: arus.toFixed(2),
      daya: daya.toFixed(2),
      energi: energiAcc.toFixed(4),
      suhu: suhu.toFixed(2),
      biaya: biaya.toFixed(0),
      last_update: new Date().toLocaleTimeString("id-ID"),
    };
  }

  function sendCommand(actuator, command) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (actuator === "relay1") relay1 = command === "ON";
        if (actuator === "buzzer") buzzer = command === "ON";
        resolve({ status: "SUCCESS", message: `[SIMULASI] ${actuator} → ${command}` });
      }, 250 + Math.random() * 300);
    });
  }

  function sendConfig(maxWatt) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ status: "SUCCESS", message: `[SIMULASI] Batas daya diset ${maxWatt}W.` });
      }, 200);
    });
  }

  function login(username, password) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ status: "SUCCESS", message: "Login demo berhasil", token: "demo-token" });
      }, 300);
    });
  }

  return { getRealtime, sendCommand, sendConfig, login };
})();
