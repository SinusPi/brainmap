// app.js - Main application controller

(function () {
  'use strict';

  // ─── Mode constants ─────────────────────────────────────────────────────────
  const MODE = {
    NORMAL:       'normal',
    ADD_NODE:     'add-node',
    ADD_REL_FROM: 'add-rel-from',  // waiting for user to click source node
    ADD_REL_TO:   'add-rel-to'     // waiting for user to click target node
  };

  // ─── State ──────────────────────────────────────────────────────────────────
  let mode           = MODE.NORMAL;
  let selectedNodeId = null;
  let selectedRelKey = null;  // number (rel.id) | 'bundle:pairKey' | null
  let relFromNodeId  = null;  // source node id while in ADD_REL_TO mode
  let lastRelType    = 'related-to';

  // Node drag state
  let dragNodeId = null;
  let dragOffX   = 0;
  let dragOffY   = 0;

  // Pan/zoom state
  let panX  = 0;
  let panY  = 0;
  let scale = 1;

  // Canvas pan drag state
  let isPanning     = false;
  let _panStartCX   = 0;
  let _panStartCY   = 0;
  let _panStartPanX = 0;
  let _panStartPanY = 0;
  let _panMoved     = false;

  const canvas     = document.getElementById('canvas');
  const emptyState = document.getElementById('empty-state');
  const hint       = document.getElementById('status-hint');
  const _viewport  = canvas.querySelector('#viewport');

  // ─── Boot ───────────────────────────────────────────────────────────────────

  model.load();

  renderer.init(canvas, {
    onNodeClick:     handleNodeClick,
    onNodeDblClick:  handleNodeDblClick,
    onNodeDragStart: handleNodeDragStart,
    onRelClick:      handleRelClick
  });

  dialog.init(model, {
    onSave(nodeId, changes) {
      model.updateNode(nodeId, changes);
      renderAll();
    },
    onDeleteNode(nodeId) {
      if (selectedNodeId === nodeId) _setSelectedNode(null);
      model.removeNode(nodeId);
      renderAll();
    },
    onDeleteRelation(relId) {
      if (selectedRelKey === relId) _setSelectedRel(null);
      model.removeRelation(relId);
      renderAll();
    },
    onAddRelation(nodeId) {
      _startRelFrom(nodeId);
    }
  });

  // ─── Toolbar ────────────────────────────────────────────────────────────────

  document.getElementById('btn-add-node').addEventListener('click', () => {
    _setMode(MODE.ADD_NODE);
  });

  document.getElementById('btn-add-relation').addEventListener('click', () => {
    _startRelFrom(null);
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Clear all nodes and relations?')) {
      model.clear();
      _setSelectedNode(null);
      _setSelectedRel(null);
      renderAll();
    }
  });

  document.getElementById('btn-zoom-extents').addEventListener('click', _zoomExtents);

  // ─── Canvas background click ─────────────────────────────────────────────────
  // Node and relation handlers call stopPropagation(), so this only fires
  // when the user clicks empty SVG space.
  canvas.addEventListener('click', e => {
    if (_panMoved) { _panMoved = false; return; }
    if (mode === MODE.ADD_NODE) {
      const pt    = _svgPt(e);
      const label = prompt('Node label:', 'Node');
      if (label !== null) {
        model.addNode(label.trim() || 'Node', pt.x, pt.y);
        renderAll();
      }
      _setMode(MODE.NORMAL);
    } else {
      // Deselect everything
      _setSelectedNode(null);
      _setSelectedRel(null);
      renderAll();
    }
  });

  // ─── Canvas pan (mousedown on empty canvas) ─────────────────────────────────

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0 || dragNodeId !== null) return;
    isPanning     = true;
    _panMoved     = false;
    _panStartCX   = e.clientX;
    _panStartCY   = e.clientY;
    _panStartPanX = panX;
    _panStartPanY = panY;
  });

  // ─── Mousewheel zoom ─────────────────────────────────────────────────────────

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r      = canvas.getBoundingClientRect();
    const sx     = e.clientX - r.left;
    const sy     = e.clientY - r.top;
    const wx     = (sx - panX) / scale;
    const wy     = (sy - panY) / scale;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    scale = Math.max(0.1, Math.min(8, scale * factor));
    panX  = sx - wx * scale;
    panY  = sy - wy * scale;
    _applyTransform();
  }, { passive: false });

  // ─── Keyboard ───────────────────────────────────────────────────────────────

  canvas.addEventListener('keydown', e => {
    if (dialog.isOpen()) return;

    if (e.key === 'Escape') {
      _setMode(MODE.NORMAL);
      _setSelectedNode(null);
      _setSelectedRel(null);
      renderAll();
      e.preventDefault();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (typeof selectedRelKey === 'number') {
        // Individual relation selected — delete it
        model.removeRelation(selectedRelKey);
        _setSelectedRel(null);
        renderAll();
        e.preventDefault();
      } else if (typeof selectedRelKey === 'string' && selectedRelKey.startsWith('bundle:')) {
        // Bundle selected — cannot delete from canvas
        _setHint('Open a node\'s properties to delete individual relations in this bundle.');
        e.preventDefault();
      } else if (selectedNodeId !== null) {
        if (confirm('Delete this node and all its relations?')) {
          model.removeNode(selectedNodeId);
          _setSelectedNode(null);
          renderAll();
        }
        e.preventDefault();
      }
    }
  });

  // ─── Node interaction callbacks ─────────────────────────────────────────────

  function handleNodeClick(nodeId) {
    if (mode === MODE.ADD_REL_FROM) {
      _startRelFrom(nodeId);
      return;
    }
    if (mode === MODE.ADD_REL_TO) {
      if (nodeId === relFromNodeId) {
        _setHint('A node cannot relate to itself - click a different node.');
        return;
      }
      const type = prompt('Relation type:', lastRelType);
      if (type === null) { _setMode(MODE.NORMAL); return; }
      lastRelType = type.trim() || lastRelType;
      model.addRelation(relFromNodeId, nodeId, lastRelType);
      renderAll();
      _setMode(MODE.NORMAL);
      return;
    }
    // Normal: select node, deselect relation
    _setSelectedNode(nodeId);
    _setSelectedRel(null);
    renderAll();
  }

  function handleNodeDblClick(nodeId) {
    _setMode(MODE.NORMAL);          // cancel any ongoing mode
    _setSelectedNode(nodeId);
    _setSelectedRel(null);
    renderAll();
    dialog.open(nodeId);
  }

  function handleNodeDragStart(nodeId, e) {
    if (mode !== MODE.NORMAL) return;
    dragNodeId = nodeId;
    const pt   = _svgPt(e);
    const node = model.getNode(nodeId);
    dragOffX   = pt.x - node.x;
    dragOffY   = pt.y - node.y;
  }

  // ─── Relation interaction callbacks ─────────────────────────────────────────

  function handleRelClick(relId, bundleKey) {
    if (mode !== MODE.NORMAL) return;
    _setSelectedNode(null);
    if (bundleKey !== null) {
      _setSelectedRel('bundle:' + bundleKey);
      _setHint('Bundle selected - use a node properties dialog to delete individual relations.');
    } else {
      _setSelectedRel(relId);
      _setHint('Relation selected — press Delete or Backspace to remove it.');
    }
    renderAll();
  }

  // ─── Drag and pan (document-level) ──────────────────────────────────────────

  document.addEventListener('mousemove', e => {
    if (dragNodeId !== null) {
      const pt = _svgPt(e);
      model.updateNode(dragNodeId, { x: pt.x - dragOffX, y: pt.y - dragOffY });
      renderAll();
      return;
    }
    if (isPanning) {
      const dx = e.clientX - _panStartCX;
      const dy = e.clientY - _panStartCY;
      if (!_panMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        _panMoved = true;
        canvas.style.cursor = 'grabbing';
      }
      if (_panMoved) {
        panX = _panStartPanX + dx;
        panY = _panStartPanY + dy;
        _applyTransform();
      }
    }
  });

  document.addEventListener('mouseup', () => {
    dragNodeId = null;
    isPanning  = false;
    canvas.style.cursor = '';
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function _startRelFrom(nodeId) {
    if (nodeId !== null) {
      relFromNodeId = nodeId;
      _setMode(MODE.ADD_REL_TO);
    } else {
      relFromNodeId = null;
      _setMode(MODE.ADD_REL_FROM);
    }
  }

  function _setMode(newMode) {
    mode = newMode;
    canvas.setAttribute('class', '');
    switch (newMode) {
      case MODE.ADD_NODE:
        canvas.classList.add('mode-add-node');
        _setHint('Click on the canvas to place a new node.');
        break;
      case MODE.ADD_REL_FROM:
        canvas.classList.add('mode-add-relation');
        _setHint('Click the SOURCE node for the new relation.');
        break;
      case MODE.ADD_REL_TO:
        canvas.classList.add('mode-add-relation');
        _setHint('Click the TARGET node for the new relation.');
        break;
      default:
        _setHint('');
    }
  }

  function _setSelectedNode(id) {
    selectedNodeId = id;
    renderer.setSelectedNode(id);
  }

  function _setSelectedRel(key) {
    selectedRelKey = key;
    renderer.setSelectedRel(key);
  }

  function _setHint(text) {
    hint.textContent = text;
  }

  function _svgPt(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - panX) / scale,
      y: (e.clientY - r.top  - panY) / scale
    };
  }

  function _applyTransform() {
    _viewport.setAttribute('transform', `translate(${panX},${panY}) scale(${scale})`);
    const DOT_SPACING = 28;   // must match background-size in style.css
    const dotSize = DOT_SPACING * scale;
    const bgX = ((panX % dotSize) + dotSize) % dotSize;
    const bgY = ((panY % dotSize) + dotSize) % dotSize;
    canvas.style.backgroundSize     = `${dotSize}px ${dotSize}px`;
    canvas.style.backgroundPosition = `${bgX}px ${bgY}px`;
  }

  function _zoomExtents() {
    const ZOOM_EXTENTS_PADDING = 60;
    const nodes = model.nodes;
    if (nodes.length === 0) return;
    const hw = renderer.NODE_W / 2;
    const hh = renderer.NODE_H / 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - hw);
      minY = Math.min(minY, n.y - hh);
      maxX = Math.max(maxX, n.x + hw);
      maxY = Math.max(maxY, n.y + hh);
    }
    minX -= ZOOM_EXTENTS_PADDING; minY -= ZOOM_EXTENTS_PADDING;
    maxX += ZOOM_EXTENTS_PADDING; maxY += ZOOM_EXTENTS_PADDING;
    const r = canvas.getBoundingClientRect();
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    scale = Math.min(r.width / contentW, r.height / contentH, 2);
    panX  = (r.width  - contentW * scale) / 2 - minX * scale;
    panY  = (r.height - contentH * scale) / 2 - minY * scale;
    _applyTransform();
  }

  function renderAll() {
    renderer.render(model.nodes, model.getRelationGroups());
    emptyState.classList.toggle('hidden', model.nodes.length > 0);
  }

  // Initial render
  renderAll();
})();
