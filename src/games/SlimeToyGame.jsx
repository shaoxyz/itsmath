/**
 * SlimeToyGame.jsx - 史莱姆玩具游戏
 * 
 * 基于软体物理的交互式史莱姆玩具
 * - 按压挤扁
 * - 倾斜滚动（陀螺仪）
 * - 双击弹跳
 * - 多指触控
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';

// ========== 俯视角史莱姆物理引擎 ==========
class SlimePhysics {
  constructor() {
    this.particles = [];
    this.springs = [];
    this.center = { x: 0, y: 0, z: 0 };
    
    this.bounds = {
      minX: -1.6, maxX: 1.6,
      minZ: -1.6, maxZ: 1.6,
      groundY: 0,
    };
    
    this.tilt = { x: 0, z: 0 };
    
    this.config = {
      surfaceStiffness: 25,
      surfaceDamping: 2,
      structureStiffness: 40,
      structureDamping: 2,
      volumeStiffness: 150,
      targetVolume: 0,
      linearDamping: 0.97,
      groundFriction: 0.75,
      wallBounce: 0.55,
      shapeRecovery: 0.03,
      pressForce: 100,
      pressRadius: 2.2,
      gravity: -15,
    };
    
    this.pressPoints = [];
  }

  init(radius = 0.8, particleCount = 32) {
    this.particles = [];
    this.springs = [];
    
    // 球形分布
    const phi = Math.PI * (3 - Math.sqrt(5));
    
    for (let i = 0; i < particleCount; i++) {
      const y = 1 - (i / (particleCount - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;
      
      const px = Math.cos(theta) * radiusAtY * radius;
      const py = y * radius * 0.4 + 0.4; // 压扁 + 抬高到地面上
      const pz = Math.sin(theta) * radiusAtY * radius;
      
      this.particles.push({
        pos: { x: px, y: py, z: pz },
        vel: { x: 0, y: 0, z: 0 },
        basePos: { x: px, y: py, z: pz },
        pressure: 0,
      });
    }

    // 中心粒子
    this.particles.push({
      pos: { x: 0, y: 0.4, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      basePos: { x: 0, y: 0.4, z: 0 },
      isCenter: true,
      pressure: 0,
    });
    
    this._createSprings(radius);
    this._updateCenter();
    this.config.targetVolume = this._calcVolume();
  }

  _createSprings(radius) {
    const n = this.particles.length - 1;
    const centerIdx = n;
    
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dist = this._dist(this.particles[i].pos, this.particles[j].pos);
        
        if (dist < radius * 0.6) {
          this.springs.push({
            a: i, b: j, rest: dist,
            stiff: this.config.surfaceStiffness,
            damp: this.config.surfaceDamping,
          });
        } else if (dist < radius * 1.2) {
          this.springs.push({
            a: i, b: j, rest: dist,
            stiff: this.config.structureStiffness,
            damp: this.config.structureDamping,
          });
        }
      }
      
      // 到中心
      const dc = this._dist(this.particles[i].pos, this.particles[centerIdx].pos);
      this.springs.push({
        a: i, b: centerIdx, rest: dc * 0.9,
        stiff: this.config.structureStiffness * 0.7,
        damp: this.config.structureDamping,
      });
    }
  }

  _dist(a, b) {
    return Math.sqrt((b.x-a.x)**2 + (b.y-a.y)**2 + (b.z-a.z)**2);
  }

  _calcVolume() {
    let maxR = 0;
    for (let i = 0; i < this.particles.length - 1; i++) {
      maxR = Math.max(maxR, this._dist(this.particles[i].pos, this.center));
    }
    return (4/3) * Math.PI * maxR * maxR * maxR;
  }

  _updateCenter() {
    let x = 0, y = 0, z = 0;
    const n = this.particles.length - 1;
    for (let i = 0; i < n; i++) {
      x += this.particles[i].pos.x;
      y += this.particles[i].pos.y;
      z += this.particles[i].pos.z;
    }
    this.center = { x: x/n, y: y/n, z: z/n };
  }

  setTilt(x, z) {
    this.tilt = { x: x * 25, z: z * 25 };
  }

  addPress(x, z, strength = 1) {
    this.pressPoints.push({ x, z, strength });
  }

  clearPress() {
    this.pressPoints = [];
    for (const p of this.particles) {
      p.pressure *= 0.7;
    }
  }

  step(dt) {
    const steps = 5;
    const subDt = dt / steps;
    
    for (let s = 0; s < steps; s++) {
      this._applyForces();
      this._applySprings();
      this._applyVolume();
      this._applyShape(subDt);
      this._integrate(subDt);
      this._boundaries();
    }
    
    this._updateCenter();
  }

  _applyForces() {
    const cfg = this.config;
    
    for (const p of this.particles) {
      // 重力
      p.vel.y += cfg.gravity * 0.001;
      
      // 倾斜 - 更强的响应，像液体流动
      p.vel.x += this.tilt.x * 0.002;
      p.vel.z += this.tilt.z * 0.002;
    }
    
    // 按压
    for (const press of this.pressPoints) {
      for (let i = 0; i < this.particles.length - 1; i++) {
        const p = this.particles[i];
        const dx = p.pos.x - press.x;
        const dz = p.pos.z - press.z;
        const hDist = Math.sqrt(dx*dx + dz*dz);
        
        if (hDist < cfg.pressRadius) {
          const t = 1 - hDist / cfg.pressRadius;
          const strength = Math.pow(t, 0.4) * press.strength;
          
          // 向下压
          p.vel.y -= strength * cfg.pressForce * 0.015;
          
          // 向外挤
          if (hDist > 0.01) {
            const outF = strength * cfg.pressForce * 0.004;
            p.vel.x += (dx / hDist) * outF;
            p.vel.z += (dz / hDist) * outF;
          }
          
          p.pressure = Math.max(p.pressure, strength);
        }
      }
    }
  }

  _applySprings() {
    for (const s of this.springs) {
      const pa = this.particles[s.a];
      const pb = this.particles[s.b];
      
      const dx = pb.pos.x - pa.pos.x;
      const dy = pb.pos.y - pa.pos.y;
      const dz = pb.pos.z - pa.pos.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.001;
      
      const nx = dx/dist, ny = dy/dist, nz = dz/dist;
      
      const stretch = dist - s.rest;
      const springF = stretch * s.stiff;
      
      const rvx = pb.vel.x - pa.vel.x;
      const rvy = pb.vel.y - pa.vel.y;
      const rvz = pb.vel.z - pa.vel.z;
      const dampF = (rvx*nx + rvy*ny + rvz*nz) * s.damp;
      
      const f = (springF + dampF) * 0.006;
      
      pa.vel.x += nx * f;
      pa.vel.y += ny * f;
      pa.vel.z += nz * f;
      pb.vel.x -= nx * f;
      pb.vel.y -= ny * f;
      pb.vel.z -= nz * f;
    }
  }

  _applyVolume() {
    const vol = this._calcVolume();
    const err = 1 - vol / this.config.targetVolume;
    const pStr = err * this.config.volumeStiffness;
    
    for (let i = 0; i < this.particles.length - 1; i++) {
      const p = this.particles[i];
      const dx = p.pos.x - this.center.x;
      const dy = p.pos.y - this.center.y;
      const dz = p.pos.z - this.center.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.001;
      
      const factor = 1 - p.pressure * 0.6;
      const f = pStr * factor * 0.0006;
      
      p.vel.x += (dx/dist) * f;
      p.vel.y += (dy/dist) * f;
      p.vel.z += (dz/dist) * f;
    }
  }

  _applyShape(dt) {
    const str = this.config.shapeRecovery;
    
    for (let i = 0; i < this.particles.length - 1; i++) {
      const p = this.particles[i];
      if (p.pressure > 0.1) continue;
      
      const tx = this.center.x + p.basePos.x;
      const ty = this.center.y + p.basePos.y - 0.4 + 0.4;
      const tz = this.center.z + p.basePos.z;
      
      p.vel.x += (tx - p.pos.x) * str * dt;
      p.vel.y += (ty - p.pos.y) * str * dt;
      p.vel.z += (tz - p.pos.z) * str * dt;
    }
  }

  _integrate(dt) {
    const damp = this.config.linearDamping;
    
    for (const p of this.particles) {
      p.vel.x *= damp;
      p.vel.y *= damp;
      p.vel.z *= damp;
      
      const spd = Math.sqrt(p.vel.x**2 + p.vel.y**2 + p.vel.z**2);
      if (spd > 3) {
        const sc = 3 / spd;
        p.vel.x *= sc;
        p.vel.y *= sc;
        p.vel.z *= sc;
      }
      
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
    }
  }

  _boundaries() {
    const b = this.bounds;
    const bounce = this.config.wallBounce;
    const fric = this.config.groundFriction;
    const margin = 0.05;
    
    for (const p of this.particles) {
      if (p.pos.y < b.groundY) {
        p.pos.y = b.groundY;
        p.vel.y *= -bounce * 0.4;
        p.vel.x *= fric;
        p.vel.z *= fric;
      }
      
      if (p.pos.x < b.minX) { 
        p.pos.x = b.minX + margin; 
        p.vel.x = Math.abs(p.vel.x) * bounce;
      }
      if (p.pos.x > b.maxX) { 
        p.pos.x = b.maxX - margin; 
        p.vel.x = -Math.abs(p.vel.x) * bounce;
      }
      if (p.pos.z < b.minZ) { 
        p.pos.z = b.minZ + margin; 
        p.vel.z = Math.abs(p.vel.z) * bounce;
      }
      if (p.pos.z > b.maxZ) { 
        p.pos.z = b.maxZ - margin; 
        p.vel.z = -Math.abs(p.vel.z) * bounce;
      }
      
      if (p.pos.y > 1.2) { p.pos.y = 1.2; p.vel.y *= -0.2; }
    }
  }

  getPositions() {
    const n = this.particles.length - 1;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i*3] = this.particles[i].pos.x;
      arr[i*3+1] = this.particles[i].pos.y;
      arr[i*3+2] = this.particles[i].pos.z;
    }
    return arr;
  }

  getCenter() {
    return [this.center.x, this.center.y, this.center.z];
  }

  getSquish() {
    let m = 0;
    for (const p of this.particles) m = Math.max(m, p.pressure);
    return m;
  }

  getJiggle() {
    let t = 0;
    const n = this.particles.length - 1;
    for (let i = 0; i < n; i++) {
      const v = this.particles[i].vel;
      t += Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
    }
    return Math.min(t / n * 3, 1);
  }

  reset() {
    for (const p of this.particles) {
      p.pos = { ...p.basePos };
      p.vel = { x: 0, y: 0, z: 0 };
      p.pressure = 0;
    }
    this._updateCenter();
  }
}

// ========== 主组件 ==========
export default function SlimeToyGame() {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const slimeRef = useRef(null);
  const physicsRef = useRef(null);
  const animationRef = useRef(null);
  
  const [slimeColor, setSlimeColor] = useState('#7FE5A0');
  const [squishLevel, setSquishLevel] = useState(0);
  const [jiggleLevel, setJiggleLevel] = useState(0);
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const isPressedRef = useRef(false);
  
  const pressRef = useRef([]);
  const baseRef = useRef([]);
  const lastTimeRef = useRef(0);
  const lastTapRef = useRef(0);

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
      const p = { light: [5], squish: [15, 8, 12], pop: [20, 10], bump: [10] };
      navigator.vibrate(p[type] || [5]);
    }
  }, []);

  // 初始化物理
  useEffect(() => {
    const phys = new SlimePhysics();
    phys.init(0.8, 32);
    physicsRef.current = phys;
    
    baseRef.current = phys.particles.slice(0, -1).map(p => ({
      x: p.basePos.x, y: p.basePos.y, z: p.basePos.z
    }));
  }, []);

  // 初始化渲染
  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    // 场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a24);
    sceneRef.current = scene;

    // 俯视相机
    const camSize = 3;
    const aspect = w / h;
    const camera = new THREE.OrthographicCamera(
      -camSize * aspect, camSize * aspect,
      camSize, -camSize,
      0.1, 50
    );
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 光照
    scene.add(new THREE.AmbientLight(0x8090a0, 1.2));
    
    const topLight = new THREE.DirectionalLight(0xffffff, 1.8);
    topLight.position.set(2, 8, 2);
    topLight.castShadow = true;
    topLight.shadow.mapSize.width = 512;
    topLight.shadow.mapSize.height = 512;
    scene.add(topLight);

    scene.add(new THREE.PointLight(0x88aaff, 0.6, 10).translateX(-2).translateY(4).translateZ(-2));
    scene.add(new THREE.PointLight(0xffaa88, 0.5, 10).translateX(2).translateY(4).translateZ(2));

    // 托盘底部
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshStandardMaterial({ color: 0x252530, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    scene.add(floor);

    // 托盘边框
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.5 });
    const edgeH = 0.3;
    const edgeW = 0.15;
    const halfSize = 2;
    
    // 四边
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

    // 史莱姆
    const slimeGeo = new THREE.SphereGeometry(0.8, 32, 24);
    
    // 压扁
    const pos = slimeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) * 0.4);
    }
    pos.needsUpdate = true;
    slimeGeo.computeVertexNormals();
    slimeGeo.userData.original = pos.array.slice();
    
    const slimeMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(slimeColor),
      metalness: 0,
      roughness: 0.08,
      transmission: 0.4,
      thickness: 1.0,
      ior: 1.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.92,
      emissive: new THREE.Color(slimeColor),
      emissiveIntensity: 0.08,
    });

    const slime = new THREE.Mesh(slimeGeo, slimeMat);
    slime.position.y = 0.4;
    slime.castShadow = true;
    scene.add(slime);
    slimeRef.current = slime;

    // 窗口调整
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
    };
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // 更新颜色
  useEffect(() => {
    if (slimeRef.current) {
      slimeRef.current.material.color.set(slimeColor);
    }
  }, [slimeColor]);

  // 动画
  useEffect(() => {
    const loop = (time) => {
      const phys = physicsRef.current;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const slime = slimeRef.current;

      if (!phys || !renderer || !scene || !camera || !slime) {
        animationRef.current = requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05) || 0.016;
      lastTimeRef.current = time;

      // 物理
      phys.clearPress();
      for (const p of pressRef.current) {
        phys.addPress(p.x, p.z, p.strength);
      }
      phys.step(dt);

      // 更新网格
      const positions = phys.getPositions();
      const center = phys.getCenter();
      
      slime.position.set(center[0], center[1], center[2]);
      
      const geo = slime.geometry;
      const attr = geo.attributes.position;
      const orig = geo.userData.original;
      const bases = baseRef.current;

      if (orig && bases.length > 0) {
        for (let i = 0; i < attr.count; i++) {
          const ox = orig[i*3];
          const oy = orig[i*3+1];
          const oz = orig[i*3+2];

          let tw = 0, dx = 0, dy = 0, dz = 0;

          for (let j = 0; j < bases.length; j++) {
            const b = bases[j];
            // 基准位置也是压扁的
            const bx = b.x;
            const by = (b.y - 0.4) * 0.4; // 转换回压扁坐标
            const bz = b.z;
            
            const dsq = (ox-bx)**2 + (oy-by)**2 + (oz-bz)**2;
            
            if (dsq < 2) {
              const w = 1 / (dsq + 0.05);
              tw += w;

              const px = positions[j*3] - center[0];
              const py = (positions[j*3+1] - center[1]) * 0.4 / 0.4; // 保持压扁比例
              const pz = positions[j*3+2] - center[2];

              dx += (px - bx) * w;
              dy += (py - by) * w;
              dz += (pz - bz) * w;
            }
          }

          if (tw > 0) {
            dx /= tw;
            dy /= tw;
            dz /= tw;
          }

          attr.setXYZ(i, ox + dx * 0.75, oy + dy * 0.75, oz + dz * 0.75);
        }

        attr.needsUpdate = true;
        geo.computeVertexNormals();
      }
      
      setSquishLevel(phys.getSquish());
      setJiggleLevel(phys.getJiggle());

      renderer.render(scene, camera);
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

  // 事件处理
  const prevent = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDown = useCallback((clientX, clientY, e) => {
    prevent(e);
    
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // 双击
      const phys = physicsRef.current;
      const pos = toWorld(clientX, clientY);
      if (phys && pos) {
        phys.addPress(pos.x, pos.z, 2.5);
        setTimeout(() => phys.clearPress(), 100);
      }
      haptic('pop');
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    
    isPressedRef.current = true;
    haptic('squish');
    
    const pos = toWorld(clientX, clientY);
    if (pos) pressRef.current = [{ ...pos, strength: 1 }];
  }, [toWorld, haptic, prevent]);

  const onMove = useCallback((clientX, clientY, e) => {
    prevent(e);
    if (!isPressedRef.current) return;
    
    const pos = toWorld(clientX, clientY);
    if (pos) pressRef.current = [{ ...pos, strength: 0.9 }];
  }, [toWorld, prevent]);

  const onUp = useCallback((e) => {
    prevent(e);
    isPressedRef.current = false;
    pressRef.current = [];
    haptic('pop');
  }, [haptic, prevent]);

  // 鼠标事件
  const handleMouseDown = useCallback((e) => onDown(e.clientX, e.clientY, e), [onDown]);
  const handleMouseMove = useCallback((e) => onMove(e.clientX, e.clientY, e), [onMove]);
  const handleMouseUp = useCallback((e) => onUp(e), [onUp]);

  // 触摸事件
  const handleTouchStart = useCallback((e) => {
    prevent(e);
    if (e.touches.length > 0) {
      onDown(e.touches[0].clientX, e.touches[0].clientY, e);
    }
    
    // 多点触控
    if (e.touches.length > 1) {
      const pts = Array.from(e.touches).map(t => {
        const pos = toWorld(t.clientX, t.clientY);
        return pos ? { ...pos, strength: 1 } : null;
      }).filter(Boolean);
      pressRef.current = pts;
    }
  }, [onDown, toWorld, prevent]);

  const handleTouchMove = useCallback((e) => {
    prevent(e);
    if (!isPressedRef.current) return;
    
    const pts = Array.from(e.touches).map(t => {
      const pos = toWorld(t.clientX, t.clientY);
      return pos ? { ...pos, strength: 0.9 } : null;
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
        return pos ? { ...pos, strength: 0.9 } : null;
      }).filter(Boolean);
      pressRef.current = pts;
    }
  }, [onUp, toWorld, prevent]);

  // 陀螺仪
  const enableGyro = useCallback(async () => {
    const handler = (e) => {
      if (e.beta !== null && e.gamma !== null && physicsRef.current) {
        physicsRef.current.setTilt(e.gamma / 45, e.beta / 45);
      }
    };

    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') {
          window.addEventListener('deviceorientation', handler);
          setGyroEnabled(true);
          haptic('light');
        }
      } catch (err) {
        console.log('Gyro denied');
      }
    } else {
      window.addEventListener('deviceorientation', handler);
      setGyroEnabled(true);
      haptic('light');
    }
  }, [haptic]);

  const reset = useCallback(() => {
    physicsRef.current?.reset();
    haptic('bump');
  }, [haptic]);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 select-none" style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' }}>
      {/* 标题 */}
      <div className="mb-3 text-center">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-1">
          Slime Tray
        </h1>
        <p className="text-gray-500 text-xs mb-2">
          按压挤扁 · 倾斜滚动 · 双击弹跳
        </p>
      </div>

      {/* 状态指示器 */}
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

      {/* 游戏画布 */}
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden shadow-2xl border border-gray-700"
        style={{
          width: '100%',
          maxWidth: '360px',
          aspectRatio: '1',
          boxShadow: `0 15px 30px -8px rgba(0,0,0,0.5), 0 0 50px ${slimeColor}08`,
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
      />

      {/* 控制按钮 */}
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

      {/* 颜色选择器 */}
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

      {/* 操作提示 */}
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
        SLIME TRAY v1.1
      </p>
    </div>
  );
}
