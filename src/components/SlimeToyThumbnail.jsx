import { useRef, useEffect } from 'react';

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_resolution;

  float sdEllipse(vec2 p, vec2 ab) {
    p = abs(p);
    if (p.x > p.y) { p = p.yx; ab = ab.yx; }
    float l = ab.y * ab.y - ab.x * ab.x;
    float m = ab.x * p.x / l;
    float m2 = m * m;
    float n = ab.y * p.y / l;
    float n2 = n * n;
    float c = (m2 + n2 - 1.0) / 3.0;
    float c3 = c * c * c;
    float q = c3 + m2 * n2 * 2.0;
    float d = c3 + m2 * n2;
    float g = m + m * n2;
    float co;
    if (d < 0.0) {
      float h = acos(q / c3) / 3.0;
      float s = cos(h);
      float t = sin(h) * sqrt(3.0);
      float rx = sqrt(-c * (s + t + 2.0) + m2);
      float ry = sqrt(-c * (s - t + 2.0) + m2);
      co = (ry + sign(l) * rx + abs(g) / (rx * ry) - m) / 2.0;
    } else {
      float h = 2.0 * m * n * sqrt(d);
      float s = sign(q + h) * pow(abs(q + h), 1.0 / 3.0);
      float u = sign(q - h) * pow(abs(q - h), 1.0 / 3.0);
      float rx = -s - u - c * 4.0 + 2.0 * m2;
      float ry = (s - u) * sqrt(3.0);
      float rm = sqrt(rx * rx + ry * ry);
      co = (ry / sqrt(rm - rx) + 2.0 * g / rm - m) / 2.0;
    }
    vec2 r = ab * vec2(co, sqrt(1.0 - co * co));
    return length(r - p) * sign(p.y - r.y);
  }

  void main() {
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;
    uv.x *= aspect;

    float t = u_time * 0.8;
    
    float squish = 0.15 * sin(t * 2.0);
    float wobbleX = 0.08 * sin(t * 3.0 + uv.y * 2.0);
    float wobbleY = 0.05 * cos(t * 2.5 + uv.x * 2.0);
    
    vec2 slimeCenter = vec2(0.0, -0.1 + 0.1 * sin(t * 1.5));
    vec2 slimeSize = vec2(0.5 + squish, 0.35 - squish * 0.5);
    
    vec2 p = uv - slimeCenter;
    p.x += wobbleX;
    p.y += wobbleY;
    
    float d = sdEllipse(p, slimeSize);
    
    vec3 bgColor = vec3(0.05, 0.05, 0.07);
    vec3 slimeColor = vec3(0.5, 0.9, 0.6);
    vec3 highlightColor = vec3(0.8, 1.0, 0.85);
    vec3 shadowColor = vec3(0.2, 0.5, 0.3);
    
    float edge = smoothstep(0.02, -0.02, d);
    
    float highlight = smoothstep(0.0, -0.2, d + 0.15 - uv.y * 0.3 - uv.x * 0.2);
    float shadow = smoothstep(-0.1, 0.1, uv.y + 0.2);
    
    vec3 slime = mix(slimeColor, highlightColor, highlight * 0.6);
    slime = mix(slime, shadowColor, shadow * 0.3);
    
    float fresnel = pow(1.0 - abs(d + 0.1), 3.0) * 0.5;
    slime += fresnel * vec3(0.3, 0.5, 0.4);
    
    float specular = smoothstep(0.08, 0.0, length(p - vec2(-0.15, 0.1)));
    slime += specular * 0.8;
    
    vec3 color = mix(bgColor, slime, edge);
    
    float trayY = -0.65;
    float trayEdge = smoothstep(0.02, -0.02, abs(uv.y - trayY) - 0.03);
    float inTray = step(abs(uv.x), 0.9 * aspect) * step(trayY - 0.1, uv.y) * step(uv.y, trayY + 0.1);
    color = mix(color, vec3(0.15, 0.15, 0.18), trayEdge * 0.8);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

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

export default function SlimeToyThumbnail({ className = '' }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const animationRef = useRef(null);
  const locationsRef = useRef(null);
  const sizeRef = useRef({ width: 300, height: 225 });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const gl = canvas.getContext('webgl', {
      antialias: false,
      preserveDrawingBuffer: true
    });

    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    glRef.current = gl;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return;

    programRef.current = program;

    const locations = {
      position: gl.getAttribLocation(program, 'a_position'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      time: gl.getUniformLocation(program, 'u_time'),
    };
    locationsRef.current = locations;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);

    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const rect = container.getBoundingClientRect();
      const width = Math.floor(rect.width * dpr);
      const height = Math.floor(rect.height * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        sizeRef.current = { width, height };
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    updateSize();

    let startTime = performance.now();

    const render = () => {
      const time = (performance.now() - startTime) / 1000;
      const { width, height } = sizeRef.current;

      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      gl.uniform2f(locations.resolution, width, height);
      gl.uniform1f(locations.time, time);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (gl && program) {
        gl.deleteProgram(program);
      }
      if (gl && vertexShader) {
        gl.deleteShader(vertexShader);
      }
      if (gl && fragmentShader) {
        gl.deleteShader(fragmentShader);
      }
      if (gl && positionBuffer) {
        gl.deleteBuffer(positionBuffer);
      }
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    };
  }, []);

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
