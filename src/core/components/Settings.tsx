import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Slider } from "./Slider";
import { Select } from "./Select";
import { Toggle } from "./Toggle";
import { SettingWrapper } from "./SettingWrapper";
import type { Scene, SettingDefinition } from "../types/scene";
import {
  toDisplayValue,
  toSceneValue,
  formatDisplayValue,
  getCurrentUnit,
  clampSceneValue,
  type SliderUtilsConfig,
} from "../utils/sliderUtils";
import { updateUrlWithSettings } from "../utils/urlParams";
import "../styles/Settings.css";

interface SettingsProps {
  scene: Scene;
  sceneId: string;
  className?: string;
  initialSettings?: Record<string, number | string | boolean>;
}

export function Settings({
  scene,
  sceneId,
  className = "",
  initialSettings,
}: SettingsProps) {
  const [settingsValues, setSettingsValues] = useState<
    Record<string, number | string | boolean>
  >({});
  const [selectedUnits, setSelectedUnits] = useState<Record<string, number>>(
    {}
  );
  const [editingSlider, setEditingSlider] = useState<string | null>(null);
  const [sliderInputValue, setSliderInputValue] = useState("");
  const sliderInputRef = useRef<HTMLInputElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  );

  const urlUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settingDefinitions = useMemo(
    () => scene.getSettings?.() || [],
    [scene]
  );

  const groupedSettings = useMemo(() => {
    const groups: Record<string, SettingDefinition[]> = {};
    const DEFAULT_GROUP = "General";

    settingDefinitions.forEach((setting) => {
      const groupName = setting.group || DEFAULT_GROUP;
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(setting);
    });

    return groups;
  }, [settingDefinitions]);

  const debouncedUrlUpdate = useCallback(
    (settings: Record<string, number | string | boolean>) => {
      if (urlUpdateTimerRef.current) {
        clearTimeout(urlUpdateTimerRef.current);
      }

      urlUpdateTimerRef.current = setTimeout(() => {
        updateUrlWithSettings(settings, settingDefinitions);
      }, 500);
    },
    [settingDefinitions]
  );

  useEffect(() => {
    const initialExpanded: Record<string, boolean> = {};
    Object.keys(groupedSettings).forEach((groupName) => {
      initialExpanded[groupName] = false;
    });
    setExpandedGroups(initialExpanded);
  }, [groupedSettings]);

  useEffect(() => {
    const initialValues: Record<string, number | string | boolean> = {};
    const initialUnits: Record<string, number> = {};

    settingDefinitions.forEach((setting) => {
      initialValues[setting.key] =
        initialSettings?.[setting.key] ?? setting.defaultValue;

      if (setting.type === "slider" && setting.units) {
        initialUnits[setting.key] = 0; // Default to first unit
      }
    });

    setSettingsValues(initialValues);
    setSelectedUnits(initialUnits);

    // Apply initial settings to the scene
    Object.entries(initialValues).forEach(([key, value]) => {
      scene.updateSetting?.(key, value);
    });

    scene.setSettingChangeCallback?.((key, value) => {
      setSettingsValues((prev) => {
        if (prev[key] !== value) {
          const newSettings = { ...prev, [key]: value };
          debouncedUrlUpdate(newSettings);
          return newSettings;
        }
        return prev;
      });
    });

    return () => {
      scene.setSettingChangeCallback?.(
        undefined as unknown as (
          key: string,
          value: number | string | boolean
        ) => void
      );
    };
  }, [settingDefinitions, initialSettings, scene, debouncedUrlUpdate]);

  useEffect(() => {
    return () => {
      if (urlUpdateTimerRef.current) {
        clearTimeout(urlUpdateTimerRef.current);
      }
    };
  }, []);

  const handleSettingChange = (
    key: string,
    value: number | string | boolean
  ) => {
    const newSettings = { ...settingsValues, [key]: value };
    setSettingsValues(newSettings);
    scene.updateSetting?.(key, value);

    debouncedUrlUpdate(newSettings);
  };

  const handleUnitChange = (key: string, unitIndex: number) => {
    setSelectedUnits((prev) => ({ ...prev, [key]: unitIndex }));
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const startSliderEdit = (
    key: string,
    currentValue: number,
    setting: SettingDefinition
  ) => {
    if (setting.type !== "slider") return;

    const config: SliderUtilsConfig = {
      units: setting.units,
      selectedUnitIndex: selectedUnits[key] || 0,
      step: setting.step,
      scale: setting.scale,
      min: setting.min,
      max: setting.max,
    };

    const displayValue = toDisplayValue(currentValue, config);
    const formattedValue = formatDisplayValue(displayValue, config);

    setSliderInputValue(formattedValue);
    setEditingSlider(key);
  };

  const confirmSliderEdit = (setting: SettingDefinition) => {
    if (setting.type !== "slider") return;

    const numericValue = parseFloat(sliderInputValue);
    if (!isNaN(numericValue)) {
      const config: SliderUtilsConfig = {
        units: setting.units,
        selectedUnitIndex: selectedUnits[setting.key] || 0,
        step: setting.step,
        scale: setting.scale,
        min: setting.min,
        max: setting.max,
      };

      let sceneValue = toSceneValue(numericValue, config);

      if (setting.step !== undefined) {
        sceneValue = Math.round(sceneValue / setting.step) * setting.step;
      }

      const clampedValue = clampSceneValue(
        sceneValue,
        setting.min,
        setting.max
      );
      handleSettingChange(setting.key, clampedValue);
    }
    setEditingSlider(null);
    setSliderInputValue("");
  };

  const cancelSliderEdit = () => {
    setEditingSlider(null);
    setSliderInputValue("");
  };

  const handleResetSettings = () => {
    const defaultValues: Record<string, number | string | boolean> = {};

    settingDefinitions.forEach((setting) => {
      defaultValues[setting.key] = setting.defaultValue;
    });

    setSettingsValues(defaultValues);

    // Reset all units to first option
    const defaultUnits: Record<string, number> = {};
    settingDefinitions.forEach((setting) => {
      if (setting.type === "slider" && setting.units) {
        defaultUnits[setting.key] = 0;
      }
    });
    setSelectedUnits(defaultUnits);

    // Apply default settings to the scene
    Object.entries(defaultValues).forEach(([key, value]) => {
      scene.updateSetting?.(key, value);
    });

    // Update URL with default settings
    debouncedUrlUpdate(defaultValues);
  };

  const handleResetGroup = (groupName: string) => {
    // Get settings for this specific group
    const groupSettings = groupedSettings[groupName];
    if (!groupSettings) return;

    const updatedValues = { ...settingsValues };
    const updatedUnits = { ...selectedUnits };

    // Reset only the settings in this group
    groupSettings.forEach((setting) => {
      updatedValues[setting.key] = setting.defaultValue;

      // Reset unit selection for sliders
      if (setting.type === "slider" && setting.units) {
        updatedUnits[setting.key] = 0;
      }
    });

    setSettingsValues(updatedValues);
    setSelectedUnits(updatedUnits);

    // Apply default settings to the scene for this group
    groupSettings.forEach((setting) => {
      scene.updateSetting?.(setting.key, setting.defaultValue);
    });

    // Update URL with new settings
    debouncedUrlUpdate(updatedValues);
  };

  const handleSliderInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setSliderInputValue(event.target.value);
  };

  const handleSliderInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    setting: SettingDefinition
  ) => {
    if (event.key === "Enter") {
      confirmSliderEdit(setting);
    } else if (event.key === "Escape") {
      cancelSliderEdit();
    }
  };

  useEffect(() => {
    if (editingSlider && sliderInputRef.current) {
      sliderInputRef.current.focus();
      sliderInputRef.current.select();
    }
  }, [editingSlider]);

  const renderSetting = (setting: SettingDefinition) => {
    const currentValue = settingsValues[setting.key] ?? setting.defaultValue;

    const renderControl = () => {
      switch (setting.type) {
        case "slider":
          return (
            <Slider
              value={currentValue as number}
              min={setting.min}
              max={setting.max}
              step={setting.step}
              scale={setting.scale}
              deadzoneWidth={setting.deadzoneWidth}
              onChange={(value) => handleSettingChange(setting.key, value)}
            />
          );
        case "select":
          return (
            <Select
              value={currentValue as string | number}
              options={setting.options}
              onChange={(value) => handleSettingChange(setting.key, value)}
            />
          );
        case "toggle":
          return (
            <Toggle
              label={setting.key}
              value={currentValue as boolean}
              onChange={(value) => handleSettingChange(setting.key, value)}
            />
          );
        default:
          return null;
      }
    };

    const renderRightContent = () => {
      if (setting.type === "slider") {
        const config: SliderUtilsConfig = {
          units: setting.units,
          selectedUnitIndex: selectedUnits[setting.key] || 0,
          step: setting.step,
          scale: setting.scale,
          min: setting.min,
          max: setting.max,
        };

        const displayValue = toDisplayValue(currentValue as number, config);
        const formattedValue = formatDisplayValue(displayValue, config);
        const currentUnit = getCurrentUnit(config);

        return (
          <div className="slider-value-container">
            {editingSlider === setting.key ? (
              <input
                ref={sliderInputRef}
                type="text"
                value={sliderInputValue}
                onChange={handleSliderInputChange}
                onKeyDown={(e) => handleSliderInputKeyDown(e, setting)}
                onBlur={() => confirmSliderEdit(setting)}
                className="slider-value-input"
              />
            ) : (
              <span
                className="slider-value clickable"
                onClick={() =>
                  startSliderEdit(setting.key, currentValue as number, setting)
                }
                title="Click to edit value"
              >
                {formattedValue}
                {setting.units.length === 1 ? currentUnit.suffix : ""}
              </span>
            )}
            {setting.units.length > 1 && (
              <select
                className="unit-selector-inline"
                value={selectedUnits[setting.key] || 0}
                onChange={(e) =>
                  handleUnitChange(setting.key, parseInt(e.target.value))
                }
              >
                {setting.units.map((unit, index) => (
                  <option key={index} value={index}>
                    {unit.suffix || unit.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      }
      return null;
    };

    const getLayout = () => {
      return setting.type === "toggle" || setting.type === "select"
        ? "inline"
        : "stacked";
    };

    return (
      <SettingWrapper
        key={setting.key}
        label={setting.label}
        description={setting.description}
        rightContent={renderRightContent()}
        layout={getLayout()}
      >
        {renderControl()}
      </SettingWrapper>
    );
  };

  const handleBackToMain = () => {
    window.location.pathname = "/";
  };

  const handleSceneGithubClick = () => {
    window.open(
      `https://github.com/entmonk/globe-viz/blob/main/src/scenes/${sceneId}.ts`,
      "_blank"
    );
  };

  return (
    <div className={`settings-sidebar ${className}`}>
      <div className="settings-header">
        <div className="settings-header-left">
          <button
            className="back-button"
            onClick={handleBackToMain}
            title="Back to scene selector"
          >
            ← Scenes
          </button>
          <button
            className="github-button"
            onClick={handleSceneGithubClick}
            title="View code"
          >
            Code
          </button>
        </div>
        <button
          className="reset-button"
          onClick={handleResetSettings}
          title="Reset all settings to defaults"
        >
          Reset
        </button>
      </div>

      <div className="settings-content">
        {settingDefinitions.length > 0 ? (
          <>
            {Object.entries(groupedSettings).map(([groupName, settings]) => {
              const isExpanded = expandedGroups[groupName];
              return (
                <div key={groupName} className="setting-group">
                  <div
                    className={`setting-group-header ${
                      isExpanded ? "expanded" : ""
                    }`}
                    onClick={() => toggleGroup(groupName)}
                  >
                    <div className="setting-group-header-left">
                      <div className="setting-group-chevron">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M6 12L10 8L6 4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <h4 className="setting-group-title">{groupName}</h4>
                    </div>
                    <button
                      className="group-reset-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetGroup(groupName);
                      }}
                      title={`Reset ${groupName} settings to defaults`}
                    >
                      Reset
                    </button>
                  </div>
                  <div
                    className={`setting-group-content ${
                      isExpanded ? "expanded" : ""
                    }`}
                  >
                    <div className="setting-group-content-inner">
                      {settings.map(renderSetting)}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="setting-group">
            <p>No settings available for this scene.</p>
          </div>
        )}
      </div>
    </div>
  );
}
