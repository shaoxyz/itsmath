import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer, RenderPass, BloomEffect, EffectPass } from 'postprocessing';

class SlimePhysicsWorld {
  constructor() {
    this.world = null;
    this.particles = [];
    this.joints = [];
    this.initialized = false;
    this.boxOrientation = new THREE.Quaternion();
    this.baseGravityMagnitude = 15;
    this.accelerationImpulse = { x: 0, y: 0, z: 0 };
  }

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -this.baseGravityMagnitude, z: 0 });
    
    const boxSize = 1.2;
    const wallThickness = 0.02;
    
    const faces = [
      { pos: [0, -boxSize/2 - wallThickness/2, 0], size: [boxSize/2, wallThickness/2, boxSize/2] },
      { pos: [0, boxSize/2 + wallThickness/2, 0], size: [boxSize/2, wallThickness/2, boxSize/2] },
      { pos: [-boxSize/2 - wallThickness/2, 0, 0], size: [wallThickness/2, boxSize/2, boxSize/2] },
      { pos: [boxSize/2 + wallThickness/2, 0, 0], size: [wallThickness/2, boxSize/2, boxSize/2] },
      { pos: [0, 0, -boxSize/2 - wallThickness/2], size: [boxSize/2, boxSize/2, wallThickness/2] },
      { pos: [0, 0, boxSize/2 + wallThickness/2], size: [boxSize/2, boxSize/2, wallThickness/2] },
    ];
    
    faces.forEach(f => {
      const desc = RAPIER.ColliderDesc.cuboid(...f.size)
        .setTranslation(...f.pos)
        .setFriction(0.3)
        .setRestitution(0.4);
      this.world.createCollider(desc);
    });
    
    this._createSlime();
    this.initialized = true;
  }

  _createSlime() {
    const particleRadius = 0.08;
    const slimeRadius = 0.35;
    const layers = [
      { y: 0, radius: slimeRadius, count: 8 },
      { y: 0.12, radius: slimeRadius * 0.85, count: 6 },
      { y: 0.22, radius: slimeRadius * 0.6, count: 4 },
      { y: -0.1, radius: slimeRadius * 0.7, count: 6 },
      { y: 0.08, radius: 0, count: 1 },
    ];
    
    for (const layer of layers) {
      const count = layer.count;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = count === 1 ? 0 : Math.cos(angle) * layer.radius;
        const z = count === 1 ? 0 : Math.sin(angle) * layer.radius;
        const y = layer.y;
        
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setLinearDamping(3.0)
          .setAngularDamping(4.0);
        
        const body = this.world.createRigidBody(bodyDesc);
        
        const colliderDesc = RAPIER.ColliderDesc.ball(particleRadius)
          .setFriction(0.4)
          .setRestitution(0.35)
          .setDensity(2.5);
        
        this.world.createCollider(colliderDesc, body);
        this.particles.push({ body, basePos: { x, y, z } });
      }
    }
    
    const stiffness = 300;
    const damping = 15;
    
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const pi = this.particles[i].body.translation();
        const pj = this.particles[j].body.translation();
        const dist = Math.sqrt(
          (pj.x - pi.x) ** 2 + (pj.y - pi.y) ** 2 + (pj.z - pi.z) ** 2
        );
        
        if (dist < 0.5) {
          const jointData = RAPIER.JointData.spring(
            dist * 0.85,
            stiffness,
            damping,
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 }
          );
          
          const joint = this.world.createImpulseJoint(
            jointData,
            this.particles[i].body,
            this.particles[j].body,
            true
          );
          this.joints.push(joint);
        }
      }
    }
  }

  setBoxOrientation(quaternion) {
    this.boxOrientation.copy(quaternion);
    const gravityDir = new THREE.Vector3(0, -1, 0);
    gravityDir.applyQuaternion(quaternion.clone().invert());
    
    this.world.gravity = {
      x: gravityDir.x * this.baseGravityMagnitude,
      y: gravityDir.y * this.baseGravityMagnitude,
      z: gravityDir.z * this.baseGravityMagnitude,
    };
  }

  applyAcceleration(ax, ay, az) {
    const impulseScale = 0.03;
    for (const p of this.particles) {
      p.body.applyImpulse({
        x: -ax * impulseScale,
        y: -ay * impulseScale,
        z: -az * impulseScale,
      }, true);
    }
  }

  step(dt) {
    if (!this.initialized) return;
    this.world.timestep = Math.min(dt, 0.016);
    this.world.step();
  }

  getCenter() {
    if (this.particles.length === 0) return new THREE.Vector3(0, 0, 0);
    let cx = 0, cy = 0, cz = 0;
    for (const p of this.particles) {
      const pos = p.body.translation();
      cx += pos.x; cy += pos.y; cz += pos.z;
    }
    const n = this.particles.length;
    return new THREE.Vector3(cx / n, cy / n, cz / n);
  }

  getPositions() {
    return this.particles.map(p => {
      const pos = p.body.translation();
      return new THREE.Vector3(pos.x, pos.y, pos.z);
    });
  }

  getVelocityMagnitude() {
    let total = 0;
    for (const p of this.particles) {
      const vel = p.body.linvel();
      total += Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
    }
    return Math.min(total / this.particles.length / 5, 1);
  }

  reset() {
    for (const p of this.particles) {
      p.body.setTranslation(p.basePos, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  dispose() {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.particles = [];
    this.joints = [];
    this.initialized = false;
  }
}

function createGlassBox(size) {
  const group = new THREE.Group();
  
  const edgeMaterial = new THREE.LineBasicMaterial({ 
    color: 0x88ccff, 
    transparent: true, 
    opacity: 0.6,
    linewidth: 2,
  });
  
  const boxGeo = new THREE.BoxGeometry(size, size, size);
  const edges = new THREE.EdgesGeometry(boxGeo);
  const wireframe = new THREE.LineSegments(edges, edgeMaterial);
  group.add(wireframe);
  
  const cornerSize = size * 0.08;
  const cornerMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xaaddff, 
    transparent: true, 
    opacity: 0.4,
  });
  
  const halfSize = size / 2;
  const corners = [
    [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
  ];
  
  corners.forEach(([x, y, z]) => {
    const corner = new THREE.Mesh(
      new THREE.SphereGeometry(cornerSize, 8, 8),
      cornerMaterial
    );
    corner.position.set(x * halfSize, y * halfSize, z * halfSize);
    group.add(corner);
  });
  
  return group;
}

function createCartoonSlime(color) {
  const group = new THREE.Group();
  
  const bodyGeo = new THREE.SphereGeometry(0.4, 32, 24);
  const positions = bodyGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    if (y < 0) {
      positions.setY(i, y * 0.6);
    }
  }
  positions.needsUpdate = true;
  bodyGeo.computeVertexNormals();
  
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: 0.0,
    roughness: 0.2,
    transmission: 0.1,
    thickness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.92,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.15,
  });
  
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'slimeBody';
  group.add(body);
  
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  
  const eyeOffset = 0.12;
  const eyeY = 0.15;
  const eyeZ = 0.32;
  
  [-1, 1].forEach(side => {
    const eyeGroup = new THREE.Group();
    eyeGroup.name = side === -1 ? 'leftEye' : 'rightEye';
    
    const eyeWhite = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      eyeWhiteMat
    );
    eyeGroup.add(eyeWhite);
    
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 12),
      pupilMat
    );
    pupil.position.z = 0.045;
    pupil.name = 'pupil';
    eyeGroup.add(pupil);
    
    const highlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      highlightMat
    );
    highlight.position.set(0.02, 0.02, 0.07);
    eyeGroup.add(highlight);
    
    eyeGroup.position.set(side * eyeOffset, eyeY, eyeZ);
    group.add(eyeGroup);
  });
  
  const cheekMat = new THREE.MeshBasicMaterial({ 
    color: 0xffaaaa, 
    transparent: true, 
    opacity: 0.4 
  });
  
  [-1, 1].forEach(side => {
    const cheek = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 16),
      cheekMat
    );
    cheek.position.set(side * 0.22, 0.02, 0.35);
    cheek.rotation.y = side * 0.3;
    group.add(cheek);
  });
  
  return group;
}

export default function SlimeToyGame() {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const boxGroupRef = useRef(null);
  const slimeGroupRef = useRef(null);
  const physicsRef = useRef(null);
  const animationRef = useRef(null);
  
  const [slimeColor, setSlimeColor] = useState('#7FE5A0');
  const [isLoading, setIsLoading] = useState(true);
  const [sensorEnabled, setSensorEnabled] = useState(false);
  const [activityLevel, setActivityLevel] = useState(0);
  
  const boxOrientationRef = useRef(new THREE.Quaternion());
  const targetOrientationRef = useRef(new THREE.Quaternion());
  const lastAccelRef = useRef({ x: 0, y: 0, z: 0 });
  const motionHandlerRef = useRef(null);
  const orientationHandlerRef = useRef(null);
  const lastTimeRef = useRef(0);

  const colors = useMemo(() => [
    { name: '薄荷绿', value: '#7FE5A0', emissive: '#2DD573' },
    { name: '樱花粉', value: '#FFB5C5', emissive: '#FF6B8A' },
    { name: '天空蓝', value: '#87CEEB', emissive: '#3AA8E0' },
    { name: '柠檬黄', value: '#FFF59D', emissive: '#FFD600' },
    { name: '葡萄紫', value: '#CE93D8', emissive: '#8E24AA' },
    { name: '蜜桃橙', value: '#FFCC80', emissive: '#F57C00' },
  ], []);

  const haptic = useCallback((type) => {
    if ('vibrate' in navigator) {
      const patterns = { light: [5], shake: [10, 5, 10], impact: [20] };
      navigator.vibrate(patterns[type] || [5]);
    }
  }, []);

  useEffect(() => {
    const physics = new SlimePhysicsWorld();
    physicsRef.current = physics;
    physics.init().then(() => setIsLoading(false));
    return () => physics.dispose();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a24);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0, 4);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new BloomEffect({
      intensity: 0.5,
      luminanceThreshold: 0.5,
      luminanceSmoothing: 0.7,
      mipmapBlur: true,
    });
    composer.addPass(new EffectPass(camera, bloom));
    composerRef.current = composer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 8;
    controls.enablePan = false;
    controls.rotateSpeed = 0.5;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0x6080a0, 0.6));
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(3, 5, 4);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.4);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xff8866, 0.3, 10);
    rimLight.position.set(0, -2, 3);
    scene.add(rimLight);

    const boxGroup = new THREE.Group();
    const glassBox = createGlassBox(1.2 * 2);
    boxGroup.add(glassBox);
    scene.add(boxGroup);
    boxGroupRef.current = boxGroup;

    const slimeGroup = createCartoonSlime(slimeColor);
    boxGroup.add(slimeGroup);
    slimeGroupRef.current = slimeGroup;

    const resize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      composer.setSize(nw, nh);
    };
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (slimeGroupRef.current) {
      const body = slimeGroupRef.current.getObjectByName('slimeBody');
      if (body) {
        body.material.color.set(slimeColor);
        body.material.emissive.set(slimeColor);
      }
    }
  }, [slimeColor]);

  useEffect(() => {
    const loop = (time) => {
      const physics = physicsRef.current;
      const composer = composerRef.current;
      const controls = controlsRef.current;
      const boxGroup = boxGroupRef.current;
      const slimeGroup = slimeGroupRef.current;

      if (!physics?.initialized || !composer || !boxGroup || !slimeGroup) {
        animationRef.current = requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05) || 0.016;
      lastTimeRef.current = time;

      boxOrientationRef.current.slerp(targetOrientationRef.current, 0.1);
      boxGroup.quaternion.copy(boxOrientationRef.current);
      physics.setBoxOrientation(boxOrientationRef.current);

      physics.step(dt);

      const center = physics.getCenter();
      const localCenter = center.clone();
      localCenter.applyQuaternion(boxOrientationRef.current.clone().invert());
      
      slimeGroup.position.lerp(localCenter, 0.3);

      const velocity = physics.getVelocityMagnitude();
      const squish = 1 + velocity * 0.15;
      const body = slimeGroup.getObjectByName('slimeBody');
      if (body) {
        body.scale.set(squish, 1 / squish, squish);
      }

      const leftEye = slimeGroup.getObjectByName('leftEye');
      const rightEye = slimeGroup.getObjectByName('rightEye');
      if (leftEye && rightEye) {
        const eyeLag = velocity * 0.1;
        leftEye.position.y = 0.15 - eyeLag;
        rightEye.position.y = 0.15 - eyeLag;
      }

      setActivityLevel(velocity);
      controls.update();
      composer.render(dt);
      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  const enableSensors = useCallback(async () => {
    let initialOrientation = null;
    
    const orientationHandler = (e) => {
      if (e.beta === null || e.gamma === null) return;
      
      const beta = e.beta || 0;
      const gamma = e.gamma || 0;
      
      if (initialOrientation === null) {
        initialOrientation = { beta, gamma };
        return;
      }
      
      const relativeBeta = (beta - initialOrientation.beta) * 0.02;
      const relativeGamma = (gamma - initialOrientation.gamma) * 0.02;
      
      const clampedBeta = Math.max(-0.5, Math.min(0.5, relativeBeta));
      const clampedGamma = Math.max(-0.5, Math.min(0.5, relativeGamma));
      
      const euler = new THREE.Euler(clampedBeta, 0, -clampedGamma, 'XYZ');
      targetOrientationRef.current.setFromEuler(euler);
    };

    const motionHandler = (e) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x === null) return;
      
      if (lastAccelRef.current.x === 0 && lastAccelRef.current.y === 0) {
        lastAccelRef.current = { x: acc.x, y: acc.y, z: acc.z };
        return;
      }
      
      const threshold = 5;
      const dx = acc.x - lastAccelRef.current.x;
      const dy = acc.y - lastAccelRef.current.y;
      const dz = acc.z - lastAccelRef.current.z;
      
      const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (magnitude > threshold && physicsRef.current) {
        const scale = Math.min(magnitude / 20, 1);
        physicsRef.current.applyAcceleration(dx * scale, dy * scale, dz * scale);
        if (magnitude > 15) haptic('impact');
        else if (magnitude > 8) haptic('shake');
      }
      
      lastAccelRef.current = { x: acc.x, y: acc.y, z: acc.z };
    };

    const requestPermissions = async () => {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const orientPerm = await DeviceOrientationEvent.requestPermission();
        if (orientPerm !== 'granted') return false;
      }
      
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        const motionPerm = await DeviceMotionEvent.requestPermission();
        if (motionPerm !== 'granted') return false;
      }
      
      return true;
    };

    try {
      const granted = await requestPermissions();
      if (granted || typeof DeviceOrientationEvent.requestPermission !== 'function') {
        window.addEventListener('deviceorientation', orientationHandler);
        window.addEventListener('devicemotion', motionHandler);
        orientationHandlerRef.current = orientationHandler;
        motionHandlerRef.current = motionHandler;
        setSensorEnabled(true);
        haptic('light');
      }
    } catch (err) {
      console.log('Sensor permission denied:', err);
    }
  }, [haptic]);

  const reset = useCallback(() => {
    physicsRef.current?.reset();
    targetOrientationRef.current.identity();
    boxOrientationRef.current.identity();
    if (boxGroupRef.current) {
      boxGroupRef.current.quaternion.identity();
    }
    haptic('light');
  }, [haptic]);

  useEffect(() => {
    return () => {
      if (orientationHandlerRef.current) {
        window.removeEventListener('deviceorientation', orientationHandlerRef.current);
      }
      if (motionHandlerRef.current) {
        window.removeEventListener('devicemotion', motionHandlerRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 select-none" style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <div className="mb-3 text-center">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-1">
          Slime Box
        </h1>
        <p className="text-gray-500 text-xs mb-2">
          滑动旋转视角 · 晃动手机玩耍
        </p>
      </div>

      <div className="flex gap-3 mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 rounded-lg">
          <span className="text-xs">〰️</span>
          <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-150"
              style={{ 
                width: `${activityLevel * 100}%`,
                background: `linear-gradient(90deg, ${slimeColor}, #fff)` 
              }} 
            />
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden shadow-2xl relative"
        style={{
          width: '100%',
          maxWidth: '400px',
          aspectRatio: '1',
          background: 'radial-gradient(circle at 50% 30%, #2a2a38 0%, #1a1a24 100%)',
          boxShadow: `0 20px 50px -15px rgba(0,0,0,0.7), 0 0 80px ${slimeColor}10`,
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 z-10">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">加载物理引擎...</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <button 
          onClick={enableSensors} 
          disabled={sensorEnabled}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            sensorEnabled 
              ? 'bg-green-600/20 text-green-400 border border-green-500/30' 
              : 'bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30'
          }`}
        >
          📱 {sensorEnabled ? '传感器已启用' : '启用传感器'}
        </button>
        
        <button 
          onClick={reset} 
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition border border-gray-700"
        >
          ↺ 重置
        </button>
      </div>

      <div className="flex gap-3 mt-4 p-3 bg-gray-800/40 rounded-xl">
        {colors.map(c => (
          <button
            key={c.value}
            onClick={() => { setSlimeColor(c.value); haptic('light'); }}
            className="w-9 h-9 rounded-full transition-all hover:scale-110"
            style={{
              background: `radial-gradient(circle at 30% 30%, white 0%, ${c.value} 50%, ${c.emissive} 100%)`,
              outline: slimeColor === c.value ? '2px solid white' : 'none',
              outlineOffset: '2px',
              transform: slimeColor === c.value ? 'scale(1.1)' : 'scale(1)',
              boxShadow: `0 3px 12px ${c.emissive}40`,
            }}
          />
        ))}
      </div>

      <div className="flex gap-2 mt-4 flex-wrap justify-center text-xs text-gray-500">
        <span className="px-2 py-1 bg-gray-800/40 rounded">👆 滑动旋转</span>
        <span className="px-2 py-1 bg-gray-800/40 rounded">📱 倾斜盒子</span>
        <span className="px-2 py-1 bg-gray-800/40 rounded">🤳 快速挥动</span>
      </div>

      <p className="mt-4 text-xs text-gray-600">
        SLIME BOX v3.0 · Rapier Physics
      </p>
    </div>
  );
}
