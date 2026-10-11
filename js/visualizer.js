/* ============================================================
   Pulse Music — visualizer.js
   Audio Visualizer (Canvas 2D)
   ============================================================ */
(function () {
  'use strict';

  let canvas = null;
  let ctx = null;
  let animId = null;
  let isRunning = false;
  let previousData = null;

  const isMobile = () => window.innerWidth <= 768;
  const getBarCount = () => isMobile() ? 32 : 64;
  const SMOOTHING = 0.65; // interpolation factor (0 = instant, 1 = frozen)
  const BAR_GAP_RATIO = 0.3; // gap between bars as fraction of bar width
  const REFLECTION_ALPHA = 0.15;
  const MIN_BAR_HEIGHT = 3;

  // ── Gradient colors ─────────────────────────────────────────
  const GRADIENT_STOPS = [
    { pos: 0.0, color: [55, 138, 203] },     // #378ACB blue
    { pos: 0.5, color: [130, 121, 232] },    // #8279E8 violet
    { pos: 1.0, color: [104, 184, 239] }     // #68B8EF light blue
  ];

  const lerpColor = (t) => {
    // Find the two stops surrounding t
    let lower = GRADIENT_STOPS[0], upper = GRADIENT_STOPS[GRADIENT_STOPS.length - 1];
    for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
      if (t >= GRADIENT_STOPS[i].pos && t <= GRADIENT_STOPS[i + 1].pos) {
        lower = GRADIENT_STOPS[i];
        upper = GRADIENT_STOPS[i + 1];
        break;
      }
    }
    const range = upper.pos - lower.pos || 1;
    const f = (t - lower.pos) / range;
    const r = Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * f);
    const g = Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * f);
    const b = Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * f);
    return `rgb(${r},${g},${b})`;
  };

  // ── Draw loop ───────────────────────────────────────────────
  const drawFrame = () => {
    if (!isRunning || !canvas || !ctx) return;

    const barCount = getBarCount();
    const analyserData = window.Player ? Player.getAnalyserData() : new Uint8Array(128);
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Smooth data
    if (!previousData || previousData.length !== barCount) {
      previousData = new Float32Array(barCount);
    }

    const totalBarWidth = w / barCount;
    const gap = totalBarWidth * BAR_GAP_RATIO;
    const barWidth = totalBarWidth - gap;
    const dataStep = Math.floor(analyserData.length / barCount);

    const mainAreaHeight = h * 0.7; // top 70% for bars, bottom 30% for reflection
    const isMobileDevice = isMobile();

    for (let i = 0; i < barCount; i++) {
      // Sample frequency data
      const dataIdx = Math.min(i * dataStep, analyserData.length - 1);
      let value = analyserData[dataIdx] / 255;

      // Smooth interpolation
      previousData[i] = previousData[i] * SMOOTHING + value * (1 - SMOOTHING);
      value = previousData[i];

      const barHeight = Math.max(MIN_BAR_HEIGHT, value * mainAreaHeight);
      const x = i * totalBarWidth + gap / 2;
      const y = mainAreaHeight - barHeight;

      const barColor = lerpColor(i / barCount);

      // ── Main bar with rounded top ──
      ctx.fillStyle = barColor;
      ctx.beginPath();
      const radius = Math.min(barWidth / 2, 4);
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, mainAreaHeight);
      ctx.lineTo(x, mainAreaHeight);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      // ── Glow effect (Bypassed on mobile for 10x performance) ──
      if (!isMobileDevice) {
        ctx.shadowColor = barColor;
        ctx.shadowBlur = value * 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Reflection ──
      const reflectionHeight = barHeight * 0.4;
      const gradient = ctx.createLinearGradient(x, mainAreaHeight, x, mainAreaHeight + reflectionHeight);
      gradient.addColorStop(0, barColor.replace('rgb', 'rgba').replace(')', `,${REFLECTION_ALPHA})`));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, mainAreaHeight + 1, barWidth, reflectionHeight);
    }

    animId = requestAnimationFrame(drawFrame);
  };

  // ── Public API ──────────────────────────────────────────────
  const Visualizer = {

    init(canvasElement) {
      canvas = canvasElement || document.querySelector('.visualizer-canvas');
      if (!canvas) {
        console.warn('[Visualizer] No canvas found');
        return;
      }
      ctx = canvas.getContext('2d');
      Visualizer.resize();

      window.addEventListener('resize', () => Visualizer.resize());

      // Auto-start/stop with player
      document.addEventListener('player:play', () => Visualizer.start());
      document.addEventListener('player:pause', () => Visualizer.stop());

      console.log('[Visualizer] Initialised');
    },

    start() {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (isRunning) return;
      isRunning = true;
      drawFrame();
    },

    stop() {
      isRunning = false;
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    },

    resize() {
      if (!canvas) return;
      const rect = canvas.parentElement
        ? canvas.parentElement.getBoundingClientRect()
        : canvas.getBoundingClientRect();
      canvas.width = rect.width * (window.devicePixelRatio || 1);
      canvas.height = rect.height * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    },

    draw(analyserData) {
      // Can be called externally; but normally the internal loop drives drawing
      if (!ctx || !canvas) return;
      // Force one frame with supplied data
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      // ... simplified external draw (internal loop is preferred)
    }
  };

  window.Visualizer = Visualizer;
})();
