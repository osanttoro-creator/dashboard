/* =============================================================
   charts.js — camada fina sobre o Chart.js
   Um registro por canvas: recriar destrói o anterior.
   Se o CDN não carregar, tudo degrada em silêncio (as tabelas
   continuam sendo a fonte da verdade).
   ============================================================= */
(function (global) {
  'use strict';

  const Charts = {};
  const registry = new Map();

  Charts.available = () => typeof global.Chart !== 'undefined';

  /** Lê os tokens de cor do tema ativo direto do CSS. */
  Charts.theme = function () {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, fb) => (cs.getPropertyValue(n) || '').trim() || fb;
    return {
      surface: v('--surface', '#15171E'),
      ink: v('--ink', '#F2F3F5'),
      ink2: v('--ink-2', '#C9CDD6'),
      muted: v('--muted', '#9AA0AC'),
      grid: v('--grid', '#22252E'),
      axis: v('--axis', '#2C303B'),
      income: v('--income', '#3DD68C'),
      expense: v('--expense', '#F0554D'),
      invest: v('--invest', '#6C6CE0'),
      accent: v('--accent', '#7C6CF0'),
      good: v('--good', '#A8C088'),
      warning: v('--warning', '#E0AC55'),
      salvia: v('--salvia', '#7A846A'),
      terracota: v('--terracota', '#C9794A'),
      /* a dica precisa ser opaca: Chart.js pinta no canvas, onde não
         existe backdrop-filter para atravessar */
      tipBg: v('--tip-bg', '#2C1F15'),
      tipLine: v('--tip-line', 'rgba(231,212,181,.18)'),
      series: [v('--s1', '#D9A441'), v('--s2', '#527A72'), v('--s3', '#A68B6B'),
        v('--s4', '#A0553F'), v('--s5', '#C2A46E'), v('--s6', '#7A846A'),
        v('--s7', '#7F588C'), v('--s8', '#C9794A'), v('--s9', '#8A6A4F'), v('--s10', '#8C8F4E')]
    };
  };

  function baseOptions(t) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 320 },
      layout: { padding: { top: 4, right: 6, bottom: 0, left: 0 } },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          align: 'start',
          labels: {
            color: t.ink2, boxWidth: 9, boxHeight: 9, usePointStyle: true,
            pointStyle: 'circle', padding: 14,
            font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', size: 11.5 }
          }
        },
        /* dica como pequeno popover: fundo do próprio painel, borda fina,
           cantos generosos — não uma caixa preta colada no gráfico */
        tooltip: {
          backgroundColor: t.tipBg,
          titleColor: t.ink,
          bodyColor: t.ink2,
          borderColor: t.tipLine,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 12,
          caretSize: 5,
          displayColors: true,
          boxWidth: 8, boxHeight: 8, boxPadding: 5, usePointStyle: true,
          titleFont: { size: 12, weight: '650' },
          bodyFont: { size: 12.5 },
          titleMarginBottom: 6,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label || ''}: ${U.fmtBRL(ctx.parsed.y != null ? ctx.parsed.y : ctx.parsed)}`
          }
        }
      }
    };
  }

  function moneyScale(t, opts) {
    return Object.assign({
      grid: { color: t.grid, drawBorder: false, lineWidth: 1 },
      border: { display: false },
      ticks: {
        color: t.muted, font: { size: 11 }, padding: 6,
        callback: (v) => U.fmtBRLCompact(v)
      }
    }, opts || {});
  }
  function catScale(t) {
    return {
      grid: { display: false },
      border: { color: t.axis },
      ticks: { color: t.muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 }
    };
  }

  /** Cria (ou recria) um gráfico no canvas com o id informado. */
  Charts.render = function (canvasId, config) {
    if (!Charts.available()) return null;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const prev = registry.get(canvasId);
    if (prev) { prev.destroy(); registry.delete(canvasId); }
    const chart = new Chart(canvas.getContext('2d'), config);
    registry.set(canvasId, chart);
    descrever(canvas, config);
    return chart;
  };

  /* ============================================================
     ALTERNATIVA TEXTUAL
     ------------------------------------------------------------
     Um <canvas> é um retângulo de pixels: para quem usa leitor de
     tela, um gráfico sem descrição simplesmente não existe. E não
     basta um rótulo dizendo "gráfico de despesas" — isso anuncia
     que há informação e a nega no mesmo gesto.

     Por isso saem daqui duas coisas: um aria-label com a leitura
     resumida (quantos pontos, qual o maior, qual o menor) e uma
     TABELA com todos os valores, invisível na tela e disponível
     para quem navega por texto. É a mesma informação, na forma que
     cada um consegue receber.

     Como todo gráfico passa por Charts.render, isto vale para os
     13 de uma vez — e para os próximos, sem ninguém precisar
     lembrar.
     ============================================================ */

  function valorFmt(v, formato) {
    if (v == null || !isFinite(v)) return '—';
    if (formato === 'pct') return U.fmtPct(v, 1);
    if (formato === 'num') return U.fmtNum(v);
    return U.fmtBRL(v);
  }

  function descrever(canvas, config) {
    const a = (config && config.acessivel) || {};
    const formato = a.formato || 'brl';
    const titulo = a.titulo || canvas.getAttribute('data-titulo') || tituloDoContexto(canvas);

    const labels = (config.data && config.data.labels) || [];
    const sets = ((config.data && config.data.datasets) || [])
      .filter((d) => d && Array.isArray(d.data) && d.data.length);

    /* Sem dados, dizer isso é mais útil do que uma tabela vazia. */
    if (!sets.length) {
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', titulo + ': sem dados no período.');
      limparTabela(canvas);
      return;
    }

    /* --- o resumo falado --- */
    const partes = [titulo + '.'];
    sets.forEach((d) => {
      const nums = d.data.map((v) => (typeof v === 'object' && v ? +v.y : +v))
        .filter((v) => isFinite(v));
      if (!nums.length) return;
      let iMax = 0, iMin = 0;
      nums.forEach((v, i) => { if (v > nums[iMax]) iMax = i; if (v < nums[iMin]) iMin = i; });
      const nome = d.label ? d.label + ': ' : '';
      partes.push(nome + nums.length + ' pontos. Maior: ' +
        (labels[iMax] != null ? labels[iMax] + ', ' : '') + valorFmt(nums[iMax], formato) +
        '. Menor: ' + (labels[iMin] != null ? labels[iMin] + ', ' : '') +
        valorFmt(nums[iMin], formato) + '.');
    });

    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', partes.join(' '));

    /* --- a tabela equivalente --- */
    const tabelaId = canvas.id + '-tabela';
    limparTabela(canvas);

    const tab = U.el('table', {});
    const thead = U.el('thead', {}, U.el('tr', {}, [U.el('th', { scope: 'col', text: 'Item' })]
      .concat(sets.map((d, i) => U.el('th', { scope: 'col', text: d.label || 'Série ' + (i + 1) })))));
    tab.appendChild(thead);

    const tbody = U.el('tbody', {});
    const linhas = Math.max.apply(null, sets.map((d) => d.data.length));
    for (let i = 0; i < linhas; i++) {
      tbody.appendChild(U.el('tr', {}, [
        U.el('th', { scope: 'row', text: String(labels[i] != null ? labels[i] : i + 1) })
      ].concat(sets.map((d) => {
        const v = d.data[i];
        const n = typeof v === 'object' && v ? +v.y : +v;
        return U.el('td', { text: valorFmt(n, formato) });
      }))));
    }
    tab.appendChild(tbody);

    const caixa = U.el('div', { class: 'sr-only', id: tabelaId }, [
      U.el('p', { text: titulo + ' — os mesmos dados do gráfico, em tabela.' }),
      tab
    ]);
    canvas.insertAdjacentElement('afterend', caixa);
    canvas.setAttribute('aria-describedby', tabelaId);
  }

  /**
   * O título vem do cartão que envolve o gráfico. Fazer cada chamada
   * passar o nome funcionaria, mas seria uma linha a mais para
   * lembrar em cada gráfico novo — e a que fosse esquecida voltaria
   * a anunciar "Gráfico" para quem depende dessa frase.
   */
  function tituloDoContexto(canvas) {
    let n = canvas.parentElement;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
      const h = n.querySelector('h1, h2, h3, h4, .card-title, .chart-title, .hero-label');
      const t = h && h.textContent.trim();
      if (t) return 'Gráfico: ' + t;
    }
    return 'Gráfico';
  }

  function limparTabela(canvas) {
    const antiga = document.getElementById(canvas.id + '-tabela');
    if (antiga) antiga.remove();
  }

  Charts.descrever = descrever;

  Charts.destroy = function (canvasId) {
    const c = registry.get(canvasId);
    if (c) { c.destroy(); registry.delete(canvasId); }
  };
  Charts.destroyAll = function () {
    registry.forEach((c) => c.destroy());
    registry.clear();
  };

  /* ============================================================
     Fábricas por forma
     ============================================================ */

  /* ============================================================
     Pizza em 3D
     ------------------------------------------------------------
     Chart.js não tem 3D. O plugin abaixo inclina o plano do disco
     (escala em Y em torno do centro) e extruda a lateral, então a
     própria Chart.js desenha a face de cima já no plano inclinado.

     Preço de honestidade: inclinar um disco distorce a leitura —
     as fatias da frente parecem maiores do que são, porque ganham
     área de parede. Por isso a lista ranqueada ao lado carrega
     valor e percentual de cada categoria: o número é a fonte da
     verdade, a pizza é a ilustração.

     Como a Chart.js testa o mouse no plano NÃO inclinado, o evento
     é convertido de volta antes de chegar nela — sem isso a fatia
     destacada não bate com a fatia sob o cursor.
     ============================================================ */
  const TILT = 0.62;    // 1 = disco de frente (sem 3D); menor = mais deitado
  const DEPTH = 22;     // espessura em px

  function darken(hex, k) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return hex;
    const v = [1, 2, 3].map((i) => Math.round(parseInt(m[i], 16) * k));
    return `rgb(${v[0]},${v[1]},${v[2]})`;
  }

  const pie3dPlugin = {
    id: 'pie3d',
    beforeEvent(chart, args) {
      const e = args.event;
      const arc = chart.getDatasetMeta(0).data[0];
      if (!arc || e.y == null || e.x == null) return;
      // tela -> plano do gráfico: desfaz a inclinação só no eixo Y
      e.y = arc.y + (e.y - arc.y) / TILT;
    },
    beforeDatasetsDraw(chart) {
      const arcs = chart.getDatasetMeta(0).data;
      if (!arcs.length) return;
      const ctx = chart.ctx;
      const cores = chart.data.datasets[0].backgroundColor || [];

      // paredes laterais, de baixo para cima. As fatias do fundo ficam
      // escondidas atrás da face de cima — não precisam de ordenação.
      for (let d = DEPTH; d >= 1; d--) {
        arcs.forEach((arc, i) => {
          if (arc.startAngle === arc.endAngle) return;
          ctx.save();
          ctx.translate(arc.x, arc.y + d);
          ctx.scale(1, TILT);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, arc.outerRadius, arc.startAngle, arc.endAngle);
          ctx.closePath();
          ctx.fillStyle = darken(cores[i] || '#A68B6B', 0.55);
          ctx.fill();
          ctx.restore();
        });
      }

      // deixa o plano inclinado montado: a face de cima é desenhada
      // pela própria Chart.js logo em seguida. O restore vem no after.
      const c = arcs[0];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(1, TILT);
      ctx.translate(-c.x, -c.y);
    },
    afterDatasetsDraw(chart) {
      if (chart.getDatasetMeta(0).data.length) chart.ctx.restore();
    }
  };

  /** A dica precisa sair na fatia que o usuário vê, não na do plano deitado. */
  function registerPositioner() {
    if (!Charts.available()) return;
    const T = global.Chart.Tooltip;
    if (!T || !T.positioners || T.positioners.pie3d) return;
    T.positioners.pie3d = function (items) {
      const pos = T.positioners.average.call(this, items);
      if (!pos || !items.length) return pos;
      const cy = items[0].element.y;
      return { x: pos.x, y: cy + (pos.y - cy) * TILT };
    };
  }

  /** Pizza cheia (sem furo) desenhada em 3D. */
  Charts.pie3d = function (canvasId, rows, opts) {
    const t = Charts.theme();
    const o = opts || {};
    const total = U.sum(rows, (r) => r.total);
    const base = baseOptions(t);
    registerPositioner();
    return Charts.render(canvasId, {
      type: 'pie',
      plugins: [pie3dPlugin],
      data: {
        labels: rows.map((r) => r.name),
        datasets: [{
          data: rows.map((r) => r.total),
          backgroundColor: rows.map((r) => r.color),
          borderColor: 'rgba(255,255,255,.22)',
          borderWidth: 1,
          hoverOffset: 0        // deslocar a fatia quebraria a extrusão
        }]
      },
      options: Object.assign({}, base, {
        // espaço embaixo para a espessura não ser cortada
        layout: { padding: { top: 6, right: 6, bottom: DEPTH + 6, left: 6 } },
        interaction: { mode: 'nearest', intersect: true },
        plugins: Object.assign({}, base.plugins, {
          legend: Object.assign({}, base.plugins.legend, {
            position: o.legendPosition || 'bottom', align: 'start'
          }),
          tooltip: Object.assign({}, base.plugins.tooltip, {
            position: 'pie3d',
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed;
                const pct = total > 0 ? (v / total) * 100 : 0;
                return ` ${ctx.label}: ${U.fmtBRL(v)} (${U.fmtPct(pct)})`;
              }
            }
          })
        })
      })
    });
  };

  /** Colunas agrupadas (ex.: receitas × despesas). */
  Charts.groupedBars = function (canvasId, labels, datasets, opts) {
    const t = Charts.theme();
    const o = opts || {};
    const base = baseOptions(t);
    return Charts.render(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          backgroundColor: d.color,
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: 'bottom',
          maxBarThickness: 24,
          categoryPercentage: 0.66,
          barPercentage: 0.82
        }))
      },
      options: Object.assign({}, base, {
        scales: { x: catScale(t), y: moneyScale(t, { beginAtZero: true }) },
        plugins: Object.assign({}, base.plugins, {
          legend: Object.assign({}, base.plugins.legend, { display: o.legend !== false && datasets.length > 1 })
        })
      })
    });
  };

  /** Barras horizontais ranqueadas (mais de 5 categorias). */
  Charts.rankedBars = function (canvasId, rows, opts) {
    const t = Charts.theme();
    const o = opts || {};
    const base = baseOptions(t);
    return Charts.render(canvasId, {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.name),
        datasets: [{
          label: o.label || 'Total',
          data: rows.map((r) => r.total),
          backgroundColor: rows.map((r) => r.color),
          borderRadius: { topLeft: 0, topRight: 4, bottomLeft: 0, bottomRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 22,
          categoryPercentage: 0.78
        }]
      },
      options: Object.assign({}, base, {
        indexAxis: 'y',
        interaction: { mode: 'nearest', intersect: true },
        scales: {
          x: moneyScale(t, { beginAtZero: true }),
          y: { grid: { display: false }, border: { display: false }, ticks: { color: t.ink2, font: { size: 11.5 } } }
        },
        plugins: Object.assign({}, base.plugins, {
          legend: { display: false },
          tooltip: Object.assign({}, base.plugins.tooltip, {
            callbacks: { label: (ctx) => ` ${U.fmtBRL(ctx.parsed.x)}` }
          })
        })
      })
    });
  };

  /**
   * Barras horizontais empilhadas — usado para quebrar cada categoria
   * em débito × crédito. O "gap de superfície" de 2px separa os
   * segmentos sem desenhar contorno.
   */
  Charts.stackedRankedBars = function (canvasId, labels, datasets) {
    const t = Charts.theme();
    const base = baseOptions(t);
    return Charts.render(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          label: d.label,
          data: d.data,
          backgroundColor: d.color,
          borderColor: t.surface,
          borderWidth: { left: 0, top: 0, bottom: 0, right: i < datasets.length - 1 ? 2 : 0 },
          borderRadius: { topLeft: 0, topRight: 4, bottomLeft: 0, bottomRight: 4 },
          borderSkipped: false,
          maxBarThickness: 22,
          categoryPercentage: 0.78
        }))
      },
      options: Object.assign({}, base, {
        indexAxis: 'y',
        scales: {
          x: Object.assign(moneyScale(t, { beginAtZero: true }), { stacked: true }),
          y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: t.ink2, font: { size: 11.5 } } }
        },
        plugins: Object.assign({}, base.plugins, {
          tooltip: Object.assign({}, base.plugins.tooltip, {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${U.fmtBRL(ctx.parsed.x)}`,
              footer: (items) => 'Total: ' + U.fmtBRL(items.reduce((s, i) => s + i.parsed.x, 0))
            }
          })
        })
      })
    });
  };

  /**
   * Linhas com wash de área opcional.
   * `opts.markers` põe um ponto em CADA mês — é a forma "linha com
   * marcadores": dá para bater o olho e ver o valor de cada período,
   * não só a tendência. Sem ela, só a ponta recebe marcador.
   */
  Charts.lines = function (canvasId, labels, datasets, opts) {
    const t = Charts.theme();
    const o = opts || {};
    const base = baseOptions(t);
    const raioPonto = o.markers
      ? (ctx) => (ctx.parsed && ctx.parsed.y == null ? 0 : 3.6)
      : (ctx) => (ctx.dataIndex === ctx.dataset.data.length - 1 ? 4.5 : 0);

    return Charts.render(canvasId, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: d.fill ? hexA(d.color, 0.12) : d.color,
          fill: !!d.fill,
          borderWidth: 1.8,          /* linha fina: a curva conduz, nao pesa */
          borderDash: d.dashed ? [5, 4] : undefined,
          tension: o.markers ? 0.18 : 0.28,   // marcador pede curva mais contida
          pointStyle: d.pointStyle || 'circle',
          pointRadius: raioPonto,
          pointHoverRadius: 6,
          pointBackgroundColor: d.color,
          pointBorderColor: t.surface,
          pointBorderWidth: 2,          // o "anel de superfície"
          spanGaps: true
        }))
      },
      options: Object.assign({}, base, {
        scales: {
          x: catScale(t),
          y: moneyScale(t, { beginAtZero: o.beginAtZero !== false })
        },
        plugins: Object.assign({}, base.plugins, {
          legend: Object.assign({}, base.plugins.legend, { display: o.legend !== false && datasets.length > 1 })
        })
      })
    });
  };

  /**
   * Curva mínima para viver atrás de um número: sem eixo, sem grade,
   * sem legenda, sem dica. Só a forma da tendência.
   */
  Charts.spark = function (canvasId, data, opts) {
    const t = Charts.theme();
    const o = opts || {};
    const cor = o.color || t.accent;
    return Charts.render(canvasId, {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data,
          borderColor: cor,
          borderWidth: 2,
          backgroundColor: (ctx) => {
            const { chartArea, ctx: c } = ctx.chart;
            if (!chartArea) return hexA(cor, .16);
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, hexA(cor, .26));
            g.addColorStop(1, hexA(cor, 0));
            return g;
          },
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          spanGaps: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        layout: { padding: 0 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        elements: { line: { capBezierPoints: true } }
      }
    });
  };

  function hexA(hex, a) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }
  Charts.hexA = hexA;

  global.Charts = Charts;
})(window);
