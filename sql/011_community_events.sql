-- Additive migration. Run after existing migrations; rerunning preserves staff settings.
CREATE TABLE IF NOT EXISTS community_events (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  revision CHAR(36) NOT NULL,
  settings JSON NOT NULL,
  updated_by VARCHAR(20) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO community_events (id, revision, settings) VALUES
('valorant-december-2026', UUID(), JSON_OBJECT('name', 'Valorant - December Community Event', 'description', 'Xenon is preparing its December Valorant community event. Help shape the main event format when voting opens.', 'startsAt', NULL, 'format', NULL, 'status', 'planning', 'pollOpen', FALSE, 'registrationOpen', FALSE, 'organisers', JSON_ARRAY('Xenon Community', 'Xenon Competitive'), 'participation', 'Dates, eligibility and event-specific rules are being finalised. The main format remains subject to organiser review, interest levels, player availability and feasibility.', 'links', JSON_ARRAY())),
('rocket-league-december-2026', UUID(), JSON_OBJECT('name', 'Rocket League - December Community Event', 'description', 'A Rocket League community activity is being prepared for December. Confirmed details will be published here and in Discord.', 'startsAt', NULL, 'format', NULL, 'status', 'planning', 'pollOpen', FALSE, 'registrationOpen', FALSE, 'organisers', JSON_ARRAY('Xenon Community', 'Xenon Competitive'), 'participation', 'The date, format and participation requirements remain unconfirmed. Registration is not open.', 'links', JSON_ARRAY()));

CREATE TABLE IF NOT EXISTS community_poll_votes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(40) NOT NULL,
  choice ENUM('skirmish-2v2','standard-5v5') NOT NULL,
  voter_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_community_vote (event_id, voter_hash),
  KEY community_poll_results (event_id, choice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_rate_limits (
  bucket CHAR(64) NOT NULL PRIMARY KEY,
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at TIMESTAMP NOT NULL,
  KEY community_rate_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_registrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reference_code VARCHAR(20) NOT NULL,
  event_id VARCHAR(40) NOT NULL,
  revision CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  voter_hash CHAR(64) NOT NULL,
  identity_hash CHAR(64) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  discord_username VARCHAR(120) NOT NULL,
  riot_id VARCHAR(80) NOT NULL,
  player_rank VARCHAR(60) NOT NULL DEFAULT '',
  region VARCHAR(100) NOT NULL,
  availability TEXT NOT NULL,
  message TEXT NOT NULL,
  agreement TINYINT(1) NOT NULL,
  status ENUM('pending','accepted','waitlisted','declined','withdrawn') NOT NULL DEFAULT 'pending',
  notified_user_ids JSON NOT NULL,
  notification_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  notification_sent_at TIMESTAMP NULL,
  next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token CHAR(36) NULL,
  leased_until TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_community_reference (reference_code),
  UNIQUE KEY uq_community_request (request_id),
  UNIQUE KEY uq_community_identity (event_id, identity_hash),
  UNIQUE KEY uq_community_browser_registration (event_id, voter_hash),
  KEY community_selection (event_id, status, id),
  KEY community_delivery (notification_sent_at, next_attempt_at, leased_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_event_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(40) NOT NULL,
  reference_code VARCHAR(20) NULL,
  actor_id VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,
  detail JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY community_event_audit (event_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
