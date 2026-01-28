/**
 * MetaballGame.jsx - 游戏容器组件
 *
 * 设计哲学：视图-控制器分离 (View-Controller Separation)
 *
 * 职责：
 * 1. React 状态管理（UI 相关）
 * 2. 连接游戏引擎和渲染系统
 * 3. 管理游戏循环生命周期
 * 4. 渲染游戏 UI
 *
 * 不负责：
 * - 游戏逻辑（由 GameEngine 处理）
 * - WebGL 渲染细节（由 WebGLRenderer 处理）
 * - 物理计算（由 PhysicsSystem 处理）
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  GameEngine,
  GameState,
  CANVAS,
} from './metaball/index.js';
import { WebGLRenderer } from './metaball/rendering/WebGLRenderer.js';
import { OverlayRenderer } from './metaball/rendering/OverlayRenderer.js';
import { InputManager, GameAction } from './metaball/input/InputManager.js';

export default function MetaballGame() {
  // ============================================================
  // Refs - 持久化对象引用
  // ============================================================
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const engineRef = useRef(null);
  const webglRendererRef = useRef(null);
  const overlayRendererRef = useRef(null);
  const inputManagerRef = useRef(null);

  // ============================================================
  // State - React 状态
  // ============================================================
  const [gameState, setGameState] = useState('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  // ============================================================
  // 初始化游戏系统
  // ============================================================
  const initializeSystems = useCallback(() => {
    // 初始化游戏引擎
    if (!engineRef.current) {
      engineRef.current = new GameEngine();

      // 监听引擎事件
      engineRef.current.on('stateChange', ({ newState }) => {
        setGameState(newState);
      });

      engineRef.current.on('scoreChange', ({ score }) => {
        setScore(score);
      });

      engineRef.current.on('playerDeath', ({ highScore }) => {
        setHighScore(h => Math.max(h, highScore));
      });

    }

    // 初始化 WebGL 渲染器
    if (!webglRendererRef.current && canvasRef.current) {
      webglRendererRef.current = new WebGLRenderer(canvasRef.current);
      if (!webglRendererRef.current.initialize()) {
        console.error('Failed to initialize WebGL renderer');
        return false;
      }
    }

    // 初始化覆盖层渲染器
    if (!overlayRendererRef.current && overlayCanvasRef.current) {
      overlayRendererRef.current = new OverlayRenderer(overlayCanvasRef.current);
    }

    // 初始化输入管理器
    if (!inputManagerRef.current) {
      inputManagerRef.current = new InputManager();
    }

    return true;
  }, []);

  // ============================================================
  // 开始游戏
  // ============================================================
  const startGame = useCallback(() => {
    if (!initializeSystems()) {
      return;
    }

    const engine = engineRef.current;
    const inputManager = inputManagerRef.current;

    // 连接输入管理器到引擎
    engine.setInputManager(inputManager);

    // 初始化游戏
    engine.initialize();
    engine.lastTime = performance.now();

    setScore(0);
  }, [initializeSystems]);

  // ============================================================
  // 游戏循环
  // ============================================================
  useEffect(() => {
    if (gameState !== 'playing') return;

    const engine = engineRef.current;
    const webglRenderer = webglRendererRef.current;
    const overlayRenderer = overlayRendererRef.current;

    if (!engine || !webglRenderer || !overlayRenderer) return;

    let animationId;

    const gameLoop = (currentTime) => {
      // 更新游戏逻辑
      const result = engine.update(currentTime);

      if (result.updated && engine.state === GameState.PLAYING) {
        // 获取渲染状态
        const renderState = engine.getRenderState();

        // WebGL 渲染
        webglRenderer.render(renderState);

        // 覆盖层渲染
        overlayRenderer.render({
          player: renderState.player,
          camera: { x: renderState.cameraX, y: renderState.cameraY },
          zoom: renderState.zoom,
          entities: renderState.entities,
          showDebug: false,
        });
      }

      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gameState]);

  // ============================================================
  // 输入事件处理
  // ============================================================
  useEffect(() => {
    const inputManager = inputManagerRef.current;
    if (!inputManager) {
      inputManagerRef.current = new InputManager();
    }

    const im = inputManagerRef.current;
    const overlay = overlayCanvasRef.current;

    im.attach(overlay);

    // 处理游戏控制快捷键
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && gameState !== 'playing') {
        startGame();
      }
      if (e.code === 'KeyR' && gameState === 'playing') {
        startGame();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      im.detach(overlay);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameState, startGame]);

  // ============================================================
  // 清理资源
  // ============================================================
  useEffect(() => {
    return () => {
      if (webglRendererRef.current) {
        webglRendererRef.current.dispose();
      }
      if (inputManagerRef.current) {
        inputManagerRef.current.reset();
      }
    };
  }, []);

  // ============================================================
  // 渲染 UI
  // ============================================================
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 select-none" style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      {/* 标题和分数 */}
      <div className="mb-3 text-center">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-1">
          Metaball
        </h1>
        <p className="text-gray-500 text-xs mb-2 font-mono">Infinite World</p>
        <div className="flex gap-4 text-sm text-white">
          <span className="text-cyan-400">
            Score: <span className="font-bold">{score}</span>
          </span>
          <span className="text-gray-400">
            Best: <span className="font-bold">{highScore}</span>
          </span>
        </div>
      </div>

      {/* 游戏画布容器 */}
      <div className="relative" style={{ width: CANVAS.SIZE, height: CANVAS.SIZE }}>
        {/* WebGL 画布 */}
        <canvas
          ref={canvasRef}
          width={CANVAS.SIZE}
          height={CANVAS.SIZE}
          className="rounded-lg shadow-2xl border border-gray-700 absolute inset-0"
        />
        {/* 覆盖层画布 */}
        <canvas
          ref={overlayCanvasRef}
          width={CANVAS.SIZE}
          height={CANVAS.SIZE}
          className="rounded-lg touch-none relative"
        />

        {/* 重新开始按钮 */}
        {gameState === 'playing' && (
          <button
            onClick={startGame}
            className="absolute top-3 right-3 px-3 py-1.5 bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition backdrop-blur flex items-center gap-1"
            title="重新开始 (R)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            重来
          </button>
        )}





        {/* 菜单界面 */}
        {gameState === 'menu' && (
          <div className="absolute inset-0 bg-black/80 rounded-lg flex flex-col items-center justify-center p-6">
            <h2 className="text-3xl font-bold text-white mb-2">Metaball</h2>
            <p className="text-cyan-400 text-sm mb-3 font-mono">探索质量与引力的奥秘</p>

            <div className="text-gray-300 text-sm mb-4 space-y-2 text-center">
              <p>🌍 吃掉绿色小球让自己变大</p>
              <p>⚠️ 躲避红色敌人和紫色黑洞</p>
              <p className="text-yellow-400">✨ 变大后你会产生自己的引力！</p>
            </div>

            <div className="bg-gray-800/60 rounded-lg p-3 mb-4 text-xs text-gray-400">
              <p className="text-cyan-300 font-bold mb-1">🔬 科学小知识</p>
              <p>质量越大的物体，引力越强。</p>
              <p>这就是为什么黑洞能吸引一切！</p>
            </div>

            <div className="text-gray-500 text-xs mb-3">
              WASD / 方向键移动 | R 重来
            </div>
            <button
              onClick={startGame}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition"
            >
              开始探索
            </button>
          </div>
        )}

        {/* 游戏结束界面 */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 bg-black/80 rounded-lg flex flex-col items-center justify-center">
            <h2 className="text-3xl font-bold text-red-500 mb-3">Game Over</h2>
            <p className="text-xl text-white mb-1">得分: {score}</p>
            {score >= highScore && score > 0 && (
              <p className="text-yellow-400 mb-3">新纪录!</p>
            )}
            <button
              onClick={startGame}
              className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition"
            >
              再来
            </button>
          </div>
        )}
      </div>

      {/* 图例 */}
      <div className="mt-3 flex gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: 'hsl(200, 70%, 50%)' }}></span>
          <span className="text-gray-400">你</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: 'hsl(110, 70%, 50%)' }}></span>
          <span className="text-gray-400">食物</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: 'hsl(350, 70%, 50%)' }}></span>
          <span className="text-gray-400">敌人</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: 'hsl(270, 70%, 40%)' }}></span>
          <span className="text-gray-400">黑洞</span>
        </span>
      </div>
    </div>
  );
}
