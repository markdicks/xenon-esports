import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db";

export type BotSubmission = {
  type: "application" | "contact";
  reference: string;
  leaseToken: string;
  deliveredUserIds: string[];
  fields: { label: string; value: string }[];
};

const applicationFields = [
  ["discord_username", "Discord username"],
  ["email", "Email"],
  ["timezone", "Timezone"],
  ["role", "Role"],
  ["weekly_availability", "Weekly availability"],
  ["experience", "Experience"],
  ["portfolio_url", "Portfolio URL"],
  ["motivation", "Motivation"],
  ["first_30_days_goal", "First 30 days goal"],
  ["reliability_example", "Reliability example"],
  ["reason_may_leave", "Reason they may leave"],
  ["support_needed", "Support needed"],
  ["unpaid_volunteer_acknowledgement", "Unpaid volunteer acknowledgement"],
] as const;

const contactFields = [
  ["name", "Name"],
  ["discord_username", "Discord username"],
  ["email", "Email"],
  ["subject", "Subject"],
  ["message", "Message"],
] as const;

function deliveredIds(value: unknown): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
}

export async function claimBotSubmissions(): Promise<BotSubmission[]> {
  const pool = getDbPool();
  const [candidates] = await pool.query<RowDataPacket[]>(`
    SELECT pending.public_reference, pending.submission_type
    FROM (
      SELECT public_reference, 'application' AS submission_type, created_at FROM applications
      UNION ALL
      SELECT public_reference, 'contact' AS submission_type, created_at FROM contact_submissions
    ) AS pending
    LEFT JOIN discord_submission_deliveries AS delivery
      ON delivery.public_reference = pending.public_reference
    WHERE delivery.completed_at IS NULL
      AND (delivery.next_attempt_at IS NULL OR delivery.next_attempt_at <= NOW())
      AND (delivery.leased_until IS NULL OR delivery.leased_until <= NOW())
    ORDER BY pending.created_at, pending.public_reference
    LIMIT 5
  `);

  const submissions: BotSubmission[] = [];
  for (const candidate of candidates) {
    const reference = String(candidate.public_reference);
    const type = candidate.submission_type as BotSubmission["type"];
    const leaseToken = randomUUID();
    await pool.execute(
      "INSERT IGNORE INTO discord_submission_deliveries (public_reference) VALUES (?)",
      [reference],
    );
    // A lease prevents overlapping polls from delivering the same submission.
    const [claim] = await pool.execute<ResultSetHeader>(`
      UPDATE discord_submission_deliveries
      SET lease_token = ?, leased_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
          attempts = attempts + 1
      WHERE public_reference = ? AND completed_at IS NULL
        AND next_attempt_at <= NOW()
        AND (leased_until IS NULL OR leased_until <= NOW())
    `, [leaseToken, reference]);
    if (!claim.affectedRows) continue;

    const table = type === "application" ? "applications" : "contact_submissions";
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT submission.*, delivery.delivered_user_ids
      FROM ${table} AS submission
      JOIN discord_submission_deliveries AS delivery USING (public_reference)
      WHERE submission.public_reference = ?
    `, [reference]);
    if (!rows[0]) continue;
    const row = rows[0];
    const definitions = type === "application" ? applicationFields : contactFields;
    submissions.push({
      type,
      reference,
      leaseToken,
      deliveredUserIds: deliveredIds(row.delivered_user_ids),
      fields: definitions.map(([key, label]) => ({
        label,
        value: key === "unpaid_volunteer_acknowledgement"
          ? (row[key] ? "Yes" : "No")
          : String(row[key] ?? "Not provided"),
      })),
    });
  }
  return submissions;
}

export async function recordBotDelivery(result: {
  reference: string;
  leaseToken: string;
  deliveredUserIds: string[];
  complete: boolean;
  release: boolean;
}) {
  const [update] = await getDbPool().execute<ResultSetHeader>(`
    UPDATE discord_submission_deliveries
    SET delivered_user_ids = ?, completed_at = IF(?, NOW(), NULL),
        next_attempt_at = IF(?, DATE_ADD(NOW(), INTERVAL LEAST(3600, 60 * POW(2, LEAST(attempts - 1, 6))) SECOND), next_attempt_at),
        lease_token = IF(?, NULL, lease_token),
        leased_until = IF(?, NULL, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
    WHERE public_reference = ? AND lease_token = ? AND completed_at IS NULL
  `, [JSON.stringify(Array.from(new Set(result.deliveredUserIds))), result.complete,
    result.release, result.release, result.release,
    result.reference, result.leaseToken]);
  return update.affectedRows === 1;
}
