import * as THREE from "three";
import type { ComponentVisualState, TransformerComponentId } from "./types";

export interface TransformerSceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  componentGroups: Map<TransformerComponentId, THREE.Group>;
  componentMaterials: Map<TransformerComponentId, THREE.MeshStandardMaterial[]>;
  updateStates: (states: Record<TransformerComponentId, ComponentVisualState>, selectedId: TransformerComponentId | null) => void;
  dispose: () => void;
}

export function createTransformerScene(
  container: HTMLDivElement,
  onComponentClick: (id: TransformerComponentId) => void,
  onComponentHover?: (id: TransformerComponentId | null) => void,
): TransformerSceneHandle {
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 500;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x131826); // Match control-room dark navy background
  scene.fog = new THREE.FogExp2(0x131826, 0.04);

  // Camera
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(6.5, 4.5, 7.5);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xcfd8dc, 0.9);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
  sunLight.position.set(8, 12, 6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 30;
  sunLight.shadow.bias = -0.0005;
  const d = 6;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
  fillLight.position.set(-8, 6, -6);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x818cf8, 0.5);
  rimLight.position.set(0, -5, 0);
  scene.add(rimLight);

  // Ground Substation Pad & Holographic Pedestal (Matching Image 2)
  const groundGroup = new THREE.Group();

  // Circular metallic pedestal
  const pedestalGeo = new THREE.CylinderGeometry(4.3, 4.5, 0.22, 64);
  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.8,
  });
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.position.y = -0.11;
  pedestal.receiveShadow = true;
  groundGroup.add(pedestal);

  // Concentric glowing cyan & emerald telemetry rings on pedestal
  const outerRingGeo = new THREE.RingGeometry(3.95, 4.08, 64);
  const cyanRingMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide });
  const outerRing = new THREE.Mesh(outerRingGeo, cyanRingMat);
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = 0.01;
  groundGroup.add(outerRing);

  const innerRingGeo = new THREE.RingGeometry(3.1, 3.16, 64);
  const emeraldRingMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide });
  const innerRing = new THREE.Mesh(innerRingGeo, emeraldRingMat);
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.01;
  groundGroup.add(innerRing);

  // Radial telemetry markers
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    const tickGeo = new THREE.BoxGeometry(0.04, 0.01, 0.35);
    const tick = new THREE.Mesh(tickGeo, cyanRingMat);
    tick.position.set(Math.cos(a) * 3.55, 0.01, Math.sin(a) * 3.55);
    tick.rotation.y = -a;
    groundGroup.add(tick);
  }

  // Steel mounting rails
  const railMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.85 });
  for (const z of [-1.1, 1.1]) {
    const railGeo = new THREE.BoxGeometry(5.8, 0.08, 0.14);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(0, 0.04, z);
    rail.castShadow = true;
    groundGroup.add(rail);
  }
  scene.add(groundGroup);

  // Component collections
  const componentGroups = new Map<TransformerComponentId, THREE.Group>();
  const componentMaterials = new Map<TransformerComponentId, THREE.MeshStandardMaterial[]>();

  function registerMaterial(id: TransformerComponentId, mat: THREE.MeshStandardMaterial) {
    if (!componentMaterials.has(id)) componentMaterials.set(id, []);
    componentMaterials.get(id)!.push(mat);
  }

  function createComponentGroup(id: TransformerComponentId): THREE.Group {
    const g = new THREE.Group();
    g.userData = { componentId: id };
    componentGroups.set(id, g);
    scene.add(g);
    return g;
  }

  // Base materials palette
  const createStdMat = (id: TransformerComponentId, baseColor: number, roughness = 0.5, metalness = 0.3) => {
    const mat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness,
      metalness,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    registerMaterial(id, mat);
    return mat;
  };

  // 1. MAIN TANK (Dark industrial metallic finish matching Image 2)
  const mainTankGroup = createComponentGroup("main_tank");
  const tankMat = createStdMat("main_tank", 0x1e293b, 0.35, 0.7); // Rich dark industrial gunmetal slate
  const tankGeo = new THREE.BoxGeometry(3.6, 2.2, 2.0);
  const mainTankBody = new THREE.Mesh(tankGeo, tankMat);
  mainTankBody.position.set(0, 1.25, 0);
  mainTankBody.castShadow = true;
  mainTankBody.receiveShadow = true;
  mainTankBody.userData = { componentId: "main_tank" };
  mainTankGroup.add(mainTankBody);

  // Corrugated vertical cooling ribs on tank walls (Front & Back)
  for (let x = -1.6; x <= 1.6; x += 0.32) {
    const ribGeo = new THREE.BoxGeometry(0.04, 1.9, 0.08);
    const rib1 = new THREE.Mesh(ribGeo, tankMat);
    rib1.position.set(x, 1.25, 1.04);
    rib1.userData = { componentId: "main_tank" };
    mainTankGroup.add(rib1);
    const rib2 = new THREE.Mesh(ribGeo, tankMat);
    rib2.position.set(x, 1.25, -1.04);
    rib2.userData = { componentId: "main_tank" };
    mainTankGroup.add(rib2);
  }

  // Neon telemetry circuit traces (Matching Image 2 holographic overlay)
  const circuitMatCyan = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
  const circuitMatEmerald = new THREE.MeshBasicMaterial({ color: 0x10b981 });

  // Horizontal diagnostic bus lines on the front face
  const trace1Geo = new THREE.BoxGeometry(2.8, 0.02, 0.02);
  const trace1 = new THREE.Mesh(trace1Geo, circuitMatCyan);
  trace1.position.set(0, 1.6, 1.06);
  mainTankGroup.add(trace1);

  const trace2Geo = new THREE.BoxGeometry(2.4, 0.02, 0.02);
  const trace2 = new THREE.Mesh(trace2Geo, circuitMatEmerald);
  trace2.position.set(0.2, 0.8, 1.06);
  mainTankGroup.add(trace2);

  // Vertical data conduit runs
  for (const x of [-0.9, 0.6]) {
    const vTraceGeo = new THREE.BoxGeometry(0.02, 0.8, 0.02);
    const vTrace = new THREE.Mesh(vTraceGeo, circuitMatCyan);
    vTrace.position.set(x, 1.2, 1.06);
    mainTankGroup.add(vTrace);
  }

  // Cover flange
  const flangeGeo = new THREE.BoxGeometry(3.8, 0.12, 2.2);
  const coverFlange = new THREE.Mesh(flangeGeo, tankMat);
  coverFlange.position.set(0, 2.38, 0);
  coverFlange.castShadow = true;
  coverFlange.userData = { componentId: "main_tank" };
  mainTankGroup.add(coverFlange);

  // Under-tank wheels/skids
  const wheelMat = createStdMat("main_tank", 0x1e293b, 0.3, 0.8);
  for (const x of [-1.3, -0.4, 0.4, 1.3]) {
    for (const z of [-1.1, 1.1]) {
      const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.14, 16);
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.12, z);
      wheel.castShadow = true;
      wheel.userData = { componentId: "main_tank" };
      mainTankGroup.add(wheel);
    }
  }

  // 2. CONSERVATOR TANK & BREATHER
  const conservatorGroup = createComponentGroup("conservator_tank");
  const conservatorMat = createStdMat("conservator_tank", 0x475569, 0.4, 0.5);
  const cylinderGeo = new THREE.CylinderGeometry(0.45, 0.45, 3.2, 24);
  const conservatorCylinder = new THREE.Mesh(cylinderGeo, conservatorMat);
  conservatorCylinder.rotation.z = Math.PI / 2;
  conservatorCylinder.position.set(0, 3.25, -0.85);
  conservatorCylinder.castShadow = true;
  conservatorCylinder.userData = { componentId: "conservator_tank" };
  conservatorGroup.add(conservatorCylinder);

  // Conservator Domes (End caps)
  for (const x of [-1.6, 1.6]) {
    const domeGeo = new THREE.SphereGeometry(0.45, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, conservatorMat);
    dome.rotation.z = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    dome.position.set(x, 3.25, -0.85);
    dome.userData = { componentId: "conservator_tank" };
    conservatorGroup.add(dome);
  }

  // Magnetic Oil Gauge (MOG) dial on conservator front
  const mogDialGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 20);
  const mogMat = createStdMat("conservator_tank", 0xf8fafc, 0.2, 0.1);
  const mog = new THREE.Mesh(mogDialGeo, mogMat);
  mog.rotation.x = Math.PI / 2;
  mog.position.set(-0.8, 3.25, -0.38);
  mog.userData = { componentId: "conservator_tank" };
  conservatorGroup.add(mog);

  // Conservator Support Brackets
  const bracketMat = createStdMat("conservator_tank", 0x334155, 0.6, 0.4);
  for (const x of [-1.0, 1.0]) {
    const legGeo = new THREE.BoxGeometry(0.1, 0.85, 0.1);
    const leg = new THREE.Mesh(legGeo, bracketMat);
    leg.position.set(x, 2.8, -0.85);
    leg.castShadow = true;
    leg.userData = { componentId: "conservator_tank" };
    conservatorGroup.add(leg);
  }

  // Silica-Gel Breather Assembly
  const breatherMat = createStdMat("conservator_tank", 0x0284c7, 0.2, 0.1); // Silica blue crystal color
  const breatherGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.65, 16);
  const breather = new THREE.Mesh(breatherGeo, breatherMat);
  breather.position.set(1.65, 2.2, -0.85);
  breather.userData = { componentId: "conservator_tank" };
  conservatorGroup.add(breather);

  // Breather Connecting Pipe
  const breatherPipeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12);
  const breatherPipe = new THREE.Mesh(breatherPipeGeo, bracketMat);
  breatherPipe.position.set(1.65, 2.85, -0.85);
  breatherPipe.userData = { componentId: "conservator_tank" };
  conservatorGroup.add(breatherPipe);

  // 3. HV BUSHINGS (400 kV Bushings - Phase R, Y, B)
  const hvBushingGroup = createComponentGroup("hv_bushings");
  const porcelainMat = createStdMat("hv_bushings", 0x991b1b, 0.25, 0.2); // Red-brown porcelain glaze
  const metalStudMat = createStdMat("hv_bushings", 0xe2e8f0, 0.2, 0.9); // Corona ring / copper stud

  const hvPositions = [-1.1, 0, 1.1];
  hvPositions.forEach((xPos) => {
    // Mounting Turret
    const turretGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.35, 16);
    const turret = new THREE.Mesh(turretGeo, tankMat);
    turret.position.set(xPos, 2.58, 0.45);
    turret.userData = { componentId: "hv_bushings" };
    hvBushingGroup.add(turret);

    // Porcelain Main Stem
    const stemGeo = new THREE.CylinderGeometry(0.09, 0.13, 1.5, 16);
    const stem = new THREE.Mesh(stemGeo, porcelainMat);
    stem.position.set(xPos, 3.45, 0.55);
    stem.rotation.x = -0.15; // Angled outward
    stem.castShadow = true;
    stem.userData = { componentId: "hv_bushings" };
    hvBushingGroup.add(stem);

    // Disc Sheds / Petticoats (8 discs per 400kV bushing)
    for (let i = 0; i < 8; i++) {
      const shedGeo = new THREE.CylinderGeometry(0.25 - i * 0.012, 0.25 - i * 0.012, 0.04, 16);
      const shed = new THREE.Mesh(shedGeo, porcelainMat);
      shed.position.set(xPos, 2.85 + i * 0.16, 0.55 - i * 0.02);
      shed.rotation.x = -0.15;
      shed.castShadow = true;
      shed.userData = { componentId: "hv_bushings" };
      hvBushingGroup.add(shed);
    }

    // Corona Ring atop 400kV bushing
    const ringGeo = new THREE.TorusGeometry(0.24, 0.035, 12, 24);
    const ring = new THREE.Mesh(ringGeo, metalStudMat);
    ring.rotation.x = Math.PI / 2 - 0.15;
    ring.position.set(xPos, 4.22, 0.43);
    ring.castShadow = true;
    ring.userData = { componentId: "hv_bushings" };
    hvBushingGroup.add(ring);

    // Terminal Palm Stud
    const studGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 12);
    const stud = new THREE.Mesh(studGeo, metalStudMat);
    stud.position.set(xPos, 4.35, 0.41);
    stud.userData = { componentId: "hv_bushings" };
    hvBushingGroup.add(stud);
  });

  // 4. LV BUSHINGS (220 kV Secondary Bushings - 4 terminals)
  const lvBushingGroup = createComponentGroup("lv_bushings");
  const lvPorcelainMat = createStdMat("lv_bushings", 0x78350f, 0.3, 0.3); // Brown secondary porcelain
  const lvPositions = [-1.2, -0.4, 0.4, 1.2];
  lvPositions.forEach((xPos) => {
    const lvStemGeo = new THREE.CylinderGeometry(0.08, 0.11, 0.9, 16);
    const lvStem = new THREE.Mesh(lvStemGeo, lvPorcelainMat);
    lvStem.position.set(xPos, 2.9, -0.2);
    lvStem.castShadow = true;
    lvStem.userData = { componentId: "lv_bushings" };
    lvBushingGroup.add(lvStem);

    // 5 Sheds for 220kV
    for (let i = 0; i < 5; i++) {
      const lvShedGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.035, 16);
      const lvShed = new THREE.Mesh(lvShedGeo, lvPorcelainMat);
      lvShed.position.set(xPos, 2.6 + i * 0.14, -0.2);
      lvShed.userData = { componentId: "lv_bushings" };
      lvBushingGroup.add(lvShed);
    }
  });

  // 5. RADIATOR COOLING BANKS
  const radiatorGroup = createComponentGroup("radiator_cooling");
  const radiatorMat = createStdMat("radiator_cooling", 0x475569, 0.5, 0.4);
  const finMat = createStdMat("radiator_cooling", 0x334155, 0.4, 0.5);

  for (const side of [-1, 1]) {
    const sideX = side * 2.35;

    // Header manifold pipes (Top and Bottom)
    for (const y of [0.5, 2.0]) {
      const headerGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.6, 16);
      const header = new THREE.Mesh(headerGeo, radiatorMat);
      header.rotation.x = Math.PI / 2;
      header.position.set(sideX, y, 0);
      header.userData = { componentId: "radiator_cooling" };
      radiatorGroup.add(header);

      // Connecting feeder pipe to main tank
      const connectPipeGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.55, 16);
      const connectPipe = new THREE.Mesh(connectPipeGeo, radiatorMat);
      connectPipe.rotation.z = Math.PI / 2;
      connectPipe.position.set(side * 2.05, y, 0);
      connectPipe.userData = { componentId: "radiator_cooling" };
      radiatorGroup.add(connectPipe);
    }

    // Array of vertical cooling fins (8 fins per side)
    for (let z = -0.7; z <= 0.7; z += 0.2) {
      const finGeo = new THREE.BoxGeometry(0.5, 1.45, 0.04);
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.set(sideX, 1.25, z);
      fin.castShadow = true;
      fin.userData = { componentId: "radiator_cooling" };
      radiatorGroup.add(fin);
    }
  }

  // 6. COOLING FANS (Forced air cooling beneath radiators)
  const fanGroup = createComponentGroup("cooling_fans");
  const fanShroudMat = createStdMat("cooling_fans", 0x0284c7, 0.4, 0.6); // Cyan / industrial blue shroud
  const fanBladeMat = createStdMat("cooling_fans", 0x0f172a, 0.3, 0.7);

  for (const side of [-1, 1]) {
    const sideX = side * 2.35;
    for (const z of [-0.4, 0.4]) {
      // Fan circular shroud
      const shroudGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 16, 1, true);
      const shroud = new THREE.Mesh(shroudGeo, fanShroudMat);
      shroud.position.set(sideX, 0.32, z);
      shroud.userData = { componentId: "cooling_fans" };
      fanGroup.add(shroud);

      // Fan hub
      const hubGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12);
      const hub = new THREE.Mesh(hubGeo, fanBladeMat);
      hub.position.set(sideX, 0.32, z);
      hub.userData = { componentId: "cooling_fans" };
      fanGroup.add(hub);
    }
  }

  // 7. COOLING PUMPS (Oil circulation pumps on lower manifold)
  const pumpGroup = createComponentGroup("cooling_pumps");
  const pumpMat = createStdMat("cooling_pumps", 0x0369a1, 0.4, 0.6);
  for (const side of [-1, 1]) {
    const pumpHousingGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 16);
    const pumpHousing = new THREE.Mesh(pumpHousingGeo, pumpMat);
    pumpHousing.rotation.z = Math.PI / 2;
    pumpHousing.position.set(side * 1.95, 0.5, -0.6);
    pumpHousing.userData = { componentId: "cooling_pumps" };
    pumpGroup.add(pumpHousing);
  }

  // 8. OIL PIPING
  const oilPipingGroup = createComponentGroup("oil_piping");
  const pipeMat = createStdMat("oil_piping", 0x64748b, 0.3, 0.7);
  // Pipe from main tank top cover to Buchholz relay & conservator
  const pipeGeo1 = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 16);
  const pipe1 = new THREE.Mesh(pipeGeo1, pipeMat);
  pipe1.position.set(-0.6, 2.75, -0.85);
  pipe1.userData = { componentId: "oil_piping" };
  oilPipingGroup.add(pipe1);

  // 9. BUCHHOLZ RELAY
  const buchholzGroup = createComponentGroup("buchholz_relay");
  const buchholzMat = createStdMat("buchholz_relay", 0xf59e0b, 0.3, 0.5); // Distinct protective yellow/amber housing
  const buchholzGeo = new THREE.BoxGeometry(0.28, 0.35, 0.28);
  const buchholz = new THREE.Mesh(buchholzGeo, buchholzMat);
  buchholz.position.set(-0.6, 2.85, -0.85);
  buchholz.castShadow = true;
  buchholz.userData = { componentId: "buchholz_relay" };
  buchholzGroup.add(buchholz);

  // Glass inspection dome
  const glassMat = createStdMat("buchholz_relay", 0xe0f2fe, 0.1, 0.1);
  const domeGeo = new THREE.SphereGeometry(0.08, 12, 12);
  const dome = new THREE.Mesh(domeGeo, glassMat);
  dome.position.set(-0.6, 2.85, -0.7);
  dome.userData = { componentId: "buchholz_relay" };
  buchholzGroup.add(dome);

  // 10. TAP CHANGER (OLTC Mechanism Enclosure)
  const tapChangerGroup = createComponentGroup("tap_changer");
  const oltcMat = createStdMat("tap_changer", 0x334155, 0.5, 0.4);
  const oltcGeo = new THREE.BoxGeometry(0.65, 1.2, 0.45);
  const oltcBox = new THREE.Mesh(oltcGeo, oltcMat);
  oltcBox.position.set(1.4, 1.3, 1.2);
  oltcBox.castShadow = true;
  oltcBox.userData = { componentId: "tap_changer" };
  tapChangerGroup.add(oltcBox);

  // OLTC Drive Shaft
  const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 12);
  const shaft = new THREE.Mesh(shaftGeo, pipeMat);
  shaft.position.set(1.4, 0.6, 1.2);
  shaft.userData = { componentId: "tap_changer" };
  tapChangerGroup.add(shaft);

  // 11. EXPLOSION VENT / PRD (Pressure Relief Device)
  const ventGroup = createComponentGroup("explosion_vent");
  const ventMat = createStdMat("explosion_vent", 0x64748b, 0.4, 0.6);
  const ventPipeGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.1, 16);
  const ventPipe = new THREE.Mesh(ventPipeGeo, ventMat);
  ventPipe.rotation.z = -0.35;
  ventPipe.position.set(-1.6, 2.9, 0.6);
  ventPipe.userData = { componentId: "explosion_vent" };
  ventGroup.add(ventPipe);

  const prdFlangeGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16);
  const prdFlange = new THREE.Mesh(prdFlangeGeo, ventMat);
  prdFlange.position.set(-1.8, 3.4, 0.6);
  prdFlange.userData = { componentId: "explosion_vent" };
  ventGroup.add(prdFlange);

  // 12. MARSHALLING KIOSK
  const kioskGroup = createComponentGroup("marshalling_kiosk");
  const kioskMat = createStdMat("marshalling_kiosk", 0x475569, 0.35, 0.7);
  const kioskGeo = new THREE.BoxGeometry(0.7, 1.1, 0.35);
  const kiosk = new THREE.Mesh(kioskGeo, kioskMat);
  kiosk.position.set(-1.4, 0.8, 1.35);
  kiosk.castShadow = true;
  kiosk.userData = { componentId: "marshalling_kiosk" };
  kioskGroup.add(kiosk);

  // Raycaster for user click / selection
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function getIntersectedComponent(event: MouseEvent): TransformerComponentId | null {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== scene) {
        if (obj.userData?.componentId) {
          return obj.userData.componentId as TransformerComponentId;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  const handleClick = (e: MouseEvent) => {
    const compId = getIntersectedComponent(e);
    if (compId) {
      onComponentClick(compId);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const compId = getIntersectedComponent(e);
    if (onComponentHover) {
      onComponentHover(compId);
    }
    renderer.domElement.style.cursor = compId ? "pointer" : "default";
  };

  renderer.domElement.addEventListener("click", handleClick);
  renderer.domElement.addEventListener("mousemove", handleMouseMove);

  // Dynamic visual state updater
  let pulseClock = 0;
  let currentStates: Record<TransformerComponentId, ComponentVisualState> = {} as any;
  let currentSelectedId: TransformerComponentId | null = null;

  function updateStates(
    states: Record<TransformerComponentId, ComponentVisualState>,
    selectedId: TransformerComponentId | null,
  ) {
    currentStates = states;
    currentSelectedId = selectedId;
  }

  // Animation render loop
  let animationFrameId: number;
  const clock = new THREE.Clock();

  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    pulseClock += delta * 3.5;
    const pulseFactor = (Math.sin(pulseClock) + 1) * 0.5; // 0 to 1

    // Apply colors/emissive to components according to state
    componentMaterials.forEach((mats, compId) => {
      const state = currentStates[compId] ?? "Healthy";
      const isSelected = compId === currentSelectedId;

      mats.forEach((mat) => {
        if (isSelected) {
          // Highlight selected component with refined rim glow that preserves metallic textures
          if (compId === "main_tank") {
            mat.emissive.setHex(0x0ea5e9);
            mat.emissiveIntensity = 0.12 + 0.08 * pulseFactor;
          } else {
            mat.emissive.setHex(0x06b6d4);
            mat.emissiveIntensity = 0.28 + 0.15 * pulseFactor;
          }
        } else if (state === "Critical") {
          // Red warning pulse
          mat.emissive.setHex(0xef4444);
          mat.emissiveIntensity = 0.35 + 0.4 * pulseFactor;
        } else if (state === "Warning") {
          // Amber glow
          mat.emissive.setHex(0xf59e0b);
          mat.emissiveIntensity = 0.22 + 0.25 * pulseFactor;
        } else if (state === "Unknown") {
          mat.emissive.setHex(0x64748b);
          mat.emissiveIntensity = 0.08;
        } else {
          // Healthy: neutral appearance
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      });
    });

    renderer.render(scene, camera);
  }

  animate();

  return {
    scene,
    camera,
    renderer,
    componentGroups,
    componentMaterials,
    updateStates,
    dispose: () => {
      cancelAnimationFrame(animationFrameId);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("mousemove", handleMouseMove);
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      scene.clear();
    },
  };
}
