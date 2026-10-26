CREATE TABLE IF NOT EXISTS discord_role_links (
  guild_id VARCHAR(20) NOT NULL,
  role_key VARCHAR(120) NOT NULL,
  discord_role_id VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, role_key),
  UNIQUE KEY discord_role_links_guild_role_unique (guild_id, discord_role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
