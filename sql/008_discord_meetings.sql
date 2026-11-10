CREATE TABLE IF NOT EXISTS discord_meetings (
  id CHAR(24) NOT NULL PRIMARY KEY,
  public_reference VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  revision CHAR(36) NOT NULL,
  state JSON NOT NULL,
  lease_token CHAR(36) NULL,
  leased_until DATETIME NULL,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_discord_meeting_submission (public_reference),
  KEY idx_discord_meeting_queue (finished_at, next_attempt_at, leased_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
