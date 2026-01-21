/**
 * Fragment Shader - 片段着色器
 *
 * 设计哲学：程序化艺术 (Procedural Art)
 *
 * 核心算法：
 * 1. Metaball 场计算 - 基于距离平方反比的隐式曲面
 * 2. HSL 色彩空间 - 直观的颜色混合
 * 3. 黑洞特效 - 吸积盘螺旋和引力透镜暗示
 *
 * 性能考虑：
 * - 最大支持 64 个球体
 * - 使用早期退出优化循环
 * - 距离平方避免 sqrt（除非必要）
 */

export const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;

  uniform vec2 u_resolution;
  uniform vec2 u_camera;
  uniform float u_zoom;
  uniform float u_threshold;
  uniform float u_gridSize;
  uniform int u_ballCount;
  uniform vec4 u_balls[64];  // x, y, r, hue
  uniform float u_time;

  /**
   * HSL 到 RGB 色彩空间转换
   *
   * 参数：
   * - h: 色调 (0-360)
   * - s: 饱和度 (0-100)
   * - l: 亮度 (0-100)
   */
  vec3 hsl2rgb(float h, float s, float l) {
    h = mod(h, 360.0) / 360.0;
    s /= 100.0;
    l /= 100.0;

    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c / 2.0;

    vec3 rgb;
    float hue6 = h * 6.0;
    if (hue6 < 1.0) rgb = vec3(c, x, 0.0);
    else if (hue6 < 2.0) rgb = vec3(x, c, 0.0);
    else if (hue6 < 3.0) rgb = vec3(0.0, c, x);
    else if (hue6 < 4.0) rgb = vec3(0.0, x, c);
    else if (hue6 < 5.0) rgb = vec3(x, 0.0, c);
    else rgb = vec3(c, 0.0, x);

    return rgb + m;
  }

  void main() {
    // ============================================================
    // 坐标变换：屏幕空间 -> 世界空间
    // ============================================================
    // Y 轴翻转以匹配屏幕坐标系（0 在顶部）
    vec2 screenPos = vec2(v_uv.x, 1.0 - v_uv.y) * u_resolution;
    vec2 worldPos = (screenPos - u_resolution * 0.5) / u_zoom + u_camera;

    // ============================================================
    // 背景网格渲染
    // ============================================================
    float gridX = mod(worldPos.x, u_gridSize);
    float gridY = mod(worldPos.y, u_gridSize);
    float gridLineWidth = 1.5 / u_zoom;
    float gridIntensity = 0.0;
    if (gridX < gridLineWidth || gridX > u_gridSize - gridLineWidth ||
        gridY < gridLineWidth || gridY > u_gridSize - gridLineWidth) {
      gridIntensity = 0.15;
    }

    // ============================================================
    // Metaball 场计算
    //
    // 原理：每个球体贡献一个基于距离的场值
    // 公式：field = r² / d²
    // 当累积场值超过阈值时，渲染为球体表面
    // ============================================================
    float totalField = 0.0;
    float weightedHue = 0.0;
    float totalWeight = 0.0;
    float blackHoleField = 0.0;

    for (int i = 0; i < 64; i++) {
      if (i >= u_ballCount) break;

      vec2 ballPos = u_balls[i].xy;
      float r = u_balls[i].z;
      float hue = u_balls[i].w;

      float dx = worldPos.x - ballPos.x;
      float dy = worldPos.y - ballPos.y;
      float distSq = dx * dx + dy * dy + 1.0;  // +1 防止除零
      float dist = sqrt(distSq);

      // ============================================================
      // 黑洞特殊渲染
      //
      // 视觉元素：
      // 1. 事件视界 - 纯黑核心
      // 2. 吸积盘 - 发光的螺旋结构
      // 3. 引力透镜 - 边缘光晕暗示
      // ============================================================
      if (hue > 265.0 && hue < 275.0) {
        float bhRadius = r * 2.0;
        if (dist < bhRadius) {
          float eventHorizon = r * 0.8;
          if (dist < eventHorizon) {
            // 事件视界内 - 纯黑
            blackHoleField = 1.0;
          } else {
            // 吸积盘效果 - 动态螺旋
            float diskFactor = (dist - eventHorizon) / (bhRadius - eventHorizon);
            float angle = atan(dy, dx) + u_time * 2.0 - dist * 0.1;
            float spiral = sin(angle * 3.0 + dist * 0.3) * 0.5 + 0.5;
            blackHoleField = max(blackHoleField, (1.0 - diskFactor) * 0.9 * (0.5 + spiral * 0.5));
          }
        }
        // 引力透镜暗示
        float pullRange = r * 6.0;
        if (dist < pullRange && dist > bhRadius) {
          float lensing = (1.0 - (dist - bhRadius) / (pullRange - bhRadius)) * 0.3;
          blackHoleField = max(blackHoleField, lensing * 0.2);
        }
      } else {
        // ============================================================
        // 普通 Metaball
        // ============================================================
        float field = (r * r) / distSq;
        totalField += field;

        // 权重混合颜色（场强越大，贡献越大）
        if (field > 0.05) {
          weightedHue += hue * field;
          totalWeight += field;
        }
      }
    }

    // ============================================================
    // 最终颜色计算
    // ============================================================
    vec3 color;

    if (blackHoleField > 0.5) {
      // 黑洞核心 - 紫色边缘光晕过渡到纯黑
      float edgeGlow = (blackHoleField - 0.5) * 2.0;
      color = mix(vec3(0.05, 0.0, 0.1), vec3(0.0, 0.0, 0.0), edgeGlow);
    } else if (blackHoleField > 0.1) {
      // 吸积盘区域 - 紫粉色漩涡
      vec3 diskColor = hsl2rgb(280.0 + blackHoleField * 40.0, 80.0, 30.0 + blackHoleField * 20.0);
      if (totalField > u_threshold) {
        // 与其他 Metaball 混合
        float hue = totalWeight > 0.0 ? weightedHue / totalWeight : 200.0;
        float intensity = min((totalField - u_threshold) / u_threshold, 1.0);
        vec3 ballColor = hsl2rgb(hue, 65.0 + intensity * 25.0, 35.0 + intensity * 30.0);
        color = mix(ballColor, diskColor, blackHoleField);
      } else {
        color = diskColor * blackHoleField * 2.0;
      }
    } else if (totalField > u_threshold) {
      // 标准 Metaball 表面
      float hue = totalWeight > 0.0 ? weightedHue / totalWeight : 200.0;
      float intensity = min((totalField - u_threshold) / u_threshold, 1.0);
      color = hsl2rgb(hue, 65.0 + intensity * 25.0, 35.0 + intensity * 30.0);
    } else if (totalField > u_threshold * 0.6) {
      // Metaball 边缘光晕
      float edgeIntensity = (totalField - u_threshold * 0.6) / (u_threshold * 0.4);
      float hue = totalWeight > 0.0 ? weightedHue / totalWeight : 200.0;
      vec3 edgeColor = hsl2rgb(hue, 50.0, 25.0);
      color = edgeColor * edgeIntensity * 0.7;
    } else {
      // 背景 - 轻微渐变 + 网格
      float bgShade = (10.0 + (1.0 - v_uv.y) * 6.0) / 255.0;
      color = vec3(bgShade, bgShade, bgShade + 2.0/255.0);
      color += vec3(gridIntensity * 0.3, gridIntensity * 0.3, gridIntensity * 0.5);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

export default FRAGMENT_SHADER;
