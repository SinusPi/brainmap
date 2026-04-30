// renderer.js - SVG graph rendering (pan/zoom, multi-select, query nodes)

const renderer = (() => {
  'use strict';

  const SVG_NS        = 'http://www.w3.org/2000/svg';
  const NODE_W        = 144;
  const NODE_H        = 44;
  const PARALLEL_GAP  = 8;
  const MAX_PARALLEL  = 5;
  const COLOR_NORMAL  = '#475569';
  const COLOR_SEL     = '#2563eb';
  const COLOR_QN      = '#7c3aed';
  const STROKE_NORMAL = 2;
  const STROKE_BUNDLE = 7;
  const ZOOM_MIN       = 0.1;
  const ZOOM_MAX       = 5;
  const ZOOM_FACTOR    = 1.12;
  const GRID_SIZE_BASE = 28;   // world-unit spacing between dot-grid dots
  const GRID_SIZE_MIN  = 4;    // minimum rendered grid size (px) before dots vanish

  let svg, world, relLayer, nodeLayer, defs, selRectEl;
  let _panX  = 0;
  let _panY  = 0;
  let _scale = 1;
  let _selectedRelKey  = null;
  let _selectedNodeIds = new Set();
  let _callbacks       = {};

  // ─── Public ────────────────────────────────────────────────────────────────

  function init(svgEl, callbacks) {
    svg        = svgEl;
    _callbacks = callbacks || {};
    defs       = svgEl.querySelector('#svg-defs');
    world      = svgEl.querySelector('#world');
    relLayer   = svgEl.querySelector('#relations-layer');
    nodeLayer  = svgEl.querySelector('#nodes-layer');
    selRectEl  = svgEl.querySelector('#selection-rect');
    _buildDefs();
    _initZoom();
    _applyTransform();
  }

  function clientToWorld(cx, cy) {
    const r = svg.getBoundingClientRect();
    return { x: (cx - r.left - _panX) / _scale, y: (cy - r.top - _panY) / _scale };
  }

  function getPan()   { return { x: _panX, y: _panY }; }
  function getScale() { return _scale; }

  function setPan(x, y) {
    _panX = x; _panY = y;
    _applyTransform();
  }

  function setSelectedRel(key)     { _selectedRelKey  = key; }
  function setSelectedNodes(idSet) { _selectedNodeIds = idSet instanceof Set ? idSet : new Set(); }
  // Single-select shim
  function setSelectedNode(id)     { _selectedNodeIds = id !== null ? new Set([id]) : new Set(); }

  function showSelectionRect(x1, y1, x2, y2) {
    if (!selRectEl) return;
    selRectEl.setAttribute('x',      Math.min(x1, x2));
    selRectEl.setAttribute('y',      Math.min(y1, y2));
    selRectEl.setAttribute('width',  Math.abs(x2 - x1));
    selRectEl.setAttribute('height', Math.abs(y2 - y1));
    selRectEl.classList.remove('hidden');
  }

  function hideSelectionRect() {
    if (selRectEl) selRectEl.classList.add('hidden');
  }

  function render(nodes, relationGroups, queryNodes) {
    relLayer.innerHTML  = '';
    nodeLayer.innerHTML = '';
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const [key, rels] of relationGroups) {
      _renderGroup(key, rels, nodes, nodeMap);
    }
    for (const node of nodes) {
      _renderNode(node, false);
    }
    if (queryNodes) {
      for (const qn of queryNodes) _renderQueryNode(qn);
    }
  }

  // ─── Zoom ──────────────────────────────────────────────────────────────────

  function _initZoom() {
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const factor   = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, _scale * factor));
      if (newScale === _scale) return;
      const r    = svg.getBoundingClientRect();
      const svgX = e.clientX - r.left;
      const svgY = e.clientY - r.top;
      _panX  = svgX - (svgX - _panX) * (newScale / _scale);
      _panY  = svgY - (svgY - _panY) * (newScale / _scale);
      _scale = newScale;
      _applyTransform();
    }, { passive: false });
  }

  function _applyTransform() {
    world.setAttribute('transform', `translate(${_panX},${_panY}) scale(${_scale})`);
    // Keep CSS dot-grid in sync with pan/zoom
    const gridSize = Math.max(GRID_SIZE_MIN, GRID_SIZE_BASE * _scale);
    const bgX = ((_panX % gridSize) + gridSize) % gridSize;
    const bgY = ((_panY % gridSize) + gridSize) % gridSize;
    svg.style.backgroundSize     = `${gridSize}px ${gridSize}px`;
    svg.style.backgroundPosition = `${bgX}px ${bgY}px`;
  }

  // ─── Defs (arrow markers) ───────────────────────────────────────────────────

  function _buildDefs() {
    defs.innerHTML = '';
    _addArrow('arrow',        COLOR_NORMAL);
    _addArrow('arrow-sel',    COLOR_SEL);
    _addArrow('arrow-bundle', COLOR_NORMAL);
  }

  function _addArrow(id, color) {
    const marker = _el('marker');
    marker.id = id;
    marker.setAttribute('viewBox',      '0 0 10 10');
    marker.setAttribute('refX',         '9');
    marker.setAttribute('refY',         '5');
    marker.setAttribute('markerWidth',  '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient',       'auto');
    const path = _el('path');
    path.setAttribute('d',    'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', color);
    marker.appendChild(path);
    defs.appendChild(marker);
  }

  // ─── Relation group rendering ───────────────────────────────────────────────

  function _renderGroup(pairKey, rels, nodesArr, nodeMap) {
    const [idA, idB] = pairKey.split('_').map(Number);
    const nodeA = nodeMap.get(idA);
    const nodeB = nodeMap.get(idB);
    if (!nodeA || !nodeB) return;

    const dx  = nodeB.x - nodeA.x;
    const dy  = nodeB.y - nodeA.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const perpX = -dy / len;
    const perpY =  dx / len;

    if (rels.length > MAX_PARALLEL) {
      _renderBundle(pairKey, rels, nodeA, nodeB);
    } else {
      for (let i = 0; i < rels.length; i++) {
        const offset = (i - (rels.length - 1) / 2) * PARALLEL_GAP;
        _renderSingle(rels[i], nodeA, nodeB, perpX, perpY, offset);
      }
    }
  }

  function _renderSingle(rel, nodeA, nodeB, perpX, perpY, offset) {
    const ox = perpX * offset;
    const oy = perpY * offset;
    const bA = _rectEdge(nodeA.x, nodeA.y, nodeB.x, nodeB.y);
    const bB = _rectEdge(nodeB.x, nodeB.y, nodeA.x, nodeA.y);

    let x1, y1, x2, y2;
    if (rel.fromId === nodeA.id) {
      x1 = bA.x + ox; y1 = bA.y + oy;
      x2 = bB.x + ox; y2 = bB.y + oy;
    } else {
      x1 = bB.x + ox; y1 = bB.y + oy;
      x2 = bA.x + ox; y2 = bA.y + oy;
    }

    const isSel  = _selectedRelKey === rel.id;
    const stroke = isSel ? COLOR_SEL : COLOR_NORMAL;
    const marker = isSel ? 'arrow-sel' : 'arrow';
    const isDir  = rel.directional !== false;

    const g = _el('g');
    g.setAttribute('class', 'relation-group');
    g.dataset.relId = rel.id;

    const hit = _line(x1, y1, x2, y2);
    hit.setAttribute('class', 'relation-hit');

    const line = _line(x1, y1, x2, y2);
    line.setAttribute('class',        'relation-line' + (isSel ? ' selected' : ''));
    line.setAttribute('stroke',       stroke);
    line.setAttribute('stroke-width', STROKE_NORMAL);
    if (isDir) line.setAttribute('marker-end', `url(#${marker})`);

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const label = _el('text');
    label.setAttribute('class', 'relation-label' + (isSel ? ' selected' : ''));
    label.setAttribute('x',    mx);
    label.setAttribute('y',    my - 6);
    label.setAttribute('fill', isSel ? COLOR_SEL : '#64748b');
    label.textContent = (isDir ? '' : '↔ ') + rel.type;

    g.appendChild(hit);
    g.appendChild(line);
    g.appendChild(label);
    g.addEventListener('click', e => {
      e.stopPropagation();
      _callbacks.onRelClick && _callbacks.onRelClick(rel.id, null);
    });
    relLayer.appendChild(g);
  }

  function _renderBundle(pairKey, rels, nodeA, nodeB) {
    const bA    = _rectEdge(nodeA.x, nodeA.y, nodeB.x, nodeB.y);
    const bB    = _rectEdge(nodeB.x, nodeB.y, nodeA.x, nodeA.y);
    const isSel = _selectedRelKey === ('bundle:' + pairKey);
    const stroke = isSel ? COLOR_SEL : COLOR_NORMAL;

    const tooltipLines =
      rels.map(r => {
        const isDir = r.directional !== false;
        const sym   = isDir ? `\u2192[${r.type}]\u2192` : `\u2194[${r.type}]\u2194`;
        return r.fromId === nodeA.id
          ? `${nodeA.label} ${sym} ${nodeB.label}`
          : `${nodeB.label} ${sym} ${nodeA.label}`;
      }).join('\n') +
      '\n\nOpen a node properties dialog to delete individual relations.';

    const g = _el('g');
    g.setAttribute('class', 'relation-group bundle');
    g.dataset.bundleKey = pairKey;

    const title = _el('title');
    title.textContent = tooltipLines;

    const hit = _line(bA.x, bA.y, bB.x, bB.y);
    hit.setAttribute('class',        'relation-hit');
    hit.setAttribute('stroke-width', '14');

    const line = _line(bA.x, bA.y, bB.x, bB.y);
    line.setAttribute('class',          'relation-line bundled' + (isSel ? ' selected' : ''));
    line.setAttribute('stroke',         stroke);
    line.setAttribute('stroke-width',   STROKE_BUNDLE);
    line.setAttribute('stroke-linecap', 'round');

    const mx = (bA.x + bB.x) / 2;
    const my = (bA.y + bB.y) / 2;
    const label = _el('text');
    label.setAttribute('class',       'relation-label');
    label.setAttribute('x',           mx);
    label.setAttribute('y',           my - 9);
    label.setAttribute('fill',        isSel ? COLOR_SEL : COLOR_NORMAL);
    label.setAttribute('font-weight', '600');
    label.textContent = `${rels.length} relations`;

    g.appendChild(title);
    g.appendChild(hit);
    g.appendChild(line);
    g.appendChild(label);

    const tip = document.getElementById('tooltip');
    g.addEventListener('mouseenter', e => {
      tip.textContent = tooltipLines;
      tip.classList.remove('hidden');
      _moveTooltip(e);
    });
    g.addEventListener('mousemove',  _moveTooltip);
    g.addEventListener('mouseleave', () => tip.classList.add('hidden'));
    g.addEventListener('click', e => {
      e.stopPropagation();
      _callbacks.onRelClick && _callbacks.onRelClick(null, pairKey);
    });
    relLayer.appendChild(g);
  }

  // ─── Node rendering ─────────────────────────────────────────────────────────

  function _renderNode(node, isQN) {
    const isSel  = !isQN && _selectedNodeIds.has(node.id);
    const stroke = isSel ? COLOR_SEL : (isQN ? COLOR_QN : COLOR_NORMAL);
    const sw     = isSel ? 3 : 2;
    const fill   = isQN ? '#faf5ff' : 'white';

    const g = _el('g');
    g.setAttribute('class', 'node-group' + (isQN ? ' query-node' : ''));
    if (isQN) g.dataset.qnId   = node.id;
    else      g.dataset.nodeId = node.id;

    const rect = _el('rect');
    rect.setAttribute('class',        'node-rect' + (isSel ? ' selected' : '') + (isQN ? ' qn-rect' : ''));
    rect.setAttribute('x',            node.x - NODE_W / 2);
    rect.setAttribute('y',            node.y - NODE_H / 2);
    rect.setAttribute('width',        NODE_W);
    rect.setAttribute('height',       NODE_H);
    rect.setAttribute('rx',           isQN ? '22' : '7');
    rect.setAttribute('fill',         fill);
    rect.setAttribute('stroke',       stroke);
    rect.setAttribute('stroke-width', sw);
    if (isQN) rect.setAttribute('stroke-dasharray', '6 3');

    const text = _el('text');
    text.setAttribute('class', 'node-label');
    text.setAttribute('x',    node.x);
    text.setAttribute('y',    node.y);
    text.setAttribute('fill', isQN ? COLOR_QN : '#1e293b');
    const raw     = node.label || '';
    const display = raw.length > 17 ? raw.slice(0, 16) + '\u2026' : raw;
    text.textContent = (isQN ? '\u2699 ' : '') + display;

    const t = _el('title');
    t.textContent = raw + (isQN ? '\n(query node \u2014 double-click to edit)' : '');
    g.appendChild(t);
    g.appendChild(rect);
    g.appendChild(text);

    if (!isQN) {
      g.addEventListener('click', e => {
        e.stopPropagation();
        _callbacks.onNodeClick && _callbacks.onNodeClick(node.id, e);
      });
      g.addEventListener('dblclick', e => {
        e.stopPropagation();
        _callbacks.onNodeDblClick && _callbacks.onNodeDblClick(node.id);
      });
      g.addEventListener('mousedown', e => {
        if (e.button === 0) {
          e.stopPropagation();
          _callbacks.onNodeDragStart && _callbacks.onNodeDragStart(node.id, e);
        }
      });
    } else {
      g.addEventListener('dblclick', e => {
        e.stopPropagation();
        _callbacks.onQueryNodeDblClick && _callbacks.onQueryNodeDblClick(node.id);
      });
      g.addEventListener('mousedown', e => {
        if (e.button === 0) {
          e.stopPropagation();
          _callbacks.onQueryNodeDragStart && _callbacks.onQueryNodeDragStart(node.id, e);
        }
      });
    }

    nodeLayer.appendChild(g);
  }

  function _renderQueryNode(qn) {
    _renderNode({ id: qn.id, label: qn.label, x: qn.x, y: qn.y }, true);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function _rectEdge(cx, cy, toX, toY) {
    const hw = NODE_W / 2;
    const hh = NODE_H / 2;
    const dx = toX - cx;
    const dy = toY - cy;
    if (dx === 0 && dy === 0) return { x: cx + hw, y: cy };
    const tx = hw / Math.abs(dx);
    const ty = hh / Math.abs(dy);
    const t  = Math.min(tx, ty);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  function _el(tag) { return document.createElementNS(SVG_NS, tag); }

  function _line(x1, y1, x2, y2) {
    const l = _el('line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    return l;
  }

  function _moveTooltip(e) {
    const tip = document.getElementById('tooltip');
    tip.style.left = Math.min(e.clientX + 16, window.innerWidth  - 270) + 'px';
    tip.style.top  = Math.max(e.clientY -  4, 8)                         + 'px';
  }

  return {
    init, render,
    clientToWorld, getPan, getScale, setPan,
    setSelectedRel, setSelectedNodes, setSelectedNode,
    showSelectionRect, hideSelectionRect,
    NODE_W, NODE_H
  };
})();
