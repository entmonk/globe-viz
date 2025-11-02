const AU = 149597870700; // meters

const GRAVITATIONAL_CONSTANT = 6.6743e-11; // m³/kg/s²

// Rotational velocities (rad/s)
// Using sidereal day (Earth's rotation period relative to distant stars)
// NOT solar day (24 hours), which includes orbital motion compensation
const EARTH_SIDEREAL_PERIOD = 86164.0905; // seconds (23h 56m 4.0905s)
// Negative because we're rotating counter-clockwise (looking down from above)
const EARTH_ANGULAR_VELOCITY = -(2 * Math.PI) / EARTH_SIDEREAL_PERIOD; // rad/s ≈ -7.2921e-5

// Orbital inclinations and tilts (in degrees, converted to radians)
const EARTH_AXIAL_TILT_DEGREES = 23.43592; // Earth's obliquity
const EARTH_AXIAL_TILT_RADIANS = (EARTH_AXIAL_TILT_DEGREES * Math.PI) / 180;

const EARTH_FLATTENING = 1 / 298.257223563; // WGS84

const LENGTH_UNITS = [
  { suffix: "m", factor: 1, label: "Meters" },
  { suffix: "km", factor: 1000, label: "Kilometers" },
  { suffix: "mi", factor: 1609.34, label: "Miles" },
  { suffix: "ft", factor: 0.3048, label: "Feet" },
];

const SMALL_LENGTH_UNITS = [
  { suffix: "cm", factor: 0.01, label: "Centimeters" },
  { suffix: "mm", factor: 0.001, label: "Millimeters" },
  { suffix: "in", factor: 0.0254, label: "Inches" },
];

// Radians are base
const ANGLE_UNITS = [
  { suffix: "rad", factor: 1, label: "Radians" },
  { suffix: "°", factor: Math.PI / 180, label: "Degrees" },
];

export {
  LENGTH_UNITS,
  SMALL_LENGTH_UNITS,
  ANGLE_UNITS,
  AU,
  GRAVITATIONAL_CONSTANT,
  EARTH_ANGULAR_VELOCITY,
  EARTH_AXIAL_TILT_RADIANS,
  EARTH_SIDEREAL_PERIOD,
  EARTH_AXIAL_TILT_DEGREES,
  EARTH_FLATTENING,
};
