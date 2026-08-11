import mysql, { type Pool } from "mysql2/promise";

let pool: Pool | undefined;

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getDbPool() {
  if (pool) {
    return pool;
  }

  const port = Number(requireEnv("DB_PORT"));

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("DB_PORT must be a valid port number.");
  }

  pool = mysql.createPool({
    host: requireEnv("DB_HOST"),
    port,
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return pool;
}
