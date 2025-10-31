import { ComputeRenderer } from "./computeRenderer";
import type { Scene, SettingDefinition } from "../types/scene";
import type { UniformSchema } from "../utils/uniformSchema";
import { defineUniformSchema } from "../utils/uniformSchema";

export abstract class RayRenderer<
  TSceneData extends Record<string, unknown> = Record<string, unknown>
> implements Scene
{
  protected renderer: ComputeRenderer<CameraData & TSceneData> | undefined;

  // Camera state
  protected cameraYaw = 0; // Horizontal rotation (radians)
  protected cameraPitch = 0; // Vertical rotation (radians)
  protected fov = 60; // Field of view (degrees)
  protected projectionType: "rectilinear" | "fisheye" = "rectilinear";

  // UI options
  protected showCrosshair = true; // Toggle for crosshair display

  // Mouse control state
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  protected mouseSensitivity = 0.003; // Base radians per pixel (at 60° FOV)

  // Setting change callback for UI synchronization
  private settingChangeCallback?: (
    key: string,
    value: number | string | boolean
  ) => void;

  /**
   * Returns the uniform schema for scene-specific uniforms.
   * This will be merged with the camera uniforms.
   */
  protected abstract getSceneUniformSchema(): UniformSchema<TSceneData>;

  /**
   * Returns the WGSL shader code for scene-specific ray tracing.
   * This code should include:
   * - Any helper functions (intersection tests, materials, etc.)
   * - A traceRay() function that takes a Ray and returns the final color
   *
   * The shader will have access to:
   * - uniforms: camera uniforms + scene uniforms
   * - Ray struct with origin and direction
   *
   * Example:
   * ```wgsl
   * fn traceRay(ray: Ray) -> vec3f {
   *   // Your ray tracing logic here
   *   return vec3f(1.0, 0.0, 0.0); // Return final color
   * }
   * ```
   */
  protected abstract getSceneShaderCode(): string;

  /**
   * Returns scene-specific settings to show in the UI.
   * These will be merged with the default camera settings.
   */
  protected abstract getSceneSettings(): SettingDefinition[];

  /**
   * Returns the scene-specific uniform data for the current frame.
   * This will be merged with camera data before being sent to the GPU.
   */
  protected abstract getSceneData(): TSceneData;

  /**
   * Optional: Override to customize workgroup size (default is [8, 8])
   */
  protected getWorkgroupSize(): [number, number] {
    return [8, 8];
  }

  /**
   * Optional: Override to specify number of textures needed (default is 0)
   */
  protected getMaxTextures(): number {
    return 0;
  }

  /**
   * Optional: Called after renderer is initialized. Override for custom setup.
   */
  protected onInitialized(): void {
    // Default: do nothing
  }

  /**
   * Calculate FOV-adjusted mouse sensitivity.
   * At smaller FOVs (zoomed in), sensitivity is reduced proportionally
   * so the same mouse movement produces the same visual rotation.
   *
   * Uses 60° as the reference FOV (sensitivity = 1.0x at 60°).
   */
  private getAdjustedMouseSensitivity(): number {
    const referenceFov = 60; // degrees
    const fovScale = this.fov / referenceFov;
    return this.mouseSensitivity * fovScale;
  }

  // Camera vector calculation

  /**
   * Calculate camera direction vectors from yaw and pitch.
   * Returns an orthonormal basis for the camera coordinate system.
   */
  protected calculateCameraVectors() {
    // Forward vector based on yaw and pitch
    // Yaw = 0 means looking in +Z direction
    // Pitch = 0 means looking horizontally
    const forward = [
      Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch), // X
      Math.sin(this.cameraPitch), // Y
      Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch), // Z
    ] as [number, number, number];

    // Right vector: perpendicular to forward in the horizontal plane
    // This is just rotating the forward direction by 90 degrees around Y-axis
    const right = [
      Math.cos(this.cameraYaw), // X
      0, // Y (always horizontal)
      -Math.sin(this.cameraYaw), // Z
    ] as [number, number, number];

    // Up vector: cross product of forward and right (forward × right)
    // This ensures a proper orthonormal basis in a right-handed coordinate system
    const up = [
      forward[1] * right[2] - forward[2] * right[1],
      forward[2] * right[0] - forward[0] * right[2],
      forward[0] * right[1] - forward[1] * right[0],
    ] as [number, number, number];

    return { forward, right, up };
  }

  // Shader generation

  /**
   * Builds the complete uniform schema by merging camera and scene uniforms.
   */
  private buildUniformSchema() {
    const sceneSchema = this.getSceneUniformSchema();

    return defineUniformSchema({
      // Camera uniforms
      screenResolution: "vec2f",
      cameraRight: "vec3f",
      cameraUp: "vec3f",
      cameraForward: "vec3f",
      fov: "f32",
      projectionType: "u32", // 0=rectilinear, 1=fisheye
      showCrosshair: "u32", // Boolean as u32 (0 or 1)
      // Scene-specific uniforms
      ...sceneSchema.schema,
    });
  }

  /**
   * Generates the complete compute shader by injecting scene-specific code.
   */
  private generateShader(): string {
    const sceneCode = this.getSceneShaderCode();
    const workgroupSize = this.getWorkgroupSize();

    return `
// Generated shader for ${this.constructor.name}
// Camera + Scene Ray Tracing

struct Ray {
  origin: vec3f,
  direction: vec3f,
}

${sceneCode}

// Crosshair overlay
fn drawCrosshair(color: vec3f, screenPos: vec2f, aspectRatio: f32) -> vec3f {
  // Check if crosshair is enabled
  if (uniforms.showCrosshair == 0u) {
    return color;
  }
  
  let crosshairSize = 0.02; // Size of crosshair in normalized coords
  let crosshairThickness = 0.003; // Thickness of crosshair lines
  let crosshairGap = 0.005; // Gap in the center
  
  // Adjust X coordinate by aspect ratio to keep crosshair square
  let adjustedX = screenPos.x * aspectRatio;
  
  let absX = abs(adjustedX);
  let absY = abs(screenPos.y);
  
  // Horizontal line (left and right of center)
  let horizontalLine = absY < crosshairThickness && absX > crosshairGap && absX < crosshairSize;
  
  // Vertical line (top and bottom of center)
  let verticalLine = absX < crosshairThickness && absY > crosshairGap && absY < crosshairSize;
  
  if (horizontalLine || verticalLine) {
    return vec3f(1.0, 1.0, 1.0); // White crosshair
  }
  
  return color; // Return original color
}

@compute @workgroup_size(${workgroupSize[0]}, ${workgroupSize[1]})
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let pixel = vec2i(global_id.xy);
  let resolution = vec2i(uniforms.screenResolution);
  
  if (pixel.x >= resolution.x || pixel.y >= resolution.y) {
    return;
  }
  
  let aspectRatio = uniforms.screenResolution.x / uniforms.screenResolution.y;
  let screenPos = (vec2f(pixel) + 0.5) / uniforms.screenResolution * 2.0 - 1.0;
  
  let forward = normalize(uniforms.cameraForward);
  let right = normalize(uniforms.cameraRight);
  let up = normalize(uniforms.cameraUp);
  
  // Calculate ray direction based on projection type
  var rayDirection: vec3f;
  
  // 0=rectilinear, 1=fisheye
  if (uniforms.projectionType == 0u) {
    // Rectilinear projection (standard perspective)
    let halfFovTangent = tan(uniforms.fov * 0.5);
    let horizontalTangent = screenPos.x * halfFovTangent * aspectRatio;
    let verticalTangent = screenPos.y * halfFovTangent;
    rayDirection = normalize(forward + right * horizontalTangent + up * verticalTangent);
    
  } else {
    // Fisheye projection (equisolid angle)
    let r = length(screenPos * vec2f(aspectRatio, 1.0));
    let theta = r * uniforms.fov * 0.5;
    let phi = atan2(screenPos.y, screenPos.x * aspectRatio);
    let sinTheta = sin(theta);
    rayDirection = normalize(forward * cos(theta) + (right * cos(phi) + up * sin(phi)) * sinTheta);
  }
  
  // Camera is at world origin (0, 0, 0)
  let ray = Ray(vec3f(0.0, 0.0, 0.0), rayDirection);
  
  // Trace the ray using scene-specific logic
  var color = traceRay(ray);
  
  // Apply crosshair overlay
  color = drawCrosshair(color, screenPos, aspectRatio);
  
  textureStore(outputTexture, pixel, vec4f(color, 1.0));
}
`;
  }

  setup(canvas: HTMLCanvasElement): void {
    if (!this.renderer) {
      const shader = this.generateShader();
      const schema = this.buildUniformSchema();

      this.renderer = new ComputeRenderer(canvas, {
        computeShader: shader,
        uniformSchema: schema,
        workgroupSize: this.getWorkgroupSize(),
        maxTextures: this.getMaxTextures(),
      });
    }

    this.renderer.initialize().then(() => {
      this.onInitialized();
    });
  }

  draw(): void {
    if (!this.renderer || !this.renderer.isReady()) {
      return;
    }

    // Get camera vectors based on current orientation
    const cameraVectors = this.calculateCameraVectors();

    // Map projection type to uniform integer
    const projectionTypeMap = {
      rectilinear: 0,
      fisheye: 1,
    };

    // Build camera data
    const cameraData: CameraData = {
      cameraRight: cameraVectors.right,
      cameraUp: cameraVectors.up,
      cameraForward: cameraVectors.forward,
      fov: (this.fov * Math.PI) / 180, // Convert to radians
      projectionType: projectionTypeMap[this.projectionType],
      showCrosshair: this.showCrosshair ? 1 : 0, // Convert boolean to u32
    };

    // Get scene-specific data
    const sceneData = this.getSceneData();

    // Merge and draw
    this.renderer.draw({
      ...cameraData,
      ...sceneData,
    } as CameraData & TSceneData);
  }

  resize(canvas: HTMLCanvasElement): void {
    if (!this.renderer || !this.renderer.isReady()) {
      return;
    }

    this.renderer.resize(canvas.width, canvas.height);
  }

  cleanup(): void {
    this.renderer?.destroy();
    this.renderer = undefined;
  }

  getSettings(): SettingDefinition[] {
    // Default camera settings
    const cameraSettings: SettingDefinition[] = [
      {
        key: "projectionType",
        label: "Projection",
        type: "select",
        defaultValue: this.projectionType,
        options: [
          { label: "Rectilinear (Standard)", value: "rectilinear" },
          { label: "Fisheye (Wide-Angle)", value: "fisheye" },
        ],
        description:
          "Camera projection type: rectilinear (standard perspective lens) or fisheye (wide-angle lens, up to 180°)",
        group: "Camera",
      },
      {
        key: "fov",
        label: "FOV",
        type: "slider",
        defaultValue: this.fov,
        min: 0.1,
        max: 120,
        scale: "logarithmic",
        units: [{ suffix: "°", factor: 1, label: "Degrees" }],
        description: "Camera field of view",
        group: "Camera",
      },
      {
        key: "showCrosshair",
        label: "Show Crosshair",
        type: "toggle",
        defaultValue: this.showCrosshair,
        description: "Display crosshair in the center of the screen",
        group: "Camera",
      },
      {
        key: "mouseSensitivity",
        label: "Mouse Sensitivity",
        type: "slider",
        defaultValue: this.mouseSensitivity,
        min: 0.0001,
        max: 0.01,
        scale: "logarithmic",
        units: [{ suffix: "", factor: 1, label: "Sensitivity" }],
        description:
          "Controls how much the camera rotates when dragging the mouse",
        group: "Camera",
      },
    ];

    // Merge with scene-specific settings
    return [...cameraSettings, ...this.getSceneSettings()];
  }

  updateSetting(key: string, value: number | string | boolean): void {
    if (key in this) {
      // @ts-expect-error - Dynamic property access for settings
      this[key] = value;
    }
  }

  setSettingChangeCallback(
    callback: (key: string, value: number | string | boolean) => void
  ): void {
    this.settingChangeCallback = callback;
  }

  /**
   * Returns scene-specific display info to show in the overlay.
   * Override this method to add custom info, and call super.getSceneDisplayInfo()
   * to include it with the default camera info.
   */
  protected getSceneDisplayInfo(): Record<string, string | number> {
    return {};
  }

  /**
   * Returns display info for the scene overlay.
   * Includes default camera info (altitude, FOV) plus scene-specific info.
   */
  getDisplayInfo(): Record<string, string | number> {
    // Calculate camera altitude (pitch angle)
    const altitudeDeg = (this.cameraPitch * 180) / Math.PI;

    // Get scene-specific info
    const sceneInfo = this.getSceneDisplayInfo();

    // Merge camera info with scene-specific info
    return {
      Altitude: `${altitudeDeg.toFixed(3)}°`,
      FOV: `${this.fov.toFixed(1)}°`,
      ...sceneInfo,
    };
  }

  // Mouse interaction

  onMouseDown(event: MouseEvent): void {
    this.isDragging = true;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;

    // Calculate mouse movement
    const deltaX = event.clientX - this.lastMouseX;
    const deltaY = event.clientY - this.lastMouseY;

    // Get FOV-adjusted sensitivity
    const adjustedSensitivity = this.getAdjustedMouseSensitivity();

    // Update camera angles based on mouse movement
    this.cameraYaw -= deltaX * adjustedSensitivity;
    this.cameraPitch += deltaY * adjustedSensitivity;

    // Clamp pitch to prevent camera flipping
    const maxPitch = Math.PI / 2 - 0.01;
    this.cameraPitch = Math.max(
      -maxPitch,
      Math.min(maxPitch, this.cameraPitch)
    );

    // Update last mouse position
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
  }

  onMouseUp(): void {
    this.isDragging = false;
  }

  onWheel(event: WheelEvent): void {
    // Prevent page scroll
    event.preventDefault();

    // FOV limits (should match the slider settings)
    const minFov = 0.1;
    const maxFov = 120;

    // Apply logarithmic scaling to match the slider behavior
    // Convert current FOV to log space
    const logMin = Math.log(minFov);
    const logMax = Math.log(maxFov);
    const logCurrent = Math.log(this.fov);

    // Calculate normalized position in log space (0-1)
    const normalizedPosition = (logCurrent - logMin) / (logMax - logMin);

    // Adjust position by a small amount based on wheel delta
    // Positive deltaY = scroll down = zoom out (increase FOV, move right)
    // Negative deltaY = scroll up = zoom in (decrease FOV, move left)
    const positionChange = event.deltaY * 0.001; // Smaller multiplier for smoother control
    const newNormalizedPosition = Math.max(
      0,
      Math.min(1, normalizedPosition + positionChange)
    );

    // Convert back from log space to linear FOV value
    const newFov = Math.exp(logMin + newNormalizedPosition * (logMax - logMin));

    // Clamp to ensure we stay in bounds
    const clampedFov = Math.max(minFov, Math.min(maxFov, newFov));

    // Only update if value actually changed (with small epsilon for floating point)
    if (Math.abs(clampedFov - this.fov) > 0.01) {
      this.fov = clampedFov;

      // Notify UI of the change
      this.settingChangeCallback?.("fov", this.fov);
    }
  }
}

// Type definition for camera uniform data
interface CameraData {
  cameraRight: [number, number, number];
  cameraUp: [number, number, number];
  cameraForward: [number, number, number];
  fov: number;
  projectionType: number; // 0=rectilinear, 1=fisheye
  showCrosshair: number; // 0 or 1 (boolean as u32)
}
