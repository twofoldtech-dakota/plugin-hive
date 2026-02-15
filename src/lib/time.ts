/** Return current UTC datetime as an ISO-like string matching SQLite's datetime('now') format */
export function nowUtc(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
