CREATE TABLE IF NOT EXISTS event_brackets (id CHAR(24) PRIMARY KEY, guild_id VARCHAR(20) NOT NULL, event_id VARCHAR(64) NOT NULL,
    request_id CHAR(36) NOT NULL, revision CHAR(36) NOT NULL, state JSON NOT NULL, published TINYINT(1) NOT NULL DEFAULT 0,
    updated_by_discord_id VARCHAR(20) NOT NULL, updated_by_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY bracket_request (guild_id, request_id), KEY bracket_guild (guild_id, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_bracket_audit (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, bracket_id CHAR(24) NOT NULL,
    actor_id VARCHAR(20) NOT NULL, actor_name VARCHAR(120) NOT NULL, operation VARCHAR(40) NOT NULL, old_state JSON NULL, new_state JSON NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), KEY bracket_history (bracket_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
