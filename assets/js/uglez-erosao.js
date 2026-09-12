/* =============================================================
   uglez-erosao.js — campo de análise WebGL do UGLEZ
   -------------------------------------------------------------
   Uma esfera de dados formada por pontos, erosão e dois rastros.
   O movimento responde aos mesmos estados textuais da conversa.
   Se WebGL não estiver disponível, pages/uglez.js recorre à
   formação 2D já usada no restante do aplicativo.
   ============================================================= */
(function (global) {
  'use strict';

  const E = {};
  const MAX_DPR = 1.65;
  const DURACAO = 11.5;

  const ESTADOS = {
    repouso:     { morph: .34, erosao: .43, velocidade: .34, brilho: .92 },
    foco:        { morph: .40, erosao: .39, velocidade: .44, brilho: 1.08 },
    recebendo:   { morph: .48, erosao: .50, velocidade: .72, brilho: 1.18 },
    pensando:    { morph: .63, erosao: .36, velocidade: 1.00, brilho: 1.26 },
    respondendo: { morph: .44, erosao: .40, velocidade: .58, brilho: 1.16 },
    sucesso:     { morph: .36, erosao: .38, velocidade: .42, brilho: 1.34 },
    erro:        { morph: .58, erosao: .62, velocidade: .18, brilho: .62 }
  };

  const VERTICE = `
    precision highp float;
    attribute vec3 aDir;
    attribute vec2 aRand;

    uniform mat3 uRot;
    uniform float uTempo;
    uniform float uPonto;
    uniform float uMorph;
    uniform float uErosao;
    uniform float uBrilho;
    uniform float uPulso;
    uniform vec2 uEscala;
    uniform vec2 uPonteiro;
    uniform vec3 uFria;
    uniform vec3 uViva;
    uniform vec3 uQuente;

    varying vec3 vCor;
    varying float vAlfa;
    varying float vNucleo;

    vec3 mod289(vec3 x){ return x-floor(x*(1.0/289.0))*289.0; }
    vec4 mod289(vec4 x){ return x-floor(x*(1.0/289.0))*289.0; }
    vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159-0.85373472095314*r; }

    float snoise(vec3 v){
      const vec2 C=vec2(1.0/6.0,1.0/3.0);
      const vec4 D=vec4(0.0,0.5,1.0,2.0);
      vec3 i=floor(v+dot(v,C.yyy));
      vec3 x0=v-i+dot(i,C.xxx);
      vec3 g=step(x0.yzx,x0.xyz);
      vec3 l=1.0-g;
      vec3 i1=min(g.xyz,l.zxy);
      vec3 i2=max(g.xyz,l.zxy);
      vec3 x1=x0-i1+C.xxx;
      vec3 x2=x0-i2+C.yyy;
      vec3 x3=x0-D.yyy;
      i=mod289(i);
      vec4 p=permute(permute(permute(
        i.z+vec4(0.0,i1.z,i2.z,1.0))+
        i.y+vec4(0.0,i1.y,i2.y,1.0))+
        i.x+vec4(0.0,i1.x,i2.x,1.0));
      float n_=0.142857142857;
      vec3 ns=n_*D.wyz-D.xzx;
      vec4 j=p-49.0*floor(p*ns.z*ns.z);
      vec4 x_=floor(j*ns.z);
      vec4 y_=floor(j-7.0*x_);
      vec4 x=x_*ns.x+ns.yyyy;
      vec4 y=y_*ns.x+ns.yyyy;
      vec4 h=1.0-abs(x)-abs(y);
      vec4 b0=vec4(x.xy,y.xy);
      vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.0+1.0;
      vec4 s1=floor(b1)*2.0+1.0;
      vec4 sh=-step(h,vec4(0.0));
      vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
      vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x);
      vec3 p1=vec3(a0.zw,h.y);
      vec3 p2=vec3(a1.xy,h.z);
      vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
      vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
      m=m*m;
      return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }

    void main(){
      vec3 dir=normalize(aDir);
      vec2 giro=vec2(cos(uTempo*.34),sin(uTempo*.27));
      float n1=snoise(dir*1.42+vec3(giro*.56,uTempo*.05));
      float n2=snoise(dir*3.10+vec3(-giro.y*.42,giro.x*.36,uTempo*.08));
      float crista=1.0-abs(n2);
      float desloc=(n1*.43+(crista-.52)*.34)*uMorph;

      float campo=snoise(dir*2.36+vec3(uTempo*.06,-uTempo*.04,.37))*.5+.5;
      float vivo=smoothstep(uErosao-.085,uErosao+.075,campo);

      vec3 trilhaA=normalize(vec3(cos(uTempo*.72),sin(uTempo*.56),.34+sin(uTempo*.31)*.35));
      vec3 trilhaB=normalize(vec3(cos(-uTempo*.43+2.1),sin(uTempo*.62+1.4),.18+cos(uTempo*.47)*.48));
      float rastroA=exp(-dot(dir-trilhaA,dir-trilhaA)*42.0);
      float rastroB=exp(-dot(dir-trilhaB,dir-trilhaB)*55.0);

      /* Duas fissuras percorrem a esfera inteira. Elas são estreitas
         e parcialmente corroídas pelo ruído: parecem caminhos de
         dados, não anéis decorativos colados sobre a superfície. */
      float ang=atan(dir.z,dir.x);
      float ondaA=.22*sin(ang*2.0+uTempo*.44)+.07*cos(ang*5.0-uTempo*.31);
      float fitaA=exp(-pow(abs(dir.y-ondaA),2.0)*175.0);
      float arcoA=smoothstep(-.18,.68,cos(ang-uTempo*.25-1.1));
      float gateA=smoothstep(-.12,.56,snoise(dir*5.7+vec3(uTempo*.08,.31,-uTempo*.05)));

      float angB=atan(dir.y,dir.z);
      float ondaB=.18*sin(angB*2.7-uTempo*.36)-.05*cos(angB*4.0+uTempo*.24);
      float fitaB=exp(-pow(abs(dir.x-ondaB),2.0)*205.0);
      float arcoB=smoothstep(-.28,.74,cos(angB+uTempo*.22+2.2));
      float gateB=smoothstep(-.06,.62,snoise(dir*6.4+vec3(-.22,uTempo*.06,.48)));

      float rastroFita=max(fitaA*arcoA*gateA,fitaB*arcoB*gateB*.72);
      float rastro=max(max(rastroA,rastroB*.76),rastroFita*.88);
      vivo=max(vivo,rastro*.92);

      vec3 p=dir*(1.0+desloc);
      vec3 rp=uRot*p;
      float face=smoothstep(-.20,.11,rp.z);
      float perspectiva=1.0/(1.0-.13*rp.z);
      vec2 pos=rp.xy*perspectiva;
      pos+=uPonteiro*(.014+.024*max(0.0,rp.z));

      float borda=pow(1.0-abs(rp.z),3.0);
      float energia=clamp(rastro*1.5+uPulso*.62,0.0,1.4);
      float frente=smoothstep(-.08,.90,rp.z);
      float estilhaco=smoothstep(.972,1.0,aRand.x)*frente*(.45+energia);
      float tamanho=uPonto*perspectiva*(.58+aRand.y*.90)*
        (1.0+energia*1.72+borda*.18+frente*.28+estilhaco*2.35);

      vec3 cor=mix(uFria,uViva,clamp(aRand.x*.72+campo*.34,0.0,1.0));
      cor=mix(cor,uQuente,clamp(energia*.90+estilhaco*.44+(aRand.x > .985 ? .24 : 0.0),0.0,1.0));

      vCor=cor;
      vAlfa=vivo*face*(.40+aRand.y*.54)*mix(.72,1.18,frente)*uBrilho;
      vNucleo=mix(2.2,1.35,clamp(energia,0.0,1.0));
      gl_PointSize=vAlfa<.012?0.0:clamp(tamanho,0.0,38.0);
      gl_Position=vec4(pos*uEscala,0.0,1.0);
    }
  `;

  const FRAGMENTO = `
    precision mediump float;
    varying vec3 vCor;
    varying float vAlfa;
    varying float vNucleo;
    void main(){
      vec2 q=gl_PointCoord-.5;
      float d=length(q)*2.0;
      float centro=pow(max(0.0,1.0-d),vNucleo);
      float halo=pow(max(0.0,1.0-d),4.2)*.42;
      float a=clamp((centro+halo)*vAlfa,0.0,1.0);
      if(a<.004) discard;
      gl_FragColor=vec4(vCor*a,a);
    }
  `;

  function shader(gl, tipo, fonte) {
    const s = gl.createShader(tipo);
    if (!s) return null;
    gl.shaderSource(s, fonte);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('UGLEZ WebGL:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function programa(gl) {
    const vs = shader(gl, gl.VERTEX_SHADER, VERTICE);
    const fs = shader(gl, gl.FRAGMENT_SHADER, FRAGMENTO);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('UGLEZ WebGL:', gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  function sorte(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pontos(qtd) {
    const dirs = new Float32Array(qtd * 3);
    const rand = new Float32Array(qtd * 2);
    const r = sorte(21092026);
    const ouro = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < qtd; i++) {
      const y = 1 - ((i + .5) / qtd) * 2;
      const raio = Math.sqrt(Math.max(0, 1 - y * y));
      const a = ouro * i;
      dirs[i * 3] = Math.cos(a) * raio;
      dirs[i * 3 + 1] = y;
      dirs[i * 3 + 2] = Math.sin(a) * raio;
      rand[i * 2] = r(); rand[i * 2 + 1] = r();
    }
    return { dirs, rand };
  }

  function suavizar(atual, alvo, dt) {
    return atual + (alvo - atual) * (1 - Math.exp(-dt * 3.6));
  }

  function matriz(ax, ay, az) {
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const cz = Math.cos(az), sz = Math.sin(az);
    return new Float32Array([
      cz * cy, sz * cy, -sy,
      cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx,
      cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx
    ]);
  }

  E.montar = function (container) {
    if (!container) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'uglez-erosao-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    const gl = canvas.getContext('webgl', {
      alpha: true, antialias: false, depth: false, premultipliedAlpha: true
    });
    if (!gl) { canvas.remove(); return null; }
    const prog = programa(gl);
    if (!prog) { canvas.remove(); return null; }
    gl.useProgram(prog);

    const reduzido = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = global.matchMedia && matchMedia('(pointer: coarse)').matches;
    const qtd = reduzido ? 1150 : coarse ? 1550 : 2600;
    const malha = pontos(qtd);

    function atributo(nome, dados, tamanho) {
      const loc = gl.getAttribLocation(prog, nome);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, dados, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, tamanho, gl.FLOAT, false, 0, 0);
    }
    atributo('aDir', malha.dirs, 3);
    atributo('aRand', malha.rand, 2);

    const locais = {};
    function uni(nome) {
      if (!(nome in locais)) locais[nome] = gl.getUniformLocation(prog, nome);
      return locais[nome];
    }

    let largura = 1, altura = 1, raf = 0, ultimo = performance.now(), tempo = 1.2;
    let visivel = true, naTela = true, vivo = true, nomeEstado = 'repouso';
    let pulsoAte = 0;
    const ponteiro = { x: 0, y: 0, tx: 0, ty: 0 };
    const atual = Object.assign({}, ESTADOS.repouso);
    let alvo = Object.assign({}, atual);

    function medir() {
      const r = canvas.getBoundingClientRect();
      largura = Math.max(1, Math.round(r.width));
      altura = Math.max(1, Math.round(r.height));
      const dpr = Math.min(MAX_DPR, global.devicePixelRatio || 1);
      const w = Math.round(largura * dpr), h = Math.round(altura * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    }

    function desenhar(agora) {
      medir();
      const curto = Math.min(canvas.width, canvas.height);
      const aspX = canvas.width > canvas.height ? canvas.height / canvas.width : 1;
      const aspY = canvas.height > canvas.width ? canvas.width / canvas.height : 1;
      const t = tempo * Math.PI * 2 / DURACAO;
      const ax = .16 * Math.sin(t * .57) - ponteiro.y * .30;
      const ay = .24 * Math.sin(t * .41 + 1.7) + ponteiro.x * .48;
      const az = .07 * Math.cos(t * .36);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.uniformMatrix3fv(uni('uRot'), false, matriz(ax, ay, az));
      gl.uniform1f(uni('uTempo'), t);
      gl.uniform1f(uni('uPonto'), Math.max(2.2, curto / 430 * 4.7));
      gl.uniform1f(uni('uMorph'), atual.morph);
      gl.uniform1f(uni('uErosao'), atual.erosao);
      gl.uniform1f(uni('uBrilho'), atual.brilho);
      gl.uniform1f(uni('uPulso'), agora < pulsoAte ? Math.max(0, (pulsoAte - agora) / 900) : 0);
      gl.uniform2f(uni('uEscala'), .73 * aspX, .73 * aspY);
      gl.uniform2f(uni('uPonteiro'), ponteiro.x, -ponteiro.y);
      gl.uniform3f(uni('uFria'), .055, .12, .19);
      gl.uniform3f(uni('uViva'), .25, .42, .94);
      gl.uniform3f(uni('uQuente'), .85, .71, .37);
      gl.drawArrays(gl.POINTS, 0, qtd);
    }

    function tick(agora) {
      if (!vivo) return;
      const dt = Math.min(.05, Math.max(.001, (agora - ultimo) / 1000));
      ultimo = agora;
      atual.morph = suavizar(atual.morph, alvo.morph, dt);
      atual.erosao = suavizar(atual.erosao, alvo.erosao, dt);
      atual.velocidade = suavizar(atual.velocidade, alvo.velocidade, dt);
      atual.brilho = suavizar(atual.brilho, alvo.brilho, dt);
      ponteiro.x = suavizar(ponteiro.x, ponteiro.tx, dt);
      ponteiro.y = suavizar(ponteiro.y, ponteiro.ty, dt);
      if (!reduzido) tempo += dt * atual.velocidade;
      desenhar(agora);
      raf = requestAnimationFrame(tick);
    }

    function ligar() {
      if (raf || !vivo || !visivel || !naTela) return;
      ultimo = performance.now();
      if (reduzido) desenhar(ultimo);
      else raf = requestAnimationFrame(tick);
    }
    function desligar() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    function mover(ev) {
      const r = canvas.getBoundingClientRect();
      ponteiro.tx = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width - .5) * 2));
      ponteiro.ty = Math.max(-1, Math.min(1, ((ev.clientY - r.top) / r.height - .5) * 2));
    }
    function sair() { ponteiro.tx = 0; ponteiro.ty = 0; }
    canvas.addEventListener('pointermove', mover);
    canvas.addEventListener('pointerleave', sair);

    function aoVisibilidade() {
      visivel = !document.hidden;
      if (visivel) ligar(); else desligar();
    }
    document.addEventListener('visibilitychange', aoVisibilidade);

    const ro = global.ResizeObserver ? new ResizeObserver(() => {
      medir(); if (reduzido) desenhar(performance.now());
    }) : null;
    if (ro) ro.observe(container);

    const io = global.IntersectionObserver ? new IntersectionObserver((entradas) => {
      naTela = entradas.some((x) => x.isIntersecting);
      if (naTela) ligar(); else desligar();
    }, { threshold: .01 }) : null;
    if (io) io.observe(canvas);

    medir();
    desenhar(performance.now());
    ligar();

    const controle = {
      estado(nome) {
        nomeEstado = ESTADOS[nome] ? nome : 'repouso';
        alvo = Object.assign({}, ESTADOS[nomeEstado]);
        ligar();
        return controle;
      },
      atual() { return nomeEstado; },
      pulsar(nome, duracao) {
        controle.estado(nome || 'sucesso');
        pulsoAte = performance.now() + Math.max(500, (duracao || 1) * 1000);
        global.setTimeout(() => controle.estado('repouso'), Math.max(650, (duracao || 1) * 1000));
        return controle;
      },
      medir() { medir(); desenhar(performance.now()); return controle; },
      destruir() {
        vivo = false; desligar();
        document.removeEventListener('visibilitychange', aoVisibilidade);
        canvas.removeEventListener('pointermove', mover);
        canvas.removeEventListener('pointerleave', sair);
        if (ro) ro.disconnect(); if (io) io.disconnect();
      }
    };
    return controle;
  };

  global.UglezErosao = E;
})(window);
