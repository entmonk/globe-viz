import type { Scene } from "./core/types/scene";
import { getSceneById } from "./sceneRegistry";

export function getScene(name: string): Scene | null {
  return getSceneById(name);
}

// Re-export registry functions for convenience
export { getAllSceneMetadata, sceneRegistry } from "./sceneRegistry";
