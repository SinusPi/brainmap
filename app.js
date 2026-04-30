// app.js - Main application controller

(function () {
  'use strict';

  // ─── Mode constants ─────────────────────────────────────────────────────────
  const MODE = {
    NORMAL:       'normal',
    ADD_NODE:     'add-node',
    ADD_REL_FROM: 'add-rel-from',
    ADD_REL_TO:   'add-rel-to'
  };

  // ─── State ──────────────────────────────────────────────────────────────────
  let mode            = MODE.NORMAL;
  let selectedNodeIds = new Set();
  let selectedRelKey  = null;
  let relFromNodeId   = null;
  let lastRelType     = 'related-to';
  let activeViewId    = null;   // null = main desktop

  // Drag: { offsets: Map<nodeId, {dx,dy}> }
  let dragState    = null;
  // Pan: { startCX, startCY, startPX, startPY }
  let panState     = null;
  // Rubber-band selection: { startX, startY, curX?, curY? } (world coords)
  let selRectState = null;
  // Query-node drag: { qnId, offX, offY }
  let qnDragState  = null;

  // Is the Space key held?
  let spaceDown = false;

  const canvas     = document.getElementById('canvas');
  const emptyState = document.getElementById('empty-state');
  const hint       = document.getElementById('status-hint');

  // ─── Boot ───────────────────────────────────────────────────────────────────

  model.load();

  renderer.init(canvas, {
    onNodeClick:          handleNodeClick,
    onNodeDblClick:       handleNodeDblClick,
    onNodeDragStart:      handleNodeDragStart,
    onRelClick:           handleRelClick,
    onQueryNodeDblClick:  handleQueryNodeDblClick,
    onQueryNodeDragStart: handleQueryNodeDragStart
  });

  dialog.init(model, {
    onSave(nodeId, changes) {
      model.updateNode(nodeId, changes);
      renderAll();
    },
    onDeleteNode(nodeId) {
      const msg = activeViewId !== null
        ? 'Remove this node from the current view?\n(Node is NOT deleted from the main desktop.)'
        : 'Delete this node and all its relations?';
      if (!confirm(msg)) return;
      if (activeViewId !== null) {
        model.removeNodeFromView(activeViewId, nodeId);
      } else {
        selectedNodeIds.delete(nodeId);
        renderer.setSelectedNodes(selectedNodeIds);
        model.removeNode(nodeId);
      }
      renderAll();
    },
    onDeleteRelation(relId) {
      if (selectedRelKey === relId) _setSelectedRel(null);
      model.removeRelation(relId);
      renderAll();
    },
    onUpdateRelation(relId, changes) {
      model.updateRelation(relId, changes);
      renderAll();
    },
    onAddRelation(nodeId) {
      _startRelFrom(nodeId);
    }
  });

  viewsModule.init(model, {
    getActiveViewId:    () => activeViewId,
    getSelectedNodeIds: () => selectedNodeIds,
    onViewChange(viewId) {
      activeViewId = viewId;
      _setSelectedNodes(new Set());
      _setSelectedRel(null);
      renderAll();
    },
    onRender() { renderAll(); }
  });

  // ─── Toolbar ────────────────────────────────────────────────────────────────

  document.getElementById('btn-add-node').addEventListener('click', () => {
    _setMode(MODE.ADD_NODE);
  });

  document.getElementById('btn-add-relation').addEventListener('click', () => {
    _startRelFrom(null);
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    const msg = activeViewId !== null
      ? 'Remove all nodes and query nodes from this view?\n(Nodes are NOT deleted from the main desktop.)'
      : 'Clear ALL nodes and relations?';
    if (confirm(msg)) {
      if (activeViewId !== null) {
        const view = model.getView(activeViewId);
        if (view) {
          [...view.nodeIds].forEach(id => model.removeNodeFromView(activeViewId, id));
          view.queryNodes.length = 0;
          model.updateView(activeViewId, {});
        }
      } else {
        model.clear();
      }
      _setSelectedNodes(new Set());
      _setSelectedRel(null);
      renderAll();
    }
  });

  // ─── Space key (pan mode toggle) ────────────────────────────────────────────

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !dialog.isOpen() && !e.repeat) {
      spaceDown = true;
      if (mode === MODE.NORMAL) canvas.classList.add('mode-pan');
      e.preventDefault();
    }
  });

  document.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      spaceDown = false;
      if (mode === MODE.NORMAL) canvas.classList.remove('mode-pan');
      panState = null;
    }
  });

  // ─── Pan (capture phase so it fires before node drag handlers) ──────────────

  document.addEventListener('mousedown', e => {
    // Middle-click always pans; left-click + space pans only in NORMAL mode
    if (e.button === 1 || (e.button === 0 && spaceDown && mode === MODE.NORMAL)) {
      const p = renderer.getPan();
      panState = { startCX: e.clientX, startCY: e.clientY, startPX: p.x, startPY: p.y };
      e.preventDefault();
    }
  }, true); // capture = fires before node mousedown stops propagation

  // ─── Canvas mousedown → start rubber-band selection ─────────────────────────
  // Fires only on empty canvas (nodes call stopPropagation on mousedown)

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0 || panState || mode !== MODE.NORMAL || spaceDown) return;
    const pt = renderer.clientToWorld(e.clientX, e.clientY);
    selRectState = { startX: pt.x, startY: pt.y };
  });

  // ─── Canvas click → place node or deselect ──────────────────────────────────

  canvas.addEventListener('click', e => {
    if (mode === MODE.ADD_NODE) {
      const pt    = renderer.clientToWorld(e.clientX, e.clientY);
      const label = prompt('Node label:', 'Node');
      if (label !== null) {
        const node = model.addNode(label.trim() || 'Node', pt.x, pt.y);
        if (activeViewId !== null) {
          model.addNodeToView(activeViewId, node.id, pt.x, pt.y);
        }
        renderAll();
      }
      _setMode(MODE.NORMAL);
    } else {
      _setSelectedNodes(new Set());
      _setSelectedRel(null);
      renderAll();
    }
  });

  // ─── Document mousemove ─────────────────────────────────────────────────────

  document.addEventListener('mousemove', e => {
    if (panState) {
      renderer.setPan(
        panState.startPX + (e.clientX - panState.startCX),
        panState.startPY + (e.clientY - panState.startCY)
      );
      return;
    }

    if (dragState) {
      const pt = renderer.clientToWorld(e.clientX, e.clientY);
      for (const [nodeId, off] of dragState.offsets) {
        const nx = pt.x - off.dx;
        const ny = pt.y - off.dy;
        if (activeViewId !== null) {
          model.setViewNodePosition(activeViewId, nodeId, nx, ny);
        } else {
          model.updateNode(nodeId, { x: nx, y: ny });
        }
      }
      renderAll();
      return;
    }

    if (qnDragState) {
      const pt = renderer.clientToWorld(e.clientX, e.clientY);
      if (activeViewId !== null) {
        model.updateQueryNode(activeViewId, qnDragState.qnId, {
          x: pt.x - qnDragState.offX,
          y: pt.y - qnDragState.offY
        });
        renderAll();
      }
      return;
    }

    if (selRectState) {
      const pt = renderer.clientToWorld(e.clientX, e.clientY);
      selRectState.curX = pt.x;
      selRectState.curY = pt.y;
      renderer.showSelectionRect(selRectState.startX, selRectState.startY, pt.x, pt.y);
    }
  });

  // ─── Document mouseup ───────────────────────────────────────────────────────

  document.addEventListener('mouseup', () => {
    panState    = null;
    dragState   = null;
    qnDragState = null;

    if (selRectState && selRectState.curX !== undefined) {
      const x1 = Math.min(selRectState.startX, selRectState.curX);
      const y1 = Math.min(selRectState.startY, selRectState.curY);
      const x2 = Math.max(selRectState.startX, selRectState.curX);
      const y2 = Math.max(selRectState.startY, selRectState.curY);

      // Only commit if the rect is non-trivial
      if (x2 - x1 > 4 || y2 - y1 > 4) {
        const newSel = new Set();
        for (const n of _getVisibleNodes()) {
          if (n.x >= x1 && n.x <= x2 && n.y >= y1 && n.y <= y2) newSel.add(n.id);
        }
        _setSelectedNodes(newSel);
        renderAll();
      }
      renderer.hideSelectionRect();
    }
    selRectState = null;
  });

  // ─── Keyboard ───────────────────────────────────────────────────────────────

  canvas.addEventListener('keydown', e => {
    if (dialog.isOpen()) return;

    if (e.key === 'Escape') {
      _setMode(MODE.NORMAL);
      _setSelectedNodes(new Set());
      _setSelectedRel(null);
      renderAll();
      e.preventDefault();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (typeof selectedRelKey === 'number') {
        model.removeRelation(selectedRelKey);
        _setSelectedRel(null);
        renderAll();
        e.preventDefault();
      } else if (typeof selectedRelKey === 'string' && selectedRelKey.startsWith('bundle:')) {
        _setHint('Open a node\u2019s properties to delete individual relations in this bundle.');
        e.preventDefault();
      } else if (selectedNodeIds.size > 0) {
        const count = selectedNodeIds.size;
        const msg   = activeViewId !== null
          ? `Remove ${count} node(s) from this view?`
          : `Delete ${count} node(s) and all their relations?`;
        if (confirm(msg)) {
          for (const id of selectedNodeIds) {
            if (activeViewId !== null) {
              model.removeNodeFromView(activeViewId, id);
            } else {
              model.removeNode(id);
            }
          }
          _setSelectedNodes(new Set());
          renderAll();
        }
        e.preventDefault();
      }
    }

    // Ctrl/Cmd+A: select all visible nodes
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      _setSelectedNodes(new Set(_getVisibleNodes().map(n => n.id)));
      renderAll();
      e.preventDefault();
    }
  });

  // ─── Node interaction callbacks ─────────────────────────────────────────────

  function handleNodeClick(nodeId, e) {
    if (mode === MODE.ADD_REL_FROM) {
      _startRelFrom(nodeId);
      return;
    }
    if (mode === MODE.ADD_REL_TO) {
      if (nodeId === relFromNodeId) {
        _setHint('A node cannot relate to itself \u2014 click a different node.');
        return;
      }
      const type  = prompt('Relation type:', lastRelType);
      if (type === null) { _setMode(MODE.NORMAL); return; }
      const isDir = confirm('Directional relation (click OK for \u2192 arrow, Cancel for \u2194 line)?');
      lastRelType = type.trim() || lastRelType;
      model.addRelation(relFromNodeId, nodeId, lastRelType, isDir);
      renderAll();
      _setMode(MODE.NORMAL);
      return;
    }
    // Normal mode: select / toggle
    if (e && e.shiftKey) {
      const newSel = new Set(selectedNodeIds);
      if (newSel.has(nodeId)) newSel.delete(nodeId);
      else                    newSel.add(nodeId);
      _setSelectedNodes(newSel);
    } else {
      _setSelectedNodes(new Set([nodeId]));
    }
    _setSelectedRel(null);
    renderAll();
  }

  function handleNodeDblClick(nodeId) {
    _setMode(MODE.NORMAL);
    _setSelectedNodes(new Set([nodeId]));
    _setSelectedRel(null);
    renderAll();

    // Update delete button label to reflect current context
    const deleteBtn = document.getElementById('dialog-delete-node');
    if (activeViewId !== null) {
      deleteBtn.textContent = 'Remove from View';
      deleteBtn.title       = 'Remove this node from the current view (node still exists on main desktop)';
    } else {
      deleteBtn.textContent = 'Delete Node';
      deleteBtn.title       = 'Delete this node and all its relations permanently';
    }

    dialog.open(nodeId);
  }

  function handleNodeDragStart(nodeId, e) {
    if (panState || mode !== MODE.NORMAL) return;

    // Drag the whole selection if the node is already selected; otherwise select just it
    let dragIds;
    if (selectedNodeIds.has(nodeId)) {
      dragIds = new Set(selectedNodeIds);
    } else {
      dragIds = new Set([nodeId]);
      _setSelectedNodes(dragIds);
    }

    const pt      = renderer.clientToWorld(e.clientX, e.clientY);
    const offsets = new Map();
    for (const id of dragIds) {
      const pos = _getNodePos(id);
      if (pos) offsets.set(id, { dx: pt.x - pos.x, dy: pt.y - pos.y });
    }
    dragState = { offsets };
    renderAll();
  }

  function handleQueryNodeDblClick(qnId) {
    if (activeViewId !== null) viewsModule.openQueryDialog(qnId, activeViewId);
  }

  function handleQueryNodeDragStart(qnId, e) {
    if (panState || activeViewId === null) return;
    const view = model.getView(activeViewId);
    if (!view) return;
    const qn = view.queryNodes.find(q => q.id === qnId);
    if (!qn) return;
    const pt = renderer.clientToWorld(e.clientX, e.clientY);
    qnDragState = { qnId, offX: pt.x - qn.x, offY: pt.y - qn.y };
  }

  // ─── Relation interaction callbacks ─────────────────────────────────────────

  function handleRelClick(relId, bundleKey) {
    if (mode !== MODE.NORMAL) return;
    _setSelectedNodes(new Set());
    if (bundleKey !== null) {
      _setSelectedRel('bundle:' + bundleKey);
      _setHint('Bundle selected \u2014 use a node properties dialog to delete individual relations.');
    } else {
      _setSelectedRel(relId);
      _setHint('Relation selected \u2014 press Delete/Backspace to remove.');
    }
    renderAll();
  }

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
        _setHint('Click the canvas to place a new node.');
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
        if (spaceDown) canvas.classList.add('mode-pan');
        _setHint('');
    }
  }

  function _setSelectedNodes(idSet) {
    selectedNodeIds = idSet instanceof Set ? idSet : new Set();
    renderer.setSelectedNodes(selectedNodeIds);
    if (selectedNodeIds.size > 1 && mode === MODE.NORMAL) {
      _setHint(`${selectedNodeIds.size} nodes selected \u2014 drag to move, Delete to remove.`);
    }
  }

  function _setSelectedRel(key) {
    selectedRelKey = key;
    renderer.setSelectedRel(key);
  }

  function _setHint(text) { hint.textContent = text; }

  // Get the current canvas position of a node (view-specific or main)
  function _getNodePos(nodeId) {
    if (activeViewId !== null) {
      const view = model.getView(activeViewId);
      if (view) {
        const pos = view.nodePositions[nodeId];
        if (pos) return pos;
        const vn = model.getViewNodes(activeViewId).find(x => x.node.id === nodeId);
        if (vn) return { x: vn.x, y: vn.y };
      }
    }
    return model.getNode(nodeId);
  }

  function _getVisibleNodes() {
    if (activeViewId !== null) {
      return model.getViewNodes(activeViewId).map(({ node, x, y }) => ({ ...node, x, y }));
    }
    return model.nodes;
  }

  function renderAll() {
    const nodes = _getVisibleNodes();

    let relGroups;
    if (activeViewId !== null) {
      const visIds = new Set(nodes.map(n => n.id));
      relGroups = new Map();
      for (const [key, rels] of model.getRelationGroups()) {
        const [a, b] = key.split('_').map(Number);
        if (visIds.has(a) && visIds.has(b)) relGroups.set(key, rels);
      }
    } else {
      relGroups = model.getRelationGroups();
    }

    let qns = [];
    if (activeViewId !== null) {
      const view = model.getView(activeViewId);
      if (view) qns = view.queryNodes;
    }

    renderer.render(nodes, relGroups, qns);

    const isEmpty = nodes.length === 0 && qns.length === 0;
    emptyState.classList.toggle('hidden', !isEmpty);

    // Update empty-state message based on context
    if (isEmpty) {
      const p = emptyState.querySelector('p');
      if (p) {
        if (activeViewId !== null) {
          p.innerHTML = 'Click <strong>+ Add Nodes</strong> to populate this view,<br>'
            + 'or <strong>+ Query Node</strong> to auto-match nodes by field.';
        } else {
          p.innerHTML = 'Click <strong>+ Node</strong> to add your first node,<br>'
            + 'then <strong>+ Relation</strong> to connect nodes.';
        }
      }
    }

    viewsModule.update();
  }

  // Initial render
  renderAll();
})();
