import type { Scene, SceneMetadata } from "./core/types/scene";
import { MirrorSphere } from "./scenes/mirrorSphere";
import { AtmosphereGlobe } from "./scenes/atmosphereGlobe";

export interface SceneRegistryEntry {
  id: string;
  name: string;
  description: string;
  factory: () => Scene;
}

/**
 * Central registry of all available scenes
 * Add new scenes here to make them available in the app
 */
export const sceneRegistry: SceneRegistryEntry[] = [
  {
    id: "mirrorSphere",
    name: "Mirror Sphere",
    description: "Mirrored sphere with cloud layer",
    factory: () => new MirrorSphere(),
  },
  {
    id: "atmosphereGlobe",
    name: "Atmosphere Globe",
    description: "Globe with sun and atmosphere simulation",
    factory: () => new AtmosphereGlobe(),
  },
];

/**
 * Get a scene by its ID
 * @param id - The scene ID to look up
 * @returns The scene instance, or null if not found
 */
export function getSceneById(id: string): Scene | null {
  const entry = sceneRegistry.find((s) => s.id === id);
  return entry ? entry.factory() : null;
}

/**
 * Get all scene metadata for display in the scene selector
 */
export function getAllSceneMetadata(): SceneMetadata[] {
  return sceneRegistry.map((entry) => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
  }));
}

/**
 * Get metadata for a specific scene by its ID
 * @param id - The scene ID to look up
 * @returns The scene metadata, or null if not found
 */
export function getSceneMetadataById(id: string): SceneMetadata | null {
  const entry = sceneRegistry.find((s) => s.id === id);
  return entry
    ? {
        id: entry.id,
        name: entry.name,
        description: entry.description,
      }
    : null;
}
