#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const id = process.argv[2];
if (!id) {
  console.error("usage: npm run voice:logs -- <sessionId>");
  process.exit(1);
}

const file = path.join(process.cwd(), ".voice-logs", `${id}.ndjson`);
const lines = readFileSync(file, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const kinds = new Set([
  "start",
  "token.ok",
  "mic.ok",
  "env",
  "ws.open",
  "ws.close",
  "server.token",
  "stop",
  "error",
]);

console.log("## milestones");
for (const row of lines) {
  if (!kinds.has(row.kind)) continue;
  console.log(
    `${row.t ?? row.ts}ms ${row.kind} ${row.type ?? ""} ${row.message ?? ""}`.trim(),
  );
}

console.log("\n## server event counts");
const counts = new Map();
for (const row of lines) {
  if (row.kind !== "server") continue;
  counts.set(row.type ?? "unknown", (counts.get(row.type ?? "unknown") ?? 0) + 1);
}
for (const [type, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${count}\t${type}`);
}

console.log("\n## audio.out turns");
for (const row of lines) {
  if (row.kind === "audio.out.first" || row.kind === "audio.out") {
    console.log(JSON.stringify(row));
  }
}

console.log("\n## last 25");
for (const row of lines.slice(-25)) {
  console.log(JSON.stringify(row));
}
