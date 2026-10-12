CREATE TABLE IF NOT EXISTS discord_submission_deliveries (
  public_reference VARCHAR(32) NOT NULL,
  delivered_user_ids JSON NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token CHAR(36) NULL,
  leased_until DATETIME NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (public_reference),
  KEY discord_deliveries_pending_idx (completed_at, next_attempt_at, leased_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Treat submissions made before this migration as historical, not new messages.
-- Run this migration once, before enabling the bot integration.
INSERT IGNORE INTO discord_submission_deliveries (public_reference, completed_at)
SELECT public_reference, NOW() FROM applications;

INSERT IGNORE INTO discord_submission_deliveries (public_reference, completed_at)
SELECT public_reference, NOW() FROM contact_submissions;
