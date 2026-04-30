// model.js - Data model for BrainMap

const model = (() => {
  'use strict';

  let _nodes = [];
  let _relations = [];
  let _nextNodeId = 1;
  let _nextRelId = 1;

  function addNode(label, x, y) {
    const node = { id: _nextNodeId++, label: label || 'Node', x, y };
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
    // Remove all relations involving this node
    for (let i = _relations.length - 1; i >= 0; i--) {
      if (_relations[i].fromId === id || _relations[i].toId === id) {
        _relations.splice(i, 1);
      }
    }
    _persist();
  }

  function getNode(id) {
    return _nodes.find(n => n.id === id);
  }

  function addRelation(fromId, toId, type) {
    const rel = { id: _nextRelId++, fromId, toId, type: type || 'related-to' };
    _relations.push(rel);
    _persist();
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

  function clear() {
    _nodes.length = 0;
    _relations.length = 0;
    _nextNodeId = 1;
    _nextRelId = 1;
    _persist();
  }

  function _persist() {
    try {
      localStorage.setItem('brainmap_data', JSON.stringify({
        nodes: _nodes,
        relations: _relations,
        nextNodeId: _nextNodeId,
        nextRelId: _nextRelId
      }));
    } catch (e) { /* quota or security error — ignore */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem('brainmap_data');
      if (!raw) return;
      const data = JSON.parse(raw);
      _nodes.length = 0;
      _relations.length = 0;
      (data.nodes || []).forEach(n => _nodes.push(n));
      (data.relations || []).forEach(r => _relations.push(r));
      _nextNodeId = data.nextNodeId || 1;
      _nextRelId  = data.nextRelId  || 1;
    } catch (e) { /* corrupt data — start fresh */ }
  }

  return {
    get nodes()     { return _nodes; },
    get relations() { return _relations; },
    addNode, updateNode, removeNode, getNode,
    addRelation, removeRelation, getRelationsForNode, getRelationGroups,
    clear, load
  };
})();
