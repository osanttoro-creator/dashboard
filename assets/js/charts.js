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
      good: v('--good', '#3DD68C'),
      warning: v('--warning', '#F2B84B'),
      series: [v('--s1', '#3DD68C'), v('--s2', '#6C6CE0'), v('--s3', '#F0554D'),
        v('--s4', '#F2B84B'), v('--s5', '#4EC5D4'), v('--s6', '#9AA0AC')]
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
        tooltip: {
          backgroundColor: t.ink,
          titleColor: t.surface,
          bodyColor: t.surface,
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
          boxWidth: 8, boxHeight: 8, boxPadding: 4, usePointStyle: true,
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 12 },
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
    return chart;
  };

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

  /** Rosca com centro vazio para o total. */
  Charts.doughnut = function (canvasId, rows, opts) {
    const t = Charts.theme();
    const o = opts || {};
    const total = U.sum(rows, (r) => r.total);
    const base = baseOptions(t);
    return Charts.render(canvasId, {
      type: 'doughnut',
      data: {
        labels: rows.map((r) => r.name),
        datasets: [{
          data: rows.map((r) => r.total),
          backgroundColor: rows.map((r) => r.color),
          borderColor: t.surface,
          borderWidth: 2,          // o "gap de superfície" entre fatias
          hoverOffset: 6
        }]
      },
      options: Object.assign({}, base, {
        cutout: '62%',
        plugins: Object.assign({}, base.plugins, {
          legend: Object.assign({}, base.plugins.legend, { position: o.legendPosition || 'right', align: 'center' }),
          tooltip: Object.assign({}, base.plugins.tooltip, {
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

  /** Linhas com marcador de ponta e wash de área opcional. */
  Charts.lines = function (canvasId, labels, datasets, opts) {
    const t = Charts.theme();
    const o = opts || {};
    const base = baseOptions(t);
    return Charts.render(canvasId, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: d.fill ? hexA(d.color, 0.1) : d.color,
          fill: !!d.fill,
          borderWidth: 2,
          borderDash: d.dashed ? [5, 4] : undefined,
          tension: 0.28,
          pointRadius: (ctx) => (ctx.dataIndex === ctx.dataset.data.length - 1 ? 4.5 : 0),
          pointHoverRadius: 5,
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
          legend: Object.assign({}, base.plugins.legend, { display: datasets.length > 1 })
        })
      })
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
