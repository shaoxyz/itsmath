# Metaball 游戏架构文档

## 概述

本文档描述 Metaball 游戏的模块化架构设计。该架构遵循经典分层模式，将游戏拆分为多个职责单一的模块，便于维护、测试和扩展。

## 设计哲学

### 核心原则

1. **单一职责原则 (SRP)** - 每个模块只负责一个功能领域
2. **依赖倒置原则 (DIP)** - 高层模块不依赖低层模块，都依赖于抽象
3. **数据驱动设计** - 所有配置参数集中管理，支持运行时调整
4. **帧率无关物理** - 使用 deltaTime 确保在任何帧率下行为一致

### 游戏设计理论支撑

| 设计决策 | 理论基础 |
|---------|---------|
| 无限世界 | 程序化生成 (Procedural Generation) |
| 动态难度 | 动态难度调整 (DDA) |
| Metaball 渲染 | 隐式曲面理论 |
| 帧率无关物理 | 确定性模拟 |
| 事件驱动状态 | 观察者模式 |

## 目录结构

```
src/games/metaball/
├── core/                    # 核心逻辑层
│   ├── GameConfig.js        # 游戏配置中心
│   ├── GameEngine.js        # 游戏引擎（协调器）
│   ├── EntityManager.js     # 实体生命周期管理
│   ├── ChunkSystem.js       # 无限世界分块系统
│   ├── PhysicsSystem.js     # 物理计算
│   └── index.js             # 模块导出
│
├── rendering/               # 渲染层
│   ├── WebGLRenderer.js     # WebGL 渲染器
│   ├── OverlayRenderer.js   # 2D 覆盖层（UI/HUD）
│   ├── shaders/             # GLSL 着色器
│   │   ├── vertex.glsl.js
│   │   ├── fragment.glsl.js
│   │   └── index.js
│   └── index.js
│
├── input/                   # 输入层
│   └── InputManager.js      # 输入抽象
│
├── ai/                      # AI 层
│   └── EnemyAI.js           # 敌人行为
│
└── index.js                 # 主模块导出

src/games/
└── MetaballGame.jsx         # React 容器组件
```

## 模块详解

### 1. GameConfig.js - 配置中心

**职责**：集中管理所有游戏参数

**设计哲学**："配置即文档"

```javascript
// 示例：修改玩家初始大小
import { PLAYER } from './core/GameConfig.js';
PLAYER.INITIAL_RADIUS = 30; // 从 22 改为 30
```

**配置分类**：

| 类别 | 对象名 | 影响范围 |
|-----|-------|---------|
| 画布 | `CANVAS` | 渲染尺寸 |
| 分块 | `CHUNK` | 世界生成 |
| 玩家 | `PLAYER` | 操控手感 |
| 摄像机 | `CAMERA` | 视觉体验 |
| 食物 | `FOOD` | 游戏节奏 |
| 敌人 | `ENEMY` | 游戏难度 |
| 黑洞 | `BLACK_HOLE` | 风险元素 |
| 物理 | `PHYSICS` | 游戏手感 |
| 渲染 | `RENDERING` | 性能/视觉 |
| 难度 | `DIFFICULTY` | 动态平衡 |

---

### 2. GameEngine.js - 游戏引擎

**职责**：协调所有子系统，驱动游戏循环

**设计模式**：游戏循环模式 (Game Loop Pattern)

**架构图**：

```
                    ┌─────────────────┐
                    │   GameEngine    │
                    │   (协调器)       │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ EntityManager │   │ ChunkManager  │   │ PhysicsSystem │
│  (实体管理)    │   │  (分块管理)    │   │   (物理计算)   │
└───────────────┘   └───────────────┘   └───────────────┘
```

**关键方法**：

| 方法 | 作用 |
|-----|-----|
| `initialize()` | 初始化新游戏 |
| `update(currentTime)` | 更新一帧逻辑 |
| `getRenderState()` | 获取渲染数据 |
| `on(event, callback)` | 监听事件 |

**事件系统**：

```javascript
engine.on('stateChange', ({ oldState, newState }) => { });
engine.on('scoreChange', ({ score }) => { });
engine.on('playerDeath', ({ score, highScore }) => { });
```

---

### 3. EntityManager.js - 实体管理

**职责**：管理所有游戏实体的生命周期

**设计模式**：简化的 ECS (Entity-Component-System)

**实体类型**：

| 类型 | 标识 | 特性 |
|-----|-----|-----|
| 玩家 | `isPlayer` | 可控制、可吸收 |
| 食物 | `isFood` | 被动、可被吸收 |
| 敌人 | `isEnemy` | AI 控制、可吸收/被吸收 |
| 黑洞 | `isBlackHole` | 静止、引力场 |

**实体数据结构**：

```javascript
{
  x, y,           // 世界坐标
  vx, vy,         // 速度向量
  r,              // 半径
  hue,            // HSL 色调
  isPlayer,       // 类型标识
  isFood,
  isEnemy,
  isBlackHole,
  chunkKey,       // 所属分块
}
```

---

### 4. ChunkSystem.js - 分块系统

**职责**：管理无限世界的程序化生成

**设计哲学**：确定性生成 (Deterministic Generation)

**核心算法**：

```
世界坐标 → 分块坐标 → 种子 → 伪随机内容
```

**种子公式**：

```javascript
seed = cx * 73856093 + cy * 19349663
```

**分块内容**：

| 元素 | 数量 | 生成规则 |
|-----|-----|---------|
| 食物 | 8-15 | 均匀分布 |
| 敌人 | 0-2 | 概率随距离增加 |
| 黑洞 | 0-1 | 远离原点才出现 |

---

### 5. PhysicsSystem.js - 物理系统

**职责**：处理所有物理计算

**设计原则**：帧率无关 (Frame-rate Independent)

**核心公式**：

| 物理现象 | 公式 |
|---------|------|
| 摩擦衰减 | `v *= friction^dt` |
| 面积守恒 | `r_new = √(r1² + (r2_old² - r2_new²))` |
| 引力拉扯 | `strength = base * (1 - dist/range)²` |

**碰撞规则**：

```
玩家 vs 食物 → 玩家吸收食物
玩家 vs 小敌人 → 玩家吸收敌人（需大 10%）
玩家 vs 大敌人 → 敌人吸收玩家
其他情况 → 互相推开
```

---

### 6. WebGLRenderer.js - WebGL 渲染器

**职责**：处理所有 GPU 渲染

**渲染管道**：

```
实体数据 → Float32Array → Uniforms → 着色器 → 像素
```

**着色器功能**：

| 功能 | 实现方式 |
|-----|---------|
| Metaball 效果 | 距离场累加 |
| 颜色混合 | 权重平均 HSL |
| 网格背景 | 模运算 |
| 黑洞特效 | 吸积盘 + 透镜 |

---

### 7. OverlayRenderer.js - 覆盖层渲染

**职责**：渲染 2D UI 元素

**渲染内容**：

| 元素 | 作用 |
|-----|-----|
| 玩家眼睛 | 增加角色表现力 |
| HUD | 显示半径和坐标 |
| 小地图 | 提供空间感知 |
| 调试信息 | FPS、实体数等 |

---

### 8. InputManager.js - 输入管理

**职责**：统一处理所有输入设备

**抽象层级**：

```
原始输入 → 按键状态 → 游戏动作 → 移动向量
```

**支持设备**：

- 键盘 (WASD / 方向键)
- 触摸屏 (虚拟摇杆)
- 可扩展：手柄

---

### 9. EnemyAI.js - 敌人 AI

**职责**：控制敌人行为

**当前行为**：追逐玩家

**扩展支持**：

- `CHASE` - 追逐
- `PATROL` - 巡逻
- `FLEE` - 逃跑
- `IDLE` - 空闲

---

## 数据流

### 游戏循环数据流

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Input   │───▶│  Engine  │───▶│ Physics  │───▶│ Entities │
│ Manager  │    │  Update  │    │  Update  │    │  Update  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                      │
                                                      ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  React   │◀───│ Overlay  │◀───│  WebGL   │◀───│  Render  │
│   UI     │    │ Renderer │    │ Renderer │    │  State   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### 事件流

```
GameEngine
    │
    ├── stateChange ──▶ React setState(gameState)
    │
    ├── scoreChange ──▶ React setState(score)
    │
    └── playerDeath ──▶ React setState(highScore)
```

---

## 性能考量

### 优化策略

| 问题 | 解决方案 |
|-----|---------|
| O(n²) 碰撞 | 只检测非黑洞实体 |
| 渲染开销 | 最多渲染 64 个球体 |
| 内存管理 | 分块卸载时清理实体 |
| 帧率稳定 | 限制最大帧时间 |

### 未来优化方向

1. 空间哈希碰撞检测
2. 实体对象池
3. Web Worker 物理计算

---

## 扩展指南

### 添加新实体类型

1. 在 `GameConfig.js` 添加配置
2. 在 `ChunkSystem.js` 添加生成逻辑
3. 在 `PhysicsSystem.js` 添加碰撞规则
4. 在 `fragment.glsl.js` 添加渲染逻辑（如需特殊效果）

### 添加新输入设备

1. 在 `InputManager.js` 添加事件监听
2. 更新 `actionStates` 映射

### 添加新 AI 行为

1. 在 `EnemyAI.js` 的 `AIBehavior` 添加类型
2. 在 `AIController` 添加处理方法

---

## 版本历史

| 版本 | 日期 | 变更 |
|-----|-----|-----|
| 2.0 | 2025-01 | 模块化重构 |
| 1.0 | 2024-12 | 初始单文件版本 |
