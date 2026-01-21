/**
 * PhysicsSystem.js - 物理系统
 *
 * 设计哲学：确定性物理 (Deterministic Physics)
 *
 * 核心原则：
 * 1. 帧率无关 - 使用 deltaTime 确保在任何帧率下行为一致
 * 2. 面积守恒 - 吸收时保持总面积不变（πr²）
 * 3. 分离关注点 - 只处理物理计算，不涉及游戏逻辑
 *
 * 物理模型：
 * - 阻尼运动（摩擦力）
 * - 碰撞响应（推开/吸收）
 * - 引力效果（黑洞）
 */

import { PLAYER, PHYSICS, BLACK_HOLE } from './GameConfig.js';

/**
 * 应用摩擦力（指数衰减）
 *
 * 使用 Math.pow 确保帧率无关：
 * - 60fps: friction^1 per frame
 * - 30fps: friction^2 per frame (等效效果)
 *
 * @param {Object} entity - 实体对象
 * @param {number} dt - 时间增量
 * @param {number} friction - 摩擦系数
 */
export function applyFriction(entity, dt, friction = PLAYER.FRICTION) {
  const factor = Math.pow(friction, dt);
  entity.vx *= factor;
  entity.vy *= factor;
}

/**
 * 限制速度
 *
 * @param {Object} entity - 实体对象
 * @param {number} maxSpeed - 最大速度
 */
export function clampVelocity(entity, maxSpeed) {
  const speed = Math.sqrt(entity.vx * entity.vx + entity.vy * entity.vy);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    entity.vx *= scale;
    entity.vy *= scale;
  }
}

/**
 * 更新位置
 *
 * @param {Object} entity - 实体对象
 * @param {number} dt - 时间增量
 */
export function updatePosition(entity, dt) {
  entity.x += entity.vx * dt;
  entity.y += entity.vy * dt;
}

/**
 * 计算两点间距离
 *
 * @param {Object} a - 点A {x, y}
 * @param {Object} b - 点B {x, y}
 * @returns {number} 距离
 */
export function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 计算两点间距离的平方（性能优化用）
 *
 * @param {Object} a - 点A {x, y}
 * @param {Object} b - 点B {x, y}
 * @returns {number} 距离的平方
 */
export function distanceSquared(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * 黑洞引力效果
 *
 * 物理模型：
 * - 引力强度随距离平方衰减
 * - 在吸取范围内持续吸收玩家质量
 *
 * @param {Object} blackHole - 黑洞实体
 * @param {Object} player - 玩家实体
 * @param {number} dt - 时间增量
 * @returns {boolean} 是否在黑洞影响范围内
 */
export function applyBlackHoleEffect(blackHole, player, dt) {
  const dx = blackHole.x - player.x;
  const dy = blackHole.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const pullRadius = blackHole.r * BLACK_HOLE.PULL_RADIUS_MULTIPLIER;

  if (dist < pullRadius && dist > 0) {
    // 引力拉扯（距离越近越强）
    const pullStrength = BLACK_HOLE.PULL_STRENGTH * dt * Math.pow(1 - dist / pullRadius, 2);
    player.vx += (dx / dist) * pullStrength;
    player.vy += (dy / dist) * pullStrength;

    // 质量吸取
    const drainRadius = blackHole.r * BLACK_HOLE.DRAIN_RADIUS_MULTIPLIER;
    if (dist < drainRadius) {
      const drainRate = BLACK_HOLE.DRAIN_RATE * dt * (1 - dist / drainRadius);
      player.r -= drainRate;
      if (player.r < PLAYER.MIN_RADIUS) {
        player.r = PLAYER.MIN_RADIUS;
      }
    }

    return true;
  }

  return false;
}

/**
 * 处理两个实体之间的碰撞/吸收
 *
 * 吸收规则：
 * 1. 玩家可以吸收食物
 * 2. 玩家可以吸收比自己小10%的敌人
 * 3. 敌人可以吃掉比自己小10%的玩家
 * 4. 其他情况互相推开
 *
 * 面积守恒公式：
 * 新半径 = √(大半径² + (小半径² - 新小半径²))
 *
 * @param {Object} a - 实体A
 * @param {Object} b - 实体B
 * @param {number} dt - 时间增量
 * @returns {Object} 交互结果 { areaTransferred, isAbsorption }
 */
export function handleCollision(a, b, dt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const dist = Math.sqrt(distSq);
  const surfaceDist = dist - a.r - b.r;

  // 确定大小关系
  const larger = a.r >= b.r ? a : b;
  const smaller = a.r >= b.r ? b : a;

  // 判断能否吸收
  const canAbsorb =
    (larger.isPlayer && smaller.isFood) ||
    (larger.isPlayer && smaller.isEnemy && larger.r > smaller.r * PHYSICS.ABSORPTION_THRESHOLD);

  const playerGetsEaten =
    smaller.isPlayer &&
    larger.isEnemy &&
    larger.r > smaller.r * PHYSICS.ABSORPTION_THRESHOLD;

  let areaTransferred = 0;
  let isAbsorption = false;

  if (surfaceDist < 0) {
    // 碰撞发生
    const overlap = -surfaceDist;

    if (canAbsorb) {
      // 吸收过程
      const transferRate = Math.min(
        overlap * PHYSICS.ABSORPTION_RATE * dt,
        smaller.r * PHYSICS.MAX_ABSORPTION_RATIO
      );

      if (transferRate > 0.01 && smaller.r > PHYSICS.DEATH_THRESHOLD) {
        const smallerAreaBefore = smaller.r * smaller.r;
        smaller.r -= transferRate;
        const smallerAreaAfter = smaller.r * smaller.r;
        areaTransferred = smallerAreaBefore - smallerAreaAfter;
        larger.r = Math.sqrt(larger.r * larger.r + areaTransferred);
        isAbsorption = true;

        // 拉近被吸收者
        if (dist > 0.1) {
          const pullStrength = PHYSICS.PULL_STRENGTH * dt;
          const invDist = 1 / dist;
          if (smaller === a) {
            a.vx += dx * invDist * pullStrength;
            a.vy += dy * invDist * pullStrength;
          } else {
            b.vx -= dx * invDist * pullStrength;
            b.vy -= dy * invDist * pullStrength;
          }
        }
      }
    } else if (playerGetsEaten) {
      // 玩家被吃
      const transferRate = Math.min(
        overlap * PHYSICS.ABSORPTION_RATE * 0.75 * dt,
        smaller.r * PHYSICS.MAX_ABSORPTION_RATIO * 0.67
      );

      if (smaller.r > PHYSICS.DEATH_THRESHOLD) {
        const smallerAreaBefore = smaller.r * smaller.r;
        smaller.r -= transferRate;
        const smallerAreaAfter = smaller.r * smaller.r;
        areaTransferred = smallerAreaBefore - smallerAreaAfter;
        larger.r = Math.sqrt(larger.r * larger.r + areaTransferred);

        // 被拉向敌人
        if (dist > 0.1) {
          const invDist = 1 / dist;
          if (smaller === a) {
            a.vx += dx * invDist * 0.1 * dt;
            a.vy += dy * invDist * 0.1 * dt;
          } else {
            b.vx -= dx * invDist * 0.1 * dt;
            b.vy -= dy * invDist * 0.1 * dt;
          }
        }
      }
    } else {
      // 互相推开
      const pushStrength = overlap * PHYSICS.PUSH_STRENGTH * dt;
      if (dist > 0.1) {
        const invDist = 1 / dist;
        a.vx -= dx * invDist * pushStrength;
        a.vy -= dy * invDist * pushStrength;
        b.vx += dx * invDist * pushStrength;
        b.vy += dy * invDist * pushStrength;
      }
    }
  } else if (surfaceDist < PHYSICS.ATTRACT_RANGE && canAbsorb) {
    // 接近时产生吸引力（方便吸收）
    const attractStrength = PHYSICS.ATTRACT_STRENGTH * dt / (surfaceDist + 5);
    const invDist = 1 / dist;
    if (smaller === a) {
      a.vx += dx * invDist * attractStrength;
      a.vy += dy * invDist * attractStrength;
    } else {
      b.vx -= dx * invDist * attractStrength;
      b.vy -= dy * invDist * attractStrength;
    }
  }

  return { areaTransferred, isAbsorption, playerScored: isAbsorption && larger.isPlayer };
}

/**
 * 判断实体是否应该被移除
 *
 * @param {Object} entity - 实体对象
 * @returns {boolean} 是否应该移除
 */
export function shouldRemoveEntity(entity) {
  return (
    !entity.isBlackHole &&
    !entity.isPlayer &&
    entity.r <= PHYSICS.DEATH_THRESHOLD
  );
}

/**
 * 判断玩家是否死亡
 *
 * @param {Object} player - 玩家实体
 * @returns {boolean} 是否死亡
 */
export function isPlayerDead(player) {
  return !player || player.r <= PLAYER.MIN_RADIUS;
}

/**
 * 应用玩家引力效果 - 教育核心功能
 *
 * 物理原理：
 * - 引力强度与质量成正比（牛顿万有引力）
 * - 引力范围与质量相关
 * - 只影响食物，不影响敌人和黑洞
 *
 * 教育目标：让孩子直观感受「质量大 = 引力大」
 *
 * @param {Object} player - 玩家实体
 * @param {Array} entities - 所有实体
 * @param {number} dt - 时间增量
 * @returns {number} 被引力影响的实体数量
 */
export function applyPlayerGravity(player, entities, dt) {
  const { GRAVITY } = PLAYER;

  // 未达到激活半径，无引力
  if (!GRAVITY.ENABLED || player.r < GRAVITY.MIN_RADIUS_TO_ACTIVATE) {
    return 0;
  }

  // 计算引力参数（基于质量/半径）
  const massRatio = player.r / PLAYER.INITIAL_RADIUS;
  const gravityStrength = GRAVITY.BASE_STRENGTH * Math.pow(massRatio, GRAVITY.MASS_POWER);
  const gravityRange = player.r * GRAVITY.RANGE_MULTIPLIER;

  let affectedCount = 0;

  for (const entity of entities) {
    // 只吸引食物（教育设计：玩家引力只对小物体有效）
    if (!entity.isFood) continue;

    const dx = player.x - entity.x;
    const dy = player.y - entity.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    if (dist > 0 && dist < gravityRange) {
      // 引力强度随距离衰减（平方反比）
      const normalizedDist = dist / gravityRange;
      const falloff = Math.pow(1 - normalizedDist, 2);
      const strength = gravityStrength * falloff * dt;

      // 应用引力加速度
      const invDist = 1 / dist;
      entity.vx += dx * invDist * strength;
      entity.vy += dy * invDist * strength;

      affectedCount++;
    }
  }

  return affectedCount;
}

export default {
  applyFriction,
  clampVelocity,
  updatePosition,
  distance,
  distanceSquared,
  applyBlackHoleEffect,
  applyPlayerGravity,
  handleCollision,
  shouldRemoveEntity,
  isPlayerDead,
};
