CREATE TABLE IF NOT EXISTS applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_reference VARCHAR(32) NOT NULL,
  discord_username VARCHAR(120) NOT NULL,
  email VARCHAR(255) NULL,
  timezone VARCHAR(80) NOT NULL,
  role VARCHAR(120) NOT NULL,
  weekly_availability VARCHAR(120) NOT NULL,
  experience TEXT NOT NULL,
  portfolio_url VARCHAR(500) NULL,
  motivation TEXT NOT NULL,
  first_30_days_goal TEXT NOT NULL,
  reliability_example TEXT NOT NULL,
  reason_may_leave TEXT NOT NULL,
  support_needed TEXT NULL,
  unpaid_volunteer_acknowledgement TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY applications_public_reference_unique (public_reference),
  KEY applications_created_at_idx (created_at),
  KEY applications_role_idx (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_reference VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  discord_username VARCHAR(120) NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY contact_submissions_public_reference_unique (public_reference),
  KEY contact_submissions_created_at_idx (created_at),
  KEY contact_submissions_email_idx (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
