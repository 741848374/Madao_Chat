import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
}

function createParticles(
  count: number,
  canvasW: number,
  canvasH: number,
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvasW,
      y: Math.random() * canvasH,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(0.1 + Math.random() * 0.35),
      size: 1.2 + Math.random() * 2,
      life: Math.random() * 400,
      maxLife: 350 + Math.random() * 450,
    });
  }
  return particles;
}

const ParticleBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      particles = createParticles(35, width, height);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        if (p.life > p.maxLife) {
          p.x = Math.random() * width;
          p.y = height + 16;
          p.life = 0;
          p.maxLife = 350 + Math.random() * 450;
          p.vx = (Math.random() - 0.5) * 0.15;
          p.vy = -(0.1 + Math.random() * 0.35);
          p.size = 1.2 + Math.random() * 2;
        }
        const lifeRatio = p.life / p.maxLife;
        const alpha =
          lifeRatio < 0.08
            ? lifeRatio / 0.08
            : lifeRatio > 0.82
              ? (1 - lifeRatio) / 0.18
              : 1;

        p.x += p.vx;
        p.y += p.vy;

        const finalAlpha = alpha * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59, 63, 107, ${finalAlpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
};

export default ParticleBackground;
