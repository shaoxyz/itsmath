/**
 * GameConfig.js - 游戏配置中心
 *
 * 设计哲学：数据驱动设计 (Data-Driven Design)
 *
 * 所有游戏参数集中管理，支持：
 * 1. 运行时调整（调试/测试）
 * 2. 不同难度预设
 * 3. 清晰的参数语义
 *
 * 遵循 "配置即文档" 原则，每个参数都有明确的注释说明其作用和影响范围
 */

// ============================================================
// 核心常量 - 影响游戏基础架构
// ============================================================
export const CANVAS = {
  SIZE: 500,                    // 画布尺寸（像素）
  ASPECT_RATIO: 1,              // 宽高比
};

export const CHUNK = {
  SIZE: 300,                    // 分块大小（世界单位）
  BASE_LOAD_RADIUS: 2,          // 基础加载半径（分块数）
  UNLOAD_BUFFER: 2,             // 卸载缓冲区（防止频繁加载/卸载）
};

// ============================================================
// 玩家配置 - 影响玩家操控手感
// ============================================================
export const PLAYER = {
  INITIAL_RADIUS: 22,           // 初始半径
  MIN_RADIUS: 5,                // 最小存活半径（低于此值死亡）
  ACCELERATION: 0.15,           // 加速度
  MAX_SPEED: 3.0,               // 最大速度
  FRICTION: 0.96,               // 摩擦系数（每帧速度衰减）
  HUE: 200,                     // 颜色色调（蓝色）
  // 玩家引力系统 - 教育核心：质量大 = 引力大
  GRAVITY: {
    ENABLED: true,              // 是否启用玩家引力
    MIN_RADIUS_TO_ACTIVATE: 30, // 激活引力的最小半径
    BASE_STRENGTH: 0.02,        // 基础引力强度
    RANGE_MULTIPLIER: 4,        // 引力范围 = 玩家半径 × 此值
    MASS_POWER: 1.5,            // 引力随质量增长的指数
  },
};

// ============================================================
// 摄像机配置 - 影响视觉体验
// ============================================================
export const CAMERA = {
  LOOK_AHEAD: 30,               // 视角前瞻距离
  FOLLOW_LERP: 0.08,            // 跟随平滑系数
  ZOOM_LERP: 0.02,              // 缩放平滑系数
  ZOOM_POWER: 0.35,             // 缩放指数（基于玩家大小）
  MIN_ZOOM: 0.15,               // 最小缩放
  MAX_ZOOM: 1.5,                // 最大缩放
};

// ============================================================
// 食物配置 - 影响游戏节奏
// ============================================================
export const FOOD = {
  COUNT_MIN: 8,                 // 每分块最少食物数
  COUNT_MAX: 15,                // 每分块最多食物数
  RADIUS_MIN: 6,                // 最小半径
  RADIUS_MAX: 14,               // 最大半径
  HUE_MIN: 90,                  // 色调范围（绿色）
  HUE_MAX: 130,
  SCALE_FACTOR: 0.5,            // 难度缩放因子（开方）
};

// ============================================================
// 敌人配置 - 影响游戏难度
// ============================================================
export const ENEMY = {
  BASE_SIZE: 20,                // 基础大小
  DISTANCE_SCALE: 2,            // 距离缩放系数
  SIZE_VARIATION: 15,           // 大小变化范围
  SIZE_MIN_RATIO: 0.7,          // 相对玩家的最小比例
  SIZE_MAX_RATIO: 1.5,          // 相对玩家的最大比例
  INITIAL_VELOCITY: 0.3,        // 初始速度
  MAX_SPEED: 0.5,               // 最大速度
  HUE_MIN: 340,                 // 色调范围（红色）
  HUE_MAX: 370,
  SPAWN_CHANCE_BASE: 0.15,      // 基础生成概率
  SPAWN_CHANCE_MAX: 0.85,       // 最大生成概率
};

// ============================================================
// 敌人 AI 配置 - 影响敌人行为模式
// ============================================================
export const ENEMY_AI = {
  BASE_CHASE_ACCEL: 0.008,      // 基础追逐加速度
  CHASE_SCALE_FACTOR: 0.5,      // 追逐缩放因子
  BASE_CHASE_RANGE: 400,        // 基础追逐范围
  SIZE_SPEED_FACTOR: 1.0,       // 大小对速度的影响
};

// ============================================================
// 黑洞配置 - 高风险高刺激元素
// ============================================================
export const BLACK_HOLE = {
  RADIUS_MIN: 18,               // 最小半径
  RADIUS_MAX: 30,               // 最大半径
  HUE: 270,                     // 色调（紫色）
  SPAWN_CHANCE_BASE: 0.05,      // 基础生成概率
  SPAWN_CHANCE_MAX: 0.4,        // 最大生成概率
  MIN_DISTANCE_FROM_ORIGIN: 2,  // 距原点最小分块数
  PULL_RADIUS_MULTIPLIER: 6,    // 引力范围倍数
  PULL_STRENGTH: 0.05,          // 引力强度
  DRAIN_RADIUS_MULTIPLIER: 2,   // 吸取范围倍数
  DRAIN_RATE: 0.2,              // 质量吸取速率
};

// ============================================================
// 物理系统配置 - 影响游戏手感
// ============================================================
export const PHYSICS = {
  ABSORPTION_RATE: 0.08,        // 吸收速率
  MAX_ABSORPTION_RATIO: 0.15,   // 单帧最大吸收比例
  ABSORPTION_THRESHOLD: 1.1,    // 吸收阈值（需要比对方大10%）
  PULL_STRENGTH: 0.15,          // 吸收时拉力
  PUSH_STRENGTH: 0.3,           // 碰撞推力
  ATTRACT_RANGE: 30,            // 吸引范围
  ATTRACT_STRENGTH: 0.02,       // 吸引力
  DEATH_THRESHOLD: 0.5,         // 死亡阈值
};

// ============================================================
// 渲染配置 - 影响视觉效果
// ============================================================
export const RENDERING = {
  TARGET_FPS: 60,               // 目标帧率
  MAX_FRAME_MULTIPLIER: 3,      // 最大帧时间倍数
  MAX_VISIBLE_BALLS: 64,        // 最大可见球体数
  VIEW_BUFFER: 200,             // 视野缓冲区
  METABALL_THRESHOLD: 1.0,      // 元球阈值
  GRID_SIZE: 50,                // 网格大小
};

// ============================================================
// 难度系统 - 动态难度调整 (Dynamic Difficulty Adjustment)
// ============================================================
export const DIFFICULTY = {
  /**
   * 计算当前难度缩放
   * 基于玩家成长的渐进难度曲线
   */
  getScale: (playerRadius) => {
    return Math.max(1.0, playerRadius / PLAYER.INITIAL_RADIUS);
  },

  /**
   * 计算食物缩放（平方根，增长较慢）
   */
  getFoodScale: (playerRadius) => {
    return Math.sqrt(DIFFICULTY.getScale(playerRadius));
  },

  /**
   * 计算敌人缩放（线性，与玩家同步）
   */
  getEnemyScale: (playerRadius) => {
    return DIFFICULTY.getScale(playerRadius);
  },

  /**
   * 计算黑洞缩放（平方根，保持挑战但不过分）
   */
  getBlackHoleScale: (playerRadius) => {
    return Math.sqrt(DIFFICULTY.getScale(playerRadius));
  },
};

// ============================================================
// 输入配置 - 控制映射
// ============================================================
export const INPUT = {
  KEYBOARD: {
    UP: ['ArrowUp', 'KeyW'],
    DOWN: ['ArrowDown', 'KeyS'],
    LEFT: ['ArrowLeft', 'KeyA'],
    RIGHT: ['ArrowRight', 'KeyD'],
    RESTART: ['KeyR'],
    START: ['Space'],
  },
  TOUCH: {
    DEADZONE: 10,               // 触摸死区（像素）
  },
};

// ============================================================
// UI 配置 - 界面元素
// ============================================================
export const UI = {
  MINIMAP: {
    SIZE: 80,                   // 小地图尺寸
    SCALE: 0.05,                // 小地图缩放
    MARGIN: 10,                 // 边距
  },
  INFO_PANEL: {
    WIDTH: 120,
    HEIGHT: 45,
    MARGIN: 10,
  },
  PLAYER_EYES: {
    OFFSET_RATIO: 0.25,         // 眼睛间距比例
    SIZE_MIN: 1.5,              // 最小眼睛大小
    SIZE_MAX: 8,                // 最大眼睛大小
    SIZE_RATIO: 0.12,           // 相对玩家的比例
    LOOK_MAX_OFFSET: 0.15,      // 最大注视偏移
    VERTICAL_OFFSET: 0.2,       // 眼睛垂直位置
  },
};

// ============================================================
// 颜色配置 - 视觉主题
// ============================================================
export const COLORS = {
  PLAYER: { h: 200, s: 70, l: 50 },
  FOOD: { h: 110, s: 70, l: 50 },
  ENEMY: { h: 350, s: 70, l: 50 },
  BLACK_HOLE: { h: 270, s: 70, l: 40 },
};

// ============================================================
// 成长里程碑 - 教育反馈系统
// ============================================================
export const MILESTONES = [
  { radius: 30, title: '小星球', message: '你开始有自己的引力了！', icon: '🌑' },
  { radius: 50, title: '行星', message: '食物正被你的引力吸引过来！', icon: '🌍' },
  { radius: 80, title: '巨行星', message: '你的引力范围越来越大！', icon: '🪐' },
  { radius: 120, title: '恒星', message: '质量越大，引力越强！', icon: '⭐' },
  { radius: 180, title: '超级恒星', message: '你现在是宇宙中的引力霸主！', icon: '🌟' },
];

// ============================================================
// 导出默认配置对象（方便整体引用）
// ============================================================
export default {
  CANVAS,
  CHUNK,
  PLAYER,
  CAMERA,
  FOOD,
  ENEMY,
  ENEMY_AI,
  BLACK_HOLE,
  PHYSICS,
  RENDERING,
  DIFFICULTY,
  INPUT,
  UI,
  COLORS,
  MILESTONES,
};
