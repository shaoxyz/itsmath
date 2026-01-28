/**
 * GameEngine.js - 游戏引擎核心
 *
 * 设计哲学：游戏循环模式 (Game Loop Pattern)
 *
 * 核心职责：
 * 1. 管理游戏状态
 * 2. 协调各子系统
 * 3. 驱动游戏循环
 * 4. 提供状态快照（用于渲染和 UI）
 *
 * 架构决策：
 * - 引擎与渲染器分离，支持无头测试
 * - 使用固定时间步长模拟，确保确定性
 * - 事件驱动的状态变更通知
 */

import { CANVAS, CHUNK, PLAYER, CAMERA, ENEMY, RENDERING, MILESTONES } from './GameConfig.js';
import { EntityManager, createPlayer } from './EntityManager.js';
import { ChunkManager, generateChunk } from './ChunkSystem.js';
import {
  applyFriction,
  clampVelocity,
  updatePosition,
  applyBlackHoleEffect,
  applyPlayerGravity,
  handleCollision,
  shouldRemoveEntity,
  isPlayerDead,
} from './PhysicsSystem.js';
import { updateAllEnemies } from '../ai/EnemyAI.js';
import { GameAction } from '../input/InputManager.js';

/**
 * 游戏状态枚举
 */
export const GameState = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
};

/**
 * 游戏引擎类
 */
export class GameEngine {
  constructor() {
    // 子系统
    this.entityManager = new EntityManager();
    this.chunkManager = new ChunkManager();

    // 游戏状态
    this.state = GameState.MENU;
    this.score = 0;
    this.highScore = 0;
    this.time = 0;

    // 摄像机
    this.camera = { x: 0, y: 0 };
    this.zoom = 1.0;
    this.baseZoom = 1.0;

    // 帧率控制
    this.lastTime = 0;
    this.targetFrameTime = 1000 / RENDERING.TARGET_FPS;

    // 事件监听器
    this.listeners = {
      stateChange: [],
      scoreChange: [],
      playerDeath: [],
      milestone: [],      // 里程碑事件
      gravityActivated: [], // 引力激活事件
    };

    // 输入状态（由外部注入）
    this.inputState = null;

    // 里程碑追踪
    this.reachedMilestones = new Set();
    this.hasGravity = false;
  }

  /**
   * 初始化新游戏
   */
  initialize() {
    // 重置子系统
    this.entityManager.reset();
    this.chunkManager.reset();

    // 创建玩家
    const player = createPlayer(0, 0);
    this.entityManager.initialize(player);

    // 重置摄像机
    this.camera = { x: 0, y: 0 };
    this.baseZoom = 1.0;
    this.zoom = 1.0;

    // 重置游戏状态
    this.time = 0;
    this.score = 0;
    this.reachedMilestones.clear();
    this.hasGravity = false;

    // 加载初始分块
    for (let cx = -CHUNK.BASE_LOAD_RADIUS; cx <= CHUNK.BASE_LOAD_RADIUS; cx++) {
      for (let cy = -CHUNK.BASE_LOAD_RADIUS; cy <= CHUNK.BASE_LOAD_RADIUS; cy++) {
        this.chunkManager.markLoaded(cx, cy);
        const entities = generateChunk(cx, cy, player.r);
        this.entityManager.addBatch(entities);
      }
    }

    // 切换状态
    this.setState(GameState.PLAYING);
  }

  /**
   * 设置游戏状态
   *
   * @param {string} newState - 新状态
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.emit('stateChange', { oldState, newState });
  }

  /**
   * 设置输入管理器引用
   *
   * @param {InputManager} inputManager - 输入管理器
   */
  setInputManager(inputManager) {
    this.inputState = inputManager;
  }

  /**
   * 更新游戏逻辑（单帧）
   *
   * @param {number} currentTime - 当前时间戳
   * @returns {Object} 帧更新结果
   */
  update(currentTime) {
    if (this.state !== GameState.PLAYING) {
      return { updated: false };
    }

    // 计算 delta time
    const rawDelta = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // 限制最大帧时间（防止"死亡螺旋"）
    const clampedDelta = Math.min(rawDelta, this.targetFrameTime * RENDERING.MAX_FRAME_MULTIPLIER);
    const dt = clampedDelta / this.targetFrameTime;

    this.time += clampedDelta / 1000;

    const player = this.entityManager.getPlayer();

    // 检查玩家死亡
    if (isPlayerDead(player)) {
      this.handlePlayerDeath();
      return { updated: true, playerDied: true };
    }

    let frameScore = 0;

    // ============================================================
    // 1. 处理玩家输入
    // ============================================================
    this.handlePlayerInput(player, dt);

    // ============================================================
    // 2. 更新摄像机
    // ============================================================
    this.updateCamera(player, dt);

    // ============================================================
    // 3. 分块管理
    // ============================================================
    this.updateChunks(player);

    // ============================================================
    // 4. 更新所有实体物理
    // ============================================================
    this.entityManager.forEach((entity) => {
      if (entity.isBlackHole) return;

      applyFriction(entity, dt);
      const maxSpeed = entity.isPlayer ? PLAYER.MAX_SPEED : ENEMY.MAX_SPEED;
      clampVelocity(entity, maxSpeed);
      updatePosition(entity, dt);
    });

    // ============================================================
    // 5. 黑洞效果
    // ============================================================
    for (const bh of this.entityManager.getBlackHoles()) {
      applyBlackHoleEffect(bh, player, dt);
    }

    // ============================================================
    // 6. 碰撞检测和处理
    // ============================================================
    this.entityManager.forEachCollisionPair((a, b) => {
      const result = handleCollision(a, b, dt);
      if (result.playerScored) {
        frameScore++;
      }
    });

    // ============================================================
    // 7. 清理死亡实体
    // ============================================================
    this.entityManager.removeWhere(shouldRemoveEntity);

    // ============================================================
    // 8. 再次检查玩家死亡
    // ============================================================
    if (player.r <= PLAYER.MIN_RADIUS) {
      this.handlePlayerDeath();
      return { updated: true, playerDied: true };
    }

    // ============================================================
    // 9. 敌人 AI
    // ============================================================
    updateAllEnemies(this.entityManager.getAll(), player, dt);

    // ============================================================
    // 10. 玩家引力效果（教育核心）
    // ============================================================
    applyPlayerGravity(player, this.entityManager.getAll(), dt);

    // 检测引力激活
    if (!this.hasGravity && player.r >= PLAYER.GRAVITY.MIN_RADIUS_TO_ACTIVATE) {
      this.hasGravity = true;
      this.emit('gravityActivated', { playerRadius: player.r });
    }

    // ============================================================
    // 11. 里程碑检测
    // ============================================================
    this.checkMilestones(player);

    // ============================================================
    // 12. 更新分数
    // ============================================================
    if (frameScore > 0) {
      this.score += frameScore;
      this.emit('scoreChange', { score: this.score });
    }

    return { updated: true, frameScore };
  }

  /**
   * 处理玩家输入
   */
  handlePlayerInput(player, dt) {
    if (!this.inputState) return;

    const accel = PLAYER.ACCELERATION * dt;

    if (this.inputState.isActionActive(GameAction.MOVE_UP)) player.vy -= accel;
    if (this.inputState.isActionActive(GameAction.MOVE_DOWN)) player.vy += accel;
    if (this.inputState.isActionActive(GameAction.MOVE_LEFT)) player.vx -= accel;
    if (this.inputState.isActionActive(GameAction.MOVE_RIGHT)) player.vx += accel;
  }

  /**
   * 更新摄像机
   */
  updateCamera(player, dt) {
    // 前瞻目标
    const targetX = player.x + player.vx * CAMERA.LOOK_AHEAD;
    const targetY = player.y + player.vy * CAMERA.LOOK_AHEAD;

    // 平滑跟随
    const camLerp = 1 - Math.pow(1 - CAMERA.FOLLOW_LERP, dt);
    this.camera.x += (targetX - this.camera.x) * camLerp;
    this.camera.y += (targetY - this.camera.y) * camLerp;

    // 动态缩放
    const targetZoom = Math.pow(PLAYER.INITIAL_RADIUS / player.r, CAMERA.ZOOM_POWER);
    const zoomLerp = 1 - Math.pow(1 - CAMERA.ZOOM_LERP, dt);
    this.baseZoom += (targetZoom - this.baseZoom) * zoomLerp;
    this.zoom = Math.max(CAMERA.MIN_ZOOM, Math.min(CAMERA.MAX_ZOOM, this.baseZoom));
  }

  /**
   * 更新分块
   */
  updateChunks(player) {
    // 使用比渲染可见范围更大的加载范围，确保元素在进入视图前就已生成
    const viewRadius = (CANVAS.SIZE / 2) / this.zoom + RENDERING.VIEW_BUFFER + CHUNK.LOAD_EXTRA_BUFFER;

    // 加载新分块
    const toLoad = this.chunkManager.getChunksToLoad(this.camera.x, this.camera.y, viewRadius);
    for (const { cx, cy } of toLoad) {
      this.chunkManager.markLoaded(cx, cy);
      const entities = generateChunk(cx, cy, player.r);
      this.entityManager.addBatch(entities);
    }

    // 卸载远离分块
    const toUnload = this.chunkManager.getChunksToUnload(this.camera.x, this.camera.y, viewRadius);
    for (const key of toUnload) {
      this.chunkManager.unload(...key.split(',').map(Number));
      this.entityManager.removeByChunkKey(key);
    }
  }

  /**
   * 处理玩家死亡
   */
  handlePlayerDeath() {
    this.highScore = Math.max(this.highScore, this.score);
    this.setState(GameState.GAMEOVER);
    this.emit('playerDeath', { score: this.score, highScore: this.highScore });
  }

  /**
   * 检测并触发里程碑事件
   *
   * @param {Object} player - 玩家实体
   */
  checkMilestones(player) {
    for (const milestone of MILESTONES) {
      if (!this.reachedMilestones.has(milestone.radius) && player.r >= milestone.radius) {
        this.reachedMilestones.add(milestone.radius);
        this.emit('milestone', {
          ...milestone,
          playerRadius: player.r,
        });
      }
    }
  }

  /**
   * 获取渲染状态
   *
   * @returns {Object} 渲染所需的状态数据
   */
  getRenderState() {
    const player = this.entityManager.getPlayer();
    const { ballData, ballCount } = this.entityManager.getRenderData(
      this.camera.x,
      this.camera.y,
      this.zoom
    );

    return {
      cameraX: this.camera.x,
      cameraY: this.camera.y,
      zoom: this.zoom,
      time: this.time,
      ballData,
      ballCount,
      player,
      entities: this.entityManager.getAll(),
    };
  }

  /**
   * 获取游戏统计
   *
   * @returns {Object}
   */
  getStats() {
    return {
      score: this.score,
      highScore: this.highScore,
      time: this.time,
      ...this.entityManager.getStats(),
      chunks: this.chunkManager.getLoadedCount(),
    };
  }

  // ============================================================
  // 事件系统
  // ============================================================

  /**
   * 添加事件监听器
   *
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * 移除事件监听器
   *
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * 触发事件
   *
   * @param {string} event - 事件名称
   * @param {Object} data - 事件数据
   */
  emit(event, data) {
    if (this.listeners[event]) {
      for (const callback of this.listeners[event]) {
        callback(data);
      }
    }
  }
}

export default {
  GameState,
  GameEngine,
};
