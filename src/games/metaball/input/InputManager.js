/**
 * InputManager.js - 输入管理器
 *
 * 设计哲学：输入抽象层 (Input Abstraction Layer)
 *
 * 核心职责：
 * 1. 统一处理键盘和触摸输入
 * 2. 将原始输入转换为游戏意图
 * 3. 支持键位重映射
 *
 * 设计优势：
 * - 游戏逻辑与输入设备解耦
 * - 便于添加新的输入方式（手柄等）
 * - 支持输入缓冲和预输入
 */

import { INPUT } from '../core/GameConfig.js';

/**
 * 游戏动作枚举
 */
export const GameAction = {
  MOVE_UP: 'moveUp',
  MOVE_DOWN: 'moveDown',
  MOVE_LEFT: 'moveLeft',
  MOVE_RIGHT: 'moveRight',
  RESTART: 'restart',
  START: 'start',
};

/**
 * 输入管理器类
 *
 * 提供统一的输入处理接口
 */
export class InputManager {
  constructor() {
    // 按键状态（原始）
    this.keyStates = {};

    // 动作状态（抽象）
    this.actionStates = {
      [GameAction.MOVE_UP]: false,
      [GameAction.MOVE_DOWN]: false,
      [GameAction.MOVE_LEFT]: false,
      [GameAction.MOVE_RIGHT]: false,
      [GameAction.RESTART]: false,
      [GameAction.START]: false,
    };

    // 触摸状态
    this.touchStart = null;
    this.isTouching = false;

    // 事件处理器绑定
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);

    // 刚按下的键（用于单次触发）
    this.justPressed = new Set();
  }

  /**
   * 注册事件监听器
   *
   * @param {HTMLElement} touchTarget - 触摸事件目标元素
   */
  attach(touchTarget = null) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    if (touchTarget) {
      touchTarget.addEventListener('touchstart', this.handleTouchStart);
      touchTarget.addEventListener('touchmove', this.handleTouchMove, { passive: false });
      touchTarget.addEventListener('touchend', this.handleTouchEnd);
    }
  }

  /**
   * 移除事件监听器
   *
   * @param {HTMLElement} touchTarget - 触摸事件目标元素
   */
  detach(touchTarget = null) {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);

    if (touchTarget) {
      touchTarget.removeEventListener('touchstart', this.handleTouchStart);
      touchTarget.removeEventListener('touchmove', this.handleTouchMove);
      touchTarget.removeEventListener('touchend', this.handleTouchEnd);
    }
  }

  /**
   * 键盘按下处理
   */
  handleKeyDown(e) {
    if (!this.keyStates[e.code]) {
      this.justPressed.add(e.code);
    }
    this.keyStates[e.code] = true;
    this.updateActionStates();

    // 阻止默认行为（方向键滚动等）
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }

  /**
   * 键盘释放处理
   */
  handleKeyUp(e) {
    this.keyStates[e.code] = false;
    this.updateActionStates();
  }

  /**
   * 触摸开始处理
   */
  handleTouchStart(e) {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    this.touchStart = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
    this.isTouching = true;
  }

  /**
   * 触摸移动处理
   */
  handleTouchMove(e) {
    if (!this.touchStart || !this.isTouching) return;
    e.preventDefault();

    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (touch.clientX - rect.left) - this.touchStart.x;
    const dy = (touch.clientY - rect.top) - this.touchStart.y;

    const deadzone = INPUT.TOUCH.DEADZONE;

    // 根据触摸偏移更新方向
    this.actionStates[GameAction.MOVE_LEFT] = dx < -deadzone;
    this.actionStates[GameAction.MOVE_RIGHT] = dx > deadzone;
    this.actionStates[GameAction.MOVE_UP] = dy < -deadzone;
    this.actionStates[GameAction.MOVE_DOWN] = dy > deadzone;
  }

  /**
   * 触摸结束处理
   */
  handleTouchEnd() {
    this.touchStart = null;
    this.isTouching = false;

    // 清除触摸产生的方向状态
    this.actionStates[GameAction.MOVE_LEFT] = false;
    this.actionStates[GameAction.MOVE_RIGHT] = false;
    this.actionStates[GameAction.MOVE_UP] = false;
    this.actionStates[GameAction.MOVE_DOWN] = false;
  }

  /**
   * 根据按键状态更新动作状态
   */
  updateActionStates() {
    // 如果正在触摸，不覆盖触摸产生的方向状态
    if (!this.isTouching) {
      this.actionStates[GameAction.MOVE_UP] = INPUT.KEYBOARD.UP.some(key => this.keyStates[key]);
      this.actionStates[GameAction.MOVE_DOWN] = INPUT.KEYBOARD.DOWN.some(key => this.keyStates[key]);
      this.actionStates[GameAction.MOVE_LEFT] = INPUT.KEYBOARD.LEFT.some(key => this.keyStates[key]);
      this.actionStates[GameAction.MOVE_RIGHT] = INPUT.KEYBOARD.RIGHT.some(key => this.keyStates[key]);
    }

    this.actionStates[GameAction.RESTART] = INPUT.KEYBOARD.RESTART.some(key => this.keyStates[key]);
    this.actionStates[GameAction.START] = INPUT.KEYBOARD.START.some(key => this.keyStates[key]);
  }

  /**
   * 检查动作是否激活
   *
   * @param {string} action - 动作名称
   * @returns {boolean}
   */
  isActionActive(action) {
    return this.actionStates[action] || false;
  }

  /**
   * 检查按键是否刚被按下（单次触发）
   *
   * @param {string} keyCode - 按键代码
   * @returns {boolean}
   */
  isKeyJustPressed(keyCode) {
    return this.justPressed.has(keyCode);
  }

  /**
   * 清除单次触发状态（每帧结束时调用）
   */
  clearJustPressed() {
    this.justPressed.clear();
  }

  /**
   * 获取移动方向向量
   *
   * @returns {Object} { x, y } 归一化方向向量
   */
  getMoveDirection() {
    let x = 0;
    let y = 0;

    if (this.actionStates[GameAction.MOVE_LEFT]) x -= 1;
    if (this.actionStates[GameAction.MOVE_RIGHT]) x += 1;
    if (this.actionStates[GameAction.MOVE_UP]) y -= 1;
    if (this.actionStates[GameAction.MOVE_DOWN]) y += 1;

    // 归一化对角线移动
    if (x !== 0 && y !== 0) {
      const len = Math.sqrt(x * x + y * y);
      x /= len;
      y /= len;
    }

    return { x, y };
  }

  /**
   * 检查是否有任何移动输入
   *
   * @returns {boolean}
   */
  hasMovementInput() {
    return (
      this.actionStates[GameAction.MOVE_UP] ||
      this.actionStates[GameAction.MOVE_DOWN] ||
      this.actionStates[GameAction.MOVE_LEFT] ||
      this.actionStates[GameAction.MOVE_RIGHT]
    );
  }

  /**
   * 重置所有状态
   */
  reset() {
    this.keyStates = {};
    this.touchStart = null;
    this.isTouching = false;
    this.justPressed.clear();

    for (const action in this.actionStates) {
      this.actionStates[action] = false;
    }
  }
}

export default {
  GameAction,
  InputManager,
};
