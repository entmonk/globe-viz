import { getAllSceneMetadata } from "../../sceneRegistry";
import "../styles/SceneSelector.css";

export function SceneSelector() {
  const scenes = getAllSceneMetadata();

  const handleSceneClick = (sceneId: string) => {
    // Navigate to the scene by updating the URL
    window.location.pathname = `/${sceneId}`;
  };

  const handleRepoClick = () => {
    window.open("https://github.com/entmonk/globe-viz", "_blank");
  };

  const handleSceneRepoClick = (sceneId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent scene navigation
    window.open(
      `https://github.com/entmonk/globe-viz/blob/main/src/scenes/${sceneId}.ts`,
      "_blank"
    );
  };

  return (
    <div className="scene-selector-container">
      <div className="scene-selector-sidebar">
        <header className="scene-selector-header">
          <h1>Globe-Viz</h1>
          <p className="scene-selector-subtitle">Interactive visualizations</p>
          <p className="scene-selector-note">
            Some pages require WebGPU (supported in Chrome; Firefox on Windows;
            Safari requires enabling in Develop → Feature Flags → Check
            "WebGPU")
          </p>
          <button
            className="github-link-button"
            onClick={handleRepoClick}
            title="View on GitHub"
          >
            Code
          </button>
        </header>

        <div className="scene-list">
          {scenes.map((scene) => (
            <div key={scene.id} className="scene-item">
              <button
                className="scene-item-button"
                onClick={() => handleSceneClick(scene.id)}
              >
                <div className="scene-item-content">
                  <h3 className="scene-item-title">{scene.name}</h3>
                  <p className="scene-item-description">{scene.description}</p>
                </div>
                <div className="scene-item-arrow">→</div>
              </button>
              <button
                className="scene-github-link"
                onClick={(e) => handleSceneRepoClick(scene.id, e)}
                title="View code"
              >
                Code
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
