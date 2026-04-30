// dialog.js - Node properties modal

const dialog = (() => {
  'use strict';

  let _currentNodeId = null;
  let _model         = null;
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

    document.getElementById('btn-add-field')
      .addEventListener('click', () => _addFieldRow('', ''));
  }

  function open(nodeId) {
    _currentNodeId = nodeId;
    const node = _model.getNode(nodeId);
    if (!node) return;
    document.getElementById('node-label-input').value = node.label;
    _renderFields(node);
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

  // ─── Fields ────────────────────────────────────────────────────────────────

  function _renderFields(node) {
    const tbody  = document.getElementById('fields-tbody');
    tbody.innerHTML = '';
    for (const [k, v] of Object.entries(node.fields || {})) {
      _addFieldRow(k, v);
    }
  }

  function _addFieldRow(key, value) {
    const tbody = document.getElementById('fields-tbody');
    const tr    = document.createElement('tr');

    const tdKey = document.createElement('td');
    const keyIn = document.createElement('input');
    keyIn.type        = 'text';
    keyIn.className   = 'field-key-input';
    keyIn.value       = key;
    keyIn.placeholder = 'field name';
    tdKey.appendChild(keyIn);

    const tdVal = document.createElement('td');
    const valIn = document.createElement('input');
    valIn.type        = 'text';
    valIn.className   = 'field-val-input';
    valIn.value       = value;
    valIn.placeholder = 'value';
    tdVal.appendChild(valIn);

    const tdAct = document.createElement('td');
    const btn   = document.createElement('button');
    btn.className   = 'btn-delete-rel';
    btn.textContent = '\uD83D\uDDD1';
    btn.title       = 'Remove field';
    btn.addEventListener('click', () => tr.remove());
    tdAct.appendChild(btn);

    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  }

  function _collectFields() {
    const fields = {};
    for (const tr of document.querySelectorAll('#fields-tbody tr')) {
      const k = tr.querySelector('.field-key-input').value.trim();
      const v = tr.querySelector('.field-val-input').value.trim();
      if (k) fields[k] = v;
    }
    return fields;
  }

  // ─── Relations ─────────────────────────────────────────────────────────────

  function _renderRelations() {
    const tbody  = document.getElementById('relations-tbody');
    tbody.innerHTML = '';
    const nodeId = _currentNodeId;
    const rels   = _model.relations.filter(r => r.fromId === nodeId || r.toId === nodeId);

    if (rels.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan     = 5;
      td.textContent = 'No relations yet.';
      td.className   = 'no-relations';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const rel of rels) {
      const otherNodeId = rel.fromId === nodeId ? rel.toId : rel.fromId;
      const otherNode   = _model.getNode(otherNodeId);
      const dir         = rel.fromId === nodeId ? '\u2192' : '\u2190';
      const dirTitle    = rel.fromId === nodeId ? 'outgoing' : 'incoming';
      const isDir       = rel.directional !== false;

      const tr = document.createElement('tr');

      const tdDir = document.createElement('td');
      tdDir.textContent = dir;
      tdDir.title       = dirTitle;
      tdDir.className   = 'rel-dir';

      const tdType = document.createElement('td');
      tdType.textContent = rel.type;

      const tdNode = document.createElement('td');
      tdNode.textContent = otherNode ? otherNode.label : `[deleted \u2013 id ${otherNodeId}]`;

      // Directionality toggle
      const tdDirToggle = document.createElement('td');
      const btnDir      = document.createElement('button');
      btnDir.className   = 'btn-dir-toggle';
      btnDir.textContent = isDir ? '\u2192' : '\u2194';
      btnDir.title       = isDir
        ? 'Directional (arrow) \u2014 click to make bidirectional'
        : 'Bidirectional (line) \u2014 click to make directional';
      btnDir.addEventListener('click', () => {
        _callbacks.onUpdateRelation && _callbacks.onUpdateRelation(rel.id, { directional: !isDir });
        _renderRelations();
      });
      tdDirToggle.appendChild(btnDir);

      const tdAct = document.createElement('td');
      const btn   = document.createElement('button');
      btn.className   = 'btn-delete-rel';
      btn.textContent = '\uD83D\uDDD1';
      btn.title       = `Delete relation "${rel.type}"`;
      btn.addEventListener('click', () => {
        if (confirm(`Delete relation "${rel.type}" (${dirTitle} ${otherNode ? otherNode.label : ''})?`)) {
          _callbacks.onDeleteRelation && _callbacks.onDeleteRelation(rel.id);
          _renderRelations();
        }
      });
      tdAct.appendChild(btn);

      tr.appendChild(tdDir);
      tr.appendChild(tdType);
      tr.appendChild(tdNode);
      tr.appendChild(tdDirToggle);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }
  }

  function _save() {
    const label  = document.getElementById('node-label-input').value.trim();
    const fields = _collectFields();
    if (label) {
      _callbacks.onSave && _callbacks.onSave(_currentNodeId, { label, fields });
    }
    close();
  }

  function _deleteNode() {
    const id  = _currentNodeId;
    const msg = _callbacks.getDeleteConfirmMessage
      ? _callbacks.getDeleteConfirmMessage(id)
      : 'Delete this node?';
    if (!confirm(msg)) return;
    close();
    _callbacks.onDeleteNode && _callbacks.onDeleteNode(id);
  }

  return { init, open, close, isOpen, getCurrentNodeId };
})();
