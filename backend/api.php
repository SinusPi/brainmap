<?php
/**
 * BrainMap — REST API stub
 *
 * All endpoints return 501 Not Implemented until a real DB backend is wired up.
 * When ready, replace the localStorage adapter in model.js with fetch() calls
 * to these routes.
 *
 * Routes (all prefixed /api/):
 *   GET    /api/nodes              list all nodes
 *   POST   /api/nodes              create node  {label, fields, x, y}
 *   GET    /api/nodes/{id}         get node
 *   PUT    /api/nodes/{id}         update node
 *   DELETE /api/nodes/{id}         delete node (cascades relations + view membership)
 *
 *   GET    /api/relations          list all relations
 *   POST   /api/relations          create relation {fromId, toId, type, directional}
 *   PUT    /api/relations/{id}     update relation
 *   DELETE /api/relations/{id}     delete relation
 *
 *   GET    /api/views              list all views
 *   POST   /api/views              create view {name}
 *   GET    /api/views/{id}         get view (includes nodeIds, nodePositions, queryNodes)
 *   PUT    /api/views/{id}         update view
 *   DELETE /api/views/{id}         delete view
 *
 *   POST   /api/views/{id}/nodes           add node to view {nodeId, x, y}
 *   DELETE /api/views/{id}/nodes/{nodeId}  remove node from view
 *   PUT    /api/views/{id}/nodes/{nodeId}  update node position in view {x, y}
 *
 *   POST   /api/views/{id}/query-nodes            create query node {label, query, x, y}
 *   PUT    /api/views/{id}/query-nodes/{qnId}     update query node
 *   DELETE /api/views/{id}/query-nodes/{qnId}     delete query node
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

http_response_code(501);
echo json_encode([
    'error'   => 'Not Implemented',
    'message' => 'The PHP/DB backend has not been implemented yet. '
               . 'The app currently uses localStorage for persistence. '
               . 'Wire up this file with a PDO connection to activate server-side storage.',
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
