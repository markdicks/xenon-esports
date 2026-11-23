-- Restart-safe drafts in the existing Hostinger website database.
-- Also initialized automatically on first authenticated ticket setup use.
CREATE TABLE IF NOT EXISTS discord_ticket_setup_sessions (
  session_id CHAR(20) PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  actor_id VARCHAR(20) NOT NULL,
  draft JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  lease_token CHAR(36) NULL,
  leased_until DATETIME NULL,
  KEY setup_actor (guild_id, actor_id),
  KEY setup_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
