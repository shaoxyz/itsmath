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

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec3 u_balls[3];

  void main() {
    vec2 pos = v_uv * u_resolution;
    float minDim = min(u_resolution.x, u_resolution.y);
    vec2 center = u_resolution * 0.5;

    float sum = 0.0;
    for (int i = 0; i < 3; i++) {
      vec2 ballPos = u_balls[i].xy;
      float r = u_balls[i].z;
      float dx = pos.x - ballPos.x;
      float dy = pos.y - ballPos.y;
      sum += (r * r) / (dx * dx + dy * dy + 1.0);
    }

    float v = min(sum * 100.0, 255.0) / 255.0;

    vec3 color;
    if (sum > 1.0) {
      color = vec3(
        (50.0 + v * 255.0 * 0.3) / 255.0,
        (150.0 + v * 255.0 * 0.4) / 255.0,
        1.0
      );
    } else {
      color = vec3(
        v * 0.2,
        v * 0.3,
        v * 0.5
      );
    }

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

export default function MetaballThumbnail({ className = '' }) {
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

    // Initialize WebGL
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
      balls: gl.getUniformLocation(program, 'u_balls'),
    };
    locationsRef.current = locations;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);

    // Handle resize
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

    // Animation
    let startTime = performance.now();

    const render = () => {
      const time = (performance.now() - startTime) / 1000;
      const { width, height } = sizeRef.current;
      const scale = Math.min(width, height) / 200;

      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      gl.uniform2f(locations.resolution, width, height);
      gl.uniform1f(locations.time, time);

      const cx = width / 2;
      const cy = height / 2;
      const balls = [
        cx + Math.sin(time) * 50 * scale, cy + Math.cos(time * 0.8) * 40 * scale, 30 * scale,
        cx + Math.cos(time * 1.2) * 45 * scale, cy + Math.sin(time * 0.9) * 45 * scale, 25 * scale,
        cx + Math.sin(time * 0.7) * 55 * scale, cy + Math.cos(time * 1.1) * 35 * scale, 35 * scale,
      ];
      gl.uniform3fv(locations.balls, balls);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
