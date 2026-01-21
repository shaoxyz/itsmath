/**
 * EnemyAI.js - 敌人 AI 系统
 *
 * 设计哲学：行为树的简化版 (Simplified Behavior Tree)
 *
 * 当前实现：基础追逐 AI
 * - 检测玩家距离
 * - 在追逐范围内向玩家移动
 * - 大型敌人移动较慢但更持久
 *
 * 扩展方向：
 * - 添加巡逻行为
 * - 添加群体行为
 * - 添加躲避黑洞行为
 * - 添加领地意识
 */

import { ENEMY_AI, PLAYER, ENEMY } from '../core/GameConfig.js';

/**
 * 计算敌人向玩家追逐的加速度
 *
 * AI 策略：
 * 1. 只在追逐范围内追踪
 * 2. 大型敌人速度较慢（平衡性）
 * 3. 追逐强度随玩家成长而增加
 *
 * @param {Object} enemy - 敌人实体
 * @param {Object} player - 玩家实体
 * @param {number} dt - 时间增量
 * @returns {Object} { ax, ay } 加速度向量，如果不追逐则返回 null
 */
export function calculateChaseAcceleration(enemy, player, dt) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // 计算难度相关的追逐参数
  const difficultyScale = Math.max(1.0, player.r / PLAYER.INITIAL_RADIUS);
  const chaseRange = ENEMY_AI.BASE_CHASE_RANGE * Math.sqrt(difficultyScale);
  const chaseAccel = ENEMY_AI.BASE_CHASE_ACCEL * (1 + (difficultyScale - 1) * ENEMY_AI.CHASE_SCALE_FACTOR);

  if (dist > 0 && dist < chaseRange) {
    const invDist = 1 / dist;

    // 大型敌人移动较慢
    const sizeFactor = Math.sqrt(PLAYER.INITIAL_RADIUS / Math.max(enemy.r, 10));

    return {
      ax: dx * invDist * chaseAccel * sizeFactor * dt,
      ay: dy * invDist * chaseAccel * sizeFactor * dt,
    };
  }

  return null;
}

/**
 * 更新敌人的 AI 行为
 *
 * @param {Object} enemy - 敌人实体
 * @param {Object} player - 玩家实体
 * @param {number} dt - 时间增量
 */
export function updateEnemyAI(enemy, player, dt) {
  const acceleration = calculateChaseAcceleration(enemy, player, dt);

  if (acceleration) {
    enemy.vx += acceleration.ax;
    enemy.vy += acceleration.ay;
  }
}

/**
 * 批量更新所有敌人的 AI
 *
 * @param {Array} enemies - 敌人实体数组
 * @param {Object} player - 玩家实体
 * @param {number} dt - 时间增量
 */
export function updateAllEnemies(enemies, player, dt) {
  for (const enemy of enemies) {
    if (enemy.isEnemy) {
      updateEnemyAI(enemy, player, dt);
    }
  }
}

/**
 * AI 行为类型枚举（为未来扩展准备）
 */
export const AIBehavior = {
  IDLE: 'idle',
  CHASE: 'chase',
  PATROL: 'patrol',
  FLEE: 'flee',
};

/**
 * 高级 AI 控制器（为未来扩展准备）
 *
 * 提供更复杂的 AI 行为支持：
 * - 状态机
 * - 行为切换
 * - 记忆系统
 */
export class AIController {
  constructor(entity) {
    this.entity = entity;
    this.behavior = AIBehavior.CHASE;
    this.targetLostTime = 0;
    this.lastKnownPlayerPos = null;
  }

  /**
   * 更新 AI 状态
   *
   * @param {Object} player - 玩家实体
   * @param {number} dt - 时间增量
   */
  update(player, dt) {
    switch (this.behavior) {
      case AIBehavior.CHASE:
        this.handleChase(player, dt);
        break;
      case AIBehavior.IDLE:
        this.handleIdle(dt);
        break;
      case AIBehavior.PATROL:
        this.handlePatrol(dt);
        break;
      case AIBehavior.FLEE:
        this.handleFlee(player, dt);
        break;
    }
  }

  handleChase(player, dt) {
    const acceleration = calculateChaseAcceleration(this.entity, player, dt);

    if (acceleration) {
      this.entity.vx += acceleration.ax;
      this.entity.vy += acceleration.ay;
      this.lastKnownPlayerPos = { x: player.x, y: player.y };
      this.targetLostTime = 0;
    } else {
      // 玩家离开追逐范围
      this.targetLostTime += dt / 60;
      if (this.targetLostTime > 3) {
        // 3 秒后切换到巡逻
        this.behavior = AIBehavior.PATROL;
      }
    }
  }

  handleIdle(dt) {
    // 静止状态，等待玩家进入视野
    // 可以添加小范围随机移动
  }

  handlePatrol(dt) {
    // 巡逻状态
    // 可以实现路径点巡逻或随机漫游
  }

  handleFlee(player, dt) {
    // 逃跑状态（当敌人比玩家小时）
    const dx = this.entity.x - player.x;
    const dy = this.entity.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const fleeAccel = 0.01 * dt;
      this.entity.vx += (dx / dist) * fleeAccel;
      this.entity.vy += (dy / dist) * fleeAccel;
    }
  }

  /**
   * 设置 AI 行为
   *
   * @param {string} behavior - 行为类型
   */
  setBehavior(behavior) {
    this.behavior = behavior;
  }
}

export default {
  calculateChaseAcceleration,
  updateEnemyAI,
  updateAllEnemies,
  AIBehavior,
  AIController,
};
