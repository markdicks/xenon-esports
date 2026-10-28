-- Public website links only. Never store tokens, credentials or secrets here.
CREATE TABLE IF NOT EXISTS site_config (
  config_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  config_value TEXT NULL,
  updated_by_discord_id VARCHAR(20) NOT NULL,
  updated_by_name VARCHAR(100) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS config_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  config_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  changed_by_discord_id VARCHAR(20) NOT NULL,
  changed_by_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY config_audit_key_created (config_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
