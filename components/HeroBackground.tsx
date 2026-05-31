"use client";

import { useEffect, useRef } from "react";

/**
 * Interaktiver "KI"-Hintergrund: ein driftendes Partikel-/Neuronennetz.
 * Knoten verbinden sich mit Nachbarn; nahe dem Cursor leuchten Linien in
 * Brand-Rot/Orange auf und Knoten werden sanft angezogen. Respektiert
 * prefers-reduced-motion (statisches Bild) und pausiert im Hintergrund.
 */
export default function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const context = el.getContext("2d");
    if (!context) return;
    // non-null Aliase mit explizitem Typ → Narrowing bleibt auch in
    // hochgezogenen Funktionen (build/draw/onMove …) erhalten.
    const cv: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = context;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    type P = { x: number; y: number; vx: number; vy: number };
    let particles: P[] = [];

    const mouse = { x: -9999, y: -9999, active: false };
    const LINK = 130; // Verbindungsdistanz
    const MOUSE_R = 200; // Cursor-Einflussradius

    function build() {
      const rect = cv.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.floor(width * dpr);
      cv.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(90, Math.round((width * height) / 14000));
      particles = Array.from({ length: target }, (_, i) => ({
        x: ((Math.sin(i * 12.9898) + 1) / 2) * width,
        y: ((Math.cos(i * 78.233) + 1) / 2) * height,
        vx: ((Math.sin(i * 3.17) + 1) / 2 - 0.5) * 0.35,
        vy: ((Math.cos(i * 5.71) + 1) / 2 - 0.5) * 0.35,
      }));
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // Basis-Glow
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.18,
        0,
        width * 0.5,
        height * 0.18,
        Math.max(width, height) * 0.7,
      );
      grad.addColorStop(0, "rgba(255,28,32,0.10)");
      grad.addColorStop(1, "rgba(13,13,11,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      for (const p of particles) {
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MOUSE_R * MOUSE_R) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / MOUSE_R) * 0.6;
            p.vx += (dx / d) * f * 0.06;
            p.vy += (dy / d) * f * 0.06;
          }
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.vy *= 0.99;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;
      }

      // Verbindungen
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            const t = 1 - d / LINK;
            const mx = (a.x + b.x) / 2 - mouse.x;
            const my = (a.y + b.y) / 2 - mouse.y;
            const near = mouse.active
              ? Math.max(0, 1 - Math.hypot(mx, my) / MOUSE_R)
              : 0;
            const alpha = t * (0.18 + near * 0.5);
            ctx.strokeStyle =
              near > 0.05
                ? `rgba(255,${Math.round(28 + near * 107)},32,${alpha})`
                : `rgba(245,244,238,${alpha * 0.4})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Knoten
      for (const p of particles) {
        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const near = mouse.active
          ? Math.max(0, 1 - Math.hypot(mdx, mdy) / MOUSE_R)
          : 0;
        const r = 1.3 + near * 1.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle =
          near > 0.1
            ? `rgba(255,${Math.round(28 + near * 107)},32,${0.5 + near * 0.5})`
            : "rgba(245,244,238,0.45)";
        ctx.fill();
      }
    }

    let raf = 0;
    let running = true;
    function loop() {
      if (!running) return;
      draw();
      raf = requestAnimationFrame(loop);
    }

    function onMove(e: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = mouse.y >= 0 && mouse.y <= rect.height;
    }
    function onLeave() {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    }
    function onResize() {
      build();
      if (reduce) draw();
    }
    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce) {
        running = true;
        loop();
      }
    }

    build();
    if (reduce) {
      draw();
    } else {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mouseout", onLeave, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      loop();
    }
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
