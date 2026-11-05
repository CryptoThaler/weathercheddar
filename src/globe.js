// Three.js globe: coastlines + US states, station orbs with temp columns,
// temp-colored orbiting particles (GPU-animated), USGS quake pulses, hazard rings.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { mesh } from 'topojson-client';
import gsap from 'gsap';
import { tempRGB } from './derive.js';

const D2R = Math.PI / 180;
const MAX = 32; // max stations in uniform arrays
const PER = 260; // particles per station
const UP = new THREE.Vector3(0, 1, 0);

export function ll2v(lat, lon, r = 1) {
  const phi = (90 - lat) * D2R;
  const th = (lon + 180) * D2R;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}

function lines(coordsList, r, color, opacity) {
  const pos = [];
  for (const line of coordsList)
    for (let i = 1; i < line.length; i++) {
      const a = ll2v(line[i - 1][1], line[i - 1][0], r);
      const b = ll2v(line[i][1], line[i][0], r);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

function graticule(step = 15) {
  const L = [];
  for (let lon = -180; lon < 180; lon += step) L.push(Array.from({ length: 91 }, (_, i) => [lon, -90 + i * 2]));
  for (let lat = -75; lat <= 75; lat += step) L.push(Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat]));
  return L;
}

export function createGlobe(container, { onSelect } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x07060a, 1);
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  const home = ll2v(37, -96, 1);
  // Fit the contiguous US (~0.48 units half-width) to the horizontal field of view.
  const homeDist = () => {
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    const hHalf = Math.atan(Math.tan((camera.fov / 2) * D2R) * aspect);
    return Math.min(4.2, Math.max(2.55, 1 + 0.48 / Math.tan(hHalf)));
  };
  camera.position.copy(home).multiplyScalar(6.5);

  const controls = new OrbitControls(camera, labels.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 1.35;
  controls.maxDistance = 6;
  controls.rotateSpeed = 0.5;
  controls.autoRotateSpeed = 0.35;

  // --- stars
  {
    const n = 2500, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(20 + Math.random() * 30);
      p.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfae8a, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.55 })));
  }

  // --- globe body + atmosphere
  const earth = new THREE.Group();
  scene.add(earth);
  earth.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(1.-max(dot(vN,vV),0.),2.2); vec3 base = vec3(0.035,0.03,0.025); gl_FragColor = vec4(base + vec3(0.55,0.38,0.08)*f*0.55, 1.); }`,
      })
    )
  );
  earth.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 64, 48),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV;
          void main(){ float d = clamp(-dot(vN, vV), 0., 1.); float i = smoothstep(0.0, 0.45, d); gl_FragColor = vec4(1.0,0.72,0.2,1.0)*i*i*0.55; }`,
      })
    )
  );
  earth.add(lines(graticule(), 1.0008, 0xffc94a, 0.07));

  // Geography is code-split so the first paint isn't blocked.
  Promise.all([import('world-atlas/land-110m.json'), import('us-atlas/states-10m.json')]).then(([w, u]) => {
    const land = w.default, us = u.default;
    earth.add(lines(mesh(land, land.objects.land).coordinates, 1.0015, 0xffc94a, 0.55));
    earth.add(lines(mesh(us, us.objects.states, (a, b) => a !== b).coordinates, 1.0015, 0xffc94a, 0.22));
  });

  // --- stations
  const stationGroup = new THREE.Group();
  earth.add(stationGroup);
  const nodes = new Map(); // id -> node
  const pickables = [];

  const uCenters = Array.from({ length: MAX }, () => new THREE.Vector3(0, 0, 0));
  const uColors = Array.from({ length: MAX }, () => new THREE.Color(0.5, 0.5, 0.5));
  const uWind = new Array(MAX).fill(0.3);
  const uAlive = new Array(MAX).fill(0);

  const pMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPR: { value: renderer.getPixelRatio() },
      uCenters: { value: uCenters },
      uColors: { value: uColors },
      uWind: { value: uWind },
      uAlive: { value: uAlive },
    },
    vertexShader: `
      uniform float uTime, uPR; uniform vec3 uCenters[${MAX}]; uniform vec3 uColors[${MAX}];
      uniform float uWind[${MAX}]; uniform float uAlive[${MAX}];
      attribute float aIdx; attribute vec4 aSeed; varying vec3 vC; varying float vA;
      void main(){
        int i = int(aIdx); vec3 c = uCenters[i];
        float sp = 0.25 + uWind[i]*1.6;
        float ang = aSeed.z*6.2831 + uTime*sp*(0.6+aSeed.y);
        float r = 0.018 + aSeed.x*0.05;
        vec3 n = normalize(c); vec3 t = normalize(cross(n, vec3(0.,1.,0.)+1e-4)); vec3 b = cross(n,t);
        float lift = fract(aSeed.w + uTime*0.06*sp) ;
        vec3 p = c + (t*cos(ang) + b*sin(ang))*r + n*(lift*0.06 - 0.02);
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_PointSize = (2.0 + aSeed.y*3.0) * uPR * (1.6/-mv.z);
        gl_Position = projectionMatrix*mv;
        vC = uColors[i]; vA = uAlive[i] * (1.0 - lift) * (0.45 + 0.55*aSeed.y);
      }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord-.5); float a = smoothstep(.5,0.,d); gl_FragColor = vec4(vC, a*vA); }`,
  });
  {
    const g = new THREE.BufferGeometry();
    const idx = new Float32Array(MAX * PER), seed = new Float32Array(MAX * PER * 4), pos = new Float32Array(MAX * PER * 3);
    for (let i = 0; i < MAX * PER; i++) {
      idx[i] = Math.floor(i / PER);
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    earth.add(new THREE.Points(g, pMat));
  }

  const orbGeo = new THREE.SphereGeometry(0.014, 24, 16);
  const colGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 1, 8, 1, true).translate(0, 0.5, 0);
  const ringGeo = new THREE.RingGeometry(0.85, 1, 48);

  function ensureNode(st, i) {
    if (nodes.has(st.id)) return nodes.get(st.id);
    const normal = ll2v(st.lat, st.lon).normalize();
    const g = new THREE.Group();
    g.position.copy(normal);
    g.quaternion.setFromUnitVectors(UP, normal);
    const color = new THREE.Color(0.6, 0.55, 0.4);
    const col = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }));
    const orb = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color }));
    orb.userData.id = st.id;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(0.07);
    const hazard = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    hazard.rotation.x = -Math.PI / 2;
    hazard.position.y = 0.002;
    hazard.scale.setScalar(0.03);
    g.add(col, orb, hazard);
    orb.add(halo);

    const el = document.createElement('button');
    el.className = st.tx ? 'lbl tx' : 'lbl';
    el.innerHTML = `<b>${st.id}</b><span>--°</span>`;
    el.addEventListener('click', (e) => (e.stopPropagation(), onSelect?.(st.id)));
    const label = new CSS2DObject(el);
    label.center.set(-0.12, 0.5);
    orb.add(label);

    stationGroup.add(g);
    pickables.push(orb);
    const node = { st, i, g, col, orb, halo, hazard, label, el, color, normal, h: { v: 0.03 }, alive: { v: 0 }, hasAlert: false, shown: true };
    nodes.set(st.id, node);
    return node;
  }

  // shown: optional Set of station ids passing the active filter; others are dimmed.
  function updateStations(list, shown) {
    list.forEach((d, i) => {
      if (i >= MAX) return;
      const n = ensureNode(d.st, i);
      n.shown = !shown || shown.has(d.st.id);
      n.orb.material.transparent = n.col.material.transparent = true;
      gsap.to([n.orb.material, n.halo.material], { opacity: n.shown ? 1 : 0.06, duration: 0.6 });
      gsap.to(n.col.material, { opacity: n.shown ? 0.6 : 0.04, duration: 0.6 });
      const f = d.tempF;
      const [r, g, b] = tempRGB(f);
      const h = f == null ? 0.02 : 0.03 + Math.max(0, Math.min(1, (f + 10) / 115)) * 0.13;
      gsap.to(n.color, { r, g, b, duration: 1.2, ease: 'power2.out', onUpdate: () => uColors[i].copy(n.color) });
      gsap.to(n.h, {
        v: h,
        duration: 1.4,
        ease: 'elastic.out(1,0.6)',
        onUpdate: () => {
          n.col.scale.y = n.h.v;
          n.orb.position.y = n.h.v;
          uCenters[i].copy(n.normal).multiplyScalar(1 + n.h.v);
        },
      });
      uWind[i] = Math.min(1, (d.latest?.wspd ?? 5) / 30);
      gsap.to(n.alive, { v: !n.shown ? 0 : f == null ? 0.15 : 1, duration: 1, onUpdate: () => (uAlive[i] = n.alive.v) });
      n.hasAlert = n.shown && d.alerts.length > 0;
      const txt = f == null ? '--°' : `${Math.round(f)}°`;
      const span = n.el.querySelector('span');
      if (span.textContent !== txt) (span.textContent = txt), (n.size = null);
      n.el.classList.toggle('alert', n.hasAlert);
      n.el.style.setProperty('--c', `rgb(${[r, g, b].map((v) => Math.round(v * 255))})`);
    });
  }

  // --- quakes
  const quakeGroup = new THREE.Group();
  earth.add(quakeGroup);
  const quakeMat = (m) => new THREE.MeshBasicMaterial({ color: m >= 5 ? 0xff4d2e : m >= 4 ? 0xff8a3d : 0xffc36b, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  function updateQuakes(qs) {
    for (const c of [...quakeGroup.children]) {
      quakeGroup.remove(c);
      c.material.dispose();
    }
    qs.slice(0, 150).forEach((q) => {
      const n = ll2v(q.lat, q.lon).normalize();
      const m = new THREE.Mesh(ringGeo, quakeMat(q.mag));
      m.position.copy(n).multiplyScalar(1.002);
      m.lookAt(n.clone().multiplyScalar(2));
      m.userData = { base: 0.008 + (q.mag - 2.5) * 0.012, phase: Math.random() * 2, age: (Date.now() - q.t) / 864e5 };
      quakeGroup.add(m);
    });
  }

  // --- camera moves
  let tween;
  function flyTo(dir, dist = 1.9, duration = 1.6) {
    tween?.kill();
    const from = camera.position.clone();
    const fromLen = from.length();
    const a = from.clone().normalize(), b = dir.clone().normalize();
    const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion().setFromUnitVectors(a, b);
    const o = { k: 0 };
    controls.autoRotate = false;
    tween = gsap.to(o, {
      k: 1,
      duration,
      ease: 'power3.inOut',
      onUpdate: () => {
        const q = q0.clone().slerp(q1, o.k);
        camera.position.copy(a).applyQuaternion(q).multiplyScalar(fromLen + (dist - fromLen) * o.k);
        camera.lookAt(0, 0, 0);
      },
    });
  }
  // Screen-space label declutter: selected > alerts > Texas > rest; hide overlaps.
  let selId = null;
  const wp = new THREE.Vector3();
  function declutter() {
    const W = container.clientWidth, Hh = container.clientHeight, placed = [];
    const order = [...nodes.values()].sort((a, b) => rank(b) - rank(a));
    for (const n of order) {
      let vis = n.shown && tmp.copy(n.normal).dot(camDir) > 0.18;
      if (vis) {
        n.orb.getWorldPosition(wp).project(camera);
        const x = (wp.x * 0.5 + 0.5) * W, y = (-wp.y * 0.5 + 0.5) * Hh;
        if (!n.size && n.el.offsetWidth) n.size = [n.el.offsetWidth, n.el.offsetHeight]; // measured once per text change
        const [w, h] = n.size || [64, 18];
        const box = [x + 4, y - h / 2, x + 8 + w, y + h / 2];
        vis = n.st.id === selId || !placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
        if (vis) placed.push(box);
      }
      n.label.visible = vis;
    }
  }
  const rank = (n) => (n.st.id === selId ? 4 : 0) + (n.hasAlert ? 2 : 0) + (n.st.tx ? 1 : 0);

  const focus = (id) => {
    selId = id;
    const n = nodes.get(id);
    if (n) flyTo(n.normal, 1.75);
    for (const [k, v] of nodes) v.el.classList.toggle('sel', k === id);
  };
  const goHome = () => flyTo(home, homeDist(), 1.8);

  // --- picking
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let down = null;
  labels.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  labels.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = labels.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) onSelect?.(hit.object.userData.id);
  });

  // --- loop
  const clock = new THREE.Clock();
  const camDir = new THREE.Vector3(), tmp = new THREE.Vector3();
  let fps = 60, active = false;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
    pMat.uniforms.uTime.value = t;
    controls.update();
    camDir.copy(camera.position).normalize();
    declutter();
    for (const n of nodes.values()) {
      if (n.shown) n.halo.material.opacity = 0.55 + Math.sin(t * 2 + n.i) * 0.2;
      if (n.hasAlert) {
        const k = (t * 0.7 + n.i * 0.1) % 1;
        n.hazard.scale.setScalar(0.016 + k * 0.04);
        n.hazard.material.opacity = (1 - k) * 0.9;
      } else n.hazard.material.opacity = 0;
    }
    for (const m of quakeGroup.children) {
      const u = m.userData, k = ((t + u.phase) % 2.4) / 2.4;
      m.scale.setScalar(u.base * (0.35 + k * 1.4));
      m.material.opacity = (1 - k) * Math.max(0.25, 1 - u.age * 0.5) * 0.9;
    }
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function setActive(on) {
    if (on === active) return;
    active = on;
    clock.getDelta();
    renderer.setAnimationLoop(on ? frame : null);
  }
  let wantActive = false;
  document.addEventListener('visibilitychange', () => setActive(!document.hidden && wantActive));

  let introDone = false;
  return {
    updateStations,
    updateQuakes,
    focus,
    goHome,
    setActive(on) {
      wantActive = on;
      setActive(on && !document.hidden);
      if (on && !introDone) {
        introDone = true;
        flyTo(home, homeDist(), 2.4);
      }
    },
    setAutoRotate: (on) => (controls.autoRotate = on),
    get distance() {
      return camera.position.length();
    },
    get fps() {
      return fps;
    },
  };
}

let _glow;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return (_glow = new THREE.CanvasTexture(c));
}
