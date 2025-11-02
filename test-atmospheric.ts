/**
 * Test file for atmospheric refraction utilities
 * Run with: bun run test-atmospheric.ts
 */

import {
  refractiveIndexAtAltitude,
  refractiveIndexOfAir,
  pressureAtAltitude,
  temperatureAtAltitude,
  densityAtAltitude,
  refractivityAtAltitude,
  refractiveIndexGradient,
  horizontalRefractionAngle,
  scaleHeight,
  saturationVaporPressure,
  waterVaporPressure,
  celsiusToKelvin,
  kelvinToCelsius,
  STANDARD_PRESSURE_HPA,
} from "./src/core/utils/atmosphericRefraction";

console.log("🌍 Atmospheric Refraction Utilities Test\n");
console.log("=".repeat(70));

// Test 1: Basic Refractive Index
console.log("\n📊 Test 1: Refractive Index at Different Altitudes\n");

const altitudes = [0, 1000, 5000, 10000];
altitudes.forEach((alt) => {
  const n = refractiveIndexAtAltitude(alt);
  const N = refractivityAtAltitude(alt);
  const pressure = pressureAtAltitude(alt);
  const temp = temperatureAtAltitude(alt);

  console.log(`Altitude: ${alt.toLocaleString()}m`);
  console.log(`  Refractive Index: ${n.toFixed(9)}`);
  console.log(`  Refractivity N:   ${N.toFixed(3)} ppm`);
  console.log(
    `  Pressure:         ${pressure.toFixed(2)} hPa (${(
      (pressure / STANDARD_PRESSURE_HPA) *
      100
    ).toFixed(1)}% of sea level)`
  );
  console.log(`  Temperature:      ${kelvinToCelsius(temp).toFixed(2)}°C`);
  console.log();
});

// Test 2: Humidity Effects
console.log("=".repeat(70));
console.log("\n💧 Test 2: Effect of Humidity on Refractive Index\n");

const humidities = [0, 50, 100];
humidities.forEach((humidity) => {
  const n = refractiveIndexAtAltitude(0, humidity);
  console.log(`Humidity: ${humidity}%`);
  console.log(`  Refractive Index: ${n.toFixed(9)}`);
});

// Test 3: Atmospheric Properties
console.log("\n" + "=".repeat(70));
console.log("\n🌡️  Test 3: Atmospheric Properties at Cruising Altitude\n");

const cruisingAlt = 10668; // 35,000 feet
const cruisingAltFeet = (cruisingAlt * 3.28084).toFixed(0);

console.log(
  `Typical airplane cruising altitude: ${cruisingAlt}m (${cruisingAltFeet} ft)\n`
);

const pressure = pressureAtAltitude(cruisingAlt);
const temp = temperatureAtAltitude(cruisingAlt);
const density = densityAtAltitude(cruisingAlt);
const n = refractiveIndexAtAltitude(cruisingAlt);

console.log(
  `Pressure:         ${pressure.toFixed(2)} hPa (${(
    (pressure / STANDARD_PRESSURE_HPA) *
    100
  ).toFixed(1)}% of sea level)`
);
console.log(`Temperature:      ${kelvinToCelsius(temp).toFixed(2)}°C`);
console.log(
  `Density:          ${density.toFixed(4)} kg/m³ (${(
    (density / 1.225) *
    100
  ).toFixed(1)}% of sea level)`
);
console.log(`Refractive Index: ${n.toFixed(9)}`);

// Test 4: Refractive Index Gradient
console.log("\n" + "=".repeat(70));
console.log("\n📈 Test 4: Refractive Index Gradient (for ray tracing)\n");

const gradientAlt = 1000;
const gradient = refractiveIndexGradient(gradientAlt);

console.log(`At ${gradientAlt}m altitude:`);
console.log(`  dn/dh: ${gradient.toExponential(6)} m⁻¹`);
console.log(`  (Negative = refractive index decreases with altitude)`);

// Test 5: Horizontal Refraction Angle
console.log("\n" + "=".repeat(70));
console.log("\n🌅 Test 5: Atmospheric Refraction Angle\n");

const seaLevelAngleRad = horizontalRefractionAngle(0);
const seaLevelAngleDeg = (seaLevelAngleRad * 180) / Math.PI;
const seaLevelAngleArcMin = seaLevelAngleDeg * 60;

console.log("At sea level (horizontal viewing):");
console.log(`  Refraction angle: ${seaLevelAngleRad.toExponential(6)} rad`);
console.log(`  Refraction angle: ${seaLevelAngleDeg.toFixed(4)}°`);
console.log(`  Refraction angle: ${seaLevelAngleArcMin.toFixed(2)} arcminutes`);
console.log(
  `  (This is why the sun appears slightly above the horizon at sunset)`
);

// Test 6: Scale Height
console.log("\n" + "=".repeat(70));
console.log("\n📏 Test 6: Atmospheric Scale Height\n");

const seaLevelTemp = temperatureAtAltitude(0);
const H = scaleHeight(seaLevelTemp);

console.log(`At sea level (${kelvinToCelsius(seaLevelTemp).toFixed(2)}°C):`);
console.log(`  Scale Height: ${(H / 1000).toFixed(2)} km`);
console.log(`  (Altitude for pressure/density to decrease by factor of e)`);

// Test 7: Custom Conditions
console.log("\n" + "=".repeat(70));
console.log("\n🌡️  Test 7: Custom Weather Conditions\n");

// Hot summer day
const hotDay = {
  pressure: STANDARD_PRESSURE_HPA,
  temp: celsiusToKelvin(35),
  humidity: 80,
};

// Cold winter day
const coldDay = {
  pressure: STANDARD_PRESSURE_HPA,
  temp: celsiusToKelvin(-10),
  humidity: 20,
};

const nHot = refractiveIndexOfAir(
  hotDay.pressure,
  hotDay.temp,
  hotDay.humidity
);
const nCold = refractiveIndexOfAir(
  coldDay.pressure,
  coldDay.temp,
  coldDay.humidity
);

console.log(`Hot summer day (35°C, 80% RH):`);
console.log(`  Refractive Index: ${nHot.toFixed(9)}`);
console.log();
console.log(`Cold winter day (-10°C, 20% RH):`);
console.log(`  Refractive Index: ${nCold.toFixed(9)}`);
console.log();
const difference = nCold - nHot;
console.log(`Difference: ${(difference * 1e6).toFixed(3)} ppm`);
if (difference > 0) {
  console.log(`(Cold, dry air has higher refractive index due to density)`);
} else {
  console.log(
    `(Hot, humid air has higher refractive index - humidity effect dominant)`
  );
}

// Test 8: Vapor Pressure
console.log("\n" + "=".repeat(70));
console.log("\n💨 Test 8: Water Vapor Pressure\n");

const testTemp = celsiusToKelvin(25);
const testHumidity = 60;

const e_s = saturationVaporPressure(testTemp);
const e = waterVaporPressure(testTemp, testHumidity);

console.log(`At 25°C with 60% relative humidity:`);
console.log(`  Saturation vapor pressure: ${e_s.toFixed(2)} hPa`);
console.log(`  Actual vapor pressure:     ${e.toFixed(2)} hPa`);

// Validation Tests
console.log("\n" + "=".repeat(70));
console.log("\n✅ Validation Tests\n");

const tests = [
  {
    name: "Sea level refractive index is ~1.000277",
    pass: Math.abs(refractiveIndexAtAltitude(0) - 1.000277) < 0.00001,
  },
  {
    name: "Refractive index decreases with altitude",
    pass: refractiveIndexAtAltitude(0) > refractiveIndexAtAltitude(10000),
  },
  {
    name: "Pressure decreases with altitude",
    pass: pressureAtAltitude(0) > pressureAtAltitude(10000),
  },
  {
    name: "Temperature decreases with altitude",
    pass: temperatureAtAltitude(0) > temperatureAtAltitude(10000),
  },
  {
    name: "Humidity decreases refractive index at fixed P,T",
    pass: refractiveIndexAtAltitude(0, 100) < refractiveIndexAtAltitude(0, 0),
  },
  {
    name: "Cold dry air has higher n than hot humid air at fixed pressure",
    pass:
      refractiveIndexOfAir(STANDARD_PRESSURE_HPA, celsiusToKelvin(35), 80) <
      refractiveIndexOfAir(STANDARD_PRESSURE_HPA, celsiusToKelvin(-10), 20),
  },
  {
    name: "Refractive index gradient is negative",
    pass: refractiveIndexGradient(1000) < 0,
  },
  {
    name: "Sea level pressure is standard",
    pass: Math.abs(pressureAtAltitude(0) - STANDARD_PRESSURE_HPA) < 0.01,
  },
  {
    name: "Sea level temperature is 15°C",
    pass: Math.abs(kelvinToCelsius(temperatureAtAltitude(0)) - 15) < 0.01,
  },
];

let passCount = 0;
tests.forEach((test) => {
  const icon = test.pass ? "✅" : "❌";
  console.log(`${icon} ${test.name}`);
  if (test.pass) passCount++;
});

console.log("\n" + "=".repeat(70));
console.log(`\n🎉 Tests completed: ${passCount}/${tests.length} passed\n`);

if (passCount === tests.length) {
  console.log(
    "All atmospheric refraction utilities are working correctly! 🌟\n"
  );
} else {
  console.log(`⚠️  ${tests.length - passCount} test(s) failed.\n`);
  process.exit(1);
}
