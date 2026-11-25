CREATE TABLE IF NOT EXISTS discord_meeting_notes (
  meeting_id CHAR(24) NOT NULL, guild_id VARCHAR(20) NOT NULL, user_id VARCHAR(20) NOT NULL,
  revision CHAR(36) NOT NULL, state JSON NOT NULL, reminder_at DATETIME(3) NULL,
  lease_token CHAR(36) NULL, leased_until DATETIME(3) NULL,
  PRIMARY KEY (meeting_id, user_id), KEY note_reminders (guild_id, reminder_at, leased_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
