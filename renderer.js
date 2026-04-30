// renderer.js - SVG graph rendering

const renderer = (() => {
  'use strict';

  const SVG_NS       = 'http://www.w3.org/2000/svg';
  const NODE_W       = 144;
  const NODE_H       = 44;
  const PARALLEL_GAP = 8;    // px between parallel offset lines
  const MAX_PARALLEL = 5;    // relations beyond this are bundled into one thick line
  const COLOR_NORMAL = '#475569';
  const COLOR_SEL    = '#2563eb';
  const STROKE_NORMAL  = 2;
  const STROKE_BUNDLE  = 7;

  let svg, relLayer, nodeLayer, defs;
  let _selectedRelKey  = null; // number (rel id) | 'bundle:pairKey' | null
  let _selectedNodeId  = null;
  let _callbacks       = {};

  // ─── Public ────────────────────────────────────────────────────────────────

  function init(svgEl, callbacks) {
    svg       = svgEl;
    relLayer  = svgEl.querySelector('#relations-layer');
    nodeLayer = svgEl.querySelector('#nodes-layer');
    defs      = svgEl.querySelector('#svg-defs');
    _callbacks = callbacks || {};
    _buildDefs();
  }

  function setSelectedRel(key)  { _selectedRelKey  = key; }
  function setSelectedNode(id)  { _selectedNodeId  = id;  }

  function render(nodes, relationGroups) {
    relLayer.innerHTML  = '';
    nodeLayer.innerHTML = '';

    for (const [key, rels] of relationGroups) {
      _renderGroup(key, rels, nodes);
    }
    for (const node of nodes) {
      _renderNode(node);
    }
  }

  // ─── SVG defs (arrow markers) ───────────────────────────────────────────────

  function _buildDefs() {
    defs.innerHTML = '';
    _addArrow('arrow',        COLOR_NORMAL);
    _addArrow('arrow-sel',    COLOR_SEL);
    _addArrow('arrow-bundle', COLOR_NORMAL);
  }

  function _addArrow(id, color) {
    const marker = _el('marker');
    marker.id = id;
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto');
    const path = _el('path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', color);
    marker.appendChild(path);
    defs.appendChild(marker);
  }

  // ─── Relation group rendering ───────────────────────────────────────────────

  function _renderGroup(pairKey, rels, nodesArr) {
    const [idA, idB] = pairKey.split('_').map(Number);
    const nodeA = nodesArr.find(n => n.id === idA);
    const nodeB = nodesArr.find(n => n.id === idB);
    if (!nodeA || !nodeB) return;

    const dx  = nodeB.x - nodeA.x;
    const dy  = nodeB.y - nodeA.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    // Perpendicular unit vector (left-hand side of A→B direction)
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

  // Render one directed relation line (possibly offset from centre-to-centre)
  function _renderSingle(rel, nodeA, nodeB, perpX, perpY, offset) {
    const ox = perpX * offset;
    const oy = perpY * offset;

    // Border points (unshifted direction, then translate by offset)
    const bA = _rectEdge(nodeA.x, nodeA.y, nodeB.x, nodeB.y);
    const bB = _rectEdge(nodeB.x, nodeB.y, nodeA.x, nodeA.y);

    // Line runs from source border to target border
    let x1, y1, x2, y2;
    if (rel.fromId === nodeA.id) {
      x1 = bA.x + ox; y1 = bA.y + oy;
      x2 = bB.x + ox; y2 = bB.y + oy;
    } else {
      x1 = bB.x + ox; y1 = bB.y + oy;
      x2 = bA.x + ox; y2 = bA.y + oy;
    }

    const isSel  = _selectedRelKey === rel.id;
    const stroke = isSel ? COLOR_SEL    : COLOR_NORMAL;
    const marker = isSel ? 'arrow-sel'  : 'arrow';

    const g = _el('g');
    g.setAttribute('class', 'relation-group');
    g.dataset.relId = rel.id;

    // Transparent wide hit-target for easy clicking
    const hit = _line(x1, y1, x2, y2);
    hit.setAttribute('class', 'relation-hit');

    // Visible line with arrowhead
    const line = _line(x1, y1, x2, y2);
    line.setAttribute('class', 'relation-line' + (isSel ? ' selected' : ''));
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', STROKE_NORMAL);
    line.setAttribute('marker-end', `url(#${marker})`);

    // Label at midpoint, slightly above the line
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const label = _el('text');
    label.setAttribute('class', 'relation-label' + (isSel ? ' selected' : ''));
    label.setAttribute('x', mx);
    label.setAttribute('y', my - 6);
    label.setAttribute('fill', isSel ? COLOR_SEL : '#64748b');
    label.textContent = rel.type;

    g.appendChild(hit);
    g.appendChild(line);
    g.appendChild(label);
    g.addEventListener('click', e => {
      e.stopPropagation();
      _callbacks.onRelClick && _callbacks.onRelClick(rel.id, null);
    });

    relLayer.appendChild(g);
  }

  // Render bundled thick line for 6+ relations between same pair
  function _renderBundle(pairKey, rels, nodeA, nodeB) {
    const bA = _rectEdge(nodeA.x, nodeA.y, nodeB.x, nodeB.y);
    const bB = _rectEdge(nodeB.x, nodeB.y, nodeA.x, nodeA.y);

    const isSel  = _selectedRelKey === ('bundle:' + pairKey);
    const stroke = isSel ? COLOR_SEL : COLOR_NORMAL;

    const tooltipLines =
      rels.map(r => {
        if (r.fromId === nodeA.id) return `${nodeA.label} →[${r.type}]→ ${nodeB.label}`;
        else                       return `${nodeB.label} →[${r.type}]→ ${nodeA.label}`;
      }).join('\n') +
      '\n\nOpen a node properties dialog to delete individual relations.';

    const g = _el('g');
    g.setAttribute('class', 'relation-group bundle');
    g.dataset.bundleKey = pairKey;

    // Native SVG tooltip (accessibility / fallback) — shows count + relation list
    const title = _el('title');
    title.textContent = tooltipLines;

    // Hit target
    const hit = _line(bA.x, bA.y, bB.x, bB.y);
    hit.setAttribute('class', 'relation-hit');
    hit.setAttribute('stroke-width', '14');

    // Thick visible line (no single arrowhead — directions are mixed)
    const line = _line(bA.x, bA.y, bB.x, bB.y);
    line.setAttribute('class', 'relation-line bundled' + (isSel ? ' selected' : ''));
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', STROKE_BUNDLE);
    line.setAttribute('stroke-linecap', 'round');

    // Count label
    const mx = (bA.x + bB.x) / 2;
    const my = (bA.y + bB.y) / 2;
    const label = _el('text');
    label.setAttribute('class', 'relation-label');
    label.setAttribute('x', mx);
    label.setAttribute('y', my - 9);
    label.setAttribute('fill', isSel ? COLOR_SEL : COLOR_NORMAL);
    label.setAttribute('font-weight', '600');
    label.textContent = `${rels.length} relations`;

    g.appendChild(title);
    g.appendChild(hit);
    g.appendChild(line);
    g.appendChild(label);

    // HTML tooltip on hover
    const tip = document.getElementById('tooltip');
    g.addEventListener('mouseenter', e => {
      tip.textContent = tooltipLines;
      tip.classList.remove('hidden');
      _moveTooltip(e);
    });
    g.addEventListener('mousemove', _moveTooltip);
    g.addEventListener('mouseleave', () => tip.classList.add('hidden'));

    g.addEventListener('click', e => {
      e.stopPropagation();
      _callbacks.onRelClick && _callbacks.onRelClick(null, pairKey);
    });

    relLayer.appendChild(g);
  }

  // ─── Node rendering ─────────────────────────────────────────────────────────

  function _renderNode(node) {
    const isSel  = _selectedNodeId === node.id;
    const stroke = isSel ? COLOR_SEL : COLOR_NORMAL;
    const sw     = isSel ? 3 : 2;

    const g = _el('g');
    g.setAttribute('class', 'node-group');
    g.dataset.nodeId = node.id;

    const rect = _el('rect');
    rect.setAttribute('class', 'node-rect' + (isSel ? ' selected' : ''));
    rect.setAttribute('x', node.x - NODE_W / 2);
    rect.setAttribute('y', node.y - NODE_H / 2);
    rect.setAttribute('width',  NODE_W);
    rect.setAttribute('height', NODE_H);
    rect.setAttribute('rx', '7');
    rect.setAttribute('fill', 'white');
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', sw);

    const text = _el('text');
    text.setAttribute('class', 'node-label');
    text.setAttribute('x', node.x);
    text.setAttribute('y', node.y);
    text.setAttribute('fill', '#1e293b');
    // Truncate long labels
    const display = node.label.length > 17 ? node.label.slice(0, 16) + '…' : node.label;
    text.textContent = display;

    // SVG title for full label on hover
    const t = _el('title');
    t.textContent = node.label;
    g.appendChild(t);

    g.appendChild(rect);
    g.appendChild(text);

    g.addEventListener('click', e => {
      e.stopPropagation();
      _callbacks.onNodeClick && _callbacks.onNodeClick(node.id);
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

    nodeLayer.appendChild(g);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  // Returns the point on the rectangle (cx,cy,NODE_W/2,NODE_H/2) border
  // along the direction from centre toward (toX,toY).
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

  function _el(tag) {
    return document.createElementNS(SVG_NS, tag);
  }

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

  return { init, render, setSelectedRel, setSelectedNode, NODE_W, NODE_H };
})();
