import type { SettingDefinition } from "../core/types/scene";
import { RayRenderer } from "../core/renderers/rayRenderer";
import { SOLAR_SYSTEM_BODIES } from "../core/utils/bodyConstants";
import { LENGTH_UNITS } from "../core/utils/constants";
import { simplexNoise3D } from "../core/utils/shaderUtils";
import { defineUniformSchema } from "../core/utils/uniformSchema";

const mirrorSphereSceneSchema = defineUniformSchema({
  sphereCount: "u32",
  mirroring: "f32", // 0 or 1
  spheres: {
    array: {
      struct: {
        center: "vec3f",
        radius: "f32",
        color: "vec3f",
        isClouds: "f32", // 0 or 1
        noiseScale: "f32",
        noiseThreshold: "f32",
        noiseOctaves: "f32",
      },
      length: 8,
    },
  },
});

interface MirrorSphereData extends Record<string, unknown> {
  sphereCount: number;
  mirroring: number;
  spheres: Array<{
    center: [number, number, number];
    radius: number;
    color: [number, number, number];
    isClouds: number;
    noiseScale: number;
    noiseThreshold: number;
    noiseOctaves: number;
  }>;
}

export class MirrorSphere extends RayRenderer<MirrorSphereData> {
  private cameraHeight = 2;
  private earthRadius = SOLAR_SYSTEM_BODIES.earth.radius;
  private cloudHeight = 2000; // Cloud layer height in meters
  private noiseScale = 0.01; // Scale factor for noise coordinates
  private noiseThreshold = 0.0; // Threshold for cloud visibility
  private noiseOctaves = 2; // Number of noise octaves for detail
  private mirroring = true; // Enable salt flat mirror effect

  protected getSceneUniformSchema() {
    return mirrorSphereSceneSchema;
  }

  protected getSceneShaderCode(): string {
    return `
struct RayExtended {
  origin: vec3f,
  direction: vec3f,
  isReflected: bool,
}

struct HitInfo {
  hit: bool,
  distance: f32,
  point: vec3f,
  normal: vec3f,
  hasSecondHit: bool,
  distance2: f32,
  point2: vec3f,
  normal2: vec3f,
}

${simplexNoise3D}

// Ray-sphere intersection with arbitrary ray origin
// Uses numerically stable half-b formulation
// Returns both intersection points (entry and exit)
fn intersectSphere(ray: RayExtended, center: vec3f, radius: f32) -> HitInfo {
  var info: HitInfo;
  info.hit = false;
  info.hasSecondHit = false;
  
  if (radius <= 0.0) {
    return info;
  }
  
  // Vector from sphere center to ray origin
  let oc = ray.origin - center;
  let b_half = dot(oc, ray.direction);
  let c = dot(oc, oc) - radius * radius;
  let discriminant = b_half * b_half - c;
  
  if (discriminant < 0.0) {
    return info;
  }
  
  let sqrtDiscriminant = sqrt(discriminant);
  let t1 = -b_half - sqrtDiscriminant;
  let t2 = -b_half + sqrtDiscriminant;
  
  let epsilon = 1e-6;
  
  // Check first hit (near intersection)
  if (t1 >= epsilon) {
    info.hit = true;
    info.distance = t1;
    info.point = ray.origin + t1 * ray.direction;
    info.normal = normalize(info.point - center);
    
    // Check second hit (far intersection)
    if (t2 >= epsilon && t2 > t1) {
      info.hasSecondHit = true;
      info.distance2 = t2;
      info.point2 = ray.origin + t2 * ray.direction;
      info.normal2 = normalize(info.point2 - center);
    }
  } else if (t2 >= epsilon) {
    // Only second intersection is valid (we're inside the sphere)
    info.hit = true;
    info.distance = t2;
    info.point = ray.origin + t2 * ray.direction;
    info.normal = normalize(info.point - center);
  }
  
  return info;
}

// Trace result with additional metadata
struct TraceResult {
  color: vec3f,
  hit: bool,
  isCloud: bool,
  normal: vec3f,
  point: vec3f,
}

// Helper to sample noise at a point on a cloud sphere
fn sampleCloudNoise(point: vec3f, center: vec3f, noiseScale: f32, noiseOctaves: f32) -> f32 {
  let localPoint = point - center;
  let direction = normalize(localPoint);
  let noisePos = direction * noiseScale * 100000.0;
  let octaves = i32(noiseOctaves);
  return fbm_simplex_3d(noisePos, octaves, 2.0, 0.5);
}

fn traceRayExtended(ray: RayExtended) -> TraceResult {
  var result: TraceResult;
  result.hit = false;
  result.isCloud = false;
  
  let maxSpheres = min(uniforms.sphereCount, 8u);
  
  var closestHit: HitInfo;
  closestHit.hit = false;
  var closestDistance = 1e30;
  var closestSphereIndex = -1;
  
  for (var i = 0u; i < maxSpheres; i++) {
    let sphere = uniforms.spheres[i];
    
    if (sphere.radius <= 0.0) {
      continue;
    }
    
    let hit = intersectSphere(ray, sphere.center, sphere.radius);
    
    if (hit.hit) {
      // For cloud spheres, check if the noise at the hit point is above threshold
      if (sphere.isClouds > 0.5) {
        // Check first hit point
        let noiseValue1 = sampleCloudNoise(hit.point, sphere.center, sphere.noiseScale, sphere.noiseOctaves);
        var foundCloud = false;
        var cloudHit: HitInfo;
        
        if (noiseValue1 > sphere.noiseThreshold) {
          // First hit has cloud
          foundCloud = true;
          cloudHit = hit;
        } else if (hit.hasSecondHit) {
          // First hit has no cloud, check second hit (far side)
          let noiseValue2 = sampleCloudNoise(hit.point2, sphere.center, sphere.noiseScale, sphere.noiseOctaves);
          if (noiseValue2 > sphere.noiseThreshold) {
            // Second hit has cloud
            foundCloud = true;
            cloudHit.hit = true;
            cloudHit.distance = hit.distance2;
            cloudHit.point = hit.point2;
            cloudHit.normal = hit.normal2;
            cloudHit.hasSecondHit = false;
          }
        }
        
        if (foundCloud && cloudHit.distance < closestDistance) {
          closestDistance = cloudHit.distance;
          closestHit = cloudHit;
          closestSphereIndex = i32(i);
        }
      } else {
        // Non-cloud sphere: skip if this is a reflected ray (prevents self-intersection)
        if (!ray.isReflected) {
          if (hit.distance < closestDistance) {
            closestDistance = hit.distance;
            closestHit = hit;
            closestSphereIndex = i32(i);
          }
        }
      }
    }
  }
  
  if (!closestHit.hit) {
    result.color = vec3f(0.5, 0.7, 1.0);
    result.hit = false;
  } else {
    result.hit = true;
    result.normal = closestHit.normal;
    result.point = closestHit.point;
    
    let sphere = uniforms.spheres[closestSphereIndex];
    result.isCloud = sphere.isClouds > 0.5;
    
    result.color = sphere.color;
  }
  
  return result;
}

fn traceRay(ray: Ray) -> vec3f {
  let extendedRay = RayExtended(ray.origin, ray.direction, false);
  
  let firstHit = traceRayExtended(extendedRay);
  
  var finalColor: vec3f;
  
  // Check if we should reflect (mirroring enabled AND hit a non-cloud surface)
  if (uniforms.mirroring > 0.5 && firstHit.hit && !firstHit.isCloud) {
    // Calculate reflected ray direction
    // Formula: R = I - 2 * (I · N) * N
    let incident = ray.direction;
    let reflectedDir = incident - 2.0 * dot(incident, firstHit.normal) * firstHit.normal;
    
    // Trace the reflected ray from the hit point
    // Mark as reflected to prevent self-intersection with the mirror surface
    let reflectedRay = RayExtended(firstHit.point, reflectedDir, true);
    let reflectedHit = traceRayExtended(reflectedRay);
    
    // Mix surface color with reflection (50/50 blend)
    let surfaceColor = firstHit.color;
    finalColor = mix(surfaceColor, reflectedHit.color, 0.5);
  } else {
    // No mirroring or hit a cloud - use direct color
    finalColor = firstHit.color;
  }
  
  return finalColor;
}
`;
  }

  protected getSceneSettings(): SettingDefinition[] {
    return [
      {
        key: "cameraHeight",
        label: "Camera Height",
        type: "slider",
        defaultValue: this.cameraHeight,
        min: 1,
        max: 6500000,
        scale: "logarithmic",
        units: LENGTH_UNITS,
        description: "Height of observer above surface",
        group: "Camera",
      },
      {
        key: "earthRadius",
        label: "Earth Radius",
        type: "slider",
        defaultValue: this.earthRadius,
        min: 10,
        max: SOLAR_SYSTEM_BODIES.earth.radius,
        scale: "logarithmic",
        units: LENGTH_UNITS,
        group: "World",
      },
      {
        key: "mirroring",
        label: "Salt Flat Mirror",
        type: "toggle",
        defaultValue: this.mirroring,
        description:
          "Enable mirror reflections on Earth's surface (simulates flooded salt flats)",
        group: "World",
      },
      {
        key: "cloudHeight",
        label: "Cloud Height",
        type: "slider",
        defaultValue: this.cloudHeight,
        min: 1,
        max: 2000000,
        scale: "logarithmic",
        units: LENGTH_UNITS,
        description: "Cloud layer height",
        group: "Clouds",
      },
      {
        key: "noiseScale",
        label: "Cloud Scale",
        type: "slider",
        defaultValue: this.noiseScale,
        min: 0.0001,
        max: 0.01,
        units: [{ suffix: "", factor: 1, label: "Scale" }],
        description: "Scale of noise pattern (smaller = larger cloud features)",
        group: "Clouds",
      },
      {
        key: "noiseThreshold",
        label: "Cloud Density",
        type: "slider",
        defaultValue: this.noiseThreshold,
        min: -1.0,
        max: 1.0,
        scale: "linear",
        units: [{ suffix: "", factor: 1, label: "Threshold" }],
        description: "Cloud density threshold (higher = less clouds)",
        group: "Clouds",
      },
    ];
  }

  protected getSceneData(): MirrorSphereData {
    const earthY = -this.cameraHeight - this.earthRadius;

    const spheres = [
      // Earth sphere
      {
        center: [0, earthY, 0] as [number, number, number],
        radius: this.earthRadius,
        color: [0.3, 0.5, 0.8] as [number, number, number], // Blue-ish earth color
        isClouds: 0,
        noiseScale: 0,
        noiseThreshold: 0,
        noiseOctaves: 0,
      },
      // Cloud sphere
      {
        center: [0, earthY, 0] as [number, number, number],
        radius: this.earthRadius + this.cloudHeight,
        color: [1.0, 1.0, 1.0] as [number, number, number], // White clouds
        isClouds: 1,
        noiseScale: this.noiseScale,
        noiseThreshold: this.noiseThreshold,
        noiseOctaves: this.noiseOctaves,
      },
    ];

    return {
      sphereCount: 2,
      mirroring: this.mirroring ? 1 : 0,
      spheres: spheres,
    };
  }
}
