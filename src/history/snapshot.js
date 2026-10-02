import { PROJECT_SCHEMA_VERSION } from "../storage/project-format.js";

// History and project files intentionally capture different v1 fields.
export function createSnapshots(context){
  function captureHistory(){
    const {
      poseController, snapshotTG, snapshotGenerationRules, waveClone, waveClips,
      cleanWave, waveConfig, cleanLAPath, laPathConfig, snapshotTorsoLookAt,
      snapshotHandAim, snapshotPoleEditor, snapshotFootPlant, keyframes, grooveSequence,
      kfEditingIndex, poseIndex, kfPendingEasing, kfPendingBeats, TRAJ_MODE,
      TRAJ_CLOSED, bpm, grooveJointSet, grooveCustomParams, grooveSquatEnabled,
      grooveSquatCustom, grooveWarmupEnabled, grooveWarmupBeats, grooveWarmupCurve, IK_LIMB_KEYS,
      trajPointMeshes,
    } = context;
    const targetClone = poseController.snapshotTarget();
    return {
      tuttingGenerator: snapshotTG(),
      generationRules: snapshotGenerationRules(),
      waveClips: waveClone(waveClips),
      waving: cleanWave(waveConfig),
      lookAtPath: cleanLAPath(laPathConfig),
      torsoLookAt: snapshotTorsoLookAt(),
      handAim: snapshotHandAim(),
      poleEditor: snapshotPoleEditor(),
      target: targetClone,
      footPlant: snapshotFootPlant(),
      keyframes: JSON.parse(JSON.stringify(keyframes)),
      grooveSequence: JSON.parse(JSON.stringify(grooveSequence)), // 律動序列跟拍點清單共用同一套 undo/redo，見下方 restoreSnapshot
      kfEditingIndex,
      poseIndex,
      kfPendingEasing,
      kfPendingBeats
    };
  }
  function captureProject(){
    const {
      poseController, snapshotTG, snapshotGenerationRules, waveClone, waveClips,
      cleanWave, waveConfig, cleanLAPath, laPathConfig, snapshotTorsoLookAt,
      snapshotHandAim, snapshotPoleEditor, snapshotFootPlant, keyframes, grooveSequence,
      kfEditingIndex, poseIndex, kfPendingEasing, kfPendingBeats, TRAJ_MODE,
      TRAJ_CLOSED, bpm, grooveJointSet, grooveCustomParams, grooveSquatEnabled,
      grooveSquatCustom, grooveWarmupEnabled, grooveWarmupBeats, grooveWarmupCurve, IK_LIMB_KEYS,
      trajPointMeshes,
    } = context;
    const data = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      tuttingGenerator: snapshotTG(),
      generationRules: snapshotGenerationRules(),
      waveClips: waveClone(waveClips),
      waving: cleanWave(waveConfig),
      lookAtPath: cleanLAPath(laPathConfig),
      torsoLookAt: snapshotTorsoLookAt(),
      handAim: snapshotHandAim(),
      poleEditor: snapshotPoleEditor(),
      footPlant: snapshotFootPlant(),
      savedAt: Date.now(),
      keyframes,
      trajPoints: {},
      trajMode: TRAJ_MODE,
      trajClosed: TRAJ_CLOSED,
      bpm,
      kfPendingEasing,
      kfPendingBeats,
      grooveJoints: Array.from(grooveJointSet),
      grooveCustom: grooveCustomParams,
      grooveSquatEnabled,
      grooveSquatCustom,
      grooveWarmupEnabled,
      grooveWarmupBeats,
      grooveWarmupCurve,
      grooveSequence // 律動序列是編舞的一部分（哪幾拍用哪個律動庫項目），存進專案檔；律動庫本身仍存 localStorage，不隨專案檔走
    };
    for (const limb of IK_LIMB_KEYS){
      data.trajPoints[limb] = trajPointMeshes[limb].map(m => ({ x:m.position.x, y:m.position.y, z:m.position.z }));
    }
    return JSON.parse(JSON.stringify(data));
  }
  return { captureHistory, captureProject };
}
