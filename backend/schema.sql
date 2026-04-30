-- BrainMap database schema
-- Compatible with MySQL 8+ / MariaDB 10.5+
-- Run once to set up the backend tables.

CREATE TABLE IF NOT EXISTS nodes (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    label       VARCHAR(255)  NOT NULL DEFAULT 'Node',
    fields      JSON,                           -- arbitrary key/value pairs
    pos_x       FLOAT         NOT NULL DEFAULT 0,
    pos_y       FLOAT         NOT NULL DEFAULT 0,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS relations (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    from_id     INT UNSIGNED  NOT NULL,
    to_id       INT UNSIGNED  NOT NULL,
    type        VARCHAR(100)  NOT NULL DEFAULT 'related-to',
    directional TINYINT(1)    NOT NULL DEFAULT 1,  -- 1 = arrow, 0 = plain line
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id)   REFERENCES nodes(id) ON DELETE CASCADE,
    INDEX idx_from (from_id),
    INDEX idx_to   (to_id)
);

CREATE TABLE IF NOT EXISTS views (
    id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name       VARCHAR(255)  NOT NULL DEFAULT 'View',
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- Nodes explicitly added to a view, with view-specific positions
CREATE TABLE IF NOT EXISTS view_nodes (
    view_id INT UNSIGNED NOT NULL,
    node_id INT UNSIGNED NOT NULL,
    pos_x   FLOAT        NOT NULL DEFAULT 100,
    pos_y   FLOAT        NOT NULL DEFAULT 100,
    PRIMARY KEY (view_id, node_id),
    FOREIGN KEY (view_id) REFERENCES views(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Query nodes (auto-populate a view with matching nodes)
CREATE TABLE IF NOT EXISTS query_nodes (
    id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    view_id INT UNSIGNED NOT NULL,
    label   VARCHAR(255) NOT NULL DEFAULT 'Query',
    query   JSON         NOT NULL DEFAULT ('{}'),  -- {field: value, ...}
    pos_x   FLOAT        NOT NULL DEFAULT 200,
    pos_y   FLOAT        NOT NULL DEFAULT 200,
    PRIMARY KEY (id),
    FOREIGN KEY (view_id) REFERENCES views(id) ON DELETE CASCADE
);
