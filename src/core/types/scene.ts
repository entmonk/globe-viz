interface BaseSettingDefinition {
  key: string;
  label: string;
  description?: string;
  group?: string;
}

export interface UnitDefinition {
  suffix: string;
  factor: number;
  label: string;
}

interface SliderSettingDefinition extends BaseSettingDefinition {
  type: "slider";
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  units: UnitDefinition[];
  scale?: "linear" | "logarithmic" | "bidirectional-logarithmic";
  deadzoneWidth?: number; // For bidirectional-logarithmic only, defaults to 0.05 (5% of slider range)
}

interface SelectSettingDefinition extends BaseSettingDefinition {
  type: "select";
  defaultValue: string | number;
  options: Array<{ label: string; value: string | number }>;
}

interface ToggleSettingDefinition extends BaseSettingDefinition {
  type: "toggle";
  defaultValue: boolean;
}

interface ColorSettingDefinition extends BaseSettingDefinition {
  type: "color";
  defaultValue: string;
}

export type SettingDefinition =
  | SliderSettingDefinition
  | SelectSettingDefinition
  | ToggleSettingDefinition
  | ColorSettingDefinition;

export interface SceneMetadata {
  /** Unique identifier for the scene (used in URL) */
  id: string;
  /** Display name for the scene */
  name: string;
  /** Brief description of what the scene demonstrates */
  description: string;
}

export interface Scene {
  /**
   * Called once when the scene is initialized
   * Use this for setting up initial state, loading assets, etc.
   */
  setup(canvas: HTMLCanvasElement): void;

  /**
   * Called every frame - this is where the drawing happens
   * @param deltaTime - Time elapsed since last frame in milliseconds
   * @param totalTime - Total time elapsed since scene started in milliseconds
   */
  draw({
    deltaTime,
    totalTime,
  }: {
    deltaTime: number;
    totalTime: number;
  }): void;

  /**
   * Called when the canvas is resized
   * Use this to recalculate positions or reinitialize size-dependent state
   * @param canvas - The canvas element
   */
  resize?(canvas: HTMLCanvasElement): void;

  /**
   * Called when the scene is being destroyed
   * Use this for cleanup (removing event listeners, clearing intervals, etc.)
   */
  cleanup?(): void;

  /**
   * Returns an array of setting definitions that this scene supports
   * These will be automatically rendered in the settings panel
   */
  getSettings?(): SettingDefinition[];

  /**
   * Called when a setting value is changed from the UI
   * @param key - The setting key that was changed
   * @param value - The new value for the setting
   */
  updateSetting?(key: string, value: number | string | boolean): void;

  /**
   * Called when the mouse button is pressed down on the canvas
   * @param event - The mouse event
   * @param canvas - The canvas element
   */
  onMouseDown?(event: MouseEvent, canvas: HTMLCanvasElement): void;

  /**
   * Called when the mouse moves over the canvas
   * @param event - The mouse event
   */
  onMouseMove?(event: MouseEvent): void;

  /**
   * Called when the mouse button is released on the canvas
   * @param event - The mouse event
   */
  onMouseUp?(event: MouseEvent): void;

  /**
   * Called when the mouse wheel is scrolled over the canvas
   * @param event - The wheel event
   */
  onWheel?(event: WheelEvent): void;

  /**
   * Sets a callback to be notified when the scene internally changes a setting value
   * This allows UI to stay in sync with scene-driven changes (e.g., mouse wheel FOV)
   * @param callback - Function called with (key, value) when a setting changes
   */
  setSettingChangeCallback?(
    callback: (key: string, value: number | string | boolean) => void
  ): void;

  /**
   * Returns display information to show in the UI overlay
   * Called periodically (not every frame) to update stats/debug info
   * @returns Either a simple string or key-value pairs to display
   */
  getDisplayInfo?(): Record<string, string | number> | string;
}
