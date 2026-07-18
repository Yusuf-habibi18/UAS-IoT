/* =========================================================
   DASHBOARD MONITORING ENERGI — app.jsx
   Tema cyber/futuristik. Menggantikan main.js lama, fungsi
   dipertahankan 100% (Dexie cache, polling Flask API, Chart.js,
   kontrol aktuator via MQTT-bridge) + perbaikan: tabel riwayat
   yang sebelumnya tidak tersambung ke DOM, dan field "biaya"
   yang sudah dikirim backend tapi belum pernah ditampilkan.
   ========================================================= */

const { useState, useEffect, useRef, useCallback } = React;

const API_URL = "http://127.0.0.1:5000";
const MAX_CHART_POINTS = 12;
const MAX_HISTORY_ROWS = 10;

/* ---------------------------------------------------------
   IKON — set SVG line-icon custom bergaya HUD (stroke tipis,
   bukan emoji, bukan font-icon eksternal)
   --------------------------------------------------------- */
const ICON_PATHS = {
  zap: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  thermometer: "M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0Z M12 8h1",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  cpu: "M9 2v3 M15 2v3 M9 19v3 M15 19v3 M2 9h3 M2 15h3 M19 9h3 M19 15h3 M6 6h12v12H6z M9 9h6v6H9z",
  battery: "M2 9h15a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H2z M22 11.5v1 M6 9v6",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2",
  power: "M12 2v9 M18.4 6.6a9 9 0 1 1-12.8 0",
  wifi: "M2 8.82a15 15 0 0 1 20 0 M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 20h.01",
  wifiOff: "M2 3l19 19 M8.5 16.5a5 5 0 0 1 6 0 M5 12.5a10 10 0 0 1 5.5-2.7 M12.5 9.8A10 10 0 0 1 19 12.5 M2 8.8A15 15 0 0 1 6.3 6",
  bolt: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  wallet: "M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2 M16 13h2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z",
  history: "M3 12a9 9 0 1 0 3-6.7 M3 5v5h5 M12 7v5l4 2",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z M17 21v-8H7v8 M7 3v5h8",
  check: "M20 6 9 17l-5-5",
  alert: "M12 9v4 M12 17h.01 M10.3 3.86 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z",
  x: "M18 6 6 18 M6 6l12 12",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Z M7 11V7a5 5 0 0 1 10 0v4",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06 M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19 M14.12 14.12a3 3 0 1 1-4.24-4.24 M1 1l22 22",
  flask: "M9 2h6 M10 2v6.34a2 2 0 0 1-.4 1.2L4.66 17.9A2 2 0 0 0 6.28 21h11.44a2 2 0 0 0 1.62-3.1L14 9.53a2 2 0 0 1-.4-1.2V2 M7 15h10",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  arrowRight: "M5 12h14 M12 5l7 7-7 7",
};

function Icon({ name, className = "w-5 h-5", strokeWidth = 1.8 }) {
  const d = ICON_PATHS[name] || "";
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ---------------------------------------------------------
   FORMAT HELPERS
   --------------------------------------------------------- */
const fmt = (v, d = 2) => Number.parseFloat(v || 0).toFixed(d);
const fmtRupiah = (v) => "Rp " + Math.round(v || 0).toLocaleString("id-ID");

/* ---------------------------------------------------------
   TOAST SYSTEM
   --------------------------------------------------------- */
function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((type, msg) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return { toasts, push };
}

function ToastStack({ toasts }) {
  const styles = {
    success: { color: "var(--mint)", icon: "check" },
    error: { color: "var(--danger)", icon: "alert" },
    info: { color: "var(--cyan)", icon: "alert" },
  };
  return (
    <div className="toast-stack">
      {toasts.map((t) => {
        const s = styles[t.type] || styles.info;
        return (
          <div key={t.id} className="toast-item cyber-panel px-4 py-3 rounded-xl flex items-center gap-3 min-w-[240px]" style={{ color: s.color }}>
            <Icon name={s.icon} className="w-4 h-4 shrink-0" />
            <span className="text-sm font-body text-[color:var(--ink)]">{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------
   HEADER
   --------------------------------------------------------- */
function Header({ online, lastUpdate, demo, username, onLogout }) {
  const [clock, setClock] = useState("--:--:--");
  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date();
      setClock(now.toLocaleTimeString("id-ID") + " • " + now.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="cyber-panel hud-corners rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-4">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="glitch font-display text-2xl md:text-3xl font-semibold tracking-wide text-white" data-text="POWER GRID MONITOR">
            POWER GRID MONITOR
          </h1>
          {demo && (
            <span className="demo-badge text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <Icon name="flask" className="w-3 h-3" /> Mode Demo · Data Simulasi
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs font-mono uppercase tracking-widest flex-wrap">
          <span className={`radar-dot inline-block w-2 h-2 rounded-full ${online ? "bg-[color:var(--mint)]" : "bg-[color:var(--danger)]"}`} style={{ color: online ? "var(--mint)" : "var(--danger)" }} />
          <span style={{ color: online ? "var(--mint)" : "var(--danger)" }}>{online ? "SYSTEM ONLINE" : "DISCONNECTED"}</span>
          {lastUpdate && <span className="text-[color:var(--ink-dim)] normal-case tracking-normal">· update terakhir {lastUpdate}</span>}
          {username && <span className="text-[color:var(--ink-dim)] normal-case tracking-normal">· operator {username}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 bg-black/30 px-5 py-2.5 rounded-xl border border-white/10">
          <Icon name="clock" className="w-4 h-4" strokeWidth={1.6} />
          <span className="font-mono text-sm text-[color:var(--cyan)]">{clock}</span>
        </div>
        <button onClick={onLogout} aria-label="Keluar" className="btn-neon w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 bg-black/30 hover:border-[color:var(--danger)] transition-colors" style={{ color: "var(--danger)" }}>
          <Icon name="logout" className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------
   COMMAND ARRAY — toggle switch kontrol aktuator
   --------------------------------------------------------- */
function ToggleRow({ label, icon, color, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between bg-black/25 border border-white/10 rounded-xl px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}22`, color }}>
          <Icon name={icon} className="w-4.5 h-4.5" />
        </span>
        <div>
          <p className="font-display text-sm tracking-wide text-white">{label}</p>
          <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: checked ? "var(--mint)" : "var(--ink-dim)" }}>
            {checked ? "AKTIF" : "NONAKTIF"}
          </p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={`Toggle ${label}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`cyber-toggle ${checked ? "on" : "off armed"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span className="knob" />
      </button>
    </div>
  );
}

function CommandArray({ sendCommand }) {
  const [relay1, setRelay1] = useState(false);
  const [buzzer, setBuzzer] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async (actuator, current, setter) => {
    const next = !current;
    setter(next); // optimistic
    setBusy(true);
    const ok = await sendCommand(actuator, next ? "ON" : "OFF");
    if (!ok) setter(current); // revert kalau gagal
    setBusy(false);
  };

  return (
    <div className="cyber-panel hud-corners rounded-2xl p-6 relative overflow-hidden reveal" ref={(el) => window.registerReveal && window.registerReveal(el)}>
      <h3 className="font-display text-sm tracking-wide uppercase text-white mb-5 flex items-center gap-2">
        <Icon name="settings" className="w-4 h-4" style={{ color: "var(--violet)" }} />
        Command Array
      </h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <ToggleRow label="Relay Lampu" icon="power" color="var(--mint)" checked={relay1} onChange={() => toggle("relay1", relay1, setRelay1)} disabled={busy} />
        <ToggleRow label="Buzzer Alarm" icon="alert" color="var(--amber)" checked={buzzer} onChange={() => toggle("buzzer", buzzer, setBuzzer)} disabled={busy} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   METRIC CARD — angka animasi + progress bar / gauge
   --------------------------------------------------------- */
function useCountUp(target, duration = 500) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    const start = performance.now();
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setDisplay(from + (to - from) * p);
      if (p < 1) raf = requestAnimationFrame(step);
      else prev.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

function MetricCard({ label, icon, color, value, unit, max, decimals = 2, gauge = false, currency = false }) {
  const animated = useCountUp(Number(value) || 0);
  const [flash, setFlash] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [value]);

  const pct = Math.min(100, Math.max(0, (Number(value) / max) * 100 || 0));
  const R = 40, C = 2 * Math.PI * R;

  return (
    <div
      className={`metric-card cyber-panel rounded-2xl p-5 relative overflow-hidden ${flash ? "flash-update" : ""}`}
      style={{ "--flash-color": color }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono uppercase tracking-widest text-[color:var(--ink-dim)]">{label}</span>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}1f`, color }}>
          <Icon name={icon} className="w-4 h-4" />
        </span>
      </div>

      {gauge ? (
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 shrink-0">
            <svg className="gauge-ring w-20 h-20" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
              <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C - (pct / 100) * C} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-xs" style={{ color }}>{pct.toFixed(0)}%</span>
            </div>
          </div>
          <div>
            <p className="stat-number font-display text-2xl text-white">{fmt(animated, decimals)}</p>
            <p className="text-xs font-mono text-[color:var(--ink-dim)]">{unit} <span className="opacity-50">/ {max}{unit}</span></p>
          </div>
        </div>
      ) : (
        <React.Fragment>
          <p className="stat-number font-display text-3xl text-white">
            {currency ? fmtRupiah(animated) : fmt(animated, decimals)}
            {!currency && <span className="text-sm font-mono font-normal text-[color:var(--ink-dim)]"> {unit}</span>}
          </p>
          <div className="metric-bar mt-3">
            <span style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   CHART PANEL — Chart.js dibungkus lifecycle React
   --------------------------------------------------------- */
function TrendChart({ dataPoints }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, "rgba(178,38,255,.35)");
    gradient.addColorStop(1, "rgba(178,38,255,0)");

    chartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Daya Aktif (W)",
          data: [],
          borderColor: "#B026FF",
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: "#00E5FF",
          pointBorderColor: "#00E5FF",
          tension: 0.4,
          fill: true,
          backgroundColor: gradient,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "rgba(255,255,255,.04)" }, ticks: { color: "#8b8aa8", font: { family: "JetBrains Mono", size: 10 } } },
          y: { grid: { color: "rgba(255,255,255,.04)" }, ticks: { color: "#8b8aa8", font: { family: "JetBrains Mono", size: 10 } } },
        },
      },
    });
    return () => chartRef.current && chartRef.current.destroy();
  }, []);

  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    c.data.labels = dataPoints.map((d) => d.t);
    c.data.datasets[0].data = dataPoints.map((d) => d.v);
    c.update("none");
  }, [dataPoints]);

  return (
    <div className="cyber-panel hud-corners rounded-2xl p-6 relative overflow-hidden reveal" ref={(el) => window.registerReveal && window.registerReveal(el)}>
      <h3 className="font-display text-sm tracking-wide uppercase text-white mb-5 flex items-center gap-2">
        <Icon name="activity" className="w-4 h-4" style={{ color: "var(--cyan)" }} />
        Power Trend Analysis
      </h3>
      <div className="h-64 w-full">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   HISTORY TABLE — riwayat data dari IndexedDB (perbaikan bug
   versi lama: elemen #log-body sekarang benar-benar terhubung)
   --------------------------------------------------------- */
function HistoryTable({ rows }) {
  return (
    <div className="cyber-panel hud-corners rounded-2xl p-6 relative overflow-hidden reveal" ref={(el) => window.registerReveal && window.registerReveal(el)}>
      <h3 className="font-display text-sm tracking-wide uppercase text-white mb-5 flex items-center gap-2">
        <Icon name="history" className="w-4 h-4" style={{ color: "var(--magenta)" }} />
        Log Riwayat (Cache Lokal)
      </h3>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="term-table w-full text-sm">
          <thead className="sticky top-0 bg-[#12121f] text-[11px] font-mono uppercase tracking-widest text-[color:var(--ink-dim)]">
            <tr>
              <th className="text-left p-3">Waktu</th>
              <th className="text-left p-3">Tegangan</th>
              <th className="text-left p-3">Arus</th>
              <th className="text-left p-3">Daya</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan="4" className="p-4 text-center text-[color:var(--ink-dim)] font-mono text-xs">Belum ada data tersimpan.</td></tr>
            )}
            {rows.map((l) => (
              <tr key={l.id} className="row-in">
                <td className="p-3 text-[color:var(--ink-dim)] font-mono text-xs">{l.time}</td>
                <td className="p-3 font-mono" style={{ color: "var(--cyan)" }}>{fmt(l.volt)} V</td>
                <td className="p-3 font-mono" style={{ color: "var(--amber)" }}>{fmt(l.current)} mA</td>
                <td className="p-3 font-mono" style={{ color: "var(--mint)" }}>{fmt(l.power)} W</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   CONFIG WIDGET — mengaktifkan endpoint /api/device/config
   yang sebelumnya sudah ada di backend tapi belum dipakai UI
   --------------------------------------------------------- */
function ConfigPanel({ maxWatt, setMaxWatt, saveConfig, pushToast }) {
  const [input, setInput] = useState(maxWatt);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const data = await saveConfig(Number(input));
      if (data.status === "SUCCESS") {
        setMaxWatt(Number(input));
        pushToast("success", data.message || "Konfigurasi tersimpan.");
      } else {
        pushToast("error", data.message || "Gagal menyimpan konfigurasi.");
      }
    } catch (e) {
      pushToast("error", "Server backend tidak dapat dihubungi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cyber-panel hud-corners rounded-2xl p-6 relative overflow-hidden reveal" ref={(el) => window.registerReveal && window.registerReveal(el)}>
      <h3 className="font-display text-sm tracking-wide uppercase text-white mb-5 flex items-center gap-2">
        <Icon name="settings" className="w-4 h-4" style={{ color: "var(--amber)" }} />
        Konfigurasi Batas Daya
      </h3>
      <p className="text-xs text-[color:var(--ink-dim)] mb-4">
        Menentukan ambang batas daya maksimum (Watt) perangkat sebelum sistem memicu peringatan.
      </p>
      <div className="flex gap-3">
        <input
          type="number"
          min="0"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 font-mono text-sm text-white focus:border-[color:var(--amber)] outline-none"
        />
        <button
          onClick={save}
          disabled={saving}
          className="btn-neon px-5 py-2.5 rounded-xl font-display text-xs tracking-widest uppercase flex items-center gap-2 disabled:opacity-50"
          style={{ background: "rgba(255,176,32,.12)", color: "var(--amber)", border: "1px solid rgba(255,176,32,.35)" }}
        >
          <Icon name="save" className="w-3.5 h-3.5" />
          {saving ? "..." : "Simpan"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   LOGIN PAGE — autentikasi ke backend Flask (/api/auth/login),
   plus opsi Mode Demo yang tidak memerlukan backend sama sekali.
   --------------------------------------------------------- */
function LoginPage({ onSuccess, onDemo }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.status === "SUCCESS") {
        onSuccess({ token: data.token, username });
      } else {
        setError(data.message || "Username atau password salah.");
      }
    } catch (err) {
      setError("Backend tidak dapat dihubungi. Pastikan server.py sedang berjalan, atau coba Mode Demo di bawah.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell relative z-10">
      <div className="auth-card cyber-panel hud-corners rounded-2xl p-8">
        <div className="text-center mb-7">
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(178,38,255,.12)", border: "1px solid rgba(178,38,255,.35)" }}>
            <Icon name="bolt" className="w-7 h-7" style={{ color: "var(--violet)" }} />
          </div>
          <h1 className="glitch font-display text-xl font-semibold tracking-wide text-white" data-text="POWER GRID MONITOR">POWER GRID MONITOR</h1>
          <p className="text-xs font-mono text-[color:var(--ink-dim)] mt-2 uppercase tracking-widest">Autentikasi Operator Diperlukan</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-widest text-[color:var(--ink-dim)] mb-1.5 block">Username</label>
            <div className="relative">
              <Icon name="user" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-dim)" }} />
              <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username"
                className="cyber-input pl-10" placeholder="kelompok2" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-widest text-[color:var(--ink-dim)] mb-1.5 block">Password</label>
            <div className="relative">
              <Icon name="lock" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-dim)" }} />
              <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                className="cyber-input pl-10 pr-10" placeholder="••••••••" />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-dim)" }} aria-label={showPass ? "Sembunyikan password" : "Tampilkan password"}>
                <Icon name={showPass ? "eyeOff" : "eye"} className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="auth-error flex items-start gap-2">
              <Icon name="alert" className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary-cyber btn-neon w-full py-3 rounded-xl font-display text-sm tracking-wide uppercase flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <span className="spinner" /> : <React.Fragment>Masuk <Icon name="arrowRight" className="w-4 h-4" /></React.Fragment>}
          </button>
        </form>

        <div className="divider-line my-6">atau</div>

        <button onClick={onDemo} className="btn-neon w-full py-3 rounded-xl font-display text-sm tracking-wide uppercase flex items-center justify-center gap-2 border" style={{ color: "var(--amber)", borderColor: "rgba(255,176,32,.35)", background: "rgba(255,176,32,.08)" }}>
          <Icon name="flask" className="w-4 h-4" /> Coba Mode Demo (Tanpa Backend)
        </button>
        <p className="text-[11px] text-center text-[color:var(--ink-dim)] mt-3 font-mono leading-relaxed">
          Mode demo memakai data simulasi lokal — tidak memerlukan server Flask, MySQL, maupun broker MQTT.
        </p>
      </div>
    </div>
  );
}


function Dashboard({ mode, username, onLogout }) {
  const isDemo = mode === "demo";
  const dbRef = useRef(null);
  const { toasts, push } = useToast();

  const [online, setOnline] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [metrics, setMetrics] = useState({ suhu: 0, tegangan: 0, arus: 0, daya: 0, energi: 0, biaya: 0 });
  const [chartData, setChartData] = useState([]);
  const [history, setHistory] = useState([]);
  const [maxWatt, setMaxWatt] = useState(2200);

  // Inisialisasi Dexie (sekali saat mount) — dipakai baik mode live maupun demo,
  // supaya perilaku cache lokal tetap konsisten dan bisa didemokan apa adanya.
  useEffect(() => {
    const db = new Dexie(isDemo ? "PowerDB_Demo" : "PowerDB");
    db.version(1).stores({ logs: "++id, volt, current, power, frequency, energy, time" });
    dbRef.current = db;
    db.logs.orderBy("id").reverse().limit(MAX_HISTORY_ROWS).toArray().then(setHistory);
  }, [isDemo]);

  const refreshHistory = useCallback(() => {
    if (!dbRef.current) return;
    dbRef.current.logs.orderBy("id").reverse().limit(MAX_HISTORY_ROWS).toArray().then(setHistory);
  }, []);

  const fetchRealtime = useCallback(async () => {
    try {
      const data = isDemo ? window.PMSimulator.getRealtime() : await (await fetch(`${API_URL}/api/dashboard/realtime`)).json();

      if (data.status_alat === "ONLINE" || data.status === "SUCCESS") {
        setOnline(true);
        setLastUpdate(data.last_update || new Date().toLocaleTimeString("id-ID"));
        setMetrics({
          suhu: data.suhu ?? data.temperature ?? 0,
          tegangan: data.tegangan ?? data.volt ?? 0,
          arus: data.arus ?? data.current ?? 0,
          daya: data.daya ?? data.power ?? 0,
          energi: data.energi ?? data.energy ?? 0,
          biaya: data.biaya ?? 0,
        });

        const timestamp = new Date().toLocaleTimeString("id-ID");
        setChartData((prev) => {
          const next = [...prev, { t: timestamp, v: Number(data.daya) || 0 }];
          return next.length > MAX_CHART_POINTS ? next.slice(next.length - MAX_CHART_POINTS) : next;
        });

        if (dbRef.current) {
          await dbRef.current.logs.add({
            volt: data.tegangan || 0,
            current: data.arus || 0,
            power: data.daya || 0,
            time: timestamp,
          });
          refreshHistory();
        }
      } else {
        setOnline(false);
      }
    } catch (err) {
      setOnline(false);
    }
  }, [refreshHistory, isDemo]);

  useEffect(() => {
    fetchRealtime();
    const t = setInterval(fetchRealtime, 2000);
    return () => clearInterval(t);
  }, [fetchRealtime]);

  const sendCommand = useCallback(async (actuator, command) => {
    try {
      const result = isDemo
        ? await window.PMSimulator.sendCommand(actuator, command)
        : await (await fetch(`${API_URL}/api/device/control`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actuator, command }),
          })).json();

      if (result.status === "SUCCESS") {
        push("success", `${actuator === "relay1" ? "Relay Lampu" : "Buzzer"} → ${command}${isDemo ? " (simulasi)" : ""}`);
        return true;
      }
      push("error", result.message || "Perintah gagal dieksekusi.");
      return false;
    } catch (err) {
      push("error", "Tidak dapat menghubungi server kontrol.");
      return false;
    }
  }, [push, isDemo]);

  const saveConfig = useCallback(async (watt) => {
    if (isDemo) return window.PMSimulator.sendConfig(watt);
    const res = await fetch(`${API_URL}/api/device/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_watt: watt }),
    });
    return res.json();
  }, [isDemo]);

  return (
    <React.Fragment>
      <div className="relative z-10 max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <Header online={online} lastUpdate={lastUpdate} demo={isDemo} username={username} onLogout={onLogout} />

        <CommandArray sendCommand={sendCommand} />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard label="Suhu" icon="thermometer" color="var(--amber)" value={metrics.suhu} unit="°C" max={100} />
          <MetricCard label="Tegangan" icon="zap" color="var(--cyan)" value={metrics.tegangan} unit="V" max={250} />
          <MetricCard label="Arus" icon="activity" color="var(--violet)" value={metrics.arus} unit="mA" max={2000} />
          <MetricCard label="Daya" icon="cpu" color="var(--mint)" value={metrics.daya} unit="W" max={maxWatt} gauge decimals={1} />
          <MetricCard label="Energi" icon="battery" color="var(--magenta)" value={metrics.energi} unit="kWh" max={10} decimals={3} />
          <MetricCard label="Estimasi Biaya" icon="wallet" color="var(--amber)" value={metrics.biaya} unit="" max={50000} decimals={0} currency />
        </div>

        <TrendChart dataPoints={chartData} />

        <div className="grid md:grid-cols-2 gap-6">
          <HistoryTable rows={history} />
          <ConfigPanel maxWatt={maxWatt} setMaxWatt={setMaxWatt} saveConfig={saveConfig} pushToast={push} />
        </div>

        <footer className="text-center text-[11px] font-mono uppercase tracking-widest text-[color:var(--ink-dim)] pt-4 pb-2">
          Power Grid Monitor · Dibangun dengan React &amp; Chart.js · {isDemo ? "Mode Demo — Data Simulasi" : "Backend Flask + MQTT"}
        </footer>
      </div>

      <ToastStack toasts={toasts} />
    </React.Fragment>
  );
}

/* ---------------------------------------------------------
   ROOT — mengatur status autentikasi (login / demo / keluar)
   dan me-render layer latar belakang global yang selalu tampil
   baik di layar login maupun dashboard.
   --------------------------------------------------------- */
const AUTH_KEY = "pm_auth"; // { mode: 'live'|'demo', username, token }

function Root() {
  const canvasBgRef = useRef(null);
  const [auth, setAuth] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
      return saved && saved.mode ? saved : null;
    } catch (e) {
      return null;
    }
  });

  useEffect(() => {
    if (window.initCircuitBG && canvasBgRef.current) window.initCircuitBG(canvasBgRef.current);
  }, []);

  const handleLoginSuccess = ({ token, username }) => {
    const next = { mode: "live", username, token };
    localStorage.setItem(AUTH_KEY, JSON.stringify(next));
    setAuth(next);
  };
  const handleDemo = () => {
    const next = { mode: "demo", username: "demo", token: "demo-token" };
    localStorage.setItem(AUTH_KEY, JSON.stringify(next));
    setAuth(next);
  };
  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
  };

  return (
    <React.Fragment>
      <canvas id="circuit-bg" ref={canvasBgRef} aria-hidden="true" />
      <div className="void-vignette" aria-hidden="true" />
      <div className="grid-static" aria-hidden="true" />
      <div className="scanline-overlay" aria-hidden="true" />
      <div className="scan-sweep" aria-hidden="true" />

      {!auth ? (
        <LoginPage onSuccess={handleLoginSuccess} onDemo={handleDemo} />
      ) : (
        <Dashboard mode={auth.mode} username={auth.username} onLogout={handleLogout} />
      )}
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Root />);
