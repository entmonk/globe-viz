import type { SettingDefinition } from "../types/scene";

/**
 * Format a number for URL display, removing floating point errors
 * Uses the unit's precision if available, otherwise uses significant figures
 */
function formatNumberForUrl(value: number, setting: SettingDefinition): string {
  // For slider settings, try to determine appropriate precision
  if (setting.type === "slider") {
    // If there's a step defined, use its precision
    if (setting.step !== undefined && setting.step > 0) {
      const stepStr = setting.step.toString();
      const decimalIndex = stepStr.indexOf(".");

      if (decimalIndex === -1) {
        // Step is an integer, so round to integer
        return Math.round(value).toString();
      } else {
        // Step has decimals, match its precision
        const decimals = stepStr.length - decimalIndex - 1;
        return value.toFixed(decimals);
      }
    }

    // If units are defined, use the smallest unit's factor to determine precision
    if (setting.units && setting.units.length > 0) {
      // Find the unit with the smallest factor (most precise)
      const smallestFactor = Math.min(...setting.units.map((u) => u.factor));

      // Determine decimals needed based on the smallest factor
      if (smallestFactor >= 1) {
        // For factors >= 1, use 2 decimal places
        return value.toFixed(2);
      } else {
        // For factors < 1, determine precision from the factor
        const decimals = Math.ceil(-Math.log10(smallestFactor)) + 1;
        return value.toFixed(Math.min(decimals, 6)); // Cap at 6 decimals
      }
    }

    // Fallback: use 4 significant figures
    // This handles cases without step or units
    const absValue = Math.abs(value);
    if (absValue === 0) return "0";

    const magnitude = Math.floor(Math.log10(absValue));
    const decimals = Math.max(0, 3 - magnitude);
    return value.toFixed(decimals);
  }

  // For non-slider types, just convert to string
  return value.toString();
}

/**
 * Parse query parameters from URL and convert to typed setting values
 */
export function parseSettingsFromUrl(
  settingDefinitions: SettingDefinition[]
): Record<string, number | string | boolean> {
  const params = new URLSearchParams(window.location.search);
  const settings: Record<string, number | string | boolean> = {};

  settingDefinitions.forEach((setting) => {
    const paramValue = params.get(setting.key);
    if (paramValue === null) return;

    switch (setting.type) {
      case "slider": {
        const numValue = parseFloat(paramValue);
        if (!isNaN(numValue)) {
          // Clamp to min/max (for bidirectional-logarithmic, allow negative values)
          const clampMin =
            setting.scale === "bidirectional-logarithmic"
              ? -setting.max
              : setting.min;
          const clampedValue = Math.max(
            clampMin,
            Math.min(setting.max, numValue)
          );
          settings[setting.key] = clampedValue;
        }
        break;
      }
      case "select": {
        // Validate that the value exists in options
        const isValid = setting.options.some(
          (opt) => String(opt.value) === paramValue
        );
        if (isValid) {
          // Convert to number if the first option value is a number
          const isNumeric = typeof setting.options[0].value === "number";
          settings[setting.key] = isNumeric
            ? parseFloat(paramValue)
            : paramValue;
        }
        break;
      }
      case "toggle": {
        // Accept "true", "1", "yes" as true; everything else as false
        settings[setting.key] =
          paramValue === "true" || paramValue === "1" || paramValue === "yes";
        break;
      }
      case "color": {
        // Basic validation for color hex codes
        if (/^#[0-9A-Fa-f]{6}$/.test(paramValue)) {
          settings[setting.key] = paramValue;
        }
        break;
      }
    }
  });

  return settings;
}

/**
 * Serialize current settings to URL query parameters
 * Only includes settings that differ from their default values
 */
export function serializeSettingsToUrl(
  settings: Record<string, number | string | boolean>,
  settingDefinitions: SettingDefinition[]
): string {
  const params = new URLSearchParams();

  // Create maps for quick lookup
  const defaults = new Map<string, number | string | boolean>();
  const settingsMap = new Map<string, SettingDefinition>();

  settingDefinitions.forEach((setting) => {
    defaults.set(setting.key, setting.defaultValue);
    settingsMap.set(setting.key, setting);
  });

  // Only add settings that differ from defaults
  Object.entries(settings).forEach(([key, value]) => {
    const defaultValue = defaults.get(key);
    if (defaultValue !== value) {
      const setting = settingsMap.get(key);

      // Format numbers intelligently based on setting type
      let formattedValue: string;
      if (typeof value === "number" && setting) {
        formattedValue = formatNumberForUrl(value, setting);
      } else {
        formattedValue = String(value);
      }

      params.set(key, formattedValue);
    }
  });

  return params.toString();
}

/**
 * Update the URL with current settings without reloading the page
 * Only includes settings that differ from their default values
 */
export function updateUrlWithSettings(
  settings: Record<string, number | string | boolean>,
  settingDefinitions: SettingDefinition[],
  replace: boolean = true
): void {
  const queryString = serializeSettingsToUrl(settings, settingDefinitions);
  const newUrl = queryString
    ? `${window.location.pathname}?${queryString}`
    : window.location.pathname;

  if (replace) {
    window.history.replaceState({}, "", newUrl);
  } else {
    window.history.pushState({}, "", newUrl);
  }
}
