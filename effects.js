/* =========================================================
   DASHBOARD MONITORING ENERGI — effects.js
   Logika visual non-React: background sirkuit animasi (canvas)
   yang merepresentasikan aliran arus listrik antar-node —
   metafora langsung untuk dashboard energi.
   Dimuat SEBELUM app.jsx.
   ========================================================= */

(function () {
  "use strict";

  window.initCircuitBG = function initCircuitBG(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let w, h, nodes, pulses;
    const NODE_COUNT_BASE = 42;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function buildNodes() {
      const count = Math.min(70, Math.max(24, Math.floor((w * h) / 42000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
      }));
      pulses = [];
    }
    buildNodes();
    window.addEventListener("resize", () => { buildNodes(); });

    const COLORS = ["rgba(178,38,255,", "rgba(0,229,255,", "rgba(255,46,159,"];

    function maybeSpawnPulse() {
      if (Math.random() < 0.02 && nodes.length > 4) {
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        const b = nodes[Math.floor(Math.random() * nodes.length)];
        if (a !== b) {
          pulses.push({ a, b, t: 0, color: COLORS[Math.floor(Math.random() * COLORS.length)] });
        }
      }
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);

      // Update & gambar node
      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      });

      // Garis penghubung antar-node yang berdekatan (efek sirkuit/neural)
      const maxDist = Math.min(180, w / 6);
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.12;
            ctx.strokeStyle = `rgba(178,38,255,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Titik node
      nodes.forEach((n) => {
        ctx.fillStyle = "rgba(0,229,255,0.35)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Pulsa "arus listrik" berjalan antar dua node acak
      maybeSpawnPulse();
      pulses.forEach((p) => { p.t += 0.02; });
      pulses = pulses.filter((p) => p.t <= 1);
      pulses.forEach((p) => {
        const x = p.a.x + (p.b.x - p.a.x) * p.t;
        const y = p.a.y + (p.b.y - p.a.y) * p.t;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 5);
        grad.addColorStop(0, p.color + "0.9)");
        grad.addColorStop(1, p.color + "0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  /* ---------------------------------------------------------
     Reveal-on-scroll ringan (dipakai beberapa panel dashboard)
     --------------------------------------------------------- */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); revealObserver.unobserve(e.target); }
      });
    },
    { threshold: 0.15 }
  );
  window.registerReveal = (el) => el && revealObserver.observe(el);
})();
