import { isGrabProject } from "./grab-project.js";
export const PROJECT_SCHEMA_VERSION = 1;
export const AUTOSAVE_KEY = 'tuttingAutosave_v1';

// Preserve v1's existing structural checks and distinguish each UI message.
export function validateProject(data, { autosave = false } = {}){
  if (!data || typeof data !== 'object' || !Array.isArray(data.keyframes)) return 'structure';
  if (data.schemaVersion !== PROJECT_SCHEMA_VERSION) return 'version';
  if (!data.keyframes.length && !(autosave && data.footPlant?.enabled) && !isGrabProject(data.grabBox)) return 'empty';
  return null;
}
