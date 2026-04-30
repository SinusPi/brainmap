// model.js - Data model for BrainMap

const model = (() => {
  'use strict';

  let _nodes = [];
  let _relations = [];
  let _views = [];
  let _nextNodeId = 1;
  let _nextRelId  = 1;
  let _nextViewId = 1;
  let _nextQnId   = 1;

  // ─── Nodes ──────────────────────────────────────────────────────────────────

  function addNode(label, x, y, fields) {
    const node = { id: _nextNodeId++, label: label || 'Node', x, y, fields: fields || {} };
    _nodes.push(node);
    _persist();
    return node;
  }

  function updateNode(id, changes) {
    const node = _nodes.find(n => n.id === id);
    if (node) {
      Object.assign(node, changes);
      _persist();
    }
    return node;
  }

  function removeNode(id) {
    const idx = _nodes.findIndex(n => n.id === id);
    if (idx !== -1) _nodes.splice(idx, 1);
    for (let i = _relations.length - 1; i >= 0; i--) {
      if (_relations[i].fromId === id || _relations[i].toId === id)
        _relations.splice(i, 1);
    }
    for (const view of _views) {
      const ni = view.nodeIds.indexOf(id);
      if (ni !== -1) view.nodeIds.splice(ni, 1);
      delete view.nodePositions[id];
    }
    _persist();
  }

  function getNode(id) { return _nodes.find(n => n.id === id); }

  // ─── Relations ──────────────────────────────────────────────────────────────

  // directional defaults to true (arrow); false = plain bidirectional line
  function addRelation(fromId, toId, type, directional) {
    const rel = {
      id: _nextRelId++,
      fromId,
      toId,
      type: type || 'related-to',
      directional: directional !== false
    };
    _relations.push(rel);
    _persist();
    return rel;
  }

  function updateRelation(id, changes) {
    const rel = _relations.find(r => r.id === id);
    if (rel) { Object.assign(rel, changes); _persist(); }
    return rel;
  }

  function removeRelation(id) {
    const idx = _relations.findIndex(r => r.id === id);
    if (idx !== -1) _relations.splice(idx, 1);
    _persist();
  }

  function getRelationsForNode(nodeId) {
    return _relations.filter(r => r.fromId === nodeId || r.toId === nodeId);
  }

  // Group relations by unordered node pair, key = "minId_maxId"
  function getRelationGroups() {
    const groups = new Map();
    for (const rel of _relations) {
      const key = Math.min(rel.fromId, rel.toId) + '_' + Math.max(rel.fromId, rel.toId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(rel);
    }
    return groups;
  }

  // ─── Views ──────────────────────────────────────────────────────────────────

  function addView(name) {
    const view = {
      id: _nextViewId++,
      name: name || 'View',
      nodeIds: [],
      nodePositions: {},  // nodeId → {x, y}
      queryNodes: []      // [{id, label, query:{field:value,...}, x, y}]
    };
    _views.push(view);
    _persist();
    return view;
  }

  function updateView(viewId, changes) {
    const view = _views.find(v => v.id === viewId);
    if (view) { Object.assign(view, changes); _persist(); }
    return view;
  }

  function removeView(viewId) {
    const idx = _views.findIndex(v => v.id === viewId);
    if (idx !== -1) _views.splice(idx, 1);
    _persist();
  }

  function getView(viewId) { return _views.find(v => v.id === viewId); }

  function addNodeToView(viewId, nodeId, x, y) {
    const view = _views.find(v => v.id === viewId);
    if (!view) return;
    if (!view.nodeIds.includes(nodeId)) view.nodeIds.push(nodeId);
    view.nodePositions[nodeId] = { x: x != null ? x : 100, y: y != null ? y : 100 };
    _persist();
  }

  function removeNodeFromView(viewId, nodeId) {
    const view = _views.find(v => v.id === viewId);
    if (!view) return;
    const ni = view.nodeIds.indexOf(nodeId);
    if (ni !== -1) view.nodeIds.splice(ni, 1);
    delete view.nodePositions[nodeId];
    _persist();
  }

  function setViewNodePosition(viewId, nodeId, x, y) {
    const view = _views.find(v => v.id === viewId);
    if (!view) return;
    view.nodePositions[nodeId] = { x, y };
    _persist();
  }

  // ─── Query Nodes ────────────────────────────────────────────────────────────

  function addQueryNode(viewId, label, query, x, y) {
    const view = _views.find(v => v.id === viewId);
    if (!view) return null;
    const qn = { id: _nextQnId++, label: label || 'Query', query: query || {}, x: x || 200, y: y || 200 };
    view.queryNodes.push(qn);
    _persist();
    return qn;
  }

  function updateQueryNode(viewId, qnId, changes) {
    const view = _views.find(v => v.id === viewId);
    if (!view) return;
    const qn = view.queryNodes.find(q => q.id === qnId);
    if (qn) { Object.assign(qn, changes); _persist(); }
    return qn;
  }

  function removeQueryNode(viewId, qnId) {
    const view = _views.find(v => v.id === viewId);
    if (!view) return;
    const idx = view.queryNodes.findIndex(q => q.id === qnId);
    if (idx !== -1) view.queryNodes.splice(idx, 1);
    _persist();
  }

  // Returns nodes visible in the view, with view-specific positions.
  // Includes explicitly added nodes + query-matched nodes.
  function getViewNodes(viewId) {
    const view = _views.find(v => v.id === viewId);
    if (!view) return [];
    const result = new Map(); // nodeId → {node, x, y}

    for (const nodeId of view.nodeIds) {
      const node = _nodes.find(n => n.id === nodeId);
      if (!node) continue;
      const pos = view.nodePositions[nodeId] || { x: 100, y: 100 };
      result.set(nodeId, { node, x: pos.x, y: pos.y });
    }

    for (const qn of view.queryNodes) {
      const matches   = _nodes.filter(n => _matchesQuery(n, qn.query));
      const radius    = 160;
      const angleStep = matches.length > 0 ? (2 * Math.PI / matches.length) : 0;
      matches.forEach((n, i) => {
        if (!result.has(n.id)) {
          const saved = view.nodePositions[n.id];
          const x = saved ? saved.x : qn.x + radius * Math.cos(i * angleStep - Math.PI / 2);
          const y = saved ? saved.y : qn.y + radius * Math.sin(i * angleStep - Math.PI / 2);
          result.set(n.id, { node: n, x, y });
        }
      });
    }

    return Array.from(result.values());
  }

  function _matchesQuery(node, query) {
    if (!query || Object.keys(query).length === 0) return false;
    for (const [k, v] of Object.entries(query)) {
      const target = String(v).toLowerCase();
      if (k === 'label') {
        if (!node.label.toLowerCase().includes(target)) return false;
      } else {
        const fieldVal = String((node.fields && node.fields[k]) || '').toLowerCase();
        if (fieldVal !== target) return false;
      }
    }
    return true;
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  function clear() {
    _nodes.length = 0;
    _relations.length = 0;
    _views.length = 0;
    _nextNodeId = 1;
    _nextRelId  = 1;
    _nextViewId = 1;
    _nextQnId   = 1;
    _persist();
  }

  function _persist() {
    try {
      localStorage.setItem('brainmap_data', JSON.stringify({
        nodes: _nodes, relations: _relations, views: _views,
        nextNodeId: _nextNodeId, nextRelId: _nextRelId,
        nextViewId: _nextViewId, nextQnId: _nextQnId
      }));
    } catch (e) { /* quota or security error */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem('brainmap_data');
      if (!raw) return;
      const data = JSON.parse(raw);
      _nodes.length = 0; _relations.length = 0; _views.length = 0;
      (data.nodes     || []).forEach(n => _nodes.push(n));
      (data.relations || []).forEach(r => _relations.push(r));
      (data.views     || []).forEach(v => _views.push(v));
      _nextNodeId = data.nextNodeId || 1;
      _nextRelId  = data.nextRelId  || 1;
      _nextViewId = data.nextViewId || 1;
      _nextQnId   = data.nextQnId   || 1;
    } catch (e) { /* corrupt data — start fresh */ }
  }

  return {
    get nodes()     { return _nodes; },
    get relations() { return _relations; },
    get views()     { return _views; },
    addNode, updateNode, removeNode, getNode,
    addRelation, updateRelation, removeRelation, getRelationsForNode, getRelationGroups,
    addView, updateView, removeView, getView,
    addNodeToView, removeNodeFromView, setViewNodePosition,
    addQueryNode, updateQueryNode, removeQueryNode, getViewNodes,
    clear, load
  };
})();
