/**
 * ChunkSystem.js - 分块系统
 *
 * 设计哲学：程序化生成 (Procedural Generation)
 *
 * 核心原则：
 * 1. 确定性生成 - 相同种子永远产生相同内容
 * 2. 无限世界 - 支持任意范围的探索
 * 3. 动态加载/卸载 - 只保留可见区域附近的分块
 *
 * 实现细节：
 * - 使用基于坐标的种子确保确定性
 * - 难度随距离原点增加
 * - 内容密度根据游戏进度动态调整
 */

import {
  CHUNK,
  FOOD,
  ENEMY,
  BLACK_HOLE,
  DIFFICULTY,
} from './GameConfig.js';

/**
 * 确定性随机数生成器
 *
 * 基于正弦函数的简单但有效的伪随机生成
 * 优点：快速、确定性、分布较均匀
 *
 * @param {number} seed - 种子值
 * @returns {number} 0-1 之间的随机数
 */
export function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 生成分块唯一标识
 *
 * @param {number} cx - 分块 X 坐标
 * @param {number} cy - 分块 Y 坐标
 * @returns {string} 分块键
 */
export function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

/**
 * 从世界坐标计算分块坐标
 *
 * @param {number} worldX - 世界 X 坐标
 * @param {number} worldY - 世界 Y 坐标
 * @returns {Object} { cx, cy }
 */
export function worldToChunk(worldX, worldY) {
  return {
    cx: Math.floor(worldX / CHUNK.SIZE),
    cy: Math.floor(worldY / CHUNK.SIZE),
  };
}

/**
 * 从分块坐标计算世界坐标（左上角）
 *
 * @param {number} cx - 分块 X 坐标
 * @param {number} cy - 分块 Y 坐标
 * @returns {Object} { x, y }
 */
export function chunkToWorld(cx, cy) {
  return {
    x: cx * CHUNK.SIZE,
    y: cy * CHUNK.SIZE,
  };
}

/**
 * 创建食物实体
 *
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {number} radius - 半径
 * @param {number} hue - 色调
 * @param {string} key - 所属分块键
 * @returns {Object} 食物实体
 */
function createFood(x, y, radius, hue, key) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    r: radius,
    isFood: true,
    hue,
    chunkKey: key,
  };
}

/**
 * 创建敌人实体
 *
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {number} radius - 半径
 * @param {number} hue - 色调
 * @param {number} vx - X 速度
 * @param {number} vy - Y 速度
 * @param {string} key - 所属分块键
 * @returns {Object} 敌人实体
 */
function createEnemy(x, y, radius, hue, vx, vy, key) {
  return {
    x,
    y,
    vx,
    vy,
    r: radius,
    isEnemy: true,
    hue,
    chunkKey: key,
  };
}

/**
 * 创建黑洞实体
 *
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {number} radius - 半径
 * @param {string} key - 所属分块键
 * @returns {Object} 黑洞实体
 */
function createBlackHole(x, y, radius, key) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    r: radius,
    isBlackHole: true,
    hue: BLACK_HOLE.HUE,
    chunkKey: key,
  };
}

/**
 * 生成分块内容
 *
 * 生成规则：
 * 1. 食物：8-15 个，均匀分布
 * 2. 敌人：0-2 个，出现概率随距离增加
 * 3. 黑洞：0-1 个，远离原点才会出现
 *
 * @param {number} cx - 分块 X 坐标
 * @param {number} cy - 分块 Y 坐标
 * @param {number} playerRadius - 玩家当前半径（用于难度缩放）
 * @returns {Array} 实体数组
 */
export function generateChunk(cx, cy, playerRadius = 22) {
  // 基于分块坐标生成确定性种子
  const seed = cx * 73856093 + cy * 19349663;
  const entities = [];
  const key = chunkKey(cx, cy);

  // 分块世界坐标
  const { x: chunkWorldX, y: chunkWorldY } = chunkToWorld(cx, cy);

  // 计算难度缩放
  const difficultyScale = DIFFICULTY.getScale(playerRadius);
  const foodScale = DIFFICULTY.getFoodScale(playerRadius);
  const enemyScale = DIFFICULTY.getEnemyScale(playerRadius);
  const blackHoleScale = DIFFICULTY.getBlackHoleScale(playerRadius);

  // ============================================================
  // 生成食物
  // ============================================================
  const foodCount = FOOD.COUNT_MIN + Math.floor(seededRandom(seed) * (FOOD.COUNT_MAX - FOOD.COUNT_MIN + 1));

  for (let i = 0; i < foodCount; i++) {
    const localSeed = seed + i * 1000;
    const x = chunkWorldX + seededRandom(localSeed) * CHUNK.SIZE;
    const y = chunkWorldY + seededRandom(localSeed + 1) * CHUNK.SIZE;
    const baseRadius = FOOD.RADIUS_MIN + seededRandom(localSeed + 2) * (FOOD.RADIUS_MAX - FOOD.RADIUS_MIN);
    const radius = baseRadius * foodScale;
    const hue = FOOD.HUE_MIN + seededRandom(localSeed + 3) * (FOOD.HUE_MAX - FOOD.HUE_MIN);

    entities.push(createFood(x, y, radius, hue, key));
  }

  // ============================================================
  // 生成敌人
  // ============================================================
  const distFromOrigin = Math.sqrt(cx * cx + cy * cy);
  const enemyChance = Math.min(
    ENEMY.SPAWN_CHANCE_MAX,
    distFromOrigin * ENEMY.SPAWN_CHANCE_BASE + (difficultyScale - 1) * 0.1
  );

  if (seededRandom(seed + 5000) < enemyChance) {
    const enemyCount = 1 + (seededRandom(seed + 5001) > 0.6 ? 1 : 0);

    for (let i = 0; i < enemyCount; i++) {
      const localSeed = seed + 5000 + i * 100;

      const x = chunkWorldX + seededRandom(localSeed) * CHUNK.SIZE;
      const y = chunkWorldY + seededRandom(localSeed + 1) * CHUNK.SIZE;

      // 计算敌人大小
      const baseSize = (ENEMY.BASE_SIZE + distFromOrigin * ENEMY.DISTANCE_SCALE) * enemyScale;
      const sizeVariation = seededRandom(localSeed + 4) * ENEMY.SIZE_VARIATION * enemyScale;
      const rawSize = baseSize + sizeVariation;

      // 限制敌人大小在玩家的合理范围内
      const minEnemySize = playerRadius * ENEMY.SIZE_MIN_RATIO;
      const maxEnemySize = playerRadius * ENEMY.SIZE_MAX_RATIO;
      const radius = Math.max(minEnemySize, Math.min(maxEnemySize, rawSize));

      const vx = (seededRandom(localSeed + 2) - 0.5) * ENEMY.INITIAL_VELOCITY;
      const vy = (seededRandom(localSeed + 3) - 0.5) * ENEMY.INITIAL_VELOCITY;
      const hue = ENEMY.HUE_MIN + seededRandom(localSeed + 4) * (ENEMY.HUE_MAX - ENEMY.HUE_MIN);

      entities.push(createEnemy(x, y, radius, hue, vx, vy, key));
    }
  }

  // ============================================================
  // 生成黑洞
  // ============================================================
  const blackHoleChance = Math.min(
    BLACK_HOLE.SPAWN_CHANCE_MAX,
    distFromOrigin * BLACK_HOLE.SPAWN_CHANCE_BASE + (difficultyScale - 1) * 0.05
  );

  if (distFromOrigin > BLACK_HOLE.MIN_DISTANCE_FROM_ORIGIN && seededRandom(seed + 9000) < blackHoleChance) {
    const localSeed = seed + 9000;
    const x = chunkWorldX + seededRandom(localSeed) * CHUNK.SIZE;
    const y = chunkWorldY + seededRandom(localSeed + 1) * CHUNK.SIZE;
    const baseRadius = BLACK_HOLE.RADIUS_MIN + seededRandom(localSeed + 2) * (BLACK_HOLE.RADIUS_MAX - BLACK_HOLE.RADIUS_MIN);
    const radius = baseRadius * blackHoleScale;

    entities.push(createBlackHole(x, y, radius, key));
  }

  return entities;
}

/**
 * 分块管理器类
 *
 * 负责：
 * 1. 追踪已加载分块
 * 2. 根据摄像机位置加载/卸载分块
 * 3. 管理分块内实体的生命周期
 */
export class ChunkManager {
  constructor() {
    this.loadedChunks = new Map();
  }

  /**
   * 重置管理器状态
   */
  reset() {
    this.loadedChunks.clear();
  }

  /**
   * 检查分块是否已加载
   *
   * @param {number} cx - 分块 X 坐标
   * @param {number} cy - 分块 Y 坐标
   * @returns {boolean}
   */
  isLoaded(cx, cy) {
    return this.loadedChunks.has(chunkKey(cx, cy));
  }

  /**
   * 标记分块为已加载
   *
   * @param {number} cx - 分块 X 坐标
   * @param {number} cy - 分块 Y 坐标
   */
  markLoaded(cx, cy) {
    this.loadedChunks.set(chunkKey(cx, cy), true);
  }

  /**
   * 卸载分块
   *
   * @param {number} cx - 分块 X 坐标
   * @param {number} cy - 分块 Y 坐标
   */
  unload(cx, cy) {
    this.loadedChunks.delete(chunkKey(cx, cy));
  }

  /**
   * 计算需要加载的分块
   *
   * @param {number} cameraX - 摄像机 X 坐标
   * @param {number} cameraY - 摄像机 Y 坐标
   * @param {number} viewRadius - 视野半径（世界单位）
   * @returns {Array} 需要加载的分块坐标数组 [{cx, cy}]
   */
  getChunksToLoad(cameraX, cameraY, viewRadius) {
    const chunksNeeded = Math.ceil(viewRadius / CHUNK.SIZE);
    const loadRadius = Math.max(CHUNK.BASE_LOAD_RADIUS, chunksNeeded + 1);

    const camChunk = worldToChunk(cameraX, cameraY);
    const toLoad = [];

    for (let cx = camChunk.cx - loadRadius; cx <= camChunk.cx + loadRadius; cx++) {
      for (let cy = camChunk.cy - loadRadius; cy <= camChunk.cy + loadRadius; cy++) {
        if (!this.isLoaded(cx, cy)) {
          toLoad.push({ cx, cy });
        }
      }
    }

    return toLoad;
  }

  /**
   * 计算需要卸载的分块
   *
   * @param {number} cameraX - 摄像机 X 坐标
   * @param {number} cameraY - 摄像机 Y 坐标
   * @param {number} viewRadius - 视野半径（世界单位）
   * @returns {Array} 需要卸载的分块键数组
   */
  getChunksToUnload(cameraX, cameraY, viewRadius) {
    const chunksNeeded = Math.ceil(viewRadius / CHUNK.SIZE);
    const loadRadius = Math.max(CHUNK.BASE_LOAD_RADIUS, chunksNeeded + 1);
    const unloadRadius = loadRadius + CHUNK.UNLOAD_BUFFER;

    const camChunk = worldToChunk(cameraX, cameraY);
    const toUnload = [];

    for (const key of this.loadedChunks.keys()) {
      const [cx, cy] = key.split(',').map(Number);
      if (
        Math.abs(cx - camChunk.cx) > unloadRadius ||
        Math.abs(cy - camChunk.cy) > unloadRadius
      ) {
        toUnload.push(key);
      }
    }

    return toUnload;
  }

  /**
   * 获取已加载分块数量
   *
   * @returns {number}
   */
  getLoadedCount() {
    return this.loadedChunks.size;
  }
}

export default {
  seededRandom,
  chunkKey,
  worldToChunk,
  chunkToWorld,
  generateChunk,
  ChunkManager,
};
