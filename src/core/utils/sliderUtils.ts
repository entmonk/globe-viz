import type { UnitDefinition } from "../types/scene";

export interface SliderUtilsConfig {
  units: UnitDefinition[];
  selectedUnitIndex: number;
  step?: number;
  scale?: "linear" | "logarithmic" | "bidirectional-logarithmic";
  min?: number; // Needed for logarithmic and bidirectional calculations
  max?: number; // Needed for logarithmic and bidirectional calculations
}

/**
 * Convert from scene units to display units
 */
export function toDisplayValue(
  sceneValue: number,
  config: SliderUtilsConfig
): number {
  const currentUnit = config.units[config.selectedUnitIndex] || config.units[0];
  return sceneValue / currentUnit.factor;
}

/**
 * Convert from display units to scene units
 */
export function toSceneValue(
  displayValue: number,
  config: SliderUtilsConfig
): number {
  const currentUnit = config.units[config.selectedUnitIndex] || config.units[0];
  return displayValue * currentUnit.factor;
}

/**
 * Format display value with smart decimal handling
 * Uses significant digits approach and respects step constraints
 */
export function formatDisplayValue(
  displayValue: number,
  config: SliderUtilsConfig
): string {
  const currentUnit = config.units[config.selectedUnitIndex] || config.units[0];
  const step = config.step;

  // For bidirectional logarithmic, add sign prefix
  let prefix = "";
  if (config.scale === "bidirectional-logarithmic") {
    const absValue = Math.abs(displayValue);
    const minValue = config.min ? config.min / currentUnit.factor : 0;

    // Show sign if outside deadzone
    if (absValue >= minValue) {
      prefix = displayValue < 0 ? "-" : "+";
    }
  }

  // Work with absolute value for formatting
  const absDisplayValue = Math.abs(displayValue);

  // If step is defined, respect step precision
  if (step !== undefined) {
    const displayStep = step / currentUnit.factor;
    const decimalPlaces =
      displayStep < 1 ? Math.max(0, -Math.floor(Math.log10(displayStep))) : 0;
    return prefix + absDisplayValue.toFixed(decimalPlaces);
  }

  // No step defined - use smart formatting based on value magnitude
  return prefix + formatWithSignificantDigits(absDisplayValue, config.scale);
}

/**
 * Format number with consistent significant digits, adjusting for logarithmic scale
 */
function formatWithSignificantDigits(
  value: number,
  scale: "linear" | "logarithmic" | "bidirectional-logarithmic" = "linear"
): string {
  const absValue = Math.abs(value);

  if (absValue === 0) return "0";

  // For logarithmic scales (including bidirectional), we want more precision at smaller values
  if (scale === "logarithmic" || scale === "bidirectional-logarithmic") {
    if (absValue >= 1000) return value.toFixed(0);
    if (absValue >= 100) return value.toFixed(1);
    if (absValue >= 10) return value.toFixed(2);
    if (absValue >= 1) return value.toFixed(3);
    return value.toFixed(4);
  }

  // Linear scale - standard significant digits approach
  if (absValue >= 1000) return value.toFixed(0);
  if (absValue >= 100) return value.toFixed(1);
  if (absValue >= 10) return value.toFixed(2);
  if (absValue >= 1) return value.toFixed(3);
  if (absValue >= 0.1) return value.toFixed(4);
  if (absValue >= 0.01) return value.toFixed(5);
  return value.toFixed(6);
}

/**
 * Get the current unit definition
 */
export function getCurrentUnit(config: SliderUtilsConfig): UnitDefinition {
  return config.units[config.selectedUnitIndex] || config.units[0];
}

/**
 * Clamp value to bounds (in scene units)
 */
export function clampSceneValue(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get display range values (min, max, step) converted from scene units
 */
export function getDisplayRange(
  sceneMin: number,
  sceneMax: number,
  sceneStep: number,
  config: SliderUtilsConfig
) {
  const currentUnit = getCurrentUnit(config);
  return {
    min: sceneMin / currentUnit.factor,
    max: sceneMax / currentUnit.factor,
    step: sceneStep / currentUnit.factor,
  };
}
