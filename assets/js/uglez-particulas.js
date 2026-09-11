/* =============================================================
   uglez-particulas.js — a presença visual do UGLEZ
   -------------------------------------------------------------
   O UGLEZ NÃO TEM MASCOTE. Não tem rosto, olhos, boca, robô,
   personagem nem logotipo próprio. O único ícone figurativo da
   marca é o coqueiro sobre a água, e ele é do OAZE — não do
   assistente. O que representa o UGLEZ é isto: poeira luminosa
   organizada num círculo imperfeito, que se comporta conforme o
   que está acontecendo.

   A leitura pretendida é "uma inteligência digital analisando
   dados em silêncio". Por isso a formação NÃO deve parecer portal,
   galáxia, fumaça, fogo, magia, spinner nem animação infantil — e
   várias decisões abaixo existem só para evitar cada uma dessas
   leituras:

     · o círculo nunca fecha       (fechado = portal / anel)
     · não há braço espiral        (espiral = galáxia)
     · nada sobe nem se dissipa    (subida = fumaça)
     · a paleta é fria, com pouco
       dourado                     (quente + subida = fogo)
     · não há rastro nem faísca    (rastro = magia)
     · nada gira em bloco a taxa
       constante                   (bloco constante = spinner)
     · as escalas são pequenas e
       as durações longas          (salto grande = infantil)

   POR QUE CANVAS 2D, E NÃO SVG NEM WebGL
   São 35 a 110 elementos redesenhados 60 vezes por segundo. Em SVG
   isso é o mesmo número de nós no DOM sofrendo reflow a cada
   quadro, e o custo aparece justamente nas páginas que também
   desenham gráfico. WebGL resolveria, mas traz contexto perdido,
   fallback e um shader para manter — preço alto por uma diferença
   invisível nesta escala.

   POR QUE NÃO É GIF, VÍDEO NEM SEQUÊNCIA DE PNG
   Além do peso: um arquivo não tem estado. Metade do valor desta
   peça é o UGLEZ mudar de comportamento entre "pensando" e
   "respondendo", e um vídeo só saberia tocar do começo.

   A REGRA DE DESEMPENHO QUE MAIS IMPORTA
   As partículas são criadas UMA VEZ, na construção, e nunca
   recriadas por render. Recriar por quadro (ou por re-render de
   página) é o defeito clássico deste tipo de componente: a
   animação continua parecendo certa e o navegador vai coletando
   lixo até engasgar a rolagem.
   ============================================================= */
(function (global) {
  'use strict';

  const P = {};

  /* ============================================================
     1 · PALETA
     ------------------------------------------------------------
     Azul-royal como cor principal, branco azulado nos pontos mais
     luminosos, dourado suave em POUCAS partículas — o dourado é o
     laço com o medalhão da marca, e em quantidade maior viraria
     fogo.
     ============================================================ */

  const PALETA = {
    dark: {
      royal: [70, 105, 240],
      brilho: [214, 228, 255],
      ouro: [216, 180, 94]
    },
    /* No tema claro as mesmas cores precisam de mais saturação e
       menos luminosidade: partícula clara sobre fundo claro some, e
       a composição aditiva (que é o que dá o brilho no escuro)
       empilha para o branco. */
    light: {
      royal: [40, 66, 190],
      brilho: [96, 132, 226],
      ouro: [166, 128, 40]
    }
  };

  /* Proporção de cada tipo. O dourado é minoria por decisão: em
     torno de 7% ele lê como acento; em 20% lê como fogueira. */
  const MISTURA = [
    { cor: 'royal', ate: 0.72 },
    { cor: 'brilho', ate: 0.93 },
    { cor: 'ouro', ate: 1.00 }
  ];

  /* ============================================================
     1b · SPRITES
     ------------------------------------------------------------
     Cada partícula é UMA IMAGEM pré-desenhada, não um arco pintado
     na hora. Duas razões, e as duas apareceram na tela:

     APARÊNCIA. O halo tentado como um segundo arco de alfa baixo
     não vira brilho: vira um disco chapado com borda dura, e o
     resultado lê como bolha de sabão. Brilho precisa de gradiente,
     e gradiente é o que este sprite tem.

     CUSTO. createRadialGradient por partícula por quadro é ~110
     gradientes 60 vezes por segundo. Desenhado uma vez por cor e
     reaproveitado com drawImage, o custo por quadro vira cópia de
     bitmap — a operação que a GPU faz de olhos fechados.

     O cache é por TEMA porque as cores mudam com ele; trocar de
     tema joga fora os sprites e redesenha três imagens pequenas.
     ============================================================ */

  const LADO_SPRITE = 64;      // resolução do sprite; escalado no uso
  let spriteTema = null;
  let sprites = null;

  function fazerSprite(rgb) {
    const c = document.createElement('canvas');
    c.width = c.height = LADO_SPRITE;
    const g = c.getContext('2d');
    const m = LADO_SPRITE / 2;
    const grad = g.createRadialGradient(m, m, 0, m, m, m);
    const cor = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    /* O núcleo ocupa pouco e a queda é longa: é essa proporção que
       faz o ponto parecer luz em vez de adesivo redondo. */
    grad.addColorStop(0.00, 'rgba(' + cor + ',1)');
    grad.addColorStop(0.16, 'rgba(' + cor + ',0.92)');
    grad.addColorStop(0.38, 'rgba(' + cor + ',0.30)');
    grad.addColorStop(0.70, 'rgba(' + cor + ',0.07)');
    grad.addColorStop(1.00, 'rgba(' + cor + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, LADO_SPRITE, LADO_SPRITE);
    return c;
  }

  function spritesDo(tema) {
    if (sprites && spriteTema === tema) return sprites;
    const cores = PALETA[tema];
    sprites = {
      royal: fazerSprite(cores.royal),
      brilho: fazerSprite(cores.brilho),
      ouro: fazerSprite(cores.ouro)
    };
    spriteTema = tema;
    return sprites;
  }

  /* ============================================================
     2 · ESTADOS
     ------------------------------------------------------------
     Cada estado é um conjunto de ALVOS. Nada salta: o quadro atual
     caminha até o alvo com suavização exponencial, e é isso que
     produz a sensação de matéria em vez de troca de sprite.

       escala      tamanho geral da formação
       contracao   0 = formação aberta · 1 = puxada para o centro
       giro        multiplicador da velocidade orbital
       brilho      multiplicador de opacidade
       agitacao    quanto a trajetória individual desobedece
     ============================================================ */

  const ESTADOS = {
    /* Repouso: órbita lenta, círculo irregular, flutuação vertical
       suave, brilho discreto. É o estado em que a peça passa 99% do
       tempo, e por isso é o mais contido. */
    repouso:     { escala: 1.00, contracao: 0.00, giro: 1.00, brilho: 1.00, agitacao: 1.00 },

    /* Hover/foco: no MÁXIMO 8%. O brief é explícito, e o motivo é
       que este elemento fica ao lado de menus e gráficos — um
       crescimento maior empurraria a atenção para longe do que a
       pessoa estava lendo. */
    foco:        { escala: 1.08, contracao: 0.16, giro: 1.15, brilho: 1.22, agitacao: 0.90 },

    /* Recebendo a pergunta: as partículas se aproximam do centro,
       como quem junta o material antes de trabalhar. */
    recebendo:   { escala: 0.96, contracao: 0.46, giro: 1.30, brilho: 1.30, agitacao: 0.70 },

    /* Pensando: mais rápido, algumas partículas ATRAVESSAM o
       centro, e a formação contrai e expande devagar. Sem spinner:
       a variação é de densidade, não de rotação de um objeto. */
    pensando:    { escala: 1.02, contracao: 0.22, giro: 1.85, brilho: 1.18, agitacao: 1.85 },

    /* Respondendo: ondas suaves saem do centro para a borda. O
       movimento desacelera à medida que conclui. */
    respondendo: { escala: 1.04, contracao: 0.05, giro: 1.20, brilho: 1.25, agitacao: 1.10 },

    /* Sucesso: um pulso curto, azul e dourado, e volta ao repouso
       sozinho. Estado transitório — ver P.pulsar(). */
    sucesso:     { escala: 1.06, contracao: 0.00, giro: 1.10, brilho: 1.55, agitacao: 0.80 },

    /* Erro: dispersa LEVEMENTE e escurece. Não sacode, não pisca
       vermelho: o texto ao lado é que explica o erro, e uma
       animação alarmada em cima de uma mensagem já ruim é castigo
       duplo. */
    erro:        { escala: 1.05, contracao: -0.30, giro: 0.55, brilho: 0.62, agitacao: 0.60 }
  };

  /* ============================================================
     3 · DENSIDADE
     ------------------------------------------------------------
     Desktop 70–110, celular 35–60, como pedido. A escolha dentro
     da faixa considera a memória do aparelho quando ele informa:
     um celular de 2GB desenhando 60 partículas atrás de um gráfico
     é onde a rolagem começa a travar.
     ============================================================ */

  function densidade(largura) {
    const celular = largura < 768 ||
      (global.matchMedia && matchMedia('(pointer: coarse)').matches);
    const memoria = navigator.deviceMemory || 4;
    if (celular) return memoria <= 2 ? 35 : memoria <= 4 ? 46 : 58;
    return memoria <= 4 ? 74 : memoria <= 8 ? 92 : 108;
  }

  function reduzMovimento() {
    return !!(global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ============================================================
     4 · A FORMAÇÃO
     ============================================================ */

  /**
   * Cria uma formação dentro de um <canvas>.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {object} opcoes
   *   qtd        força a quantidade (senão, densidade automática)
   *   estado     estado inicial
   * @returns {object} controle com estado(), pulsar(), destruir()
   */
  P.criar = function (canvas, opcoes) {
    const op = opcoes || {};
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return P.inerte();

    let largura = 0, altura = 0, dpr = 1;
    let particulas = [];
    let quadro = null;
    let vivo = true;
    let visivel = true;
    let naTela = true;

    const reduzido = reduzMovimento();

    /* O estado atual caminha até o alvo; nunca pula para ele. */
    let alvo = Object.assign({}, ESTADOS[op.estado || 'repouso']);
    const agora = Object.assign({}, alvo);
    let nomeEstado = op.estado || 'repouso';

    /* Ondas de "respondendo": cada uma é uma frente que viaja do
       centro para a borda e some. Guardadas num array pequeno e
       reaproveitado — alocar por quadro é o que enche o coletor. */
    const ondas = [];
    let tempo = 0;
    let respiro = 0;
    let ultimo = 0;
    let voltarAoRepouso = 0;

    /* ---------------- construção ---------------- */

    function sortearCor() {
      const r = Math.random();
      for (let i = 0; i < MISTURA.length; i++) if (r <= MISTURA[i].ate) return MISTURA[i].cor;
      return 'royal';
    }

    function construir(qtd) {
      particulas = new Array(qtd);
      for (let i = 0; i < qtd; i++) {
        /* raio^1.25 concentra o centro sem esvaziar a borda. Uma
           distribuição uniforme daria um disco chapado; uma
           gaussiana daria um ponto com halo. */
        const base = Math.pow(Math.random(), 1.25);
        particulas[i] = {
          raioBase: 0.14 + base * 0.80,
          angulo: Math.random() * Math.PI * 2,
          /* Velocidade angular própria. Se todas fossem iguais, a
             formação giraria como um disco rígido — que é
             exatamente a leitura "spinner" que não queremos. */
          giro: (0.05 + Math.random() * 0.13) * (Math.random() < 0.12 ? -0.6 : 1),
          /* Duas ondas de deformação radial em frequências
             irracionais entre si: o contorno nunca repete, então o
             círculo nunca "fecha" visualmente. */
          f1: 0.18 + Math.random() * 0.26,
          f2: 0.41 + Math.random() * 0.53,
          p1: Math.random() * Math.PI * 2,
          p2: Math.random() * Math.PI * 2,
          /* Profundidade: partícula "ao fundo" é menor e mais
             apagada. É o que impede a formação de parecer um
             adesivo recortado. */
          z: 0.35 + Math.random() * 0.65,
          tamanho: 0.5 + Math.random() * 1.15,
          flutua: Math.random() * Math.PI * 2,
          cor: sortearCor(),
          /* Algumas atravessam o centro quando o UGLEZ pensa. Só
             algumas: se todas atravessassem, a formação implodiria
             e voltaria — leitura de batimento, não de análise. */
          cruza: Math.random() < 0.28 ? (0.5 + Math.random() * 0.5) : 0
        };
      }
    }

    /* ---------------- medida ---------------- */

    function medir() {
      const r = canvas.getBoundingClientRect();
      const l = Math.max(1, Math.round(r.width));
      const a = Math.max(1, Math.round(r.height));
      /* Teto de 2 no DPR: acima disso o custo por quadro dobra e
         ninguém enxerga a diferença numa partícula de 2px. */
      const d = Math.min(2, global.devicePixelRatio || 1);
      if (l === largura && a === altura && d === dpr) return;
      largura = l; altura = a; dpr = d;
      canvas.width = Math.round(l * d);
      canvas.height = Math.round(a * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);

      const querido = op.qtd || densidade(global.innerWidth || l);
      /* Reconstrói SÓ quando a quantidade muda de fato — girar o
         celular não deve reembaralhar a formação inteira. */
      if (particulas.length !== querido) construir(querido);

      /* UM QUADRO IMEDIATO QUANDO O LAÇO ESTÁ PARADO.
         Escrever em canvas.width limpa o canvas — é assim que a
         API funciona. Se a animação estiver pausada (aba em
         segundo plano, formação fora da tela, ou o painel que
         acabou de ser revelado), ninguém repinta, e o que fica na
         tela é um retângulo vazio: a formação some e só volta
         quando o laço religa. Pintar aqui fecha essa janela. */
      if (!quadro && vivo) desenhar();
    }

    /* ---------------- desenho ---------------- */

    function claro() {
      return document.documentElement.getAttribute('data-theme') === 'light';
    }

    function passo(dt) {
      /* Dois relógios. `tempo` conduz a deformação do contorno e a
         flutuação vertical — tudo que MOVE. `respiro` conduz o
         brilho, que não move nada. Com movimento reduzido o
         primeiro para e o segundo continua: é assim que sobra uma
         pulsação mínima sem deslocamento nenhum. */
      if (!reduzido) tempo += dt;
      respiro += dt;

      /* Suavização exponencial: independente da taxa de quadros, o
         que evita a animação ficar mais rápida em tela de 120Hz. */
      const k = 1 - Math.exp(-dt * 3.2);
      agora.escala += (alvo.escala - agora.escala) * k;
      agora.contracao += (alvo.contracao - agora.contracao) * k;
      agora.giro += (alvo.giro - agora.giro) * k;
      agora.brilho += (alvo.brilho - agora.brilho) * k;
      agora.agitacao += (alvo.agitacao - agora.agitacao) * k;

      if (voltarAoRepouso && respiro > voltarAoRepouso) {
        voltarAoRepouso = 0;
        definirEstado('repouso');
      }

      for (let i = ondas.length - 1; i >= 0; i--) {
        ondas[i].t += dt;
        if (ondas[i].t > 1.6) ondas.splice(i, 1);
      }

      /* O avanço das órbitas é SIMULAÇÃO, e por isso mora aqui e
         não em desenhar(). Deixá-lo no desenho amarraria a posição
         das partículas ao número de vezes que a tela é pintada —
         e um quadro perdido viraria um solavanco.

         COM MOVIMENTO REDUZIDO, NADA ORBITA. O brief pede uma
         formação "praticamente estática com uma pulsação mínima", e
         "praticamente estática" não é "a mesma órbita mais devagar":
         quem liga essa preferência costuma fazê-lo por enjoo ou
         vertigem, e movimento lento e contínuo é justamente o que
         mais incomoda. O que sobra é o respiro de brilho, que não
         desloca nada na tela. */
      if (!reduzido) {
        for (let i = 0; i < particulas.length; i++) {
          const p = particulas[i];
          p.angulo += p.giro * agora.giro * dt;
        }
      }
    }

    function desenhar() {
      ctx.clearRect(0, 0, largura, altura);

      const cx = largura / 2;
      const cy = altura / 2;
      /* 0.34 e não 0.5: o raio máximo de uma partícula chega a
         ~1.25 do raio base (a deformação que torna o círculo
         irregular), e um raio base de metade da caixa faria a
         formação bater na borda e ser cortada — o que lê como
         "gráfico com overflow", não como poeira solta. */
      const R = Math.min(largura, altura) * 0.34 * agora.escala;
      /* As partículas escalam com a formação. Sem isto, o mesmo
         código produz poeira grossa num botão de 52px e areia fina
         invisível num painel de 200px. */
      /* O piso era 0.55, e ele quebrava as formações pequenas: numa
         caixa de 30px o raio é ~10px, e uma partícula de 3,8px
         cobria mais de um terço dele. Com composição aditiva, 26
         manchas desse tamanho somam para o branco — o painel do
         assistente exibia um QUADRADO BRANCO onde deveria haver
         poeira. O piso baixo mantém a proporção em qualquer
         tamanho, que é o ponto de escalar com R. */
      const escalaPonto = Math.max(0.36, R / 58);
      const luz = claro();
      const img = spritesDo(luz ? 'light' : 'dark');

      /* A pulsação. Discreta quando há movimento (0.06 é quase
         subliminar, e é o suficiente para a formação não parecer
         congelada num quadro); mais presente quando o movimento
         está desligado, porque então ela é o ÚNICO sinal de que a
         peça está viva — e uma imagem parada no lugar de uma
         formação viva lê como falha de carregamento. */
      const amplitude = reduzido ? 0.18 : 0.06;
      const pulso = 1 + amplitude * Math.sin(respiro * (reduzido ? 0.9 : 0.6));

      /* Composição aditiva só no escuro. No claro ela empilharia
         tudo para o branco e a formação sumiria no fundo. */
      ctx.globalCompositeOperation = luz ? 'source-over' : 'lighter';

      for (let i = 0; i < particulas.length; i++) {
        const p = particulas[i];

        /* contorno irregular — duas senoides incomensuráveis */
        const deform = 1 +
          0.15 * Math.sin(tempo * p.f1 + p.p1) +
          0.09 * Math.sin(tempo * p.f2 + p.p2);

        /* "pensando": algumas partículas atravessam o centro. O
           seno leva o raio ao negativo, e raio negativo em
           coordenada polar é literalmente o outro lado. */
        const travessia = p.cruza && agora.agitacao > 1.3
          ? Math.sin(tempo * 0.9 + p.p1) * p.cruza * (agora.agitacao - 1.3) * 0.9
          : 0;

        let raio = p.raioBase * deform * (1 - agora.contracao) - travessia;

        /* ondas de resposta: um empurrão suave para fora quando a
           frente passa pelo raio desta partícula */
        for (let w = 0; w < ondas.length; w++) {
          const frente = ondas[w].t / 1.6;
          const d = Math.abs(p.raioBase - frente);
          if (d < 0.22) raio += (1 - d / 0.22) * 0.16 * (1 - frente);
        }

        const x = cx + Math.cos(p.angulo) * raio * R;
        /* Flutuação vertical suave: 2% do raio, não mais. Acima
           disso a formação "balança" e vira animação de espera. */
        const y = cy + Math.sin(p.angulo) * raio * R +
          Math.sin(tempo * 0.55 + p.flutua) * R * 0.022;

        /* O sprite é quase todo queda suave: o raio desenhado é ~4x
           o "ponto" para o brilho ter para onde cair. */
        const tam = p.tamanho * p.z * escalaPonto * 4.2;

        /* Opacidade cai perto da BORDA EXTERNA, e só lá. É o que
           produz "bordas parcialmente dispersas" sem precisar tirar
           partículas de lá — tirar deixaria um vazio com contorno
           nítido, que é justamente a leitura de anel/portal que a
           peça não pode ter. */
        const borda = Math.max(0, 1 - Math.max(0, Math.abs(raio) - 0.70) * 2.2);
        let a = (0.40 + p.z * 0.60) * agora.brilho * borda * pulso * (luz ? 0.85 : 1);
        if (p.cor === 'brilho') a *= 1.15;
        if (a <= 0.015) continue;

        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(img[p.cor], x - tam, y - tam, tam * 2, tam * 2);
      }
      ctx.globalAlpha = 1;

      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------------- laço ---------------- */

    function tick(t) {
      if (!vivo) return;
      const dt = ultimo ? Math.min(0.05, (t - ultimo) / 1000) : 0.016;
      ultimo = t;
      passo(dt);
      desenhar();
      quadro = requestAnimationFrame(tick);
    }

    function ligar() {
      /* NUNCA dois laços. Sem esta guarda, voltar para a aba duas
         vezes deixa dois requestAnimationFrame correndo, a animação
         anda ao dobro da velocidade e o consumo dobra junto — e
         isso não aparece em teste nenhum, só na bateria de quem
         usa. */
      if (quadro || !vivo) return;
      if (!visivel) return;
      /* naTela começa true e só vira false depois que o
         IntersectionObserver realmente disser que saiu da tela.
         Quem acabou de revelar a formação já a marcou como visível
         ao chamar medir(); esperar o observador aqui deixaria o
         canvas em branco por um quadro ou mais. */
      if (!naTela) return;
      ultimo = 0;
      quadro = requestAnimationFrame(tick);
    }

    function desligar() {
      if (!quadro) return;
      cancelAnimationFrame(quadro);
      quadro = null;
    }

    /* ---------------- eventos externos ---------------- */

    function aoTrocarVisibilidade() {
      visivel = !document.hidden;
      if (visivel) ligar(); else desligar();
    }

    function aoRedimensionar() { medir(); }

    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
    global.addEventListener('resize', aoRedimensionar);

    /* Fora da tela também para. Rolar a página para longe do UGLEZ
       não deveria continuar custando 60 quadros por segundo. */
    let observador = null;
    if (global.IntersectionObserver) {
      observador = new IntersectionObserver((entradas) => {
        naTela = entradas.some((e) => e.isIntersecting);
        if (naTela) ligar(); else desligar();
      }, { threshold: 0 });
      observador.observe(canvas);
    }

    /* ============================================================
       A FORMAÇÃO SE REMEDE SOZINHA — e isto corrigiu um defeito
       ------------------------------------------------------------
       medir() lê getBoundingClientRect(). Quando a formação é
       construída dentro de um elemento AINDA ESCONDIDO — e é
       exatamente o caso do painel do assistente flutuante, montado
       com hidden e revelado só no primeiro clique — a leitura
       devolve 0×0. O canvas nascia com 1×1 (o mínimo), o CSS o
       esticava para 30×30, e as poucas partículas empilhadas num
       único pixel saturavam.

       O resultado na tela era um QUADRADO BRANCO no lugar da
       formação. Nada no console, nenhuma exceção: só um retângulo
       branco onde deveria haver poeira azul.

       'resize' da janela não resolve, porque a janela não mudou de
       tamanho — quem mudou foi o elemento. É para isso que existe
       o ResizeObserver, e é por isso que ele observa o canvas em
       vez de a janela.
       ============================================================ */
    let observadorTamanho = null;
    if (global.ResizeObserver) {
      observadorTamanho = new ResizeObserver(() => { medir(); });
      observadorTamanho.observe(canvas);
    }

    /* ---------------- controle ---------------- */

    function definirEstado(nome) {
      if (!ESTADOS[nome]) return;
      nomeEstado = nome;
      alvo = ESTADOS[nome];
      if (nome === 'respondendo') emitirOnda();
    }

    function emitirOnda() {
      if (reduzido) return;
      if (ondas.length > 3) return;
      ondas.push({ t: 0 });
    }

    medir();
    ligar();

    return {
      /** Troca o estado. Nomes: ver ESTADOS. */
      estado(nome) { definirEstado(nome); return this; },
      atual: () => nomeEstado,

      /** Uma onda avulsa — usada a cada trecho de resposta que chega. */
      onda() { emitirOnda(); return this; },

      /**
       * Pulso curto e volta sozinho ao repouso. É o "sucesso" e o
       * "erro" do brief: os dois são momentos, não modos, e deixá-los
       * fixos faria a tela ficar comemorando (ou de luto) para
       * sempre.
       */
      pulsar(nome, segundos) {
        definirEstado(nome);
        voltarAoRepouso = respiro + (segundos || 1.2);
        return this;
      },

      /**
       * Recalcula o tamanho E repinta, mesmo que o tamanho não
       * tenha mudado.
       *
       * O repintar não é redundância. Quem chama isto é uma tela
       * que acabou de REVELAR a formação — o painel do assistente,
       * por exemplo. Enquanto ela estava escondida, o laço de
       * animação estava parado (o IntersectionObserver o desliga
       * fora da tela, para não gastar bateria desenhando o
       * invisível). O laço religa, mas só no próximo quadro em que
       * o observador reagir; até lá o canvas fica em branco, e o
       * que a pessoa vê ao abrir o painel é um buraco onde deveria
       * estar o UGLEZ.
       */
      medir() {
        /* A formação foi revelada: ela ESTÁ na tela agora. O
           observador confirma no próximo quadro; assumir aqui é o
           que evita o branco de um quadro. */
        naTela = true;
        medir();
        desenhar();
        ligar();
        return this;
      },

      /**
       * Solta TUDO. Sem isto, cada troca de página deixaria para
       * trás um laço de animação, dois ouvintes globais e um
       * observador — o vazamento clássico deste tipo de peça, que só
       * aparece depois de meia hora de uso.
       */
      destruir() {
        vivo = false;
        desligar();
        document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
        global.removeEventListener('resize', aoRedimensionar);
        if (observador) { observador.disconnect(); observador = null; }
        if (observadorTamanho) { observadorTamanho.disconnect(); observadorTamanho = null; }
        particulas = [];
        try { ctx.clearRect(0, 0, largura, altura); } catch (e) { /* já foi */ }
      }
    };
  };

  /**
   * Um controle que não faz nada, com a mesma forma do de verdade.
   * Devolvido quando não há canvas 2D. Quem chama nunca precisa
   * perguntar se deu certo — e é isso que impede um `if` esquecido
   * de virar TypeError numa página inteira.
   */
  P.inerte = function () {
    const nada = {
      estado() { return nada; }, atual: () => 'repouso',
      onda() { return nada; }, pulsar() { return nada; },
      medir() { return nada; }, destruir() {}
    };
    return nada;
  };

  /**
   * Monta o canvas dentro de um contêiner e devolve o controle.
   * O canvas é aria-hidden: ele é decorativo, e quem precisa saber
   * o que o UGLEZ está fazendo lê o texto ao lado, não a animação.
   */
  P.montar = function (container, opcoes) {
    if (!container) return P.inerte();
    let canvas = container.querySelector('canvas.uglez-particulas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'uglez-particulas';
      canvas.setAttribute('aria-hidden', 'true');
      container.appendChild(canvas);
    }
    return P.criar(canvas, opcoes);
  };

  global.UglezParticulas = P;
})(window);
