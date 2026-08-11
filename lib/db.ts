import mysql, { type Pool } from "mysql2/promise";

let pool: Pool | undefined;

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getDbPort() {
  const value = process.env.DB_PORT?.trim() || "3306";
  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("DB_PORT must be a valid port number.");
  }

  return port;
}

export function getDbPool() {
  if (pool) {
    return pool;
  }

  console.log("DB CONFIG", {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    passwordPresent: Boolean(process.env.DB_PASSWORD),
    passwordLength: process.env.DB_PASSWORD?.length,
  });

  pool = mysql.createPool({
    host: requireEnv("DB_HOST"),
    port: getDbPort(),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return pool;
}
