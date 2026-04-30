// dialog.js - Node properties modal

const dialog = (() => {
  'use strict';

  let _currentNodeId = null;
  let _model         = null;   // reference to the model module
  let _callbacks     = {};

  // ─── Public ────────────────────────────────────────────────────────────────

  function init(modelRef, callbacks) {
    _model     = modelRef;
    _callbacks = callbacks || {};

    document.getElementById('dialog-close')
      .addEventListener('click', close);

    document.getElementById('dialog-overlay')
      .addEventListener('click', e => { if (e.target.id === 'dialog-overlay') close(); });

    document.getElementById('dialog-save')
      .addEventListener('click', _save);

    document.getElementById('dialog-delete-node')
      .addEventListener('click', _deleteNode);

    document.getElementById('btn-dialog-add-rel')
      .addEventListener('click', () => {
        const nodeId = _currentNodeId;
        close();
        _callbacks.onAddRelation && _callbacks.onAddRelation(nodeId);
      });
  }

  function open(nodeId) {
    _currentNodeId = nodeId;
    const node = _model.getNode(nodeId);
    if (!node) return;
    document.getElementById('node-label-input').value = node.label;
    _renderRelations();
    document.getElementById('dialog-overlay').classList.remove('hidden');
    document.getElementById('node-label-input').focus();
    document.getElementById('node-label-input').select();
  }

  function close() {
    document.getElementById('dialog-overlay').classList.add('hidden');
    _currentNodeId = null;
  }

  function isOpen() {
    return !document.getElementById('dialog-overlay').classList.contains('hidden');
  }

  function getCurrentNodeId() { return _currentNodeId; }

  // ─── Private ───────────────────────────────────────────────────────────────

  function _renderRelations() {
    const tbody = document.getElementById('relations-tbody');
    tbody.innerHTML = '';

    const nodeId = _currentNodeId;
    const rels   = _model.relations.filter(r => r.fromId === nodeId || r.toId === nodeId);

    if (rels.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No relations yet.';
      td.className = 'no-relations';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const rel of rels) {
      const otherNodeId = rel.fromId === nodeId ? rel.toId : rel.fromId;
      const otherNode   = _model.getNode(otherNodeId);
      const dir         = rel.fromId === nodeId ? '→' : '←';
      const dirTitle    = rel.fromId === nodeId ? 'outgoing' : 'incoming';

      const tr = document.createElement('tr');

      const tdDir = document.createElement('td');
      tdDir.textContent = dir;
      tdDir.title = dirTitle;
      tdDir.className = 'rel-dir';

      const tdType = document.createElement('td');
      tdType.textContent = rel.type;

      const tdNode = document.createElement('td');
      tdNode.textContent = otherNode ? otherNode.label : `[deleted – id ${otherNodeId}]`;

      const tdAct = document.createElement('td');
      const btn   = document.createElement('button');
      btn.className = 'btn-delete-rel';
      btn.textContent = '🗑';
      btn.title = `Delete relation "${rel.type}"`;
      btn.addEventListener('click', () => {
        if (confirm(`Delete relation "${rel.type}" (${dirTitle} ${otherNode ? otherNode.label : ''})?`)) {
          _callbacks.onDeleteRelation && _callbacks.onDeleteRelation(rel.id);
          // Re-render the relations table in-place (model was already mutated)
          _renderRelations();
        }
      });
      tdAct.appendChild(btn);

      tr.appendChild(tdDir);
      tr.appendChild(tdType);
      tr.appendChild(tdNode);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }
  }

  function _save() {
    const label = document.getElementById('node-label-input').value.trim();
    if (label) {
      _callbacks.onSave && _callbacks.onSave(_currentNodeId, { label });
    }
    close();
  }

  function _deleteNode() {
    if (confirm('Delete this node and all its relations?')) {
      const id = _currentNodeId;
      close();
      _callbacks.onDeleteNode && _callbacks.onDeleteNode(id);
    }
  }

  return { init, open, close, isOpen, getCurrentNodeId };
})();
