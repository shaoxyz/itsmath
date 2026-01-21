/**
 * Metaball Game Module - 主模块导出
 *
 * 提供游戏的所有公共 API
 */

// 核心模块
export {
  GameEngine,
  GameState,
  EntityManager,
  ChunkManager,
  GameConfig,
  CANVAS,
  CHUNK,
  PLAYER,
  CAMERA,
  FOOD,
  ENEMY,
  BLACK_HOLE,
  PHYSICS,
  RENDERING,
  DIFFICULTY,
  INPUT,
  UI,
  COLORS,
} from './core/index.js';

// 渲染模块
export { WebGLRenderer, OverlayRenderer } from './rendering/index.js';

// 输入模块
export { InputManager, GameAction } from './input/InputManager.js';

// AI 模块
export { updateAllEnemies, AIController, AIBehavior } from './ai/EnemyAI.js';
