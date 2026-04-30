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

  // Drag state
  let dragNodeId = null;
  let dragOffX   = 0;
  let dragOffY   = 0;

  const canvas     = document.getElementById('canvas');
  const emptyState = document.getElementById('empty-state');
  const hint       = document.getElementById('status-hint');

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

  // ─── Canvas background click ─────────────────────────────────────────────────
  // Node and relation handlers call stopPropagation(), so this only fires
  // when the user clicks empty SVG space.
  canvas.addEventListener('click', e => {
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

  // ─── Drag (document-level) ───────────────────────────────────────────────────

  document.addEventListener('mousemove', e => {
    if (dragNodeId === null) return;
    const pt = _svgPt(e);
    model.updateNode(dragNodeId, { x: pt.x - dragOffX, y: pt.y - dragOffY });
    renderAll();
  });

  document.addEventListener('mouseup', () => { dragNodeId = null; });

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
    canvas.className = '';
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
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function renderAll() {
    renderer.render(model.nodes, model.getRelationGroups());
    emptyState.classList.toggle('hidden', model.nodes.length > 0);
  }

  // Initial render
  renderAll();
})();
