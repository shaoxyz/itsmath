# Metaball 模块交互文档

## 概述

本文档详细描述 Metaball 游戏各模块之间的交互方式、数据流向和通信协议。

---

## 模块依赖图

```
                         ┌─────────────────────────┐
                         │   MetaballGame.jsx      │
                         │   (React 容器组件)       │
                         └───────────┬─────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
     ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
     │  GameEngine    │    │ WebGLRenderer  │    │  InputManager  │
     │  (核心逻辑)     │    │  (GPU 渲染)     │    │   (输入处理)    │
     └────────┬───────┘    └────────────────┘    └────────────────┘
              │
     ┌────────┼────────┬────────────────┐
     │        │        │                │
     ▼        ▼        ▼                ▼
┌─────────┐┌─────────┐┌─────────┐┌───────────┐
│ Entity  ││  Chunk  ││ Physics ││  EnemyAI  │
│ Manager ││ Manager ││ System  ││           │
└─────────┘└─────────┘└─────────┘└───────────┘
     │         │
     ▼         ▼
┌─────────────────────┐
│    GameConfig       │
│   (配置中心)         │
└─────────────────────┘
```

---

## 详细交互说明

### 1. MetaballGame.jsx ↔ GameEngine

**交互类型**：双向通信

**初始化流程**：

```javascript
// MetaballGame.jsx
const engine = new GameEngine();

// 监听引擎事件
engine.on('stateChange', ({ newState }) => setGameState(newState));
engine.on('scoreChange', ({ score }) => setScore(score));
engine.on('playerDeath', ({ highScore }) => setHighScore(highScore));

// 连接输入
engine.setInputManager(inputManager);

// 启动游戏
engine.initialize();
```

**每帧交互**：

```javascript
// MetaballGame.jsx (游戏循环)
const result = engine.update(currentTime);  // 更新逻辑
const renderState = engine.getRenderState(); // 获取渲染数据
```

**数据传递**：

| 方向 | 数据 | 用途 |
|-----|-----|-----|
| JSX → Engine | `InputManager` | 输入状态 |
| Engine → JSX | 事件 (`stateChange`) | 状态同步 |
| Engine → JSX | `renderState` | 渲染数据 |

---

### 2. MetaballGame.jsx ↔ WebGLRenderer

**交互类型**：单向数据流

**初始化**：

```javascript
// MetaballGame.jsx
const renderer = new WebGLRenderer(canvas);
renderer.initialize();
```

**每帧渲染**：

```javascript
// MetaballGame.jsx
const renderState = engine.getRenderState();
renderer.render(renderState);
```

**renderState 结构**：

```javascript
{
  cameraX: number,      // 摄像机 X
  cameraY: number,      // 摄像机 Y
  zoom: number,         // 缩放级别
  time: number,         // 游戏时间
  ballData: Float32Array, // 球体数据 [x, y, r, hue, ...]
  ballCount: number,    // 球体数量
}
```

---

### 3. MetaballGame.jsx ↔ InputManager

**交互类型**：事件驱动

**初始化**：

```javascript
// MetaballGame.jsx
const inputManager = new InputManager();
inputManager.attach(overlayCanvas); // 附加到画布
```

**事件绑定**：

```javascript
// InputManager 内部自动处理
window.addEventListener('keydown', this.handleKeyDown);
window.addEventListener('keyup', this.handleKeyUp);
canvas.addEventListener('touchstart', this.handleTouchStart);
canvas.addEventListener('touchmove', this.handleTouchMove);
canvas.addEventListener('touchend', this.handleTouchEnd);
```

**清理**：

```javascript
// MetaballGame.jsx (卸载时)
inputManager.detach(overlayCanvas);
inputManager.reset();
```

---

### 4. GameEngine ↔ EntityManager

**交互类型**：组合关系

**初始化**：

```javascript
// GameEngine.initialize()
const player = createPlayer(0, 0);
this.entityManager.initialize(player);
```

**每帧操作**：

```javascript
// 遍历实体
this.entityManager.forEach((entity) => {
  applyFriction(entity, dt);
  updatePosition(entity, dt);
});

// 碰撞检测
this.entityManager.forEachCollisionPair((a, b) => {
  handleCollision(a, b, dt);
});

// 移除死亡实体
this.entityManager.removeWhere(shouldRemoveEntity);

// 获取渲染数据
const { ballData, ballCount } = this.entityManager.getRenderData(
  cameraX, cameraY, zoom
);
```

---

### 5. GameEngine ↔ ChunkManager

**交互类型**：组合关系

**分块加载**：

```javascript
// GameEngine.updateChunks()
const toLoad = this.chunkManager.getChunksToLoad(cameraX, cameraY, viewRadius);
for (const { cx, cy } of toLoad) {
  this.chunkManager.markLoaded(cx, cy);
  const entities = generateChunk(cx, cy, playerRadius);
  this.entityManager.addBatch(entities);
}
```

**分块卸载**：

```javascript
// GameEngine.updateChunks()
const toUnload = this.chunkManager.getChunksToUnload(cameraX, cameraY, viewRadius);
for (const key of toUnload) {
  this.chunkManager.unload(...key.split(',').map(Number));
  this.entityManager.removeByChunkKey(key);
}
```

---

### 6. GameEngine ↔ PhysicsSystem

**交互类型**：函数调用（纯函数）

**物理更新**：

```javascript
// GameEngine.update()
import {
  applyFriction,
  clampVelocity,
  updatePosition,
  applyBlackHoleEffect,
  handleCollision,
  shouldRemoveEntity,
  isPlayerDead,
} from './PhysicsSystem.js';

// 摩擦力
applyFriction(entity, dt);

// 速度限制
clampVelocity(entity, maxSpeed);

// 位置更新
updatePosition(entity, dt);

// 黑洞效果
applyBlackHoleEffect(blackHole, player, dt);

// 碰撞处理
const result = handleCollision(a, b, dt);
```

**PhysicsSystem 设计原则**：

- 所有函数都是纯函数
- 不持有状态
- 直接修改传入的实体对象

---

### 7. GameEngine ↔ EnemyAI

**交互类型**：函数调用

**AI 更新**：

```javascript
// GameEngine.update()
import { updateAllEnemies } from '../ai/EnemyAI.js';

updateAllEnemies(this.entityManager.getAll(), player, dt);
```

**内部逻辑**：

```javascript
// EnemyAI.updateAllEnemies()
for (const entity of entities) {
  if (entity.isEnemy) {
    const accel = calculateChaseAcceleration(entity, player, dt);
    if (accel) {
      entity.vx += accel.ax;
      entity.vy += accel.ay;
    }
  }
}
```

---

### 8. GameEngine ↔ InputManager

**交互类型**：引用注入

**连接**：

```javascript
// GameEngine.setInputManager()
this.inputState = inputManager;
```

**输入读取**：

```javascript
// GameEngine.handlePlayerInput()
if (this.inputState.isActionActive(GameAction.MOVE_UP)) {
  player.vy -= accel;
}
if (this.inputState.isActionActive(GameAction.MOVE_DOWN)) {
  player.vy += accel;
}
// ...
```

---

### 9. WebGLRenderer ↔ Shaders

**交互类型**：资源依赖

**着色器加载**：

```javascript
// WebGLRenderer.initialize()
import { VERTEX_SHADER, FRAGMENT_SHADER } from './shaders/index.js';

const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
```

**Uniform 传递**：

```javascript
// WebGLRenderer.render()
gl.uniform2f(uniforms.camera, cameraX, cameraY);
gl.uniform1f(uniforms.zoom, zoom);
gl.uniform1f(uniforms.time, time);
gl.uniform1i(uniforms.ballCount, ballCount);
gl.uniform4fv(uniforms.balls, ballData);
```

---

### 10. 所有模块 ↔ GameConfig

**交互类型**：静态导入

**配置使用**：

```javascript
// 任何模块
import { PLAYER, PHYSICS, CANVAS } from './GameConfig.js';

// 使用配置
const accel = PLAYER.ACCELERATION * dt;
const maxSpeed = PLAYER.MAX_SPEED;
```

**配置分发**：

```
GameConfig.js
    │
    ├── GameEngine.js (CANVAS, CHUNK, PLAYER, CAMERA, RENDERING)
    ├── EntityManager.js (PLAYER, RENDERING, CANVAS)
    ├── ChunkSystem.js (CHUNK, FOOD, ENEMY, BLACK_HOLE, DIFFICULTY)
    ├── PhysicsSystem.js (PLAYER, PHYSICS, BLACK_HOLE)
    ├── EnemyAI.js (ENEMY_AI, PLAYER, ENEMY)
    ├── InputManager.js (INPUT)
    ├── WebGLRenderer.js (CANVAS, RENDERING)
    └── OverlayRenderer.js (CANVAS, UI, COLORS)
```

---

## 通信协议

### 事件协议

**事件格式**：

```javascript
{
  type: string,    // 事件类型
  payload: Object, // 事件数据
}
```

**支持的事件**：

| 事件名 | 触发时机 | Payload |
|-------|---------|---------|
| `stateChange` | 游戏状态变化 | `{ oldState, newState }` |
| `scoreChange` | 分数变化 | `{ score }` |
| `playerDeath` | 玩家死亡 | `{ score, highScore }` |

### 渲染数据协议

**ballData 格式**：

```javascript
Float32Array [
  // 球体 0
  x0, y0, r0, hue0,
  // 球体 1
  x1, y1, r1, hue1,
  // ...
  // 最多 64 个球体
]
```

---

## 时序图

### 游戏启动时序

```
MetaballGame    GameEngine    EntityManager    ChunkManager
     │               │              │              │
     │ new()         │              │              │
     │──────────────▶│              │              │
     │               │ new()        │              │
     │               │─────────────▶│              │
     │               │ new()        │              │
     │               │─────────────────────────────▶│
     │               │              │              │
     │ initialize()  │              │              │
     │──────────────▶│              │              │
     │               │ createPlayer │              │
     │               │─────────────▶│              │
     │               │              │              │
     │               │ generateChunk (循环)         │
     │               │─────────────────────────────▶│
     │               │              │              │
     │               │ setState(PLAYING)           │
     │               │──────────────────────────────
     │◀──────────────│ emit('stateChange')         │
     │               │              │              │
```

### 每帧更新时序

```
requestAnimationFrame
     │
     ▼
MetaballGame    GameEngine    Physics    Entities    Renderer
     │               │           │           │           │
     │ update(time)  │           │           │           │
     │──────────────▶│           │           │           │
     │               │ handleInput           │           │
     │               │──────────────────────▶│           │
     │               │           │           │           │
     │               │ physics   │           │           │
     │               │──────────▶│           │           │
     │               │           │ update    │           │
     │               │           │──────────▶│           │
     │               │           │           │           │
     │               │ collision │           │           │
     │               │──────────▶│           │           │
     │               │           │           │           │
     │ getRenderState│           │           │           │
     │──────────────▶│           │           │           │
     │◀──────────────│           │           │           │
     │               │           │           │           │
     │ render()      │           │           │           │
     │───────────────────────────────────────────────────▶│
     │               │           │           │           │
```

---

## 错误处理

### 模块间错误传播

| 源模块 | 错误类型 | 处理方式 |
|-------|---------|---------|
| WebGLRenderer | WebGL 不支持 | 返回 false，UI 显示降级消息 |
| WebGLRenderer | 着色器编译失败 | console.error，返回 false |
| InputManager | 事件绑定失败 | 静默处理，不影响游戏 |
| ChunkSystem | 分块生成异常 | 返回空数组 |

### 边界检查

| 检查点 | 条件 | 处理 |
|-------|-----|-----|
| 实体数组 | 空数组 | 跳过遍历 |
| 玩家对象 | null | 触发游戏结束 |
| 渲染数据 | 球体数 > 64 | 截断为 64 |
| 帧时间 | 过大 | 限制为 3 帧 |

---

## 扩展点

### 添加新子系统

1. 创建新模块文件
2. 在 `GameEngine` 中实例化
3. 在 `update()` 中调用更新方法
4. 必要时添加事件监听

### 添加新事件

1. 在 `GameEngine.listeners` 添加事件数组
2. 在适当位置调用 `this.emit(eventName, data)`
3. 在 `MetaballGame.jsx` 中监听

### 添加新配置

1. 在 `GameConfig.js` 添加配置对象
2. 在 `index.js` 导出
3. 在需要的模块中导入使用
