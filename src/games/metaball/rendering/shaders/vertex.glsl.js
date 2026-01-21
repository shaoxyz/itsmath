/**
 * Vertex Shader - 顶点着色器
 *
 * 设计哲学：极简主义 (Minimalism)
 *
 * 职责单一：将 NDC 坐标转换为 UV 坐标
 * 所有复杂计算都在片段着色器中完成，保持顶点处理的高效
 */

export const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    // 将 NDC (-1, 1) 转换为 UV (0, 1)
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

export default VERTEX_SHADER;
