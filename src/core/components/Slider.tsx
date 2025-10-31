import { useState, useEffect } from "react";
import "../styles/Slider.css";
import { clampSceneValue } from "../utils/sliderUtils";

interface SliderProps {
  label?: string;
  value: number; // Always in scene's base units (can be negative for bidirectional)
  min: number; // Always in scene's base units
  max: number; // Always in scene's base units
  step?: number;
  scale?: "linear" | "logarithmic" | "bidirectional-logarithmic"; // Scaling type
  deadzoneWidth?: number; // For bidirectional-logarithmic only, defaults to 0.05 (5%)
  onChange?: (value: number) => void; // Always returns value in scene's base units
  disabled?: boolean;
  className?: string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step, // No default - undefined means continuous
  scale = "linear", // Default to linear
  deadzoneWidth = 0.05, // Default 5% deadzone for bidirectional
  onChange,
  disabled = false,
  className = "",
}: SliderProps) {
  const [currentValue, setCurrentValue] = useState(value);

  // Convert scene value to slider position (0-100)
  const valueToPosition = (sceneValue: number): number => {
    if (scale === "bidirectional-logarithmic") {
      // Bidirectional logarithmic: negative values on left, positive on right, deadzone in center
      const absValue = Math.abs(sceneValue);
      const leftBoundary = 50 - (deadzoneWidth * 100) / 2;
      const rightBoundary = 50 + (deadzoneWidth * 100) / 2;

      if (absValue < min) {
        // In deadzone: map [-min, +min] to [leftBoundary, rightBoundary]
        const t = (sceneValue / min + 1) / 2; // Map to [0, 1]
        return leftBoundary + t * (rightBoundary - leftBoundary);
      } else if (sceneValue < 0) {
        // Left region (negative): map [-max, -min] to [0, leftBoundary]
        if (min <= 0 || max <= 0) {
          // Fallback to linear if invalid
          return ((sceneValue + max) / (max - min)) * leftBoundary;
        }
        const logMin = Math.log(min);
        const logMax = Math.log(max);
        const logValue = Math.log(absValue);
        // t=0 when absValue=max (most negative), t=1 when absValue=min (least negative)
        const t = (logMax - logValue) / (logMax - logMin);
        return t * leftBoundary;
      } else {
        // Right region (positive): map [min, max] to [rightBoundary, 100]
        if (min <= 0 || max <= 0 || sceneValue <= 0) {
          // Fallback to linear if invalid
          return (
            rightBoundary +
            ((sceneValue - min) / (max - min)) * (100 - rightBoundary)
          );
        }
        const logMin = Math.log(min);
        const logMax = Math.log(max);
        const logValue = Math.log(sceneValue);
        const t = (logValue - logMin) / (logMax - logMin);
        return rightBoundary + t * (100 - rightBoundary);
      }
    } else if (scale === "logarithmic") {
      if (min <= 0 || max <= 0 || sceneValue <= 0) {
        // Fallback to linear if invalid values
        return ((sceneValue - min) / (max - min)) * 100;
      }
      const logMin = Math.log(min);
      const logMax = Math.log(max);
      const logValue = Math.log(sceneValue);
      return ((logValue - logMin) / (logMax - logMin)) * 100;
    } else {
      // Linear scaling
      return ((sceneValue - min) / (max - min)) * 100;
    }
  };

  const sliderPosition = valueToPosition(currentValue);

  // Convert slider position (0-100) to scene value
  const positionToValue = (position: number): number => {
    if (scale === "bidirectional-logarithmic") {
      // Bidirectional logarithmic: three regions
      const leftBoundary = 50 - (deadzoneWidth * 100) / 2;
      const rightBoundary = 50 + (deadzoneWidth * 100) / 2;

      if (position < leftBoundary) {
        // Left region: map [0, leftBoundary] to [-max, -min]
        if (min <= 0 || max <= 0) {
          // Fallback to linear
          const t = position / leftBoundary;
          return -max + t * (max - min);
        }
        const logMin = Math.log(min);
        const logMax = Math.log(max);
        const t = position / leftBoundary; // 0 to 1
        // t=0 → -max, t=1 → -min
        const absValue = Math.exp(logMax - t * (logMax - logMin));
        return -absValue;
      } else if (position > rightBoundary) {
        // Right region: map [rightBoundary, 100] to [min, max]
        if (min <= 0 || max <= 0) {
          // Fallback to linear
          const t = (position - rightBoundary) / (100 - rightBoundary);
          return min + t * (max - min);
        }
        const logMin = Math.log(min);
        const logMax = Math.log(max);
        const t = (position - rightBoundary) / (100 - rightBoundary); // 0 to 1
        return Math.exp(logMin + t * (logMax - logMin));
      } else {
        // Center deadzone: linear map [leftBoundary, rightBoundary] to [-min, +min]
        const t = (position - leftBoundary) / (rightBoundary - leftBoundary); // 0 to 1
        return (t - 0.5) * 2 * min;
      }
    } else if (scale === "logarithmic") {
      const normalizedPosition = position / 100; // 0-1 range
      if (min <= 0 || max <= 0) {
        // Fallback to linear if invalid values
        return min + normalizedPosition * (max - min);
      }
      const logMin = Math.log(min);
      const logMax = Math.log(max);
      return Math.exp(logMin + normalizedPosition * (logMax - logMin));
    } else {
      // Linear scaling
      const normalizedPosition = position / 100; // 0-1 range
      return min + normalizedPosition * (max - min);
    }
  };

  // Handle slider change
  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const position = parseFloat(event.target.value);
    let sceneValue = positionToValue(position);

    // Apply step rounding only if step is defined
    if (step !== undefined) {
      if (scale === "bidirectional-logarithmic") {
        // For bidirectional, apply step to absolute value and preserve sign
        const sign = Math.sign(sceneValue);
        const absValue = Math.abs(sceneValue);
        if (absValue >= min) {
          // Only apply step outside deadzone
          sceneValue = sign * Math.round(absValue / step) * step;
        }
      } else {
        sceneValue = Math.round(sceneValue / step) * step;
      }
    }

    // Clamp value - for bidirectional, clamp to [-max, max]
    const clampMin = scale === "bidirectional-logarithmic" ? -max : min;
    const clampedValue = clampSceneValue(sceneValue, clampMin, max);
    setCurrentValue(clampedValue);
    onChange?.(clampedValue);
  };

  // Sync internal state with prop changes
  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  // Calculate step for slider
  const getSliderStep = () => {
    if (scale === "logarithmic" || scale === "bidirectional-logarithmic") {
      // For logarithmic sliders, use a fixed fine step on the 0-100 range
      // The actual value steps will be handled by the logarithmic conversion
      return 0.1; // 0.1% increments on the slider position
    } else {
      // Linear: if step is defined, convert to slider step; otherwise use small continuous step
      if (step !== undefined) {
        return (step / (max - min)) * 100;
      } else {
        // No step defined - allow continuous movement with fine granularity
        return 0.01; // 0.01% increments for smooth continuous control
      }
    }
  };

  return (
    <div
      className={`slider-container ${className} ${disabled ? "disabled" : ""}`}
    >
      <div className="slider-track-container">
        <input
          id={label ? `slider-${label}` : undefined}
          type="range"
          min={0} // Always 0-100 for slider position
          max={100} // Always 0-100 for slider position
          step={getSliderStep()}
          value={sliderPosition}
          onChange={handleSliderChange}
          disabled={disabled}
          className="slider-input"
          style={{
            background: `linear-gradient(to right, #4a9eff 0%, #4a9eff ${sliderPosition}%, rgba(255, 255, 255, 0.1) ${sliderPosition}%, rgba(255, 255, 255, 0.1) 100%)`,
          }}
        />
      </div>
    </div>
  );
}
