import { useMemo } from "react";
import { Canvas } from "./Canvas";
import { Settings } from "./Settings";
import { SceneSelector } from "./SceneSelector";
import { getScene } from "../../sceneIndex";

import "../styles/App.css";
import { parseSettingsFromUrl } from "../utils/urlParams";

function App() {
  const path = window.location.pathname;
  const sceneName = path.startsWith("/") ? path.slice(1) : path;

  const scene = getScene(sceneName);

  const initialSettings = useMemo(() => {
    if (!scene) return {};
    const settingDefinitions = scene.getSettings?.() || [];
    return parseSettingsFromUrl(settingDefinitions);
  }, [scene]);

  if (!scene || sceneName === "") {
    return <SceneSelector />;
  }

  return (
    <div className="app-container">
      <Settings
        scene={scene}
        sceneId={sceneName}
        initialSettings={initialSettings}
      />
      <Canvas scene={scene} />
    </div>
  );
}

export default App;
