// The prize: a gold supercar waiting on the summit, with a big red bow.
import * as THREE from 'three';

export function buildCar(envMap) {
  const car = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({
    color: '#f2b705',
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMap,
    envMapIntensity: 1.2,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#0b0e12', metalness: 0.3, roughness: 0.12, envMap, envMapIntensity: 0.6,
  });
  const black = new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.7 });
  const tire = new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 1, roughness: 0.18, envMap });
  const headlight = new THREE.MeshBasicMaterial({ color: '#fffbe8' });
  const taillight = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  const bowMat = new THREE.MeshStandardMaterial({ color: '#e0202e', roughness: 0.45 });

  // Side profile of a low wedge supercar, extruded across its width
  const s = new THREE.Shape();
  s.moveTo(-2.25, 0.3);
  s.lineTo(2.18, 0.3);
  s.lineTo(2.32, 0.44);
  s.lineTo(2.2, 0.62);
  s.lineTo(0.8, 0.86);
  s.lineTo(-0.12, 1.17);
  s.lineTo(-0.95, 1.17);
  s.lineTo(-2.05, 0.92);
  s.lineTo(-2.32, 0.86);
  s.lineTo(-2.32, 0.42);
  s.lineTo(-2.25, 0.3);
  const width = 1.86;
  const bodyGeo = new THREE.ExtrudeGeometry(s, {
    depth: width, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 4,
  });
  bodyGeo.translate(0, 0, -width / 2);
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  car.add(body);

  // Cabin glass (slightly proud of the body sides)
  const w = new THREE.Shape();
  w.moveTo(0.62, 0.9);
  w.lineTo(-0.14, 1.12);
  w.lineTo(-0.92, 1.12);
  w.lineTo(-1.75, 0.94);
  w.lineTo(0.62, 0.9);
  const glassGeo = new THREE.ExtrudeGeometry(w, { depth: width + 0.16, bevelEnabled: false });
  glassGeo.translate(0, 0, -(width + 0.16) / 2);
  car.add(new THREE.Mesh(glassGeo, glass));

  // Windshield panel
  const wsPivot = new THREE.Group();
  wsPivot.position.set(0.37, 1.09, 0);
  wsPivot.rotation.z = -Math.atan2(0.31, 0.92);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.88, width * 0.9), glass);
  ws.rotation.x = -Math.PI / 2;
  wsPivot.add(ws);
  car.add(wsPivot);

  // Rear spoiler
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, width + 0.1), black);
  wing.position.set(-2.12, 1.18, 0);
  car.add(wing);
  for (const z of [-0.6, 0.6]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), black);
    strut.position.set(-2.05, 1.04, z);
    car.add(strut);
  }

  // Side intakes and splitter
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.05), black);
    intake.position.set(-0.7, 0.62, side * (width / 2 + 0.07));
    intake.rotation.z = -0.25;
    car.add(intake);
  }
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, width + 0.1), black);
  splitter.position.set(2.15, 0.3, 0);
  car.add(splitter);

  // Lights
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.42), headlight);
    hl.position.set(2.2, 0.64, side * 0.62);
    hl.rotation.z = -0.17;
    car.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.62), taillight);
    tl.position.set(-2.4, 0.76, side * 0.55);
    car.add(tl);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 12), chrome);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-2.38, 0.42, side * 0.18);
    car.add(pipe);
  }

  // Wheels
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 24);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.32, 10);
  rimGeo.rotateX(Math.PI / 2);
  for (const [x, z] of [[1.42, 0.86], [1.42, -0.86], [-1.45, 0.86], [-1.45, -0.86]]) {
    const wg = new THREE.Group();
    wg.position.set(x, 0.37, z);
    const t = new THREE.Mesh(tireGeo, tire);
    t.castShadow = true;
    wg.add(t);
    wg.add(new THREE.Mesh(rimGeo, chrome));
    car.add(wg);
    wheels.push(wg);
  }

  // Under-tray
  const tray = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.12, width - 0.1), black);
  tray.position.y = 0.3;
  car.add(tray);

  // A big red bow on the roof: it's a prize
  const bow = new THREE.Group();
  bow.position.set(-0.55, 1.3, 0);
  const loopGeo = new THREE.TorusGeometry(0.22, 0.07, 8, 18);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(loopGeo, bowMat);
    loop.position.set(0, 0.1, side * 0.2);
    loop.rotation.set(0, Math.PI / 2, side * 0.5);
    loop.scale.set(1, 1, 0.6);
    bow.add(loop);
  }
  bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), bowMat));
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, width + 0.2), bowMat);
  ribbon.position.y = -0.12;
  bow.add(ribbon);
  const ribbon2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.16), bowMat);
  ribbon2.position.y = -0.12;
  bow.add(ribbon2);
  car.add(bow);

  car.userData = { wheels, paint, headlight, bow };
  return car;
}
