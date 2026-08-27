'use client';
import { useEffect, useRef } from 'react';

// Faint drifting particles on a fixed canvas — sits behind everything,
// never blocks clicks. Respects prefers-reduced-motion (renders static).
export default function Particles({ count = 36, color = '14,116,144' }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w, h, dots;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 2.2 + 0.6,
        vy: Math.random() * 0.25 + 0.05,
        vx: (Math.random() - 0.5) * 0.12,
        a: Math.random() * 0.5 + 0.15,
      }));
    }
    resize();
    window.addEventListener('resize', resize);

    let raf;
    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.y -= d.vy; d.x += d.vx;
        if (d.y < -5) { d.y = h + 5; d.x = Math.random() * w; }
        if (d.x < -5) d.x = w + 5; if (d.x > w + 5) d.x = -5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${d.a * 0.18})`;
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    if (reduce) { frame(); } else { frame(); }
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [count, color]);

  return <canvas ref={ref} aria-hidden="true" className="particles-canvas" />;
}
