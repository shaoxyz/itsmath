/**
 * WebGLRenderer.js - WebGL 渲染器
 *
 * 设计哲学：单一职责 (Single Responsibility)
 *
 * 核心职责：
 * 1. WebGL 上下文管理
 * 2. 着色器编译和链接
 * 3. 缓冲区管理
 * 4. 渲染调用
 *
 * 不负责：
 * - 游戏逻辑
 * - 实体管理
 * - 输入处理
 */

import { VERTEX_SHADER, FRAGMENT_SHADER } from './shaders/index.js';
import { CANVAS, RENDERING } from '../core/GameConfig.js';

/**
 * 编译着色器
 *
 * @param {WebGLRenderingContext} gl - WebGL 上下文
 * @param {number} type - 着色器类型
 * @param {string} source - 着色器源码
 * @returns {WebGLShader|null}
 */
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

/**
 * 链接着色器程序
 *
 * @param {WebGLRenderingContext} gl - WebGL 上下文
 * @param {WebGLShader} vertexShader - 顶点着色器
 * @param {WebGLShader} fragmentShader - 片段着色器
 * @returns {WebGLProgram|null}
 */
function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

/**
 * WebGL 渲染器类
 *
 * 封装所有 WebGL 相关操作
 */
export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.uniforms = null;
    this.positionBuffer = null;
    this.isInitialized = false;
  }

  /**
   * 初始化 WebGL 上下文和资源
   *
   * @returns {boolean} 是否初始化成功
   */
  initialize() {
    const gl = this.canvas.getContext('webgl', {
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      console.error('WebGL not supported');
      return false;
    }

    // 编译着色器
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      return false;
    }

    // 链接程序
    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      return false;
    }

    // 创建顶点缓冲区（全屏四边形）
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1,
      ]),
      gl.STATIC_DRAW
    );

    // 设置顶点属性
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // 获取 uniform 位置
    const uniforms = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      camera: gl.getUniformLocation(program, 'u_camera'),
      zoom: gl.getUniformLocation(program, 'u_zoom'),
      threshold: gl.getUniformLocation(program, 'u_threshold'),
      gridSize: gl.getUniformLocation(program, 'u_gridSize'),
      ballCount: gl.getUniformLocation(program, 'u_ballCount'),
      balls: gl.getUniformLocation(program, 'u_balls'),
      time: gl.getUniformLocation(program, 'u_time'),
    };

    // 激活程序并设置默认值
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, CANVAS.SIZE, CANVAS.SIZE);
    gl.uniform1f(uniforms.threshold, RENDERING.METABALL_THRESHOLD);
    gl.uniform1f(uniforms.gridSize, RENDERING.GRID_SIZE);

    // 保存引用
    this.gl = gl;
    this.program = program;
    this.uniforms = uniforms;
    this.positionBuffer = positionBuffer;
    this.isInitialized = true;

    return true;
  }

  /**
   * 渲染一帧
   *
   * @param {Object} renderState - 渲染状态
   * @param {number} renderState.cameraX - 摄像机 X 坐标
   * @param {number} renderState.cameraY - 摄像机 Y 坐标
   * @param {number} renderState.zoom - 缩放级别
   * @param {number} renderState.time - 游戏时间
   * @param {Float32Array} renderState.ballData - 球体数据
   * @param {number} renderState.ballCount - 球体数量
   */
  render(renderState) {
    if (!this.isInitialized) {
      console.warn('WebGLRenderer not initialized');
      return;
    }

    const { gl, uniforms } = this;
    const { cameraX, cameraY, zoom, time, ballData, ballCount } = renderState;

    // 更新 uniforms
    gl.uniform2f(uniforms.camera, cameraX, cameraY);
    gl.uniform1f(uniforms.zoom, zoom);
    gl.uniform1f(uniforms.time, time);
    gl.uniform1i(uniforms.ballCount, ballCount);
    gl.uniform4fv(uniforms.balls, ballData);

    // 绘制全屏四边形
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * 调整画布大小
   *
   * @param {number} width - 新宽度
   * @param {number} height - 新高度
   */
  resize(width, height) {
    if (!this.isInitialized) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.gl.uniform2f(this.uniforms.resolution, width, height);
  }

  /**
   * 设置 Metaball 阈值
   *
   * @param {number} threshold - 阈值
   */
  setThreshold(threshold) {
    if (!this.isInitialized) return;
    this.gl.uniform1f(this.uniforms.threshold, threshold);
  }

  /**
   * 设置网格大小
   *
   * @param {number} size - 网格大小
   */
  setGridSize(size) {
    if (!this.isInitialized) return;
    this.gl.uniform1f(this.uniforms.gridSize, size);
  }

  /**
   * 清理 WebGL 资源
   */
  dispose() {
    if (!this.isInitialized) return;

    const { gl, program, positionBuffer } = this;

    if (positionBuffer) {
      gl.deleteBuffer(positionBuffer);
    }

    if (program) {
      gl.deleteProgram(program);
    }

    this.gl = null;
    this.program = null;
    this.uniforms = null;
    this.positionBuffer = null;
    this.isInitialized = false;
  }

  /**
   * 检查 WebGL 支持
   *
   * @returns {boolean}
   */
  static isSupported() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  }
}

export default WebGLRenderer;
