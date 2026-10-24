/** OAZE Liquid Ether — WebGL interativo, sem dependências. */
(function () {
  'use strict';

  var host = document.getElementById('v3-liquid-ether');
  if (!host) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) {
    host.classList.add('is-static');
    return;
  }

  var canvas = document.createElement('canvas');
  var gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power'
  });
  if (!gl) {
    host.classList.add('is-static');
    return;
  }
  host.appendChild(canvas);

  var vertexSource = 'attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.0,1.0);}';
  var fragmentSource = [
    'precision highp float;',
    'uniform vec2 u_resolution;',
    'uniform vec2 u_pointer;',
    'uniform vec2 u_velocity;',
    'uniform float u_time;',
    'uniform float u_interaction;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.0,a=.5;mat2 r=mat2(.80,.60,-.60,.80);for(int i=0;i<5;i++){v+=a*noise(p);p=r*p*2.03+3.1;a*=.5;}return v;}',
    'vec3 aura(vec2 uv,vec2 center,vec3 color,float phase,float polarity){vec2 p=uv-center;float d=length(p*vec2(.78,1.18));float angle=atan(p.y,p.x);float n=fbm(p*2.15+vec2(phase*.13,-phase*.09));float edge=.40+.12*sin(angle*3.0+phase*1.15)+.16*(n-.5);float body=smoothstep(edge+.33,edge-.18,d);float vein=.5+.5*sin((d*10.0-angle*2.0)*polarity-phase*1.4+n*4.0);body*=.80+.20*vein;return color*body;}',
    'void main(){',
    'vec2 frag=gl_FragCoord.xy/u_resolution;vec2 uv=frag-.5;uv.x*=u_resolution.x/u_resolution.y;',
    'vec2 pointer=u_pointer-.5;pointer.x*=u_resolution.x/u_resolution.y;',
    'float t=u_time*.22;float swap=.5+.5*sin(t*.72);float spread=min(.74,(u_resolution.x/u_resolution.y)*.38);',
    'vec2 left=vec2(mix(-spread,spread,swap),.10*sin(t*.9));vec2 right=vec2(mix(spread,-spread,swap),-.10*sin(t*.9));',
    'float pd=length(uv-pointer);vec2 bend=normalize(u_velocity+vec2(.0001))*.12*exp(-pd*4.5)*u_interaction;uv+=bend*sin(pd*18.0-t*4.0);',
    'vec3 blue=vec3(.208,.333,.396),teal=vec3(.373,.663,.608),orange=vec3(.914,.529,.369),col=vec3(0.0);',
    'col+=aura(uv,left,mix(blue,teal,.54),t,1.0);col+=aura(uv,right,orange,t+2.7,-1.0);',
    'float touch=exp(-pd*5.5)*u_interaction;col+=mix(teal,orange,.5+.5*sin(t*1.6))*touch*(.28+.18*sin(pd*28.0-t*6.0));',
    'col*=.94+.06*noise(gl_FragCoord.xy*.22+u_time);float vignette=smoothstep(1.18,.12,length(uv*vec2(.72,1.0)));col*=vignette;',
    'gl_FragColor=vec4(pow(max(col,0.0),vec3(.92)),1.0);}'
  ].join('\n');

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[OAZE] Liquid Ether indisponível:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  var vertex = compile(gl.VERTEX_SHADER, vertexSource);
  var fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    canvas.remove(); host.classList.add('is-static'); return;
  }

  var program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    canvas.remove(); host.classList.add('is-static'); return;
  }
  gl.useProgram(program);

  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  var position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  var uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    pointer: gl.getUniformLocation(program, 'u_pointer'),
    velocity: gl.getUniformLocation(program, 'u_velocity'),
    time: gl.getUniformLocation(program, 'u_time'),
    interaction: gl.getUniformLocation(program, 'u_interaction')
  };
  var pointer = { x: .25, y: .55, tx: .25, ty: .55 };
  var started = performance.now();
  var frame = 0;
  var lastFrame = 0;
  var running = false;
  var contextLost = false;

  function resize() {
    var mobile = innerWidth < 720;
    var scale = mobile ? .48 : .68;
    var maxWidth = mobile ? 720 : 1280;
    var maxHeight = mobile ? 1080 : 800;
    var ratio = Math.min(1, maxWidth / Math.max(1, innerWidth * devicePixelRatio * scale), maxHeight / Math.max(1, innerHeight * devicePixelRatio * scale));
    var width = Math.max(1, Math.round(innerWidth * devicePixelRatio * scale * ratio));
    var height = Math.max(1, Math.round(innerHeight * devicePixelRatio * scale * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height);
    }
  }

  addEventListener('resize', resize, { passive: true });
  function shouldRun() {
    return !contextLost && !document.hidden && !reduceMotion.matches;
  }

  function syncPlayback() {
    if (!shouldRun()) {
      running = false;
      cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    if (!running) {
      running = true;
      lastFrame = 0;
      frame = requestAnimationFrame(render);
    }
  }

  document.addEventListener('visibilitychange', syncPlayback);
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', syncPlayback);
  else reduceMotion.addListener(syncPlayback);
  canvas.addEventListener('webglcontextlost', function (event) {
    event.preventDefault();
    contextLost = true;
    running = false;
    cancelAnimationFrame(frame);
    canvas.remove();
    host.classList.add('is-static');
  });

  function render(now) {
    if (!running) return;
    frame = requestAnimationFrame(render);
    if (now - lastFrame < 32) return;
    lastFrame = now;
    var elapsed = (now - started) / 1000;
    pointer.tx = .5 + .34 * Math.sin(elapsed * .19);
    pointer.ty = .5 + .23 * Math.sin(elapsed * .27 + 1.4);
    pointer.x += (pointer.tx - pointer.x) * .075;
    pointer.y += (pointer.ty - pointer.y) * .075;
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
    gl.uniform2f(uniforms.velocity, 0, 0);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.interaction, .28);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  resize();
  syncPlayback();
  addEventListener('pagehide', function () {
    running = false;
    cancelAnimationFrame(frame);
  }, { once: true });
}());
