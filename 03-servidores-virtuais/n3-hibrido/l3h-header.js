// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — HEADER-LITE (fonte canónica)                        v1 · ES5   ║
// ║                                                                          ║
// ║  Versão leve e STANDALONE do header global: logo + título + relógio,      ║
// ║  ZERO chamadas à API — pinta instantaneamente, nunca espera pelo proxy.   ║
// ║  Para dashboards híbridos/nativos que não carregam o BPC Runtime          ║
// ║  (utils.js). Mesma identidade visual do header global (navy/cyan/gold,    ║
// ║  logo /public/img/bpc-logo.png com fallback textual).                    ║
// ║                                                                          ║
// ║  USO: copiar para a pasta do dashboard e editar só CFG.rootId (único      ║
// ║  por dashboard) e CFG.nocLabel. Melhorias fazem-se AQUI primeiro e        ║
// ║  propagam-se às cópias — nunca divergir uma cópia à mão.                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  var CFG = {
    rootId: 'bt-vmh-header',
    nocLabel: 'SERVIDORES VIRTUAIS - FICHA DA VM',
    title: 'BPC NOC',
    subtitle: 'BANCO DE POUPANÇA E CRÉDITO · CENTRO DE OPERAÇÕES DE REDE',
    logoUrl: '/public/img/bpc-logo.png',
    colors: { navy: '#0B1341', navy2: '#0E1A52', cyan: '#00B4D8', gold: '#F0A500' },
  };

  var root = document.getElementById(CFG.rootId);
  if (!root) return;
  var c = CFG.colors;

  var logoHTML = '<img src="' + CFG.logoUrl + '" height="36" style="height:36px;flex-shrink:0" '
    + 'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
    + '<div style="display:none;height:36px;width:52px;flex-shrink:0;background:rgba(255,255,255,.04);'
    + 'border:1px dashed rgba(255,255,255,.12);border-radius:7px;align-items:center;justify-content:center;'
    + 'font-size:10px;font-weight:800;color:rgba(255,255,255,.28);letter-spacing:1px">' + CFG.title + '</div>';

  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:18px;'
    + 'background:linear-gradient(90deg,' + c.navy + ' 0%,' + c.navy2 + ' 50%,' + c.navy + ' 100%);'
    + 'border:1px solid rgba(0,180,216,.14);border-top:2px solid rgba(0,180,216,.40);'
    + 'border-radius:10px;padding:8px 22px;height:100%;box-sizing:border-box;'
    + 'font-family:Inter,\'Segoe UI\',sans-serif">'
    +   logoHTML
    +   '<div style="flex:1;text-align:center">'
    +     '<div style="font-size:17px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;color:#fff;line-height:1">'
    +       CFG.title + ' &nbsp;|&nbsp; <em style="color:' + c.gold + ';font-style:normal">' + CFG.nocLabel + '</em>'
    +     '</div>'
    +     '<div style="font-size:8px;color:rgba(255,255,255,.22);letter-spacing:.14em;text-transform:uppercase;margin-top:4px">'
    +       CFG.subtitle + '</div>'
    +   '</div>'
    +   '<div style="text-align:right;flex-shrink:0">'
    +     '<span id="' + CFG.rootId + '-time" style="font-size:22px;font-weight:800;color:' + c.cyan + ';'
    +       'letter-spacing:3px;display:block;font-variant-numeric:tabular-nums;line-height:1">--:--:--</span>'
    +     '<div id="' + CFG.rootId + '-date" style="font-size:8.5px;color:rgba(255,255,255,.22);margin-top:3px;text-transform:capitalize">…</div>'
    +   '</div>'
    + '</div>';

  // relógio — 1 timer por rootId (limpa o anterior em re-render)
  var tKey = '_bpc_hdrlite_' + CFG.rootId;
  if (window[tKey]) clearInterval(window[tKey]);
  function tick() {
    var el = document.getElementById(CFG.rootId + '-time');
    var ed = document.getElementById(CFG.rootId + '-date');
    if (!el) { clearInterval(window[tKey]); return; }
    var n = new Date();
    function p(x) { return (x < 10 ? '0' : '') + x; }
    el.textContent = p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
    if (ed) ed.textContent = n.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  tick();
  window[tKey] = setInterval(tick, 1000);

})();
