import { RayRenderer } from "../core/renderers/rayRenderer";
import type { SettingDefinition } from "../core/types/scene";
import { SOLAR_SYSTEM_BODIES } from "../core/utils/bodyConstants";
import { LENGTH_UNITS, ANGLE_UNITS } from "../core/utils/constants";
import { defineUniformSchema } from "../core/utils/uniformSchema";

// Atmosphere simulation based on https://www.scratchapixel.com/lessons/procedural-generation-virtual-worlds/simulating-sky/simulating-colors-of-the-sky.html

interface AtmosphereGlobeData extends Record<string, unknown> {
  sphereCenter: [number, number, number];
  sphereRadius: number;
  sunCenter: [number, number, number];
  sunRadius: number;
  atmosphereRadius: number;
  betaRayleigh: [number, number, number];
  betaMie: number;
  scaleHeightRayleigh: number;
  scaleHeightMie: number;
  mieG: number;
  sunIntensity: number;
  enableAtmosphere: number; // 0 or 1 (boolean as u32)
  numViewSamples: number;
  numLightSamples: number;
}

const atmosphereGlobeShader = `
// Ray-sphere intersection
struct SphereHit {
  hit: bool,
  distance: f32,
  normal: vec3f,
}

fn intersectSphere(ray: Ray, center: vec3f, radius: f32) -> SphereHit {
  var result: SphereHit;
  result.hit = false;
  result.distance = -1.0;
  result.normal = vec3f(0.0, 0.0, 0.0);
  
  if (radius <= 0.0) {
    return result;
  }
  
  // Vector from ray origin to sphere center
  let oc = ray.origin - center;
  let a = dot(ray.direction, ray.direction);
  let b = 2.0 * dot(oc, ray.direction);
  let c = dot(oc, oc) - radius * radius;
  let discriminant = b * b - 4.0 * a * c;
  
  if (discriminant < 0.0) {
    return result;
  }
  
  let sqrtDiscriminant = sqrt(discriminant);
  let t1 = (-b - sqrtDiscriminant) / (2.0 * a);
  let t2 = (-b + sqrtDiscriminant) / (2.0 * a);
  
  let epsilon = 0.001;
  var t = t1;
  if (t1 < epsilon) {
    t = t2;
  }
  if (t < epsilon) {
    return result;
  }
  
  result.hit = true;
  result.distance = t;
  
  // Calculate surface normal at hit point
  let hitPoint = ray.origin + t * ray.direction;
  result.normal = normalize(hitPoint - center);
  
  return result;
}

// Atmosphere intersection returning both entry and exit distances
struct AtmosphereHit {
  hit: bool,
  tMin: f32,
  tMax: f32,
}

fn intersectAtmosphere(ray: Ray, center: vec3f, radius: f32) -> AtmosphereHit {
  var result: AtmosphereHit;
  result.hit = false;
  result.tMin = -1.0;
  result.tMax = -1.0;
  
  if (radius <= 0.0) {
    return result;
  }
  
  let oc = ray.origin - center;
  let a = dot(ray.direction, ray.direction);
  let b = 2.0 * dot(oc, ray.direction);
  let c = dot(oc, oc) - radius * radius;
  let discriminant = b * b - 4.0 * a * c;
  
  if (discriminant < 0.0) {
    return result;
  }
  
  let sqrtDiscriminant = sqrt(discriminant);
  let t1 = (-b - sqrtDiscriminant) / (2.0 * a);
  let t2 = (-b + sqrtDiscriminant) / (2.0 * a);
  
  // We need both intersection points for atmosphere
  result.hit = true;
  result.tMin = t1;
  result.tMax = t2;
  
  return result;
}

// Rayleigh phase function
fn phaseRayleigh(cosTheta: f32) -> f32 {
  return (3.0 / (16.0 * 3.14159265359)) * (1.0 + cosTheta * cosTheta);
}

// Mie phase function (Henyey-Greenstein)
fn phaseMie(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  let num = (1.0 - g2) * (1.0 + cosTheta * cosTheta);
  let denom = (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
  return (3.0 / (8.0 * 3.14159265359)) * (num / denom);
}

// Compute optical depth along a ray segment
fn computeOpticalDepth(
  origin: vec3f,
  dir: vec3f,
  maxDist: f32,
  numSamples: u32
) -> vec2f {
  var opticalDepthR = 0.0;
  var opticalDepthM = 0.0;
  let segmentLength = maxDist / f32(numSamples);
  
  for (var i = 0u; i < numSamples; i++) {
    let t = (f32(i) + 0.5) * segmentLength;
    let samplePos = origin + dir * t;
    let height = length(samplePos - uniforms.sphereCenter) - uniforms.sphereRadius;
    
    // Check if below ground (in Earth's shadow)
    if (height < 0.0) {
      break;
    }
    
    // Exponential density falloff
    let hr = exp(-height / uniforms.scaleHeightRayleigh) * segmentLength;
    let hm = exp(-height / uniforms.scaleHeightMie) * segmentLength;
    
    opticalDepthR += hr;
    opticalDepthM += hm;
  }
  
  return vec2f(opticalDepthR, opticalDepthM);
}

// Compute atmospheric scattering along a ray
fn computeAtmosphereColor(ray: Ray, tMin: f32, tMax: f32) -> vec3f {
  let numViewSamples = u32(uniforms.numViewSamples);
  let numLightSamples = u32(uniforms.numLightSamples);
  let segmentLength = (tMax - tMin) / f32(numViewSamples);
  
  var sumR = vec3f(0.0);
  var sumM = vec3f(0.0);
  var opticalDepthR = 0.0;
  var opticalDepthM = 0.0;
  
  let sunDir = normalize(uniforms.sunCenter - uniforms.sphereCenter);
  let mu = dot(ray.direction, sunDir);
  let phaseR = phaseRayleigh(mu);
  let phaseM = phaseMie(mu, uniforms.mieG);
  
  // March along view ray
  for (var i = 0u; i < numViewSamples; i++) {
    let t = tMin + (f32(i) + 0.5) * segmentLength;
    let samplePos = ray.origin + ray.direction * t;
    let height = length(samplePos - uniforms.sphereCenter) - uniforms.sphereRadius;
    
    let hr = exp(-height / uniforms.scaleHeightRayleigh) * segmentLength;
    let hm = exp(-height / uniforms.scaleHeightMie) * segmentLength;
    opticalDepthR += hr;
    opticalDepthM += hm;
    
    // Cast ray toward sun to compute light optical depth
    // First check if the light ray is blocked by Earth (shadow check)
    let earthShadowHit = intersectSphere(
      Ray(samplePos, sunDir),
      uniforms.sphereCenter,
      uniforms.sphereRadius
    );
    
    // If light ray hits Earth and the hit is in front of us, this point is in shadow
    // Skip this sample as no sunlight reaches it
    if (!earthShadowHit.hit || earthShadowHit.distance < 0.0) {
      // Not in Earth's shadow - compute light contribution
      let atmosphereHit = intersectAtmosphere(
        Ray(samplePos, sunDir),
        uniforms.sphereCenter,
        uniforms.atmosphereRadius
      );
      
      if (atmosphereHit.hit && atmosphereHit.tMax > 0.0) {
        let lightDistance = max(0.0, atmosphereHit.tMax);
        let lightOpticalDepth = computeOpticalDepth(
          samplePos,
          sunDir,
          lightDistance,
          numLightSamples
        );
        
        // Combine optical depths (Beer-Lambert law)
        // tau = beta * (opticalDepth_view + opticalDepth_light)
        let tau = uniforms.betaRayleigh * (opticalDepthR + lightOpticalDepth.x) +
                  vec3f(uniforms.betaMie) * 1.1 * (opticalDepthM + lightOpticalDepth.y);
        
        // Transmittance = exp(-tau)
        let attenuation = vec3f(exp(-tau.x), exp(-tau.y), exp(-tau.z));
        
        sumR += attenuation * hr;
        sumM += attenuation * hm;
      }
    }
    // If in Earth's shadow, contribute nothing (skip the light contribution)
  }
  
  // Final color: sum of Rayleigh and Mie contributions
  return (sumR * uniforms.betaRayleigh * phaseR + 
          sumM * vec3f(uniforms.betaMie) * phaseM) * uniforms.sunIntensity;
}

// Simple lighting calculation using sun direction
fn calculateLighting(normal: vec3f, lightDir: vec3f) -> f32 {
  // Lambertian diffuse lighting
  let diffuse = max(dot(normal, lightDir), 0.0);
  
  // Add ambient lighting
  let ambient = 0.2;
  
  return ambient + diffuse * 0.8;
}

// Main ray tracing function
fn traceRay(ray: Ray) -> vec3f {
  let earthHit = intersectSphere(ray, uniforms.sphereCenter, uniforms.sphereRadius);
  let sunHit = intersectSphere(ray, uniforms.sunCenter, uniforms.sunRadius);
  let atmosphereHit = intersectAtmosphere(ray, uniforms.sphereCenter, uniforms.atmosphereRadius);
  
  var color = vec3f(0.0, 0.0, 0.0);
  
  // First priority: render the sun if visible
  if (sunHit.hit && (!earthHit.hit || sunHit.distance < earthHit.distance)) {
    return vec3f(1.0, 0.95, 0.8);
  }
  
  // Check if atmosphere is enabled
  if (uniforms.enableAtmosphere == 1u && atmosphereHit.hit) {
    // Determine ray bounds through atmosphere
    var tMin = max(0.0, atmosphereHit.tMin);
    var tMax = atmosphereHit.tMax;
    
    // If we're inside the atmosphere, start from ray origin
    if (atmosphereHit.tMin < 0.0) {
      tMin = 0.0;
    }
    
    // If we hit Earth, limit atmosphere ray to Earth surface
    var hitEarth = false;
    if (earthHit.hit && earthHit.distance < tMax) {
      tMax = earthHit.distance;
      hitEarth = true;
    }
    
    // Compute atmospheric scattering
    if (tMax > tMin) {
      color = computeAtmosphereColor(ray, tMin, tMax);
    }
    
    // If we hit Earth, add surface color with aerial perspective
    if (hitEarth) {
      let lightDir = normalize(uniforms.sunCenter - uniforms.sphereCenter);
      let lighting = calculateLighting(earthHit.normal, lightDir);
      
      // Base color - blue/green for Earth-like appearance
      let surfaceColor = vec3f(0.3, 0.5, 0.8) * lighting;
      
      // Composite surface with atmosphere
      // Atmosphere color is the in-scattered light along the view ray
      // Surface color should be attenuated less when closer, more when farther
      // Simple blend: use distance-based factor
      let distanceToSurface = earthHit.distance;
      let maxDistance = uniforms.atmosphereRadius * 2.0;
      let atmosphereFactor = min(1.0, distanceToSurface / maxDistance);
      
      color = surfaceColor * (1.0 - atmosphereFactor * 0.7) + color;
    }
  } else {
    // Atmosphere disabled - use simple shading
    if (earthHit.hit) {
      let lightDir = normalize(uniforms.sunCenter - uniforms.sphereCenter);
      let lighting = calculateLighting(earthHit.normal, lightDir);
      let baseColor = vec3f(0.3, 0.5, 0.8);
      color = baseColor * lighting;
    }
  }
  
  return color;
}
`;

export class AtmosphereGlobe extends RayRenderer<AtmosphereGlobeData> {
  private cameraHeight = 20000000; // 20,000 km above surface
  private sphereRadius = SOLAR_SYSTEM_BODIES.earth.radius; // Earth radius in meters
  private readonly sunRadius = SOLAR_SYSTEM_BODIES.sun.radius; // Sun radius in meters
  private readonly sunDistance = 1.496e11; // 1 AU (average Earth-Sun distance) in meters

  // Sun position parameters
  private latitude = 0; // Observer's latitude in radians (0 = equator)
  private timeOfDay = 12; // Time in hours (0-24, 12 = solar noon)
  private dayOfYear = 172; // Day of year (1-365, 172 = June 21, summer solstice)

  // Atmospheric scattering parameters
  private atmosphereThickness = 60000; // 60 km atmosphere thickness
  private enableAtmosphere = true; // Toggle atmosphere rendering
  private sunIntensity = 20; // Sun intensity for scattering calculations

  // Rayleigh scattering (air molecules) - coefficients at sea level
  // Values from Nishita paper: wavelengths 440nm (blue), 550nm (green), 680nm (red)
  private readonly betaRayleighBase: [number, number, number] = [
    3.8e-6, // Blue scatters most
    13.5e-6, // Green scatters moderately
    33.1e-6, // Red scatters least
  ];
  private rayleighStrength = 1.0; // Multiplier for Rayleigh scattering intensity
  private readonly scaleHeightRayleigh = 7994; // 8km scale height for Rayleigh

  // Mie scattering (aerosols/haze) - grayscale coefficient
  private readonly betaMieBase = 21e-6;
  private mieStrength = 1.0; // Multiplier for Mie scattering intensity
  private readonly scaleHeightMie = 1200; // 1.2km scale height for Mie
  private mieG = 0.76; // Anisotropy parameter (forward scattering)

  // Sampling quality
  private numViewSamples = 16; // Number of samples along view ray
  private numLightSamples = 8; // Number of samples along light ray

  constructor() {
    super();
    // Start looking down at the globe below
    this.cameraPitch = -Math.PI / 2; // Look down at 90 degrees
    this.cameraYaw = 0;
  }

  /**
   * Calculate solar declination angle based on day of year
   * Uses the approximation: δ = 23.44° × sin(360° × (284 + n) / 365)
   * @param dayOfYear Day of year (1-365)
   * @returns Solar declination in radians
   */
  private calculateSolarDeclination(dayOfYear: number): number {
    const degrees = 23.44 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
    return (degrees * Math.PI) / 180;
  }

  /**
   * Calculate the Equation of Time correction
   * Accounts for Earth's elliptical orbit and axial tilt
   * @param dayOfYear Day of year (1-365)
   * @returns Equation of time correction in minutes
   */
  private calculateEquationOfTime(dayOfYear: number): number {
    // B is the fractional year in radians
    const B = (2 * Math.PI * (dayOfYear - 1)) / 365;

    // Spencer's Fourier series approximation
    // Returns correction in minutes
    const E =
      229.18 *
      (0.000075 +
        0.001868 * Math.cos(B) -
        0.032077 * Math.sin(B) -
        0.014615 * Math.cos(2 * B) -
        0.040849 * Math.sin(2 * B));

    return E;
  }

  /**
   * Calculate hour angle based on time of day with Equation of Time correction
   * Hour angle = 15° × (time_in_hours - 12) + correction
   * @param timeOfDay Time in hours (0-24)
   * @param dayOfYear Day of year (1-365) for Equation of Time correction
   * @returns Hour angle in radians
   */
  private calculateHourAngle(timeOfDay: number, dayOfYear: number): number {
    // Get Equation of Time correction in minutes
    const eotMinutes = this.calculateEquationOfTime(dayOfYear);

    // Convert to hours
    const eotHours = eotMinutes / 60;

    // Apply correction to time of day
    const correctedTime = timeOfDay + eotHours;

    // Calculate hour angle
    const degrees = 15 * (correctedTime - 12);
    return (degrees * Math.PI) / 180;
  }

  /**
   * Calculate sun's elevation and azimuth from observer's perspective
   * @param latitude Observer's latitude in radians
   * @param declination Solar declination in radians
   * @param hourAngle Hour angle in radians
   * @returns Object with elevation and azimuth in radians
   */
  private calculateSunPosition(
    latitude: number,
    declination: number,
    hourAngle: number
  ): { elevation: number; azimuth: number } {
    // Solar elevation (altitude)
    const sinElevation =
      Math.sin(latitude) * Math.sin(declination) +
      Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
    const elevation = Math.asin(sinElevation);

    // Solar azimuth
    // We need both sin and cos to determine the correct quadrant
    const cosAzimuth =
      (Math.sin(declination) - Math.sin(elevation) * Math.sin(latitude)) /
      (Math.cos(elevation) * Math.cos(latitude));
    const sinAzimuth =
      (-Math.cos(declination) * Math.sin(hourAngle)) / Math.cos(elevation);

    // Use atan2 to get the correct quadrant
    // Convention: 0 = North, π/2 = East, π = South, 3π/2 = West
    let azimuth = Math.atan2(sinAzimuth, cosAzimuth);

    // Convert from astronomical convention (0 = South) to our convention (0 = right/East)
    // Astronomical: 0 = South, rotating clockwise when looking down
    // Our system: 0 = +X (right/East), π/2 = +Z (front/South), π = -X (left/West), 3π/2 = -Z (back/North)
    // So we need to rotate by π/2 (90 degrees)
    azimuth = azimuth + Math.PI / 2;

    // Normalize to [0, 2π]
    if (azimuth < 0) azimuth += 2 * Math.PI;
    if (azimuth >= 2 * Math.PI) azimuth -= 2 * Math.PI;

    return { elevation, azimuth };
  }

  // Scene-specific uniform schema
  protected getSceneUniformSchema() {
    return defineUniformSchema({
      sphereCenter: "vec3f",
      sphereRadius: "f32",
      sunCenter: "vec3f",
      sunRadius: "f32",
      atmosphereRadius: "f32",
      betaRayleigh: "vec3f",
      betaMie: "f32",
      scaleHeightRayleigh: "f32",
      scaleHeightMie: "f32",
      mieG: "f32",
      sunIntensity: "f32",
      enableAtmosphere: "u32",
      numViewSamples: "f32",
      numLightSamples: "f32",
    });
  }

  // Scene-specific shader code
  protected getSceneShaderCode(): string {
    return atmosphereGlobeShader;
  }

  // Scene-specific settings
  protected getSceneSettings(): SettingDefinition[] {
    return [
      {
        key: "cameraHeight",
        label: "Camera Height",
        type: "slider",
        defaultValue: this.cameraHeight,
        min: 1, // At least 1km above surface
        max: SOLAR_SYSTEM_BODIES.earth.radius * 10, // Up to 10 Earth radii
        scale: "logarithmic",
        units: LENGTH_UNITS,
        description: "Height of camera above Earth's surface",
        group: "Camera",
      },
      {
        key: "latitude",
        label: "Latitude",
        type: "slider",
        defaultValue: this.latitude,
        min: -Math.PI / 2, // South pole
        max: Math.PI / 2, // North pole
        scale: "linear",
        units: ANGLE_UNITS,
        description:
          "Observer's latitude (0° = equator, +90° = north pole, -90° = south pole)",
        group: "Location & Time",
      },
      {
        key: "timeOfDay",
        label: "Time of Day",
        type: "slider",
        defaultValue: this.timeOfDay,
        min: 0,
        max: 24,
        scale: "linear",
        units: [{ suffix: "h", factor: 1, label: "Hours" }],
        description:
          "Time of day in hours (0 = midnight, 12 = noon, 24 = midnight)",
        group: "Location & Time",
      },
      {
        key: "dayOfYear",
        label: "Day of Year",
        type: "slider",
        defaultValue: this.dayOfYear,
        min: 1,
        max: 365,
        scale: "linear",
        units: [{ suffix: "", factor: 1, label: "Days" }],
        description:
          "Day of year (1 = Jan 1, 80 = Mar 21 equinox, 172 = Jun 21 solstice, 266 = Sep 23 equinox, 355 = Dec 21 solstice)",
        group: "Location & Time",
      },
      {
        key: "enableAtmosphere",
        label: "Enable Atmosphere",
        type: "toggle",
        defaultValue: this.enableAtmosphere,
        description: "Toggle atmospheric scattering effects (Rayleigh + Mie)",
        group: "Atmosphere",
      },
      {
        key: "atmosphereThickness",
        label: "Atmosphere Thickness",
        type: "slider",
        defaultValue: this.atmosphereThickness,
        min: 10000, // 10 km minimum
        max: 200000, // 200 km maximum
        scale: "linear",
        units: LENGTH_UNITS,
        description: "Thickness of the atmosphere layer",
        group: "Atmosphere",
      },
      {
        key: "sunIntensity",
        label: "Sun Intensity",
        type: "slider",
        defaultValue: this.sunIntensity,
        min: 1,
        max: 100,
        scale: "logarithmic",
        units: [{ suffix: "", factor: 1, label: "Intensity" }],
        description:
          "Intensity of sunlight for atmospheric scattering (higher = brighter sky)",
        group: "Atmosphere",
      },
      {
        key: "rayleighStrength",
        label: "Rayleigh Strength",
        type: "slider",
        defaultValue: this.rayleighStrength,
        min: 0.1,
        max: 10,
        scale: "logarithmic",
        units: [{ suffix: "×", factor: 1, label: "Multiplier" }],
        description:
          "Multiplier for Rayleigh scattering (air molecules). Higher = more blue sky color",
        group: "Scattering",
      },
      {
        key: "mieStrength",
        label: "Mie Strength",
        type: "slider",
        defaultValue: this.mieStrength,
        min: 0.1,
        max: 10,
        scale: "logarithmic",
        units: [{ suffix: "×", factor: 1, label: "Multiplier" }],
        description:
          "Multiplier for Mie scattering (aerosols/haze). Higher = more white haze",
        group: "Scattering",
      },
      {
        key: "mieG",
        label: "Mie Anisotropy (g)",
        type: "slider",
        defaultValue: this.mieG,
        min: -0.99,
        max: 0.99,
        scale: "linear",
        units: [{ suffix: "", factor: 1, label: "g" }],
        description:
          "Mie phase function direction: -1 = backward, 0 = uniform, +1 = forward (sun halo)",
        group: "Scattering",
      },
      {
        key: "numViewSamples",
        label: "View Ray Samples",
        type: "slider",
        defaultValue: this.numViewSamples,
        min: 4,
        max: 32,
        scale: "linear",
        units: [{ suffix: "", factor: 1, label: "Samples" }],
        description:
          "Number of samples along view ray. Higher = better quality but slower",
        group: "Rendering",
      },
      {
        key: "numLightSamples",
        label: "Light Ray Samples",
        type: "slider",
        defaultValue: this.numLightSamples,
        min: 2,
        max: 16,
        scale: "linear",
        units: [{ suffix: "", factor: 1, label: "Samples" }],
        description:
          "Number of samples along light ray. Higher = smoother shadows but much slower",
        group: "Rendering",
      },
    ];
  }

  // Per-frame scene data
  protected getSceneData(): AtmosphereGlobeData {
    // Camera is at origin (0, 0, 0) in camera space
    // The sphere should be directly below the observer
    // Sphere center Y = -(cameraHeight + sphereRadius)
    // This places the sphere's surface cameraHeight units below the camera
    const sphereY = -(this.cameraHeight + this.sphereRadius);

    // Calculate sun position using astronomical formulas
    const declination = this.calculateSolarDeclination(this.dayOfYear);
    const hourAngle = this.calculateHourAngle(this.timeOfDay, this.dayOfYear);
    const { elevation, azimuth } = this.calculateSunPosition(
      this.latitude,
      declination,
      hourAngle
    );

    // Convert spherical coordinates (azimuth, elevation, distance) to Cartesian (x, y, z)
    // Azimuth: 0 = +X axis, rotates counterclockwise when looking down
    // Elevation: 0 = horizon (XZ plane), +π/2 = up (+Y), -π/2 = down (-Y)
    // The sun position is relative to Earth's center
    const sunX = this.sunDistance * Math.cos(elevation) * Math.cos(azimuth);
    const sunY = this.sunDistance * Math.sin(elevation);
    const sunZ = this.sunDistance * Math.cos(elevation) * Math.sin(azimuth);

    // Offset sun position by Earth's position (since Earth is at [0, sphereY, 0])
    const sunCenter: [number, number, number] = [sunX, sphereY + sunY, sunZ];

    // Atmosphere radius = Earth radius + atmosphere thickness
    const atmosphereRadius = this.sphereRadius + this.atmosphereThickness;

    // Apply strength multipliers to scattering coefficients
    const betaRayleigh: [number, number, number] = [
      this.betaRayleighBase[0] * this.rayleighStrength,
      this.betaRayleighBase[1] * this.rayleighStrength,
      this.betaRayleighBase[2] * this.rayleighStrength,
    ];
    const betaMie = this.betaMieBase * this.mieStrength;

    return {
      sphereCenter: [0, sphereY, 0],
      sphereRadius: this.sphereRadius,
      sunCenter,
      sunRadius: this.sunRadius,
      atmosphereRadius,
      betaRayleigh,
      betaMie,
      scaleHeightRayleigh: this.scaleHeightRayleigh,
      scaleHeightMie: this.scaleHeightMie,
      mieG: this.mieG,
      sunIntensity: this.sunIntensity,
      enableAtmosphere: this.enableAtmosphere ? 1 : 0,
      numViewSamples: this.numViewSamples,
      numLightSamples: this.numLightSamples,
    };
  }

  // Scene-specific display info
  protected getSceneDisplayInfo(): Record<string, string | number> {
    // Calculate current sun position for display
    const declination = this.calculateSolarDeclination(this.dayOfYear);
    const hourAngle = this.calculateHourAngle(this.timeOfDay, this.dayOfYear);
    const { elevation, azimuth } = this.calculateSunPosition(
      this.latitude,
      declination,
      hourAngle
    );

    return {
      "Height Above Surface": `${(this.cameraHeight / 1000).toFixed(1)} km`,
      "Solar Declination": `${((declination * 180) / Math.PI).toFixed(1)}°`,
      "Sun Azimuth": `${((azimuth * 180) / Math.PI).toFixed(1)}°`,
      "Sun Elevation": `${((elevation * 180) / Math.PI).toFixed(1)}°`,
    };
  }
}
