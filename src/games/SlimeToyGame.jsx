import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer, RenderPass, BloomEffect, EffectPass } from 'postprocessing';

// Rapier 软体史莱姆物理 - 盒子中的果冻
class RapierSlimePhysics {
  constructor() {
    this.world = null;
    this.particles = [];
    this.joints = [];
    this.initialized = false;
    this.baseGravity = 12;
    this.interactionIntensity = 0;
  }

  async init() {
    await RAPIER.init();
    
    this.world = new RAPIER.World({ x: 0, y: -this.baseGravity, z: 0 });
    
    // 透明盒子边界 - 地面
    const groundDesc = RAPIER.ColliderDesc.cuboid(2, 0.05, 2)
      .setTranslation(0, -0.05, 0)
      .setFriction(0.6)
      .setRestitution(0.3);
    this.world.createCollider(groundDesc);
    
    // 透明盒子边界 - 顶部
    const ceilingDesc = RAPIER.ColliderDesc.cuboid(2, 0.05, 2)
      .setTranslation(0, 1.5, 0)
      .setFriction(0.3)
      .setRestitution(0.4);
    this.world.createCollider(ceilingDesc);
    
    // 透明盒子边界 - 四面墙
    const wallHeight = 0.8;
    const wallThickness = 0.05;
    const halfSize = 1.4;
    
    const walls = [
      { pos: [0, wallHeight, -halfSize], size: [halfSize, wallHeight, wallThickness] },
      { pos: [0, wallHeight, halfSize], size: [halfSize, wallHeight, wallThickness] },
      { pos: [-halfSize, wallHeight, 0], size: [wallThickness, wallHeight, halfSize] },
      { pos: [halfSize, wallHeight, 0], size: [wallThickness, wallHeight, halfSize] },
    ];
    
    walls.forEach(w => {
      const desc = RAPIER.ColliderDesc.cuboid(...w.size)
        .setTranslation(...w.pos)
        .setFriction(0.4)
        .setRestitution(0.5);
      this.world.createCollider(desc);
    });
    
    this._createSoftBody();
    this.initialized = true;
  }

  _createSoftBody() {
    const radius = 0.55;
    const particleRadius = 0.1;
    const layers = 4;
    const particlesPerLayer = 8;
    
    for (let layer = 0; layer < layers; layer++) {
      const y = 0.2 + layer * 0.12;
      const layerRadius = radius * (1 - layer * 0.2);
      const count = layer === layers - 1 ? 1 : particlesPerLayer;
      
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = layer === layers - 1 ? 0 : Math.cos(angle) * layerRadius;
        const z = layer === layers - 1 ? 0 : Math.sin(angle) * layerRadius;
        
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setLinearDamping(4.0)
          .setAngularDamping(5.0);
        
        const body = this.world.createRigidBody(bodyDesc);
        
        const colliderDesc = RAPIER.ColliderDesc.ball(particleRadius)
          .setFriction(0.5)
          .setRestitution(0.4)
          .setDensity(2.0);
        
        this.world.createCollider(colliderDesc, body);
        this.particles.push({ body, basePos: { x, y, z } });
      }
    }
    
    // 弹簧约束 - 更柔软的连接
    const stiffness = 400;
    const damping = 20;
    
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const pi = this.particles[i].body.translation();
        const pj = this.particles[j].body.translation();
        const dist = Math.sqrt(
          (pj.x - pi.x) ** 2 + (pj.y - pi.y) ** 2 + (pj.z - pi.z) ** 2
        );
        
        if (dist < radius * 1.5) {
          const jointData = RAPIER.JointData.spring(
            dist * 0.9,
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

  setTilt(tiltX, tiltZ) {
    if (this.world) {
      // 倾斜盒子 = 改变重力方向，模拟盒子被倾斜
      const gx = tiltX * this.baseGravity * 0.8;
      const gz = tiltZ * this.baseGravity * 0.8;
      const gy = -this.baseGravity;
      this.world.gravity = { x: gx, y: gy, z: gz };
    }
  }

  applyForceAt(worldX, worldZ, strength) {
    if (!this.initialized) return;
    
    this.interactionIntensity = Math.min(1, this.interactionIntensity + strength * 0.2);
    
    for (const p of this.particles) {
      const pos = p.body.translation();
      const dx = pos.x - worldX;
      const dz = pos.z - worldZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < 1.2) {
        const factor = Math.pow(1 - dist / 1.2, 0.5) * strength;
        
        // 轻柔按压
        const forceY = -factor * 3;
        const forceH = dist > 0.05 ? factor * 1.5 / dist : 0;
        
        p.body.applyImpulse({ 
          x: dx * forceH, 
          y: forceY, 
          z: dz * forceH 
        }, true);
      }
    }
  }

  step(dt) {
    if (!this.initialized) return;
    
    this.world.timestep = Math.min(dt, 0.016);
    this.world.step();
    
    this.interactionIntensity *= 0.9;
  }

  getPositions() {
    return this.particles.map(p => {
      const pos = p.body.translation();
      return { x: pos.x, y: pos.y, z: pos.z };
    });
  }

  getCenter() {
    if (this.particles.length === 0) return { x: 0, y: 0.3, z: 0 };
    
    let cx = 0, cy = 0, cz = 0;
    for (const p of this.particles) {
      const pos = p.body.translation();
      cx += pos.x;
      cy += pos.y;
      cz += pos.z;
    }
    const n = this.particles.length;
    return { x: cx / n, y: cy / n, z: cz / n };
  }

  getInteractionIntensity() {
    return this.interactionIntensity;
  }

  getVelocityMagnitude() {
    let total = 0;
    for (const p of this.particles) {
      const vel = p.body.linvel();
      total += Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
    }
    return Math.min(total / this.particles.length / 3, 1);
  }

  reset() {
    for (const p of this.particles) {
      p.body.setTranslation(p.basePos, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.interactionIntensity = 0;
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

export default function SlimeToyGame() {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const bloomRef = useRef(null);
  const cameraRef = useRef(null);
  const slimeMeshRef = useRef(null);
  const physicsRef = useRef(null);
  const animationRef = useRef(null);
  
  const [slimeColor, setSlimeColor] = useState('#7FE5A0');
  const [squishLevel, setSquishLevel] = useState(0);
  const [jiggleLevel, setJiggleLevel] = useState(0);
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const isPressedRef = useRef(false);
  const pressRef = useRef([]);
  const lastTimeRef = useRef(0);
  const lastTapRef = useRef(0);
  const gyroHandlerRef = useRef(null);

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
      const patterns = { light: [5], squish: [15, 8, 12], pop: [20, 10], bump: [10] };
      navigator.vibrate(patterns[type] || [5]);
    }
  }, []);

  // 初始化物理引擎
  useEffect(() => {
    const physics = new RapierSlimePhysics();
    physicsRef.current = physics;
    
    physics.init().then(() => {
      setIsLoading(false);
    });
    
    return () => {
      physics.dispose();
    };
  }, []);

  // 初始化渲染
  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a22);
    sceneRef.current = scene;

    const camSize = 2.8;
    const aspect = w / h;
    const camera = new THREE.OrthographicCamera(
      -camSize * aspect, camSize * aspect,
      camSize, -camSize,
      0.1, 50
    );
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 后处理 - Bloom 光晕
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    const bloom = new BloomEffect({
      intensity: 0.8,
      luminanceThreshold: 0.4,
      luminanceSmoothing: 0.7,
      mipmapBlur: true,
    });
    bloomRef.current = bloom;
    composer.addPass(new EffectPass(camera, bloom));
    composerRef.current = composer;

    // 光照 - 柔和但不过亮
    scene.add(new THREE.AmbientLight(0x8090a0, 0.8));
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(3, 10, 3);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    mainLight.shadow.camera.near = 1;
    mainLight.shadow.camera.far = 20;
    mainLight.shadow.radius = 3;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xeeeeff, 0.5);
    fillLight.position.set(-2, 8, -2);
    scene.add(fillLight);

    scene.add(new THREE.PointLight(0x6688ff, 0.4, 8).translateX(-2).translateY(4).translateZ(-2));
    scene.add(new THREE.PointLight(0xff8866, 0.3, 8).translateX(2).translateY(4).translateZ(2));

    // 托盘
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshStandardMaterial({ 
        color: 0x2a2a35, 
        roughness: 0.8,
        metalness: 0.1,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    scene.add(floor);

    const edgeMat = new THREE.MeshStandardMaterial({ 
      color: 0x3a3a48, 
      roughness: 0.6,
      metalness: 0.2,
    });
    const edgeH = 0.35;
    const edgeW = 0.12;
    const halfSize = 1.85;
    
    const edges = [
      { pos: [0, edgeH/2, -halfSize], scale: [halfSize*2 + edgeW, edgeH, edgeW] },
      { pos: [0, edgeH/2, halfSize], scale: [halfSize*2 + edgeW, edgeH, edgeW] },
      { pos: [-halfSize, edgeH/2, 0], scale: [edgeW, edgeH, halfSize*2] },
      { pos: [halfSize, edgeH/2, 0], scale: [edgeW, edgeH, halfSize*2] },
    ];
    
    edges.forEach(e => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), edgeMat);
      mesh.position.set(...e.pos);
      mesh.scale.set(...e.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    });

    // 史莱姆网格 - 使用 metaball-like 的方式
    const slimeGeo = new THREE.SphereGeometry(0.65, 48, 32);
    
    const pos = slimeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) * 0.5);
    }
    pos.needsUpdate = true;
    slimeGeo.computeVertexNormals();
    slimeGeo.userData.original = pos.array.slice();
    
    const slimeMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(slimeColor),
      metalness: 0.0,
      roughness: 0.15,
      transmission: 0.15,
      thickness: 0.5,
      ior: 1.4,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.95,
      emissive: new THREE.Color(slimeColor),
      emissiveIntensity: 0.2,
    });

    const slime = new THREE.Mesh(slimeGeo, slimeMat);
    slime.position.y = 0.35;
    slime.castShadow = true;
    scene.add(slime);
    slimeMeshRef.current = slime;

    const resize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      const na = nw / nh;
      camera.left = -camSize * na;
      camera.right = camSize * na;
      camera.top = camSize;
      camera.bottom = -camSize;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      composer.setSize(nw, nh);
    };
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      composer.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 更新颜色和光晕
  useEffect(() => {
    if (slimeMeshRef.current) {
      slimeMeshRef.current.material.color.set(slimeColor);
      slimeMeshRef.current.material.emissive.set(slimeColor);
    }
  }, [slimeColor]);

  // 动画循环
  useEffect(() => {
    const loop = (time) => {
      const physics = physicsRef.current;
      const composer = composerRef.current;
      const bloom = bloomRef.current;
      const slime = slimeMeshRef.current;

      if (!physics?.initialized || !composer || !slime) {
        animationRef.current = requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05) || 0.016;
      lastTimeRef.current = time;

      // 应用按压力
      for (const p of pressRef.current) {
        physics.applyForceAt(p.x, p.z, p.strength);
      }
      
      physics.step(dt);

      // 更新网格位置
      const center = physics.getCenter();
      slime.position.set(center.x, center.y, center.z);
      
      // 根据物理粒子变形网格
      const positions = physics.getPositions();
      const geo = slime.geometry;
      const attr = geo.attributes.position;
      const orig = geo.userData.original;
      
      if (orig && positions.length > 0) {
        for (let i = 0; i < attr.count; i++) {
          const ox = orig[i * 3];
          const oy = orig[i * 3 + 1];
          const oz = orig[i * 3 + 2];
          
          let totalWeight = 0;
          let dx = 0, dy = 0, dz = 0;
          
          for (const p of positions) {
            const px = p.x - center.x;
            const py = (p.y - center.y) * 2;
            const pz = p.z - center.z;
            
            const distSq = (ox - px) ** 2 + (oy - py) ** 2 + (oz - pz) ** 2;
            
            if (distSq < 1.5) {
              const w = 1 / (distSq + 0.1);
              totalWeight += w;
              dx += (px - ox) * w;
              dy += (py - oy) * w;
              dz += (pz - oz) * w;
            }
          }
          
          if (totalWeight > 0) {
            dx /= totalWeight;
            dy /= totalWeight;
            dz /= totalWeight;
          }
          
          attr.setXYZ(i, ox + dx * 0.6, oy + dy * 0.6, oz + dz * 0.6);
        }
        
        attr.needsUpdate = true;
        geo.computeVertexNormals();
      }

      // 动态调整光晕强度
      const interaction = physics.getInteractionIntensity();
      const velocity = physics.getVelocityMagnitude();
      const bloomIntensity = 0.6 + interaction * 1.5 + velocity * 0.8;
      bloom.intensity = THREE.MathUtils.lerp(bloom.intensity, bloomIntensity, 0.15);
      
      // 动态调整自发光
      slime.material.emissiveIntensity = 0.15 + interaction * 0.4 + velocity * 0.2;
      
      setSquishLevel(interaction);
      setJiggleLevel(velocity);

      composer.render(dt);
      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  // 坐标转换
  const toWorld = useCallback((cx, cy) => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return null;

    const rect = container.getBoundingClientRect();
    const nx = ((cx - rect.left) / rect.width) * 2 - 1;
    const ny = -((cy - rect.top) / rect.height) * 2 + 1;

    const worldX = nx * (camera.right - camera.left) / 2;
    const worldZ = -ny * (camera.top - camera.bottom) / 2;

    return { x: worldX, z: worldZ };
  }, []);

  const prevent = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDown = useCallback((clientX, clientY, e) => {
    prevent(e);
    
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const physics = physicsRef.current;
      const pos = toWorld(clientX, clientY);
      if (physics && pos) {
        physics.applyForceAt(pos.x, pos.z, 3);
      }
      haptic('pop');
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    
    isPressedRef.current = true;
    haptic('squish');
    
    const pos = toWorld(clientX, clientY);
    if (pos) pressRef.current = [{ ...pos, strength: 1.2 }];
  }, [toWorld, haptic, prevent]);

  const onMove = useCallback((clientX, clientY, e) => {
    prevent(e);
    if (!isPressedRef.current) return;
    
    const pos = toWorld(clientX, clientY);
    if (pos) pressRef.current = [{ ...pos, strength: 1.0 }];
  }, [toWorld, prevent]);

  const onUp = useCallback((e) => {
    prevent(e);
    isPressedRef.current = false;
    pressRef.current = [];
    haptic('pop');
  }, [haptic, prevent]);

  const handleMouseDown = useCallback((e) => onDown(e.clientX, e.clientY, e), [onDown]);
  const handleMouseMove = useCallback((e) => onMove(e.clientX, e.clientY, e), [onMove]);
  const handleMouseUp = useCallback((e) => onUp(e), [onUp]);

  const handleTouchStart = useCallback((e) => {
    prevent(e);
    if (e.touches.length > 0) {
      onDown(e.touches[0].clientX, e.touches[0].clientY, e);
    }
    
    if (e.touches.length > 1) {
      const pts = Array.from(e.touches).map(t => {
        const pos = toWorld(t.clientX, t.clientY);
        return pos ? { ...pos, strength: 1.2 } : null;
      }).filter(Boolean);
      pressRef.current = pts;
    }
  }, [onDown, toWorld, prevent]);

  const handleTouchMove = useCallback((e) => {
    prevent(e);
    if (!isPressedRef.current) return;
    
    const pts = Array.from(e.touches).map(t => {
      const pos = toWorld(t.clientX, t.clientY);
      return pos ? { ...pos, strength: 1.0 } : null;
    }).filter(Boolean);
    pressRef.current = pts;
  }, [toWorld, prevent]);

  const handleTouchEnd = useCallback((e) => {
    prevent(e);
    if (e.touches.length === 0) {
      onUp(e);
    } else {
      const pts = Array.from(e.touches).map(t => {
        const pos = toWorld(t.clientX, t.clientY);
        return pos ? { ...pos, strength: 1.0 } : null;
      }).filter(Boolean);
      pressRef.current = pts;
    }
  }, [onUp, toWorld, prevent]);

  const enableGyro = useCallback(async () => {
    const handler = (e) => {
      if (e.beta !== null && e.gamma !== null && physicsRef.current) {
        // gamma: 左右倾斜 (-90 to 90), beta: 前后倾斜 (-180 to 180)
        const tiltX = Math.max(-1, Math.min(1, e.gamma / 45));
        const tiltZ = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
        physicsRef.current.setTilt(tiltX, tiltZ);
      }
    };

    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') {
          window.addEventListener('deviceorientation', handler);
          gyroHandlerRef.current = handler;
          setGyroEnabled(true);
          haptic('light');
        }
      } catch {
        console.log('Gyro permission denied');
      }
    } else {
      window.addEventListener('deviceorientation', handler);
      gyroHandlerRef.current = handler;
      setGyroEnabled(true);
      haptic('light');
    }
  }, [haptic]);

  const reset = useCallback(() => {
    physicsRef.current?.reset();
    haptic('bump');
  }, [haptic]);

  // 清理陀螺仪
  useEffect(() => {
    return () => {
      if (gyroHandlerRef.current) {
        window.removeEventListener('deviceorientation', gyroHandlerRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 select-none" style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' }}>
      <div className="mb-3 text-center">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-1">
          Slime Tray
        </h1>
        <p className="text-gray-500 text-xs mb-2">
          按压挤扁 · 倾斜滚动 · 双击弹跳
        </p>
      </div>

      <div className="flex gap-3 mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 rounded-lg">
          <span className="text-xs">🤏</span>
          <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-100"
              style={{ 
                width: `${squishLevel * 100}%`,
                background: slimeColor 
              }} 
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 rounded-lg">
          <span className="text-xs">〰️</span>
          <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-100"
              style={{ 
                width: `${jiggleLevel * 100}%`,
                background: 'linear-gradient(90deg, #88f, #f8f)' 
              }} 
            />
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden shadow-2xl border border-gray-700 relative"
        style={{
          width: '100%',
          maxWidth: '360px',
          aspectRatio: '1',
          boxShadow: `0 15px 40px -10px rgba(0,0,0,0.6), 0 0 60px ${slimeColor}15`,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={prevent}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-400 text-sm">加载物理引擎...</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <button 
          onClick={enableGyro} 
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            gyroEnabled 
              ? 'bg-green-600/20 text-green-400 border border-green-500/30' 
              : 'bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30'
          }`}
        >
          📱 {gyroEnabled ? '陀螺仪已启用' : '启用陀螺仪'}
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
              boxShadow: `0 3px 10px ${c.emissive}30`,
            }}
          />
        ))}
      </div>

      <div className="flex gap-2 mt-4 flex-wrap justify-center">
        {['👆 按压', '📱 倾斜', '👆👆 双击', '🤏 多指'].map((t, i) => (
          <span 
            key={i} 
            className="px-2 py-1 bg-gray-800/40 rounded text-xs text-gray-500"
          >
            {t}
          </span>
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-600">
        SLIME TRAY v2.0 · Rapier Physics
      </p>
    </div>
  );
}
