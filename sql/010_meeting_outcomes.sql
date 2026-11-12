-- Run after migration 009. Guards make a partially applied migration safe to retry.
CREATE TABLE IF NOT EXISTS discord_meeting_outcomes (
  meeting_id CHAR(24) NOT NULL PRIMARY KEY,
  revision CHAR(36) NOT NULL,
  state JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discord_meeting_outcome_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  meeting_id CHAR(24) NOT NULL,
  actor_id VARCHAR(20) NULL,
  event_type VARCHAR(60) NOT NULL,
  detail JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY meeting_outcome_history (meeting_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discord_onboarding_policy (
  guild_id VARCHAR(20) NOT NULL PRIMARY KEY,
  revision CHAR(36) NOT NULL,
  role_ids JSON NOT NULL,
  updated_by VARCHAR(20) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @xenon_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'discord_meetings' AND COLUMN_NAME = 'round_number') = 0,
  'ALTER TABLE discord_meetings ADD COLUMN round_number INT UNSIGNED NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE xenon_migration FROM @xenon_ddl;
EXECUTE xenon_migration;
DEALLOCATE PREPARE xenon_migration;

SET @xenon_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'discord_meetings' AND COLUMN_NAME = 'parent_meeting_id') = 0,
  'ALTER TABLE discord_meetings ADD COLUMN parent_meeting_id CHAR(24) NULL', 'SELECT 1');
PREPARE xenon_migration FROM @xenon_ddl;
EXECUTE xenon_migration;
DEALLOCATE PREPARE xenon_migration;

-- Install the replacement unique index before removing the old one.
SET @xenon_ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'discord_meetings' AND INDEX_NAME = 'uq_discord_meeting_round') = 0,
  'ALTER TABLE discord_meetings ADD UNIQUE KEY uq_discord_meeting_round (public_reference, round_number)', 'SELECT 1');
PREPARE xenon_migration FROM @xenon_ddl;
EXECUTE xenon_migration;
DEALLOCATE PREPARE xenon_migration;

SET @xenon_ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'discord_meetings' AND INDEX_NAME = 'uq_discord_meeting_submission') > 0,
  'ALTER TABLE discord_meetings DROP INDEX uq_discord_meeting_submission', 'SELECT 1');
PREPARE xenon_migration FROM @xenon_ddl;
EXECUTE xenon_migration;
DEALLOCATE PREPARE xenon_migration;

SET @xenon_ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'discord_meetings' AND INDEX_NAME = 'idx_discord_meeting_parent') = 0,
  'ALTER TABLE discord_meetings ADD KEY idx_discord_meeting_parent (parent_meeting_id)', 'SELECT 1');
PREPARE xenon_migration FROM @xenon_ddl;
EXECUTE xenon_migration;
DEALLOCATE PREPARE xenon_migration;
