import { useState, useEffect, useRef, memo } from "react";
import type { Scene } from "../types/scene";
import "../styles/SceneInfo.css";

interface SceneInfoProps {
  scene: Scene;
  updateInterval?: number; // milliseconds between updates, default 200ms
}

function SceneInfoComponent({ scene, updateInterval = 200 }: SceneInfoProps) {
  const [displayInfo, setDisplayInfo] = useState<
    Record<string, string | number> | string | null
  >(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Only set up interval if scene provides display info
    if (!scene.getDisplayInfo) {
      setDisplayInfo(null);
      return;
    }

    // Get initial info immediately
    const initialInfo = scene.getDisplayInfo();
    setDisplayInfo(initialInfo);

    // Set up periodic updates
    intervalRef.current = setInterval(() => {
      if (scene.getDisplayInfo) {
        const info = scene.getDisplayInfo();
        setDisplayInfo(info);
      }
    }, updateInterval);

    // Cleanup on unmount or scene change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [scene, updateInterval]);

  if (!scene.getDisplayInfo || displayInfo === null) {
    return null;
  }

  const renderContent = () => {
    if (typeof displayInfo === "string") {
      return <div className="scene-info-text">{displayInfo}</div>;
    } else {
      return (
        <div className="scene-info-grid">
          {Object.entries(displayInfo).map(([key, value]) => (
            <div key={key} className="scene-info-row">
              <span className="scene-info-key">{key}:</span>
              <span className="scene-info-value">{value}</span>
            </div>
          ))}
        </div>
      );
    }
  };

  return (
    <div className={`scene-info-container ${isCollapsed ? "collapsed" : ""}`}>
      <button
        className="scene-info-toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label={isCollapsed ? "Show scene info" : "Hide scene info"}
        title={isCollapsed ? "Show scene info" : "Hide scene info"}
      >
        {isCollapsed ? "▼" : "▲"}
      </button>
      {!isCollapsed && (
        <div className="scene-info-content">{renderContent()}</div>
      )}
    </div>
  );
}

export const SceneInfo = memo(SceneInfoComponent);
