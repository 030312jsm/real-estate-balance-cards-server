const express = require("express");
const path = require("node:path");
const fs = require("node:fs/promises");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 8787);
const DATABASE_URL = process.env.DATABASE_URL;
const DATA_DIR = path.join(__dirname, "data");
const LEADERBOARD_FILE = path.join(DATA_DIR, "leaderboard.json");

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

async function initDatabase() {
  if (!pool) {
    console.log("DATABASE_URL not found. Using local JSON leaderboard for development.");
    await ensureLocalFile();
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      turn INTEGER NOT NULL DEFAULT 0,
      avg INTEGER NOT NULL DEFAULT 0,
      low INTEGER NOT NULL DEFAULT 0,
      bonus_count INTEGER NOT NULL DEFAULT 0,
      base_score INTEGER NOT NULL DEFAULT 0,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      difficulty_label TEXT NOT NULL DEFAULT '중간',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS turn INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS avg INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS low INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS bonus_count INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS base_score INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS difficulty_label TEXT NOT NULL DEFAULT '중간';`);
  await pool.query(`CREATE INDEX IF NOT EXISTS leaderboard_difficulty_score_idx ON leaderboard (difficulty, score DESC, turn DESC, created_at ASC);`);

  console.log("Leaderboard database is ready.");
}

async function ensureLocalFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(LEADERBOARD_FILE);
  } catch {
    await fs.writeFile(LEADERBOARD_FILE, "[]", "utf8");
  }
}

async function readLocalLeaderboard() {
  await ensureLocalFile();
  try {
    const file = await fs.readFile(LEADERBOARD_FILE, "utf8");
    const data = JSON.parse(file || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeLocalLeaderboard(entries) {
  await ensureLocalFile();
  await fs.writeFile(LEADERBOARD_FILE, JSON.stringify(entries, null, 2), "utf8");
}

function cleanText(value, fallback, maxLength) {
  const text = String(value || fallback)
    .trim()
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
  return text || fallback;
}

function cleanInteger(value, min = 0) {
  const number = Math.round(Number(value || 0));
  return Number.isFinite(number) ? Math.max(min, number) : min;
}

function sanitizeRecord(body) {
  const record = {
    name: cleanText(body.name, "", 12),
    score: cleanInteger(body.score, 0),
    turn: cleanInteger(body.turn, 0),
    avg: cleanInteger(body.avg, 0),
    low: cleanInteger(body.low, 0),
    bonusCount: cleanInteger(body.bonusCount, 0),
    baseScore: cleanInteger(body.baseScore, 0),
    difficulty: cleanText(body.difficulty, "medium", 20),
    difficultyLabel: cleanText(body.difficultyLabel, body.difficulty || "중간", 20)
  };

  if (record.name.length < 2) return { error: "이름은 2자 이상이어야 합니다." };
  if (record.score <= 0) return { error: "점수가 올바르지 않습니다." };
  if (record.turn <= 0) return { error: "턴 수가 올바르지 않습니다." };
  return record;
}

function normalizeLocalRecord(record) {
  return {
    id: record.id,
    name: record.name,
    score: cleanInteger(record.score),
    turn: cleanInteger(record.turn),
    avg: cleanInteger(record.avg),
    low: cleanInteger(record.low),
    bonusCount: cleanInteger(record.bonusCount ?? record.bonus_count),
    baseScore: cleanInteger(record.baseScore ?? record.base_score),
    difficulty: record.difficulty || "medium",
    difficultyLabel: record.difficultyLabel || record.difficulty_label || record.difficulty || "중간",
    createdAt: record.createdAt || record.created_at || new Date().toISOString()
  };
}

function sortRecords(records) {
  return records
    .map(normalizeLocalRecord)
    .sort((a, b) => b.score - a.score || b.turn - a.turn || new Date(a.createdAt) - new Date(b.createdAt));
}

async function readLeaderboard(difficulty) {
  if (pool) {
    const sql = `
      SELECT
        id,
        name,
        score,
        turn,
        avg,
        low,
        bonus_count AS "bonusCount",
        base_score AS "baseScore",
        difficulty,
        difficulty_label AS "difficultyLabel",
        created_at AS "createdAt"
      FROM leaderboard
      ${difficulty ? "WHERE difficulty = $1" : ""}
      ORDER BY score DESC, turn DESC, created_at ASC
      LIMIT 50;
    `;
    const result = difficulty ? await pool.query(sql, [difficulty]) : await pool.query(sql);
    return result.rows;
  }

  const records = await readLocalLeaderboard();
  return sortRecords(records)
    .filter(record => !difficulty || record.difficulty === difficulty)
    .slice(0, 50);
}

async function insertLeaderboard(record) {
  if (pool) {
    await pool.query(
      `
      INSERT INTO leaderboard (
        name,
        score,
        turn,
        avg,
        low,
        bonus_count,
        base_score,
        difficulty,
        difficulty_label
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `,
      [
        record.name,
        record.score,
        record.turn,
        record.avg,
        record.low,
        record.bonusCount,
        record.baseScore,
        record.difficulty,
        record.difficultyLabel
      ]
    );
    return;
  }

  const records = await readLocalLeaderboard();
  records.push({
    id: Date.now(),
    ...record,
    createdAt: new Date().toISOString()
  });
  await writeLocalLeaderboard(sortRecords(records).slice(0, 50));
}

app.get("/health", (request, response) => {
  response.status(200).json({
    status: "ok",
    database: pool ? "postgres" : "local-json"
  });
});

app.get("/api/leaderboard", async (request, response) => {
  try {
    const difficulty = request.query.difficulty
      ? cleanText(request.query.difficulty, "", 20)
      : "";
    response.json(await readLeaderboard(difficulty || null));
  } catch (error) {
    console.error("GET /api/leaderboard error:", error);
    response.status(500).json({ error: "순위표를 불러오지 못했습니다." });
  }
});

app.post("/api/leaderboard", async (request, response) => {
  try {
    const record = sanitizeRecord(request.body);
    if (record.error) {
      response.status(400).json({ error: record.error });
      return;
    }

    await insertLeaderboard(record);
    response.status(201).json({
      ok: true,
      records: await readLeaderboard(record.difficulty)
    });
  } catch (error) {
    console.error("POST /api/leaderboard error:", error);
    response.status(500).json({ error: "순위표 등록에 실패했습니다." });
  }
});

app.get("/favicon.ico", (request, response) => {
  response.status(204).end();
});

app.get("*", (request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

initDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Server startup error:", error);
    process.exit(1);
  });
