import type { Scene, SettingDefinition } from "../core/types/scene";

const PARTICLE_COLOR = "cyan";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export class GasGravity implements Scene {
  private particles: Particle[] = [];
  private canvas!: HTMLCanvasElement;

  private particleCount = 0;
  private initialVelocityRange = 200;
  private particleRadius = 2;
  private gravity = 500;
  private enableTopBoundary = false;
  private topBoundaryHeight = 1000;
  private kineticEnergy = 0;
  private potentialEnergy = 0;
  private totalEnergy = 0;
  private bottomImpulse = 0;
  private pressure = 0;
  private pressureWindowSeconds = 5;
  private pressureSamples: { impulse: number; dt: number }[] = [];
  private pressureImpulseSum = 0;
  private pressureTimeSum = 0;
  private cameraHeight = 0;

  setup(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(this.createRandomParticle());
    }
  }

  resize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  draw({ deltaTime }: { deltaTime: number; totalTime: number }): void {
    this.update(deltaTime);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawParticles(ctx);
    this.drawBoundaries(ctx);
  }

  cleanup(): void {
    this.particles = [];
  }

  private createRandomParticle(): Particle {
    const x =
      Math.random() * (this.canvas.width - 2 * this.particleRadius) +
      this.particleRadius;
    // World y-up: spawn between bottom (0) and either the top boundary or the canvas height
    const yMin = this.particleRadius;
    const yMax = this.enableTopBoundary
      ? Math.max(yMin, this.topBoundaryHeight - this.particleRadius)
      : this.canvas.height - this.particleRadius;
    const yRange = Math.max(0, yMax - yMin);
    const y = yMin + (yRange > 0 ? Math.random() * yRange : 0);

    return {
      x,
      y,
      vx: (Math.random() - 0.5) * this.initialVelocityRange,
      vy: (Math.random() - 0.5) * this.initialVelocityRange,
    };
  }

  private synchronizeParticleCount(): void {
    if (this.particles.length < this.particleCount) {
      const particlesToAdd = this.particleCount - this.particles.length;
      for (let i = 0; i < particlesToAdd; i++) {
        this.particles.push(this.createRandomParticle());
      }
    } else if (this.particles.length > this.particleCount) {
      this.particles.length = this.particleCount;
    }
  }

  private calculateAcceleration(): { ax: number; ay: number } {
    // World coordinates: y increases upward. Gravity pulls downward.
    return { ax: 0, ay: -this.gravity };
  }

  private update(deltaTime: number): void {
    this.synchronizeParticleCount();

    const dt = deltaTime / 1000;
    this.kineticEnergy = 0;
    this.potentialEnergy = 0;
    this.totalEnergy = 0;
    this.bottomImpulse = 0;
    this.performVelocityVerletStep(dt);
    this.handleBoundaryCollisions();
    this.handleParticleCollisions();

    this.totalEnergy = this.kineticEnergy + this.potentialEnergy;

    this.pressureSamples.push({ impulse: this.bottomImpulse, dt });
    this.pressureImpulseSum += this.bottomImpulse;
    this.pressureTimeSum += dt;

    while (
      this.pressureTimeSum > this.pressureWindowSeconds &&
      this.pressureSamples.length > 0
    ) {
      const oldest = this.pressureSamples[0];
      const overflow = this.pressureTimeSum - this.pressureWindowSeconds;
      if (overflow >= oldest.dt) {
        this.pressureImpulseSum -= oldest.impulse;
        this.pressureTimeSum -= oldest.dt;
        this.pressureSamples.shift();
      } else {
        const fraction = overflow / oldest.dt;
        this.pressureImpulseSum -= oldest.impulse * fraction;
        this.pressureTimeSum -= overflow;
        oldest.dt -= overflow;
        oldest.impulse -= oldest.impulse * fraction;
        break;
      }
    }

    this.pressure =
      this.pressureTimeSum > 0
        ? this.pressureImpulseSum / this.pressureTimeSum / this.canvas.width
        : 0;
  }

  private performVelocityVerletStep(dt: number): void {
    const acc = this.calculateAcceleration();

    // Update positions
    for (const particle of this.particles) {
      particle.x += particle.vx * dt + 0.5 * acc.ax * dt * dt;
      particle.y += particle.vy * dt + 0.5 * acc.ay * dt * dt;
      // Potential energy U = g * y (m=1) with y measured up from bottom (y=0)
      const height = particle.y;
      this.potentialEnergy += this.gravity * height;
    }

    // Update velocities (acceleration is constant)
    for (const particle of this.particles) {
      particle.vx += acc.ax * dt;
      particle.vy += acc.ay * dt;
      // Accumulate kinetic energy after velocity update (KE = 1/2 v^2)
      const speedSquared =
        particle.vx * particle.vx + particle.vy * particle.vy;
      this.kineticEnergy += 0.5 * speedSquared;
    }
  }

  private resolveEnergyConservingVerticalCollision(
    particle: Particle,
    boundaryY: number,
    isTopBoundary: boolean
  ): number {
    const yOld = particle.y;
    // World y-up: bottom at 0, top at increasing y
    const yNew = isTopBoundary
      ? boundaryY - this.particleRadius
      : boundaryY + this.particleRadius;

    // Potential energy change due to position correction (m=1):
    // U = g * y. ΔU = U_new - U_old = g * (yNew - yOld)
    const deltaU = this.gravity * (yNew - yOld);

    // Position correction
    particle.y = yNew;

    // Reflect normal velocity component (perfectly elastic wall)
    const vyBefore = particle.vy;
    const vyReflected = -vyBefore;

    // Adjust y-velocity to conserve total energy: ΔK = -ΔU
    // 0.5 * (vy_new^2 - vy_reflected^2) = -ΔU  => vy_new^2 = vy_reflected^2 - 2*ΔU
    const vyNewSquared = Math.max(0, vyReflected * vyReflected - 2 * deltaU);
    const vyAfter = Math.sign(vyReflected) * Math.sqrt(vyNewSquared);
    particle.vy = vyAfter;

    // Return impulse magnitude imparted to boundary (mass=1): |Δv|
    return Math.abs(vyAfter - vyBefore);
  }

  private handleBoundaryCollisions(): void {
    for (const particle of this.particles) {
      const topBoundaryY = this.topBoundaryHeight;
      // Horizontal wrap only after fully leaving the boundary; keep velocity
      if (particle.x + this.particleRadius < 0) {
        // Left side fully left -> appear just outside right boundary
        particle.x = this.canvas.width + this.particleRadius;
      }
      if (particle.x - this.particleRadius > this.canvas.width) {
        // Right side fully right -> appear just outside left boundary
        particle.x = -this.particleRadius;
      }
      // Top boundary (only if enabled)
      if (
        this.enableTopBoundary &&
        particle.y + this.particleRadius > topBoundaryY
      ) {
        this.resolveEnergyConservingVerticalCollision(
          particle,
          topBoundaryY,
          true
        );
      }
      // Bottom boundary
      if (particle.y - this.particleRadius < 0) {
        const impulse = this.resolveEnergyConservingVerticalCollision(
          particle,
          0,
          false
        );
        this.bottomImpulse += impulse;
      }
    }
  }

  private handleParticleCollisions(): void {
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const minDistance = this.particleRadius * 2;
        if (distance < minDistance && distance > 0) {
          // Normalize collision normal
          const nx = dx / distance;
          const ny = dy / distance;

          // Calculate relative velocity along collision normal
          const dvx = p2.vx - p1.vx;
          const dvy = p2.vy - p1.vy;
          const relativeVelocityAlongNormal = dvx * nx + dvy * ny;

          // Only resolve if particles are moving towards each other
          if (relativeVelocityAlongNormal < 0) {
            // Impulse-based collision response for equal masses
            const impulseMagnitude = -2 * relativeVelocityAlongNormal;
            const impulsePerParticle = impulseMagnitude / 2;

            p1.vx -= impulsePerParticle * nx;
            p1.vy -= impulsePerParticle * ny;
            p2.vx += impulsePerParticle * nx;
            p2.vy += impulsePerParticle * ny;
          }
        }
      }
    }
  }

  private drawBoundaries(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = "white";
    ctx.lineWidth = 5;

    // No side boundaries: world wraps horizontally

    // Top boundary (only if enabled)
    if (this.enableTopBoundary) {
      const topY =
        this.canvas.height - this.topBoundaryHeight + this.cameraHeight;
      if (topY >= 0 && topY <= this.canvas.height) {
        ctx.beginPath();
        ctx.moveTo(0, topY);
        ctx.lineTo(this.canvas.width, topY);
        ctx.stroke();
      }
    }

    // Bottom boundary
    const bottomY = this.canvas.height + this.cameraHeight;
    if (bottomY >= 0 && bottomY <= this.canvas.height) {
      ctx.beginPath();
      ctx.moveTo(0, bottomY);
      ctx.lineTo(this.canvas.width, bottomY);
      ctx.stroke();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PARTICLE_COLOR;
    for (const particle of this.particles) {
      // Visible if within camera window [cameraHeight, cameraHeight + canvas.height]
      if (
        particle.y >= this.cameraHeight &&
        particle.y <= this.cameraHeight + this.canvas.height
      ) {
        const screenY = this.canvas.height - (particle.y - this.cameraHeight);
        ctx.beginPath();
        ctx.arc(particle.x, screenY, this.particleRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  getDisplayInfo(): Record<string, string | number> | string {
    return {
      Particles: this.particles.length,
      // Scale energy values for readability
      "Energy (Total)": (this.totalEnergy / 1000000).toFixed(2),
      "Energy (Kinetic)": (this.kineticEnergy / 1000000).toFixed(2),
      "Energy (Potential)": (this.potentialEnergy / 1000000).toFixed(2),
      "Pressure (Bottom)": this.pressure.toFixed(2),
    };
  }

  getSettings(): SettingDefinition[] {
    return [
      {
        key: "particleCount",
        label: "Particle Count",
        type: "slider",
        defaultValue: this.particleCount,
        min: 0,
        max: 5000,
        step: 1,
        units: [{ suffix: "", factor: 1, label: "Count" }],
        group: "Particle creation",
      },
      {
        key: "initialVelocityRange",
        label: "Initial Velocity Range",
        type: "slider",
        defaultValue: this.initialVelocityRange,
        min: 0,
        max: 10000,
        step: 1,
        units: [{ suffix: "px/s", factor: 1, label: "px/s" }],
        group: "Particle creation",
      },
      {
        key: "particleRadius",
        label: "Particle Radius",
        type: "slider",
        defaultValue: this.particleRadius,
        min: 1,
        max: 10,
        units: [{ suffix: "px", factor: 1, label: "Pixels" }],
        group: "Conditions",
      },
      {
        key: "gravity",
        label: "Gravity Strength",
        type: "slider",
        defaultValue: this.gravity,
        min: 0,
        max: 2000,
        step: 10,
        units: [{ suffix: "", factor: 1, label: "Strength" }],
        description: "Downward gravitational acceleration",
        group: "Conditions",
      },
      {
        key: "enableTopBoundary",
        label: "Enable Top Boundary",
        type: "toggle",
        defaultValue: this.enableTopBoundary,
        description: "When disabled, particles can escape through the top",
        group: "Top Boundary",
      },
      {
        key: "topBoundaryHeight",
        label: "Top Boundary Height",
        type: "slider",
        defaultValue: this.topBoundaryHeight,
        min: 100,
        max: 2000,
        step: 1,
        units: [{ suffix: "px", factor: 1, label: "Pixels" }],
        group: "Top Boundary",
        description: "Ceiling height measured up from the bottom boundary",
      },
      {
        key: "cameraHeight",
        label: "Camera Height",
        type: "slider",
        defaultValue: this.cameraHeight,
        min: 0,
        max: 10000,
        step: 1,
        units: [{ suffix: "px", factor: 1, label: "Pixels" }],
        group: "Display",
        description:
          "Vertical camera offset from the bottom; larger shows higher regions",
      },
    ];
  }

  updateSetting(key: string, value: number | string | boolean): void {
    if (key in this) {
      // @ts-expect-error - Dynamic property access for settings
      this[key] = value;
    }
  }
}
