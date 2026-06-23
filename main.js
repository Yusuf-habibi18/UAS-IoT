document.addEventListener('DOMContentLoaded', () => {
    // 1. Inisialisasi Database Local
    const db = new Dexie("PowerDB");
    db.version(1).stores({ logs: '++id, volt, current, power, frequency, energy, time' });

    let liveChart = null;
    const maxDataPoints = 12; // Batas titik data pada chart agar tidak menumpuk

    // 2. Fungsi Inisialisasi Grafik Real-time
    function initChart() {
        const ctx = document.getElementById('realtimeChart').getContext('2d');
        liveChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Daya Aktif (W)',
                    data: [],
                    borderColor: '#10b981', // Neon Emerald
                    borderWidth: 3,
                    pointBackgroundColor: '#34d399',
                    pointRadius: 4,
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#94a3b8', font: { family: 'Orbitron' } } },
                    y: { grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#94a3b8', font: { family: 'Orbitron' } } }
                }
            }
        });
    }

    // 3. Fungsi Update Real-time Data Ke Chart
    function addChartData(time, powerValue) {
        if (!liveChart) return;
        
        liveChart.data.labels.push(time);
        liveChart.data.datasets[0].data.push(powerValue);

        // Geser grafik jika data melewati batas maxDataPoints
        if (liveChart.data.labels.length > maxDataPoints) {
            liveChart.data.labels.shift();
            liveChart.data.datasets[0].data.shift();
        }
        liveChart.update('none'); // Update dengan mode performa tinggi tanpa animasi re-draw berat
    }

    // 4. Fungsi Update UI Telemetry
    function updateUI(data) {
        if(document.getElementById('v-val')) document.getElementById('v-val').innerText = data.volt.toFixed(2);
        if(document.getElementById('c-val')) document.getElementById('c-val').innerText = data.current.toFixed(2);
        if(document.getElementById('p-val')) document.getElementById('p-val').innerText = data.power.toFixed(2);
        if(document.getElementById('f-val')) document.getElementById('f-val').innerText = data.frequency.toFixed(2);
        if(document.getElementById('e-val')) document.getElementById('e-val').innerText = data.energy.toFixed(2);
    }

    // 5. Render Data Log Table
    function renderTable() {
        db.logs.orderBy('id').reverse().limit(10).toArray().then(logs => {
            const tbody = document.getElementById('log-body');
            if(tbody) {
                tbody.innerHTML = logs.map(l => 
                    `<tr class="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                        <td class="p-4 font-digital text-slate-400">${l.time}</td>
                        <td class="p-4 font-semibold text-cyan-400 font-digital">${parseFloat(l.volt).toFixed(2)} V</td>
                        <td class="p-4 font-semibold text-amber-400 font-digital">${parseFloat(l.current).toFixed(2)} mA</td>
                        <td class="p-4 font-semibold text-emerald-400 font-digital">${parseFloat(l.power).toFixed(2)} W</td>
                    </tr>`
                ).join('');
            }
        });
    }

    // 6. Logika Mode Simulasi Dinamis
    const btnSimulasi = document.getElementById('btn-simulasi');
    if(btnSimulasi) {
        btnSimulasi.onclick = () => {
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('dashboard-section').classList.remove('hidden');
            
            // Transformasi status ke Mode Simulasi Terpola Aktif
            const dot = document.getElementById('status-dot');
            dot.className = 'w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_12px_#f59e0b] animate-ping';
            document.getElementById('status-text').innerText = 'Simulation Mode Enabled';
            document.getElementById('status-text').className = 'text-xs uppercase font-bold tracking-widest font-digital text-amber-400';
            
            // Nyalakan Engine Chart
            initChart();

            // Simulasi Loop Interval 2 Detik
            setInterval(() => {
                const timestamp = new Date().toLocaleTimeString();
                // Generator variasi nilai acak beraturan untuk gelombang daya
                const baseVolt = 220 + (Math.sin(Date.now() / 5000) * 4);
                const baseCurrent = 12 + (Math.cos(Date.now() / 3000) * 2);
                const generatedPower = baseVolt * (baseCurrent / 1000) * 100; // P = V * I ekivalen skala

                const mock = { 
                    volt: baseVolt + Math.random(), 
                    current: baseCurrent + Math.random(), 
                    power: generatedPower, 
                    frequency: 50 + (Math.random() * 0.1 - 0.05), 
                    energy: 2.45 
                };

                updateUI(mock);
                addChartData(timestamp, mock.power);
                db.logs.add({...mock, time: timestamp});
                renderTable();
            }, 2000);
        };
    }

    // 7. Live System Clock Interface
    setInterval(() => {
        const clock = document.getElementById('clock');
        if(clock) {
            const now = new Date();
            clock.innerText = now.toLocaleTimeString() + " | " + now.toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'});
        }
    }, 1000);

    // Initial check untuk merender ikon Lucide
    if(typeof lucide !== 'undefined') lucide.createIcons();
});