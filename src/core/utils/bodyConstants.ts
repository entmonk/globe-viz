type BodyConstants = {
  radius: number;
  mass: number;
};

const SOLAR_SYSTEM_BODIES: Record<string, BodyConstants> = {
  earth: {
    radius: 6.371e6,
    mass: 5.9722e24,
  },
  moon: {
    radius: 1.737e6,
    mass: 7.3458e22,
  },
  sun: {
    radius: 6.96e8,
    mass: 1.988416e30,
  },
};

export { SOLAR_SYSTEM_BODIES };
