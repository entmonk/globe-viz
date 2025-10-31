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
  mercury: {
    radius: 2.4397e6,
    mass: 3.302e23,
  },
  sun: {
    radius: 6.96e8,
    mass: 1.988416e30,
  },
};

export { SOLAR_SYSTEM_BODIES };
