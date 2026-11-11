CREATE TABLE IF NOT EXISTS discord_staff_availability (
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  timezone VARCHAR(100) NOT NULL,
  weekly_slots JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discord_meeting_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  meeting_id CHAR(24) NOT NULL,
  actor_id VARCHAR(20) NULL,
  event_type VARCHAR(60) NOT NULL,
  detail JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY meeting_history_page (meeting_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Triggers keep the audit record atomic with every successful state mutation.
-- Earlier actions cannot be reconstructed; preserve the current state as the starting point.
INSERT INTO discord_meeting_history (meeting_id, event_type, detail, created_at)
SELECT meeting.id, 'imported', JSON_OBJECT('status', JSON_EXTRACT(meeting.state, '$.status')), meeting.created_at
FROM discord_meetings AS meeting
WHERE NOT EXISTS (SELECT 1 FROM discord_meeting_history AS history WHERE history.meeting_id = meeting.id);

DROP TRIGGER IF EXISTS xenon_meeting_created;
DROP TRIGGER IF EXISTS xenon_meeting_changed;
CREATE TRIGGER xenon_meeting_created AFTER INSERT ON discord_meetings
FOR EACH ROW INSERT INTO discord_meeting_history (meeting_id, event_type, detail)
VALUES (NEW.id, 'created', JSON_OBJECT('status', JSON_EXTRACT(NEW.state, '$.status')));

CREATE TRIGGER xenon_meeting_changed AFTER UPDATE ON discord_meetings
FOR EACH ROW INSERT INTO discord_meeting_history (meeting_id, actor_id, event_type, detail)
SELECT NEW.id,
  IF(NOT (JSON_EXTRACT(OLD.state, '$.lastAction') <=> JSON_EXTRACT(NEW.state, '$.lastAction')),
     JSON_UNQUOTE(JSON_EXTRACT(NEW.state, '$.lastAction.actorId')), NULL),
  IF(NOT (JSON_EXTRACT(OLD.state, '$.lastAction') <=> JSON_EXTRACT(NEW.state, '$.lastAction')),
     COALESCE(JSON_UNQUOTE(JSON_EXTRACT(NEW.state, '$.lastAction.kind')), 'updated'), 'delivery_update'),
  JSON_OBJECT('status', JSON_EXTRACT(NEW.state, '$.status'), 'workflowStatus', JSON_EXTRACT(NEW.state, '$.workflowStatus'),
    'attempts', JSON_EXTRACT(NEW.state, '$.attempts'), 'retryPaused', JSON_EXTRACT(NEW.state, '$.retryPaused'),
    'participants', JSON_EXTRACT(NEW.state, '$.participants'))
WHERE NOT (OLD.state <=> NEW.state);
