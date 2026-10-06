import { t as tr, liveText } from "../i18n/index.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { placeModelOnGround } from "../rig/model-utils.js";
import { BONE_SUFFIXES, ALL_JOINT_KEYS, IK_CHAINS, FINGER_IK_CHAINS, FINGER_IDS } from "../rig/definitions.js";
import { findBone } from "../rig/find-bone.js";
import { createGrabBoxCore } from "../interaction/grab-core.js";

// Live host getters preserve shared rig and playback coordination.
export function createSceneBootstrap(context){
  function init(){
    context.scene = new THREE.Scene();
    context.scene.background = new THREE.Color(0x0a0a12);
    context.scene.fog = new THREE.Fog(0x0a0a12, 12, 26);

    context.camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
    context.camera.position.set(0, 1.4, 3.2);

    context.renderer = new THREE.WebGLRenderer({ antialias:true });
    context.renderer.setSize(innerWidth, innerHeight);
    context.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    context.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById("canvasHolder").appendChild(context.renderer.domElement);

    context.scene.add(new THREE.AmbientLight(0x8899ff, 0.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 5, 4);
    context.scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0xff2f7e, 0.5);
    rim.position.set(-4, 3, -3);
    context.scene.add(rim);

    context.controls = new OrbitControls(context.camera, context.renderer.domElement);
    context.controls.target.set(0, 1, 0);
    context.controls.enableDamping = true;
    context.controls.minDistance = 1.0;
    context.controls.maxDistance = 14;

    context.initTransformGizmos();

    window.addEventListener("resize", context.onResize);
    context.setupPickRaycaster();

    loadModel();
    requestAnimationFrame(context.animate);
  }

  function loadModel(){
    const loader = new GLTFLoader();
    loader.load(context.MODEL_URL, (gltf) => {
      context.model = gltf.scene;

      const targetHeight = 1.75;
      context.modelHeight = targetHeight;
      placeModelOnGround(context.model, targetHeight);

      context.scene.add(context.model);
      context.scene.add(new THREE.GridHelper(20, 20, 0x2a2a55, 0x1a1a33));

      context.model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });

      for (const key of ALL_JOINT_KEYS){
        context.bones[key] = findBone(context.model, BONE_SUFFIXES[key]);
        if (!context.bones[key]) console.warn(tr("找不到骨骼:"), BONE_SUFFIXES[key]);
      }
      for (const key of ALL_JOINT_KEYS){
        if (context.bones[key]) context.restQuat[key] = context.bones[key].quaternion.clone();
      }
      context.buildOnionGhosts();

      // 手指IK effector：優先找指尖第4節骨（只讀位置，不開放FK），模型萬一沒有這根骨頭，
      // 優雅退回用第3節自己當effector，只是精準度變差、不會整個壞掉。
      for (const fingerId of FINGER_IDS){
        const chain = FINGER_IK_CHAINS[fingerId];
        let tipBone = findBone(context.model, chain.tipSuffix);
        if (!tipBone){
          console.warn(tr("找不到指尖骨骼(") + chain.tipSuffix + ")，" + tr(chain.label) + tr(" IK 退回用第3節自身當effector，精準度會變差"));
          tipBone = context.bones[chain.bones[2]];
        }
        context.fingerEffectorBones[fingerId] = tipBone;
      }

      // 記錄置中/貼地完成後的初始位置，供「重置身體位置」使用
      context.defaultModelPosition = context.model.position.clone();
      context.defaultModelQuaternion = context.model.quaternion.clone();

      context.calibrateFootGround();
      context.buildJointMarkers();
      context.buildSkeletonLines();
      context.buildHandCollisionVizMeshes();
      context.buildIKMarkers();
      context.buildSpineIKMarker();
      context.buildLookAtMarkers();
      context.buildTrajMarkers();
      context.buildFingerIKMarkers();
      context.buildFingerPanel();
      context.buildJointLimitPanel();
      context.buildOverviewPanel();
      context.buildJsonRefTable();
      context.rebuildIKDrivenKeys(); // 防呆：初始四個開關都是 false，理論上等於空集合，但不依賴這個假設

      // 扶握箱核心：依賴用「讀取用函式」注入，不直接傳物件參照，
      // 避免主程式之後改變 bones/ikTargetMeshes 時，核心還抱著舊的參照。
      context.grabBoxCore = createGrabBoxCore({
        scene: context.scene, camera: context.camera, renderer: context.renderer,
        orbitControls: context.controls,
        getModel: () => context.model,
        getBones: () => context.bones,
        getHandBone: (limb) => context.bones[IK_CHAINS[limb]?.end],
        getIKTargetMesh: (limb) => context.ikTargetMeshes[limb],
        isIKEnabled: (limb) => context.ikEnabled[limb],
        setIKEnabled: (limb, on) => context.setIKEnabled(limb, on),
        isFingerTutActive: () => context.isFingerTutActive(),
        preparePose: () => context.prepareGrabPose(),
        prepareHands: () => context.prepareGrabHands(),
        solvePose: () => context.solveGrabPose(),
        captureRig: () => context.captureGrabRig(),
        restoreRig: state => context.restoreGrabRig(state),
        pushHistory: () => context.pushHistory(),
      });
      context.grabBoxCore.buildAfterModelLoad();

      context.controls.target.set(0, targetHeight * 0.55, 0);
      context.camera.position.set(0, targetHeight * 0.75, targetHeight * 1.6);
      context.controls.update();

      // 用實際量測到的包圍盒重新套用一次「正面」視角，確保初始畫面就能完整照到全身
      // （包含手臂張開的寬度等，不只是單純用身高比例粗估），瞬間套用不做過渡動畫。
      context.goToCameraPreset("front", true);
      context.controls.update();

      context.resetPose();
      context.bindTopUI();
      context.tryLoadAutosave();
      context.renderKeyframeChips();
      context.pushHistory();

      document.getElementById("loading").style.display = "none";
      // #ui 的顯示/隱藏（flex/none）已由 bindTopUI() 內的 initUIVisibility() 依 localStorage 設定好，這裡不再覆蓋
    }, undefined, (err) => {
      liveText(document.getElementById("loading"),()=>tr("模型載入失敗，請檢查網路連線"));
      console.error(err);
    });
  }
  return { init, loadModel };
}
