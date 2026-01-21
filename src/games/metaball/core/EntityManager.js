/**
 * EntityManager.js - 实体管理器
 *
 * 设计哲学：实体组件系统的简化版 (Simplified ECS)
 *
 * 核心职责：
 * 1. 实体创建和销毁
 * 2. 实体查询和过滤
 * 3. 实体生命周期管理
 * 4. 空间哈希碰撞优化
 *
 * 设计决策：
 * - 使用数组而非 Map 存储实体，因为频繁遍历比随机访问更常见
 * - 实体类型通过布尔标志区分，保持简单
 * - 玩家作为特殊实体始终存在于数组首位
 * - 使用空间哈希将 O(n²) 碰撞检测降低到 O(n)
 */

import { PLAYER, RENDERING, CANVAS } from './GameConfig.js';

// 空间哈希网格大小（应该略大于最大实体直径）
const SPATIAL_CELL_SIZE = 80;

/**
 * 创建玩家实体
 *
 * @param {number} x - 初始 X 坐标
 * @param {number} y - 初始 Y 坐标
 * @returns {Object} 玩家实体
 */
export function createPlayer(x = 0, y = 0) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    r: PLAYER.INITIAL_RADIUS,
    isPlayer: true,
    hue: PLAYER.HUE,
  };
}

/**
 * 计算实体所在的空间哈希单元格键
 *
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @returns {string} 单元格键
 */
function getSpatialKey(x, y) {
  const cx = Math.floor(x / SPATIAL_CELL_SIZE);
  const cy = Math.floor(y / SPATIAL_CELL_SIZE);
  return `${cx},${cy}`;
}

/**
 * 获取实体可能碰撞的所有单元格键（考虑实体半径）
 *
 * @param {Object} entity - 实体
 * @returns {string[]} 单元格键数组
 */
function getEntityCellKeys(entity) {
  const keys = [];
  const minCx = Math.floor((entity.x - entity.r) / SPATIAL_CELL_SIZE);
  const maxCx = Math.floor((entity.x + entity.r) / SPATIAL_CELL_SIZE);
  const minCy = Math.floor((entity.y - entity.r) / SPATIAL_CELL_SIZE);
  const maxCy = Math.floor((entity.y + entity.r) / SPATIAL_CELL_SIZE);

  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      keys.push(`${cx},${cy}`);
    }
  }
  return keys;
}

/**
 * 实体管理器类
 *
 * 提供统一的实体管理接口
 */
export class EntityManager {
  constructor() {
    this.entities = [];
    this.player = null;
    // 空间哈希网格
    this.spatialGrid = new Map();
    // 复用的渲染数据缓冲区
    this.renderBuffer = new Float32Array(RENDERING.MAX_VISIBLE_BALLS * 4);
  }

  /**
   * 初始化管理器
   *
   * @param {Object} player - 玩家实体
   */
  initialize(player) {
    this.entities = [player];
    this.player = player;
  }

  /**
   * 重置管理器状态
   */
  reset() {
    this.entities = [];
    this.player = null;
    this.spatialGrid.clear();
  }

  /**
   * 添加实体
   *
   * @param {Object} entity - 要添加的实体
   */
  add(entity) {
    this.entities.push(entity);
  }

  /**
   * 批量添加实体
   *
   * @param {Array} entities - 实体数组
   */
  addBatch(entities) {
    this.entities.push(...entities);
  }

  /**
   * 移除实体
   *
   * @param {Object} entity - 要移除的实体
   */
  remove(entity) {
    const index = this.entities.indexOf(entity);
    if (index > -1) {
      this.entities.splice(index, 1);
    }
  }

  /**
   * 根据条件移除实体
   *
   * @param {Function} predicate - 判断函数，返回 true 则移除
   * @returns {number} 移除的实体数量
   */
  removeWhere(predicate) {
    let removed = 0;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      if (predicate(this.entities[i])) {
        this.entities.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  /**
   * 根据分块键移除实体
   *
   * @param {string} chunkKey - 分块键
   * @returns {number} 移除的实体数量
   */
  removeByChunkKey(chunkKey) {
    return this.removeWhere(e => e.chunkKey === chunkKey);
  }

  /**
   * 获取所有实体
   *
   * @returns {Array} 实体数组
   */
  getAll() {
    return this.entities;
  }

  /**
   * 获取实体数量
   *
   * @returns {number}
   */
  getCount() {
    return this.entities.length;
  }

  /**
   * 获取玩家实体
   *
   * @returns {Object}
   */
  getPlayer() {
    return this.player;
  }

  /**
   * 获取所有食物实体
   *
   * @returns {Array}
   */
  getFood() {
    return this.entities.filter(e => e.isFood);
  }

  /**
   * 获取所有敌人实体
   *
   * @returns {Array}
   */
  getEnemies() {
    return this.entities.filter(e => e.isEnemy);
  }

  /**
   * 获取所有黑洞实体
   *
   * @returns {Array}
   */
  getBlackHoles() {
    return this.entities.filter(e => e.isBlackHole);
  }

  /**
   * 获取可见实体（用于渲染）
   *
   * 根据摄像机位置和缩放级别筛选可见实体
   * 包含额外缓冲区以支持 Metaball 效果的边缘渲染
   *
   * @param {number} cameraX - 摄像机 X 坐标
   * @param {number} cameraY - 摄像机 Y 坐标
   * @param {number} zoom - 缩放级别
   * @returns {Array} 可见实体数组（已排序）
   */
  getVisibleEntities(cameraX, cameraY, zoom) {
    const viewRadius = (CANVAS.SIZE / 2) / zoom + RENDERING.VIEW_BUFFER;

    const visible = this.entities.filter(e => {
      const dx = e.x - cameraX;
      const dy = e.y - cameraY;
      // 额外缓冲区用于 Metaball 边缘效果
      const entityBuffer = e.r * 2;
      return Math.abs(dx) < viewRadius + entityBuffer && Math.abs(dy) < viewRadius + entityBuffer;
    });

    // 排序：玩家优先，然后是普通实体，黑洞最后
    visible.sort((a, b) => {
      if (a.isPlayer) return -1;
      if (b.isPlayer) return 1;
      if (a.isBlackHole && !b.isBlackHole) return 1;
      if (!a.isBlackHole && b.isBlackHole) return -1;
      return 0;
    });

    return visible;
  }

  /**
   * 获取渲染数据
   *
   * 将可见实体转换为 WebGL 需要的 Float32Array 格式
   * 使用复用的缓冲区，避免每帧内存分配
   *
   * @param {number} cameraX - 摄像机 X 坐标
   * @param {number} cameraY - 摄像机 Y 坐标
   * @param {number} zoom - 缩放级别
   * @returns {Object} { ballData: Float32Array, ballCount: number }
   */
  getRenderData(cameraX, cameraY, zoom) {
    const visible = this.getVisibleEntities(cameraX, cameraY, zoom);
    const ballCount = Math.min(visible.length, RENDERING.MAX_VISIBLE_BALLS);

    // 复用缓冲区，清零未使用部分
    for (let i = 0; i < ballCount; i++) {
      const entity = visible[i];
      this.renderBuffer[i * 4] = entity.x;
      this.renderBuffer[i * 4 + 1] = entity.y;
      this.renderBuffer[i * 4 + 2] = entity.r;
      this.renderBuffer[i * 4 + 3] = entity.hue;
    }

    // 清零剩余部分（防止残留数据）
    for (let i = ballCount * 4; i < this.renderBuffer.length; i++) {
      this.renderBuffer[i] = 0;
    }

    return { ballData: this.renderBuffer, ballCount };
  }

  /**
   * 更新空间哈希网格
   *
   * 每帧调用一次，重建整个网格
   * 复杂度 O(n)
   */
  updateSpatialGrid() {
    this.spatialGrid.clear();

    for (const entity of this.entities) {
      if (entity.isBlackHole) continue;

      const keys = getEntityCellKeys(entity);
      for (const key of keys) {
        if (!this.spatialGrid.has(key)) {
          this.spatialGrid.set(key, []);
        }
        this.spatialGrid.get(key).push(entity);
      }
    }
  }

  /**
   * 执行碰撞检测回调（使用空间哈希优化）
   *
   * 优化后复杂度从 O(n²) 降低到 O(n*k)，其中 k 是单元格内平均实体数
   *
   * @param {Function} callback - 碰撞回调函数 (entityA, entityB) => void
   */
  forEachCollisionPair(callback) {
    // 先更新空间网格
    this.updateSpatialGrid();

    // 已检查的配对（避免重复检测）
    const checkedPairs = new Set();

    for (const entity of this.entities) {
      if (entity.isBlackHole) continue;

      const keys = getEntityCellKeys(entity);

      for (const key of keys) {
        const cellEntities = this.spatialGrid.get(key);
        if (!cellEntities) continue;

        for (const other of cellEntities) {
          if (other === entity || other.isBlackHole) continue;

          // 创建唯一配对键（确保 A-B 和 B-A 被视为相同）
          const pairKey = entity.x < other.x ||
                          (entity.x === other.x && entity.y < other.y)
            ? `${entity.x},${entity.y}-${other.x},${other.y}`
            : `${other.x},${other.y}-${entity.x},${entity.y}`;

          if (!checkedPairs.has(pairKey)) {
            checkedPairs.add(pairKey);
            callback(entity, other);
          }
        }
      }
    }
  }

  /**
   * 对所有实体执行回调
   *
   * @param {Function} callback - 回调函数 (entity, index) => void
   */
  forEach(callback) {
    this.entities.forEach(callback);
  }

  /**
   * 获取统计信息
   *
   * @returns {Object} 统计数据
   */
  getStats() {
    let foodCount = 0;
    let enemyCount = 0;
    let blackHoleCount = 0;

    for (const entity of this.entities) {
      if (entity.isFood) foodCount++;
      else if (entity.isEnemy) enemyCount++;
      else if (entity.isBlackHole) blackHoleCount++;
    }

    return {
      total: this.entities.length,
      food: foodCount,
      enemies: enemyCount,
      blackHoles: blackHoleCount,
      player: this.player ? 1 : 0,
    };
  }
}

export default {
  createPlayer,
  EntityManager,
};
