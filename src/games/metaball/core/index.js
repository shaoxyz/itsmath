/**
 * Core Module Index - 核心模块导出
 */

export { default as GameConfig } from './GameConfig.js';
export * from './GameConfig.js';

export { GameEngine, GameState } from './GameEngine.js';
export { EntityManager, createPlayer } from './EntityManager.js';
export { ChunkManager, generateChunk, chunkKey, seededRandom } from './ChunkSystem.js';
export * from './PhysicsSystem.js';
