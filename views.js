// views.js - Views sidebar and query-node dialog

const viewsModule = (() => {
  'use strict';

  let _model     = null;
  let _callbacks = {};

  // Query dialog state
  let _editingViewId = null;
  let _editingQnId   = null;   // null = new query node

  // Add-nodes dialog state
  let _addNodesViewId = null;

  // ─── Public ────────────────────────────────────────────────────────────────

  function init(modelRef, callbacks) {
    _model     = modelRef;
    _callbacks = callbacks || {};

    document.getElementById('btn-toggle-sidebar')
      .addEventListener('click', _toggleSidebar);

    document.getElementById('btn-new-view')
      .addEventListener('click', _newView);

    document.getElementById('btn-view-add-nodes')
      .addEventListener('click', _openAddNodesDialog);

    document.getElementById('btn-add-query-node')
      .addEventListener('click', () => openQueryDialog(null, null));

    // Query node dialog
    document.getElementById('qn-dialog-close')
      .addEventListener('click', _closeQueryDialog);
    document.getElementById('qn-dialog-overlay')
      .addEventListener('click', e => { if (e.target.id === 'qn-dialog-overlay') _closeQueryDialog(); });
    document.getElementById('btn-add-qn-filter')
      .addEventListener('click', () => _addFilterRow('', ''));
    document.getElementById('qn-dialog-cancel')
      .addEventListener('click', _closeQueryDialog);
    document.getElementById('qn-dialog-save')
      .addEventListener('click', _saveQueryNode);

    // Add-nodes dialog
    document.getElementById('add-nodes-dialog-close')
      .addEventListener('click', _closeAddNodesDialog);
    document.getElementById('add-nodes-dialog-overlay')
      .addEventListener('click', e => { if (e.target.id === 'add-nodes-dialog-overlay') _closeAddNodesDialog(); });
    document.getElementById('add-nodes-cancel')
      .addEventListener('click', _closeAddNodesDialog);
    document.getElementById('add-nodes-confirm')
      .addEventListener('click', _confirmAddNodes);

    update();
  }

  function update() {
    _renderViewsList();
    _updateViewActions();
    _updateViewBadge();
  }

  function openQueryDialog(qnId, viewId) {
    _editingViewId = viewId != null ? viewId : _callbacks.getActiveViewId();
    _editingQnId   = qnId != null  ? qnId   : null;

    const view = _editingViewId != null ? _model.getView(_editingViewId) : null;

    if (_editingQnId != null && view) {
      const qn = view.queryNodes.find(q => q.id === _editingQnId);
      if (!qn) return;
      document.getElementById('qn-name-input').value = qn.label;
      _renderFilters(qn.query);
    } else {
      document.getElementById('qn-name-input').value = '';
      _renderFilters({});
    }

    document.getElementById('qn-dialog-overlay').classList.remove('hidden');
    document.getElementById('qn-name-input').focus();
  }

  // ─── Sidebar toggle ─────────────────────────────────────────────────────────

  function _toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn     = document.getElementById('btn-toggle-sidebar');
    sidebar.classList.toggle('collapsed');
    btn.textContent = sidebar.classList.contains('collapsed') ? '\u25BA' : '\u25C4';
  }

  // ─── Views list ─────────────────────────────────────────────────────────────

  function _renderViewsList() {
    const list         = document.getElementById('views-list');
    const activeViewId = _callbacks.getActiveViewId();
    list.innerHTML     = '';

    const mainItem = document.createElement('div');
    mainItem.className   = 'view-item' + (activeViewId === null ? ' active' : '');
    mainItem.textContent = '\uD83D\uDDFA Main Desktop';
    mainItem.addEventListener('click', () => _callbacks.onViewChange(null));
    list.appendChild(mainItem);

    for (const view of _model.views) {
      const item      = document.createElement('div');
      item.className  = 'view-item' + (activeViewId === view.id ? ' active' : '');

      const nameSpan       = document.createElement('span');
      nameSpan.className   = 'view-name';
      nameSpan.textContent = view.name;

      const actionsSpan    = document.createElement('span');
      actionsSpan.className = 'view-item-actions';

      const btnRename       = document.createElement('button');
      btnRename.className   = 'btn-view-action';
      btnRename.title       = 'Rename view';
      btnRename.textContent = '\u270F';
      btnRename.addEventListener('click', e => {
        e.stopPropagation();
        const newName = prompt('Rename view:', view.name);
        if (newName !== null && newName.trim()) {
          _model.updateView(view.id, { name: newName.trim() });
          _callbacks.onRender();
        }
      });

      const btnDelete       = document.createElement('button');
      btnDelete.className   = 'btn-view-action danger';
      btnDelete.title       = 'Delete view (nodes are kept)';
      btnDelete.textContent = '\uD83D\uDDD1';
      btnDelete.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`Delete view "${view.name}"? Nodes will NOT be deleted.`)) {
          if (activeViewId === view.id) _callbacks.onViewChange(null);
          _model.removeView(view.id);
          _callbacks.onRender();
        }
      });

      actionsSpan.appendChild(btnRename);
      actionsSpan.appendChild(btnDelete);
      item.appendChild(nameSpan);
      item.appendChild(actionsSpan);
      item.addEventListener('click', () => _callbacks.onViewChange(view.id));
      list.appendChild(item);
    }
  }

  function _updateViewActions() {
    const activeViewId = _callbacks.getActiveViewId();
    document.getElementById('view-actions').classList.toggle('hidden', activeViewId === null);
  }

  function _updateViewBadge() {
    const activeViewId = _callbacks.getActiveViewId();
    const badge        = document.getElementById('view-badge');
    if (activeViewId !== null) {
      const view = _model.getView(activeViewId);
      badge.textContent = '\uD83D\uDCCB ' + (view ? view.name : 'View');
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function _newView() {
    const name = prompt('View name:', 'New View');
    if (name === null) return;
    const view = _model.addView(name.trim() || 'New View');
    _callbacks.onViewChange(view.id);
    _callbacks.onRender();
  }

  // ─── Add Nodes dialog ───────────────────────────────────────────────────────

  function _openAddNodesDialog() {
    _addNodesViewId = _callbacks.getActiveViewId();
    if (_addNodesViewId === null) return;

    const view   = _model.getView(_addNodesViewId);
    const inView = new Set(view ? view.nodeIds : []);
    const list   = document.getElementById('add-nodes-list');
    list.innerHTML = '';

    if (_model.nodes.length === 0) {
      const p = document.createElement('p');
      p.className   = 'no-relations';
      p.style.padding = '14px';
      p.textContent = 'No nodes exist yet. Add nodes on the Main Desktop first.';
      list.appendChild(p);
    } else {
      for (const node of _model.nodes) {
        const row     = document.createElement('label');
        row.className = 'add-node-row';

        const cb    = document.createElement('input');
        cb.type     = 'checkbox';
        cb.value    = node.id;
        cb.checked  = inView.has(node.id);

        const span       = document.createElement('span');
        span.textContent = node.label;

        row.appendChild(cb);
        row.appendChild(span);
        list.appendChild(row);
      }
    }

    document.getElementById('add-nodes-dialog-overlay').classList.remove('hidden');
  }

  function _closeAddNodesDialog() {
    document.getElementById('add-nodes-dialog-overlay').classList.add('hidden');
    _addNodesViewId = null;
  }

  function _confirmAddNodes() {
    if (_addNodesViewId === null) { _closeAddNodesDialog(); return; }
    const view = _model.getView(_addNodesViewId);
    if (!view) { _closeAddNodesDialog(); return; }

    for (const cb of document.querySelectorAll('#add-nodes-list input[type=checkbox]')) {
      const nodeId = Number(cb.value);
      if (cb.checked) {
        const node = _model.getNode(nodeId);
        if (node) _model.addNodeToView(_addNodesViewId, nodeId, node.x, node.y);
      } else {
        _model.removeNodeFromView(_addNodesViewId, nodeId);
      }
    }
    _closeAddNodesDialog();
    _callbacks.onRender();
  }

  // ─── Query node dialog ──────────────────────────────────────────────────────

  function _closeQueryDialog() {
    document.getElementById('qn-dialog-overlay').classList.add('hidden');
    _editingViewId = null;
    _editingQnId   = null;
  }

  function _renderFilters(query) {
    const container     = document.getElementById('qn-filters');
    container.innerHTML = '';
    for (const [k, v] of Object.entries(query || {})) {
      _addFilterRow(k, v);
    }
  }

  function _addFilterRow(key, value) {
    const container   = document.getElementById('qn-filters');
    const row         = document.createElement('div');
    row.className     = 'qn-filter-row';

    const keyIn         = document.createElement('input');
    keyIn.type          = 'text';
    keyIn.className     = 'qn-filter-key';
    keyIn.placeholder   = 'field (or "label")';
    keyIn.value         = key;

    const valIn         = document.createElement('input');
    valIn.type          = 'text';
    valIn.className     = 'qn-filter-val';
    valIn.placeholder   = 'value';
    valIn.value         = value;

    const btnDel        = document.createElement('button');
    btnDel.className    = 'btn-delete-rel';
    btnDel.textContent  = '\u2715';
    btnDel.title        = 'Remove filter';
    btnDel.addEventListener('click', () => row.remove());

    row.appendChild(keyIn);
    row.appendChild(valIn);
    row.appendChild(btnDel);
    container.appendChild(row);
  }

  function _saveQueryNode() {
    const label = document.getElementById('qn-name-input').value.trim() || 'Query';
    const query = {};
    for (const row of document.querySelectorAll('#qn-filters .qn-filter-row')) {
      const k = row.querySelector('.qn-filter-key').value.trim();
      const v = row.querySelector('.qn-filter-val').value.trim();
      if (k) query[k] = v;
    }

    const viewId = _editingViewId;
    if (_editingQnId !== null) {
      _model.updateQueryNode(viewId, _editingQnId, { label, query });
    } else {
      _model.addQueryNode(viewId, label, query, 300, 200);
    }
    _closeQueryDialog();
    _callbacks.onRender();
  }

  return { init, update, openQueryDialog };
})();
