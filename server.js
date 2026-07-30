const http = require("http");
const fs = require("fs");
const path = require("path");
let Pool = null;
try {
  ({ Pool } = require("pg"));
} catch (error) {
  Pool = null;
}

const PORT = Number(process.env.PORT || 8023);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "80238023";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const DATABASE_URL = process.env.DATABASE_URL;
const pgPool = DATABASE_URL && Pool ? new Pool({ connectionString: DATABASE_URL }) : null;
let pgReady = false;

const shopItems = [
  { slug: "QQ", name: "亲亲券", cost: 2 },
  { slug: "NC", name: "奶茶券", cost: 10 },
  { slug: "BBW", name: "饱饱碗券", cost: 15 },
  { slug: "QK", name: "请客券（40r以内）", cost: 18 },
  { slug: "GS", name: "挂饰券", cost: 22 },
  { slug: "BX", name: "报销券（70r以内）", cost: 30 }
];

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ coupons: [], verifiedCodes: [] }, null, 2), "utf8");
  }
}

async function ensurePgDb() {
  if (!pgPool || pgReady) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      cost INTEGER NOT NULL,
      status TEXT NOT NULL,
      redeemed_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS verified_codes (
      code TEXT PRIMARY KEY REFERENCES coupons(code) ON DELETE CASCADE,
      name TEXT NOT NULL,
      cost INTEGER NOT NULL,
      verified_at TIMESTAMPTZ NOT NULL
    );
  `);
  pgReady = true;
}

function rowToCoupon(row) {
  return {
    code: row.code,
    slug: row.slug,
    name: row.name,
    cost: row.cost,
    status: row.status,
    redeemedAt: new Date(row.redeemed_at).toISOString(),
    usedAt: row.used_at ? new Date(row.used_at).toISOString() : null
  };
}

function rowToVerified(row) {
  return {
    code: row.code,
    name: row.name,
    cost: row.cost,
    verifiedAt: new Date(row.verified_at).toISOString()
  };
}

async function readDb() {
  if (pgPool) {
    await ensurePgDb();
    const [coupons, verifiedCodes] = await Promise.all([
      pgPool.query("SELECT * FROM coupons ORDER BY redeemed_at DESC"),
      pgPool.query("SELECT * FROM verified_codes ORDER BY verified_at DESC")
    ]);
    return {
      coupons: coupons.rows.map(rowToCoupon),
      verifiedCodes: verifiedCodes.rows.map(rowToVerified)
    };
  }

  ensureDb();
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return {
      coupons: Array.isArray(data.coupons) ? data.coupons : [],
      verifiedCodes: Array.isArray(data.verifiedCodes) ? data.verifiedCodes : []
    };
  } catch (error) {
    return { coupons: [], verifiedCodes: [] };
  }
}

async function writeDb(db) {
  if (pgPool) {
    await ensurePgDb();
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM verified_codes");
      await client.query("DELETE FROM coupons");
      for (const coupon of db.coupons) {
        await client.query(
          `INSERT INTO coupons (code, slug, name, cost, status, redeemed_at, used_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            coupon.code,
            coupon.slug,
            coupon.name,
            coupon.cost,
            coupon.status,
            coupon.redeemedAt,
            coupon.usedAt
          ]
        );
      }
      for (const entry of db.verifiedCodes) {
        await client.query(
          `INSERT INTO verified_codes (code, name, cost, verified_at)
           VALUES ($1, $2, $3, $4)`,
          [entry.code, entry.name, entry.cost, entry.verifiedAt]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function parseCouponCode(value) {
  const code = normalizeCode(value);
  const parts = code.split("-");
  if (parts.length !== 5 || parts[0] !== "GJJ") return null;
  const item = shopItems.find((entry) => entry.slug === parts[1] && String(entry.cost) === parts[2]);
  if (!item || !/^\d{8}$/.test(parts[3]) || !/^[A-Z0-9]{5}$/.test(parts[4])) return null;
  return { code, slug: item.slug, name: item.name, cost: item.cost };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function publicState(db, extra = {}) {
  return {
    coupons: db.coupons,
    verifiedCodes: db.verifiedCodes,
    ...extra
  };
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/sync") {
    sendJson(res, 200, publicState(await readDb()));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    if (String(body.password || "") !== ADMIN_PASSWORD) {
      sendJson(res, 403, { message: "谷鸡鸡账号密码不对。" });
      return true;
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/coupons") {
    const body = await readBody(req);
    const parsed = parseCouponCode(body.coupon && body.coupon.code);
    if (!parsed) {
      sendJson(res, 400, { message: "券码格式不对。" });
      return true;
    }

    const db = await readDb();
    const code = parsed.code;
    const exists = db.coupons.some((coupon) => normalizeCode(coupon.code) === code);
    if (!exists) {
      db.coupons.unshift({
        code,
        slug: parsed.slug,
        name: parsed.name,
        cost: parsed.cost,
        status: "pending",
        redeemedAt: body.coupon.redeemedAt || new Date().toISOString(),
        usedAt: null
      });
      await writeDb(db);
    }
    sendJson(res, 200, publicState(db));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/verify") {
    const body = await readBody(req);
    if (String(body.password || "") !== ADMIN_PASSWORD) {
      sendJson(res, 403, { message: "谷鸡鸡账号密码不对。" });
      return true;
    }

    const parsed = parseCouponCode(body.code);
    if (!parsed) {
      sendJson(res, 400, { message: "券码格式不对。" });
      return true;
    }

    const db = await readDb();
    const already = db.verifiedCodes.find((entry) => normalizeCode(entry.code) === parsed.code);
    if (already) {
      sendJson(res, 409, { message: "这张券已经核销过啦。", verified: already, ...publicState(db) });
      return true;
    }

    let coupon = db.coupons.find((entry) => normalizeCode(entry.code) === parsed.code);
    if (!coupon) {
      coupon = {
        code: parsed.code,
        slug: parsed.slug,
        name: parsed.name,
        cost: parsed.cost,
        status: "pending",
        redeemedAt: new Date().toISOString(),
        usedAt: null
      };
      db.coupons.unshift(coupon);
    }

    const verified = {
      code: parsed.code,
      name: parsed.name,
      cost: parsed.cost,
      verifiedAt: new Date().toISOString()
    };
    coupon.status = "used";
    coupon.usedAt = verified.verifiedAt;
    db.verifiedCodes.unshift(verified);
    await writeDb(db);
    sendJson(res, 200, publicState(db, { verified }));
    return true;
  }

  return false;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = ext === ".html" ? "text/html; charset=utf-8" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { message: "服务器有点小迷糊，请稍后再试。" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`小程微的回忆拼图已启动：http://localhost:${PORT}`);
});
