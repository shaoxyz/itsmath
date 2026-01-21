/**
 * OverlayRenderer.js - 2D 覆盖层渲染器
 *
 * 设计哲学：UI 与游戏渲染分离 (Separation of Concerns)
 *
 * 核心职责：
 * 1. 玩家眼睛动画
 * 2. HUD 信息显示
 * 3. 小地图渲染
 *
 * 使用 Canvas 2D API，独立于 WebGL 渲染管道
 */

import { CANVAS, UI, COLORS, PLAYER } from '../core/GameConfig.js';

/**
 * 覆盖层渲染器类
 */
export class OverlayRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /**
   * 清除画布
   */
  clear() {
    this.ctx.clearRect(0, 0, CANVAS.SIZE, CANVAS.SIZE);
  }

  /**
   * 渲染玩家眼睛
   *
   * @param {Object} player - 玩家实体
   * @param {Object} camera - 摄像机 {x, y}
   * @param {number} zoom - 缩放级别
   */
  renderPlayerEyes(player, camera, zoom) {
    const { ctx } = this;
    const { PLAYER_EYES } = UI;

    // 计算屏幕坐标
    const screenX = (player.x - camera.x) * zoom + CANVAS.SIZE / 2;
    const screenY = (player.y - camera.y) * zoom + CANVAS.SIZE / 2;
    const screenR = player.r * zoom;

    // 太小时不渲染
    if (screenR <= 3) return;

    const eyeOffset = screenR * PLAYER_EYES.OFFSET_RATIO;
    const eyeSize = Math.max(
      PLAYER_EYES.SIZE_MIN,
      Math.min(screenR * PLAYER_EYES.SIZE_RATIO, PLAYER_EYES.SIZE_MAX)
    );

    // 计算眼睛看向方向（基于速度）
    const maxLookOffset = screenR * PLAYER_EYES.LOOK_MAX_OFFSET;
    const lookX = Math.max(-maxLookOffset, Math.min(maxLookOffset, player.vx * 3 * zoom));
    const lookY = Math.max(-maxLookOffset, Math.min(maxLookOffset, player.vy * 3 * zoom));

    // 眼睛基准位置（稍微偏上）
    const eyeBaseY = screenY - screenR * PLAYER_EYES.VERTICAL_OFFSET;

    // 渲染两只眼睛
    [-1, 1].forEach(side => {
      const ex = screenX + side * eyeOffset + lookX * 0.5;
      const ey = eyeBaseY + lookY * 0.5;

      // 眼白
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(ex, ey, eyeSize, 0, Math.PI * 2);
      ctx.fill();

      // 瞳孔
      const pupilSize = eyeSize * 0.5;
      const pupilOffsetX = lookX * 0.3;
      const pupilOffsetY = lookY * 0.3;

      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(ex + pupilOffsetX, ey + pupilOffsetY, pupilSize, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /**
   * 渲染 HUD 信息
   *
   * @param {Object} player - 玩家实体
   */
  renderHUD(player) {
    const { ctx } = this;
    const { INFO_PANEL } = UI;

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(
      INFO_PANEL.MARGIN,
      CANVAS.SIZE - INFO_PANEL.HEIGHT - INFO_PANEL.MARGIN,
      INFO_PANEL.WIDTH,
      INFO_PANEL.HEIGHT
    );

    // 半径显示
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(
      `r = ${player.r.toFixed(1)}`,
      INFO_PANEL.MARGIN + 8,
      CANVAS.SIZE - INFO_PANEL.HEIGHT - INFO_PANEL.MARGIN + 18
    );

    // 坐标显示
    ctx.fillStyle = '#888';
    ctx.fillText(
      `(${Math.round(player.x)}, ${Math.round(player.y)})`,
      INFO_PANEL.MARGIN + 8,
      CANVAS.SIZE - INFO_PANEL.HEIGHT - INFO_PANEL.MARGIN + 35
    );
  }

  /**
   * 渲染小地图
   *
   * @param {Array} entities - 实体数组
   * @param {Object} player - 玩家实体
   */
  renderMinimap(entities, player) {
    const { ctx } = this;
    const { MINIMAP } = UI;

    const minimapX = CANVAS.SIZE - MINIMAP.SIZE - MINIMAP.MARGIN;
    const minimapY = CANVAS.SIZE - MINIMAP.SIZE - MINIMAP.MARGIN;

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(minimapX, minimapY, MINIMAP.SIZE, MINIMAP.SIZE);

    // 边框
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.strokeRect(minimapX, minimapY, MINIMAP.SIZE, MINIMAP.SIZE);

    // 渲染实体点
    for (const entity of entities) {
      const mx = minimapX + MINIMAP.SIZE / 2 + (entity.x - player.x) * MINIMAP.SCALE;
      const my = minimapY + MINIMAP.SIZE / 2 + (entity.y - player.y) * MINIMAP.SCALE;

      // 边界检查
      if (mx < minimapX || mx > minimapX + MINIMAP.SIZE ||
          my < minimapY || my > minimapY + MINIMAP.SIZE) {
        continue;
      }

      if (entity.isPlayer) {
        ctx.fillStyle = `hsl(${COLORS.PLAYER.h}, ${COLORS.PLAYER.s}%, ${COLORS.PLAYER.l + 10}%)`;
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (entity.isBlackHole) {
        ctx.fillStyle = `hsl(${COLORS.BLACK_HOLE.h}, ${COLORS.BLACK_HOLE.s}%, ${COLORS.BLACK_HOLE.l}%)`;
        ctx.beginPath();
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (entity.isEnemy) {
        ctx.fillStyle = `hsl(${COLORS.ENEMY.h}, ${COLORS.ENEMY.s}%, ${COLORS.ENEMY.l}%)`;
        ctx.beginPath();
        ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // 食物不在小地图上显示，减少视觉噪音
    }
  }

  /**
   * 渲染玩家引力场（教育可视化）
   *
   * 通过同心圆环显示引力场范围和强度
   * 越靠近中心，圆环越密集（视觉传达引力强度）
   *
   * @param {Object} player - 玩家实体
   * @param {Object} camera - 摄像机 {x, y}
   * @param {number} zoom - 缩放级别
   */
  renderGravityField(player, camera, zoom) {
    const { ctx } = this;
    const { GRAVITY } = PLAYER;

    // 未达到激活半径，不渲染
    if (!GRAVITY.ENABLED || player.r < GRAVITY.MIN_RADIUS_TO_ACTIVATE) {
      return;
    }

    // 计算屏幕坐标
    const screenX = (player.x - camera.x) * zoom + CANVAS.SIZE / 2;
    const screenY = (player.y - camera.y) * zoom + CANVAS.SIZE / 2;

    // 引力范围
    const gravityRange = player.r * GRAVITY.RANGE_MULTIPLIER * zoom;

    // 绘制引力场圆环（3-5个同心圆）
    const ringCount = 4;
    for (let i = 1; i <= ringCount; i++) {
      const ratio = i / ringCount;
      const radius = gravityRange * ratio;
      const alpha = 0.15 * (1 - ratio * 0.7); // 外圈更透明

      ctx.strokeStyle = `rgba(100, 200, 255, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.setLineDash([]); // 重置虚线
  }

  /**
   * 渲染调试信息（可选）
   *
   * @param {Object} debugInfo - 调试信息
   */
  renderDebugInfo(debugInfo) {
    const { ctx } = this;
    const { fps, entityCount, chunkCount } = debugInfo;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(CANVAS.SIZE - 100, 10, 90, 55);

    ctx.fillStyle = '#0f0';
    ctx.font = '10px monospace';
    ctx.fillText(`FPS: ${fps}`, CANVAS.SIZE - 95, 25);
    ctx.fillText(`Entities: ${entityCount}`, CANVAS.SIZE - 95, 40);
    ctx.fillText(`Chunks: ${chunkCount}`, CANVAS.SIZE - 95, 55);
  }

  /**
   * 完整渲染覆盖层
   *
   * @param {Object} state - 渲染状态
   */
  render(state) {
    const { player, camera, zoom, entities, showDebug, debugInfo, showGravityField = true } = state;

    this.clear();

    // 先渲染引力场（在玩家下层）
    if (showGravityField) {
      this.renderGravityField(player, camera, zoom);
    }

    this.renderPlayerEyes(player, camera, zoom);
    this.renderHUD(player);
    this.renderMinimap(entities, player);

    if (showDebug && debugInfo) {
      this.renderDebugInfo(debugInfo);
    }
  }
}

export default OverlayRenderer;
