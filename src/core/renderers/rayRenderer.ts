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

  // Camera parameterization mode and intrinsics (advanced)
  // cameraParamMode: "fov" uses legacy FOV-based ray generation
  // cameraParamMode: "advanced" uses physical camera intrinsics
  protected useAdvancedCamera = false;
  protected focalLengthMm = 35; // Real camera focal length (mm)
  protected sensorWidthMm = 36; // Sensor width (mm), default Full Frame
  protected sensorHeightMm = 24; // Sensor height (mm), default Full Frame
  // Principal point as normalized coordinates [0,1] across the render target
  protected principalPointX = 0.5;
  protected principalPointY = 0.5;

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
   * Optional: Override to customize the update logic.
   * This will be called every frame before the renderer is drawn.
   * @param deltaTime - Time elapsed since last frame in milliseconds
   * @param totalTime - Total time elapsed since scene started in milliseconds
   */
  protected update(_timing: { deltaTime: number; totalTime: number }): void {
    void _timing;
    return;
  }

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
   * Uses 60° horizontal FOV as the reference.
   */
  private getAdjustedMouseSensitivity(): number {
    const referenceHFov = 60; // degrees (horizontal)
    const effectiveHFovDeg = this.getEffectiveHorizontalFovDegrees();
    const fovScale = effectiveHFovDeg / referenceHFov;
    return this.mouseSensitivity * fovScale;
  }

  /**
   * Compute effective horizontal FOV in degrees based on current camera mode.
   * - Simple mode: use the configured horizontal FOV directly
   * - Advanced mode: derive from focal length and sensor width
   */
  private getEffectiveHorizontalFovDegrees(): number {
    if (this.useAdvancedCamera) {
      const focal = this.focalLengthMm;
      const sensorW = this.sensorWidthMm;
      if (focal > 0 && sensorW > 0) {
        const hfovRad = 2 * Math.atan(sensorW / 2 / focal);
        return (hfovRad * 180) / Math.PI;
      }
    }
    return this.fov;
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
      cameraParamMode: "u32", // 0=FOV, 1=Advanced intrinsics
      focalLengthMm: "f32",
      sensorWidthMm: "f32",
      sensorHeightMm: "f32",
      principalPointX: "f32", // normalized [0,1]
      principalPointY: "f32", // normalized [0,1]
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

// Crosshair overlay (only draw within active viewport)
fn drawCrosshair(color: vec3f, screenPos: vec2f, aspectRatio: f32, inViewport: bool) -> vec3f {
  // Skip crosshair if outside viewport
  if (!inViewport) {
    return color;
  }
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
  var inViewport: bool = true;
  
  // Branch on camera parameterization mode
  if (uniforms.cameraParamMode == 0u) {
    // Simple FOV-based mode (legacy behavior)
    // 0=rectilinear, 1=fisheye
    if (uniforms.projectionType == 0u) {
      // Rectilinear projection (standard perspective)
      // Interpret uniforms.fov as HORIZONTAL FOV
      let tanHalfH = tan(uniforms.fov * 0.5);
      let horizontalTangent = screenPos.x * tanHalfH;
      let verticalTangent = screenPos.y * tanHalfH / aspectRatio;
      rayDirection = normalize(forward + right * horizontalTangent + up * verticalTangent);
      
    } else {
      // Fisheye projection (equisolid angle)
      // Interpret uniforms.fov as HORIZONTAL FOV - scale Y by 1/aspect in radius
      let r = length(screenPos * vec2f(1.0, 1.0 / aspectRatio));
      let theta = r * uniforms.fov * 0.5;
      let phi = atan2(screenPos.y, screenPos.x * aspectRatio);
      let sinTheta = sin(theta);
      rayDirection = normalize(forward * cos(theta) + (right * cos(phi) + up * sin(phi)) * sinTheta);
    }
  } else {
    // Advanced intrinsics-based mode
    // Compute pixel-center coordinates
    let px = f32(pixel.x) + 0.5;
    let py = f32(pixel.y) + 0.5;

    // Compute active viewport for FIT behavior (letterbox/pillarbox to match sensor aspect)
    let canvasW = uniforms.screenResolution.x;
    let canvasH = uniforms.screenResolution.y;
    let eps = 1e-6;
    let sensorAspect = uniforms.sensorWidthMm / max(uniforms.sensorHeightMm, eps);

    var viewW = 0.0;
    var viewH = 0.0;
    var viewX = 0.0;
    var viewY = 0.0;
    if (aspectRatio > sensorAspect) {
      // Canvas wider than sensor: pillarbox
      viewH = canvasH;
      viewW = canvasH * sensorAspect;
      viewX = (canvasW - viewW) * 0.5;
      viewY = 0.0;
    } else {
      // Canvas taller than sensor: letterbox
      viewW = canvasW;
      viewH = canvasW / sensorAspect;
      viewX = 0.0;
      viewY = (canvasH - viewH) * 0.5;
    }

    // Determine if current pixel is inside the active viewport
    inViewport = (px >= viewX) && (px < viewX + viewW) && (py >= viewY) && (py < viewY + viewH);

    // Compute fx, fy in pixels for the active viewport and principal point in pixels
    let fx = viewW * uniforms.focalLengthMm / max(uniforms.sensorWidthMm, eps);
    let fy = viewH * uniforms.focalLengthMm / max(uniforms.sensorHeightMm, eps);
    let cx = viewX + viewW * uniforms.principalPointX;
    let cy = viewY + viewH * uniforms.principalPointY;
    // Normalized image coordinates within viewport
    let xn = (px - cx) / max(fx, eps);
    let yn = (py - cy) / max(fy, eps);

    if (uniforms.projectionType == 0u) {
      // Rectilinear pinhole: ray through [xn, yn, 1]
      rayDirection = normalize(forward + right * xn + up * yn);
    } else {
      // Fisheye (equisolid default) using intrinsics; use f = (fx+fy)/2
      let f = max(0.5 * (fx + fy), eps);
      let dx = px - cx;
      let dy = py - cy;
      let r = length(vec2f(dx, dy));
      // Equisolid: r = 2 f sin(theta/2)  => theta = 2 * asin(r/(2f))
      let theta = 2.0 * asin(min(1.0, r / max(2.0 * f, eps)));
      let phi = atan2(dy, dx);
      let sinTheta = sin(theta);
      // Build direction from spherical angles in camera basis
      let dirCam = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cos(theta));
      rayDirection = normalize(forward * dirCam.z + right * dirCam.x + up * dirCam.y);
    }
  }
  
  // Camera is at world origin (0, 0, 0)
  let ray = Ray(vec3f(0.0, 0.0, 0.0), rayDirection);
  
  // Trace the ray using scene-specific logic
  var color = traceRay(ray);
  // If using Advanced intrinsics and outside viewport, draw black bars
  if (uniforms.cameraParamMode == 1u && !inViewport) {
    color = vec3f(0.0, 0.0, 0.0);
  }
  
  // Apply crosshair overlay (only within viewport)
  color = drawCrosshair(color, screenPos, aspectRatio, inViewport);
  
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

  draw({
    deltaTime,
    totalTime,
  }: {
    deltaTime: number;
    totalTime: number;
  }): void {
    if (!this.renderer || !this.renderer.isReady()) {
      return;
    }

    this.update({ deltaTime, totalTime });

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
      cameraParamMode: this.useAdvancedCamera ? 1 : 0,
      focalLengthMm: this.focalLengthMm,
      sensorWidthMm: this.sensorWidthMm,
      sensorHeightMm: this.sensorHeightMm,
      principalPointX: this.principalPointX,
      principalPointY: this.principalPointY,
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
        label: "Horizontal FOV",
        type: "slider",
        defaultValue: this.fov,
        min: 0.1,
        max: 170,
        scale: "logarithmic",
        units: [{ suffix: "°", factor: 1, label: "Degrees" }],
        description: "Horizontal camera field of view",
        group: "Camera",
      },
      {
        key: "useAdvancedCamera",
        label: "Use Advanced Camera",
        type: "toggle",
        defaultValue: this.useAdvancedCamera,
        description: "Use advanced camera mode with real camera intrinsics",
        group: "Advanced Camera",
      },
      {
        key: "focalLengthMm",
        label: "Focal Length",
        type: "slider",
        defaultValue: this.focalLengthMm,
        min: 1,
        max: 4000,
        scale: "logarithmic",
        units: [{ suffix: " mm", factor: 1, label: "Millimeters" }],
        description: "Lens focal length (mm)",
        group: "Advanced Camera",
      },
      {
        key: "sensorWidthMm",
        label: "Sensor Width",
        type: "slider",
        defaultValue: this.sensorWidthMm,
        min: 4,
        max: 50,
        scale: "linear",
        units: [{ suffix: " mm", factor: 1, label: "Millimeters" }],
        description: "Sensor width (mm)",
        group: "Advanced Camera",
      },
      {
        key: "sensorHeightMm",
        label: "Sensor Height",
        type: "slider",
        defaultValue: this.sensorHeightMm,
        min: 3,
        max: 40,
        scale: "linear",
        units: [{ suffix: " mm", factor: 1, label: "Millimeters" }],
        description: "Sensor height (mm)",
        group: "Advanced Camera",
      },
      {
        key: "principalPointX",
        label: "Principal Point X",
        type: "slider",
        defaultValue: this.principalPointX,
        min: 0,
        max: 1,
        step: 0.001,
        scale: "linear",
        units: [{ suffix: "", factor: 1, label: "Normalized" }],
        description: "Principal point X as a fraction of width (0-1)",
        group: "Advanced Camera",
      },
      {
        key: "principalPointY",
        label: "Principal Point Y",
        type: "slider",
        defaultValue: this.principalPointY,
        min: 0,
        max: 1,
        step: 0.001,
        scale: "linear",
        units: [{ suffix: "", factor: 1, label: "Normalized" }],
        description: "Principal point Y as a fraction of height (0-1)",
        group: "Advanced Camera",
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
      "Horizontal FOV": `${this.getEffectiveHorizontalFovDegrees().toFixed(
        2
      )}°`,
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

    const positionChange = event.deltaY * 0.001;

    if (this.useAdvancedCamera) {
      const minFocal = 1; // mm (should match slider)
      const maxFocal = 4000; // mm (should match slider)

      const logMinF = Math.log(minFocal);
      const logMaxF = Math.log(maxFocal);
      const logCurrentF = Math.log(
        Math.max(minFocal, Math.min(maxFocal, this.focalLengthMm))
      );

      const normalizedPosF = (logCurrentF - logMinF) / (logMaxF - logMinF);
      const newNormalizedPosF = Math.max(
        0,
        Math.min(1, normalizedPosF - positionChange)
      );

      const newFocal = Math.exp(
        logMinF + newNormalizedPosF * (logMaxF - logMinF)
      );
      const clampedFocal = Math.max(minFocal, Math.min(maxFocal, newFocal));

      if (Math.abs(clampedFocal - this.focalLengthMm) > 0.00001) {
        this.focalLengthMm = clampedFocal;
        this.settingChangeCallback?.("focalLengthMm", this.focalLengthMm);
      }
    } else {
      const minFov = 0.1; // should match slider
      const maxFov = 170; // should match slider

      const logMin = Math.log(minFov);
      const logMax = Math.log(maxFov);
      const logCurrent = Math.log(this.fov);

      const normalizedPosition = (logCurrent - logMin) / (logMax - logMin);
      // Positive deltaY = scroll down = zoom out (increase FOV)
      const newNormalizedPosition = Math.max(
        0,
        Math.min(1, normalizedPosition + positionChange)
      );

      const newFov = Math.exp(
        logMin + newNormalizedPosition * (logMax - logMin)
      );
      const clampedFov = Math.max(minFov, Math.min(maxFov, newFov));

      if (Math.abs(clampedFov - this.fov) > 0.00001) {
        this.fov = clampedFov;
        this.settingChangeCallback?.("fov", this.fov);
      }
    }
  }
}

// Type definition for camera uniform data
interface CameraData {
  cameraRight: [number, number, number];
  cameraUp: [number, number, number];
  cameraForward: [number, number, number];
  fov: number;
  cameraParamMode: number; // 0=FOV, 1=Advanced intrinsics
  focalLengthMm: number;
  sensorWidthMm: number;
  sensorHeightMm: number;
  principalPointX: number;
  principalPointY: number;
  projectionType: number; // 0=rectilinear, 1=fisheye
  showCrosshair: number; // 0 or 1 (boolean as u32)
}
