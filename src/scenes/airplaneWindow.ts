import { RayRenderer } from "../core/renderers/rayRenderer";
import type { SettingDefinition } from "../core/types/scene";
import { SOLAR_SYSTEM_BODIES } from "../core/utils/bodyConstants";
import { LENGTH_UNITS, SMALL_LENGTH_UNITS } from "../core/utils/constants";
import { defineUniformSchema } from "../core/utils/uniformSchema";

interface AirplaneWindowData extends Record<string, unknown> {
  sphereCenter: [number, number, number];
  sphereRadius: number;
  lightDirection: [number, number, number];
  cylinderAxisZ: number;
  cylinderAxisY: number;
  cylinderRadius: number;
  cylinderColor: [number, number, number];
  windowCenterX: number;
  windowCenterY: number;
  windowWidth: number;
  windowHeight: number;
  windowThickness: number;
  indexOfRefraction: number;
  useDetailedModel: number;
  outerPaneThickness: number;
  airGap1Thickness: number;
  innerPaneThickness: number;
  airGap2Thickness: number;
  scratchPaneThickness: number;
  pmmaIOR: number;
  useFlatEarth: number;
  planeY: number;
}

const airplaneWindowShader = `
// Ray-sphere intersection
struct SphereHit {
  hit: bool,
  distance: f32,
  normal: vec3f,
}

// Ray-plane intersection
struct PlaneHit {
  hit: bool,
  distance: f32,
  normal: vec3f,
}

// Ray-cylinder intersection (infinite horizontal cylinder along X axis)
struct CylinderHit {
  hit: bool,
  distance: f32,
  normal: vec3f,
  isWindow: bool,
}

fn intersectInfiniteCylinderX(ray: Ray, axisZ: f32, radius: f32, checkWindow: bool) -> CylinderHit {
  var result: CylinderHit;
  result.hit = false;
  result.distance = -1.0;
  result.normal = vec3f(0.0, 0.0, 0.0);
  result.isWindow = false;
  
  if (radius <= 0.0) {
    return result;
  }
  
  // Cylinder axis is at (any_x, axisY, axisZ), extending infinitely along X
  // Ray: P(t) = origin + t * direction
  // Cylinder: (y - axisY)^2 + (z - axisZ)^2 = radius^2
  // We ignore the x component for an infinite cylinder along X
  
  let o_y = ray.origin.y - uniforms.cylinderAxisY;
  let o_z = ray.origin.z - axisZ;
  let d_y = ray.direction.y;
  let d_z = ray.direction.z;
  
  // Quadratic equation: a*t^2 + b*t + c = 0
  let a = d_y * d_y + d_z * d_z;
  let b = 2.0 * (o_y * d_y + o_z * d_z);
  let c = o_y * o_y + o_z * o_z - radius * radius;
  
  // Check if ray is parallel to cylinder axis (a ~= 0)
  if (abs(a) < 0.0001) {
    return result;
  }
  
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
  // Normal is perpendicular to the X axis, pointing away from axis
  let axisPoint = vec3f(hitPoint.x, uniforms.cylinderAxisY, axisZ);
  result.normal = normalize(hitPoint - axisPoint);
  
  if (checkWindow) {
    // Check if hit point is inside the rectangular window cutout
    // Window position is relative to the cylinder axis, not absolute
    let hitX = hitPoint.x;
    let hitY = hitPoint.y - uniforms.cylinderAxisY; // Offset by cylinder axis Y
    let halfWidth = uniforms.windowWidth * 0.5;
    let halfHeight = uniforms.windowHeight * 0.5;
    
    if (hitX >= uniforms.windowCenterX - halfWidth && 
        hitX <= uniforms.windowCenterX + halfWidth &&
        hitY >= uniforms.windowCenterY - halfHeight && 
        hitY <= uniforms.windowCenterY + halfHeight) {
      // Hit is inside the window area
      result.isWindow = true;
    }
  }
  
  return result;
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

// Intersect ray with infinite horizontal plane
fn intersectPlane(ray: Ray, planeY: f32) -> PlaneHit {
  var result: PlaneHit;
  result.hit = false;
  result.distance = -1.0;
  result.normal = vec3f(0.0, 1.0, 0.0); // Always pointing up
  
  let epsilon = 0.001;
  
  // Ray: P(t) = origin + t * direction
  // Plane: y = planeY
  // Solve: origin.y + t * direction.y = planeY
  
  if (abs(ray.direction.y) < 0.0001) {
    // Ray is parallel to plane
    return result;
  }
  
  let t = (planeY - ray.origin.y) / ray.direction.y;
  
  if (t < epsilon) {
    // Behind ray
    return result;
  }
  
  result.hit = true;
  result.distance = t;
  
  return result;
}

// Refract a ray using Snell's law
// incident: normalized ray direction
// normal: surface normal (should point toward the incident ray side)
// eta = n1/n2 (ratio of refractive indices)
// Returns refracted direction, or vec3f(0.0) if total internal reflection
fn refractRay(incident: vec3f, normal: vec3f, eta: f32) -> vec3f {
  // Ensure normal points toward incident ray
  var n = normal;
  let cosI = dot(incident, normal);
  if (cosI > 0.0) {
    n = -normal;
  }
  
  let cosThetaI = -dot(incident, n);
  let sin2ThetaT = eta * eta * (1.0 - cosThetaI * cosThetaI);
  
  if (sin2ThetaT > 1.0) {
    // Total internal reflection
    return vec3f(0.0);
  }
  
  let cosThetaT = sqrt(1.0 - sin2ThetaT);
  return eta * incident + (eta * cosThetaI - cosThetaT) * n;
}

// Simple lighting calculation
fn calculateLighting(normal: vec3f, lightDir: vec3f) -> f32 {
  // Lambertian diffuse lighting
  let diffuse = max(dot(normal, lightDir), 0.0);
  
  // Add ambient lighting
  let ambient = 0.2;
  
  return ambient + diffuse * 0.8;
}

// Refract through a single layer with two surfaces
fn refractThroughLayer(
  ray: Ray,
  innerRadius: f32,
  outerRadius: f32,
  iorFrom: f32,
  iorLayer: f32,
  iorTo: f32
) -> Ray {
  let epsilon = 0.001;
  
  // Enter the layer (from -> layer)
  let innerHit = intersectInfiniteCylinderX(ray, uniforms.cylinderAxisZ, innerRadius, false);
  if (!innerHit.hit) {
    return ray; // Shouldn't happen
  }
  
  let eta1 = iorFrom / iorLayer;
  let refractedDir1 = refractRay(ray.direction, innerHit.normal, eta1);
  
  if (dot(refractedDir1, refractedDir1) < 0.0001) {
    // Total internal reflection
    return ray;
  }
  
  let entryPoint = ray.origin + ray.direction * innerHit.distance;
  var layerRay = Ray(entryPoint + normalize(refractedDir1) * epsilon, normalize(refractedDir1));
  
  // Exit the layer (layer -> to)
  let outerHit = intersectInfiniteCylinderX(layerRay, uniforms.cylinderAxisZ, outerRadius, false);
  if (!outerHit.hit) {
    return ray; // Shouldn't happen
  }
  
  let eta2 = iorLayer / iorTo;
  let refractedDir2 = refractRay(layerRay.direction, outerHit.normal, eta2);
  
  if (dot(refractedDir2, refractedDir2) < 0.0001) {
    // Total internal reflection
    return ray;
  }
  
  let exitPoint = layerRay.origin + layerRay.direction * outerHit.distance;
  return Ray(exitPoint + normalize(refractedDir2) * epsilon, normalize(refractedDir2));
}

// Main ray tracing function
fn traceRay(ray: Ray) -> vec3f {
  var currentRay = ray;
  let epsilon = 0.001;
  
  // Camera is inside the cylinder, check inner surface first
  let innerHit = intersectInfiniteCylinderX(currentRay, uniforms.cylinderAxisZ, uniforms.cylinderRadius, true);
  
  if (innerHit.hit && !innerHit.isWindow) {
    // Hit the cylinder wall (not in window area)
    let lighting = calculateLighting(innerHit.normal, uniforms.lightDirection);
    return uniforms.cylinderColor * lighting;
  }
  
  if (innerHit.hit && innerHit.isWindow) {
    if (uniforms.useDetailedModel == 1u) {
      // Detailed multi-layer model
      // Start from cabin air at inner radius
      var currentRadius = uniforms.cylinderRadius;
      
      // Layer 1: Scratch pane (cabin air -> PMMA -> air gap)
      let scratchPaneOuter = currentRadius + uniforms.scratchPaneThickness;
      currentRay = refractThroughLayer(currentRay, currentRadius, scratchPaneOuter, 1.0, uniforms.pmmaIOR, 1.0);
      currentRadius = scratchPaneOuter;
      
      // Layer 2: Air gap 2
      let airGap2Outer = currentRadius + uniforms.airGap2Thickness;
      currentRay = refractThroughLayer(currentRay, currentRadius, airGap2Outer, 1.0, 1.0, 1.0);
      currentRadius = airGap2Outer;
      
      // Layer 3: Inner pane (air gap -> PMMA -> air gap)
      let innerPaneOuter = currentRadius + uniforms.innerPaneThickness;
      currentRay = refractThroughLayer(currentRay, currentRadius, innerPaneOuter, 1.0, uniforms.pmmaIOR, 1.0);
      currentRadius = innerPaneOuter;
      
      // Layer 4: Air gap 1
      let airGap1Outer = currentRadius + uniforms.airGap1Thickness;
      currentRay = refractThroughLayer(currentRay, currentRadius, airGap1Outer, 1.0, 1.0, 1.0);
      currentRadius = airGap1Outer;
      
      // Layer 5: Outer pane (air gap -> PMMA -> exterior air)
      let outerPaneOuter = currentRadius + uniforms.outerPaneThickness;
      currentRay = refractThroughLayer(currentRay, currentRadius, outerPaneOuter, 1.0, uniforms.pmmaIOR, 1.0);
      
    } else {
      // Simple single-layer model
      // Ray hits the inner surface of the window glass
      // Refract from air into glass (n1=1.0, n2=IOR)
      let eta1 = 1.0 / uniforms.indexOfRefraction;
      let refractedDir1 = refractRay(currentRay.direction, innerHit.normal, eta1);
      
      if (dot(refractedDir1, refractedDir1) < 0.0001) {
        // Total internal reflection (shouldn't happen air->glass at normal angles)
        return vec3f(0.5, 0.7, 1.0);
      }
      
      // Continue ray through glass
      let entryPoint = currentRay.origin + currentRay.direction * innerHit.distance;
      currentRay = Ray(entryPoint + normalize(refractedDir1) * epsilon, normalize(refractedDir1));
      
      // Find outer surface of window (cylinder at radius + thickness)
      let outerRadius = uniforms.cylinderRadius + uniforms.windowThickness;
      let outerHit = intersectInfiniteCylinderX(currentRay, uniforms.cylinderAxisZ, outerRadius, false);
      
      if (outerHit.hit) {
        // Refract from glass back into air (n1=IOR, n2=1.0)
        let eta2 = uniforms.indexOfRefraction / 1.0;
        let refractedDir2 = refractRay(currentRay.direction, outerHit.normal, eta2);
        
        if (dot(refractedDir2, refractedDir2) < 0.0001) {
          // Total internal reflection at exit
          return vec3f(0.5, 0.7, 1.0);
        }
        
        // Continue ray outside the window
        let exitPoint = currentRay.origin + currentRay.direction * outerHit.distance;
        currentRay = Ray(exitPoint + normalize(refractedDir2) * epsilon, normalize(refractedDir2));
      } else {
        // Shouldn't happen - couldn't find outer surface
        return vec3f(1.0, 0.0, 1.0); // Magenta for debug
      }
    }
  }
  
  // Now check for Earth (sphere or plane) with the (possibly refracted) ray
  if (uniforms.useFlatEarth == 1u) {
    // Flat Earth mode - check plane intersection
    let planeHit = intersectPlane(currentRay, uniforms.planeY);
    
    if (planeHit.hit) {
      let lighting = calculateLighting(planeHit.normal, uniforms.lightDirection);
      let baseColor = vec3f(0.3, 0.5, 0.8); // Blue-ish earth color
      return baseColor * lighting;
    }
  } else {
    // Spherical Earth mode - check sphere intersection
    let sphereHit = intersectSphere(currentRay, uniforms.sphereCenter, uniforms.sphereRadius);
    
    if (sphereHit.hit) {
      let lighting = calculateLighting(sphereHit.normal, uniforms.lightDirection);
      let baseColor = vec3f(0.3, 0.5, 0.8); // Blue-ish earth color
      return baseColor * lighting;
    }
  }
  
  // Sky background
  return vec3f(0.5, 0.7, 1.0);
}
`;

export class AirplaneWindow extends RayRenderer<AirplaneWindowData> {
  private cameraHeight = 10000; // 10 km above surface (typical cruising altitude)
  private sphereRadius = SOLAR_SYSTEM_BODIES.earth.radius; // Earth radius in meters
  private cylinderDistance = 0.2; // Distance from camera to cylinder surface
  private cylinderRadius = 2; // Radius of the cylinder
  private cameraHeightInCylinder = 0; // Height of camera within cylinder (Y offset)
  private windowCenterX = 0; // X position of window center
  private windowCenterY = 0; // Y position of window center
  private windowWidth = 0.25; // Width of the window
  private windowHeight = 0.36; // Height of the window
  private windowThickness = 0.01; // Thickness of the window glass (10mm) - for simple model
  private indexOfRefraction = 1.5; // Glass IOR (typical window glass) - for simple model

  // Detailed multi-layer window model
  private useDetailedModel = false; // Toggle between simple and detailed model
  private outerPaneThickness = 0.01; // 10mm PMMA outer pane
  private airGap1Thickness = 0.005; // 5mm air gap (small gap)
  private innerPaneThickness = 0.005; // 5mm PMMA inner pane
  private airGap2Thickness = 0.005; // 5mm air gap (small gap)
  private scratchPaneThickness = 0.0015; // 1.5mm plastic scratch pane
  private pmmaIOR = 1.49; // PMMA refractive index

  // Earth geometry
  private useFlatEarth = false; // Toggle between sphere and flat plane

  // Scene-specific uniform schema
  protected getSceneUniformSchema() {
    return defineUniformSchema({
      sphereCenter: "vec3f",
      sphereRadius: "f32",
      lightDirection: "vec3f",
      cylinderAxisZ: "f32",
      cylinderAxisY: "f32",
      cylinderRadius: "f32",
      cylinderColor: "vec3f",
      windowCenterX: "f32",
      windowCenterY: "f32",
      windowWidth: "f32",
      windowHeight: "f32",
      windowThickness: "f32",
      indexOfRefraction: "f32",
      useDetailedModel: "u32",
      outerPaneThickness: "f32",
      airGap1Thickness: "f32",
      innerPaneThickness: "f32",
      airGap2Thickness: "f32",
      scratchPaneThickness: "f32",
      pmmaIOR: "f32",
      useFlatEarth: "u32",
      planeY: "f32",
    });
  }

  // Scene-specific shader code
  protected getSceneShaderCode(): string {
    return airplaneWindowShader;
  }

  // Scene-specific settings
  protected getSceneSettings(): SettingDefinition[] {
    return [
      {
        key: "useFlatEarth",
        label: "Use Flat Earth",
        type: "toggle",
        defaultValue: this.useFlatEarth,
        description:
          "Toggle between spherical Earth and infinite horizontal plane",
        group: "Earth",
      },
      {
        key: "cameraHeight",
        label: "Plane Height",
        type: "slider",
        defaultValue: this.cameraHeight,
        min: 1000, // 1 km minimum
        max: 100000, // 100 km maximum
        scale: "logarithmic",
        units: LENGTH_UNITS,
        description: "Height of plane above Earth's surface",
        group: "Plane",
      },
      {
        key: "cylinderDistance",
        label: "Distance to side of plane",
        type: "slider",
        defaultValue: this.cylinderDistance,
        min: 0.01,
        max: 2,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Distance from camera to side of plane",
        group: "Camera Position",
      },
      {
        key: "cylinderRadius",
        label: "Plane radius",
        type: "slider",
        defaultValue: this.cylinderRadius,
        min: 1,
        max: 3,
        scale: "linear",
        units: LENGTH_UNITS,
        description: "Radius of the plane (affects curve of window)",
        group: "Plane",
      },
      {
        key: "cameraHeightInCylinder",
        label: "Camera Height in Plane",
        type: "slider",
        defaultValue: this.cameraHeightInCylinder,
        min: -0.5,
        max: 0.5,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description:
          "Vertical offset of camera within plane (+ = above, - = below window center)",
        group: "Camera Position",
      },
      {
        key: "windowCenterX",
        label: "Window Center X",
        type: "slider",
        defaultValue: this.windowCenterX,
        min: -0.5,
        max: 0.5,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Horizontal position of window center",
        group: "Window Geometry",
      },
      {
        key: "windowCenterY",
        label: "Window Center Y",
        type: "slider",
        defaultValue: this.windowCenterY,
        min: -0.1,
        max: 0.1,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Vertical position of window center",
        group: "Window Geometry",
      },
      {
        key: "windowWidth",
        label: "Window Width",
        type: "slider",
        defaultValue: this.windowWidth,
        min: 0.25,
        max: 0.3,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Width of the rectangular window",
        group: "Window Geometry",
      },
      {
        key: "windowHeight",
        label: "Window Height",
        type: "slider",
        defaultValue: this.windowHeight,
        min: 0.36,
        max: 0.45,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Height of the rectangular window",
        group: "Window Geometry",
      },
      {
        key: "useDetailedModel",
        label: "Use Detailed Model",
        type: "toggle",
        defaultValue: this.useDetailedModel,
        description:
          "Use multi-layer window stack (outer pane, air gaps, inner pane, scratch pane). If not selected, a single-layer model is used.",
        group: "Window Properties",
      },
      {
        key: "windowThickness",
        label: "Window Thickness",
        type: "slider",
        defaultValue: this.windowThickness,
        min: 0.005,
        max: 0.5,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Thickness of the window glass (simple model only)",
        group: "Window Properties",
      },
      {
        key: "indexOfRefraction",
        label: "Index of Refraction",
        type: "slider",
        defaultValue: this.indexOfRefraction,
        min: 1.0,
        max: 2.5,
        scale: "linear",
        units: [{ suffix: "", factor: 1, label: "IOR" }],
        description: "Refractive index of glass (simple model only)",
        group: "Window Properties",
      },
      {
        key: "outerPaneThickness",
        label: "Outer Pane Thickness",
        type: "slider",
        defaultValue: this.outerPaneThickness,
        min: 0.005,
        max: 0.02,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Thickness of outer PMMA pane (detailed model)",
        group: "Detailed Window Properties",
      },
      {
        key: "airGap1Thickness",
        label: "Air Gap 1 Thickness",
        type: "slider",
        defaultValue: this.airGap1Thickness,
        min: 0.001,
        max: 0.015,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Thickness of air gap between outer and inner panes",
        group: "Detailed Window Properties",
      },
      {
        key: "innerPaneThickness",
        label: "Inner Pane Thickness",
        type: "slider",
        defaultValue: this.innerPaneThickness,
        min: 0.003,
        max: 0.015,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Thickness of inner PMMA pane (detailed model)",
        group: "Detailed Window Properties",
      },
      {
        key: "airGap2Thickness",
        label: "Air Gap 2 Thickness",
        type: "slider",
        defaultValue: this.airGap2Thickness,
        min: 0.001,
        max: 0.015,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Thickness of air gap between inner pane and scratch pane",
        group: "Detailed Window Properties",
      },
      {
        key: "scratchPaneThickness",
        label: "Scratch Pane Thickness",
        type: "slider",
        defaultValue: this.scratchPaneThickness,
        min: 0.001,
        max: 0.005,
        scale: "linear",
        units: SMALL_LENGTH_UNITS,
        description: "Thickness of inner scratch-resistant plastic pane",
        group: "Detailed Window Properties",
      },
      {
        key: "pmmaIOR",
        label: "PMMA Index of Refraction",
        type: "slider",
        defaultValue: this.pmmaIOR,
        min: 1.4,
        max: 1.6,
        scale: "linear",
        units: [{ suffix: "", factor: 1, label: "IOR" }],
        description: "Refractive index of PMMA (acrylic) material",
        group: "Detailed Window Properties",
      },
    ];
  }

  // Per-frame scene data
  protected getSceneData(): AirplaneWindowData {
    // Camera is at origin (0, 0, 0) in camera space

    // For spherical Earth: sphere center Y = -(cameraHeight + sphereRadius)
    const sphereY = -(this.cameraHeight + this.sphereRadius);

    // For flat Earth: plane Y = -cameraHeight
    const planeY = -this.cameraHeight;

    const cylinderAxisY = -this.cameraHeightInCylinder;
    const radiusMinusDistance = this.cylinderRadius - this.cylinderDistance;
    const axisZMagnitude = Math.sqrt(
      Math.max(0, radiusMinusDistance ** 2 - cylinderAxisY ** 2)
    );
    const cylinderAxisZ = -axisZMagnitude;

    // Light from top-right
    const lightDirection: [number, number, number] = [0.5, 0.7, 0.5];
    const length = Math.sqrt(
      lightDirection[0] ** 2 + lightDirection[1] ** 2 + lightDirection[2] ** 2
    );
    const normalizedLight: [number, number, number] = [
      lightDirection[0] / length,
      lightDirection[1] / length,
      lightDirection[2] / length,
    ];

    // Cylinder color - light gray/white
    const cylinderColor: [number, number, number] = [0.9, 0.9, 0.9];

    return {
      sphereCenter: [0, sphereY, 0],
      sphereRadius: this.sphereRadius,
      lightDirection: normalizedLight,
      cylinderAxisZ,
      cylinderAxisY,
      cylinderRadius: this.cylinderRadius,
      cylinderColor,
      windowCenterX: this.windowCenterX,
      windowCenterY: this.windowCenterY,
      windowWidth: this.windowWidth,
      windowHeight: this.windowHeight,
      windowThickness: this.windowThickness,
      indexOfRefraction: this.indexOfRefraction,
      useDetailedModel: this.useDetailedModel ? 1 : 0,
      outerPaneThickness: this.outerPaneThickness,
      airGap1Thickness: this.airGap1Thickness,
      innerPaneThickness: this.innerPaneThickness,
      airGap2Thickness: this.airGap2Thickness,
      scratchPaneThickness: this.scratchPaneThickness,
      pmmaIOR: this.pmmaIOR,
      useFlatEarth: this.useFlatEarth ? 1 : 0,
      planeY,
    };
  }
}
