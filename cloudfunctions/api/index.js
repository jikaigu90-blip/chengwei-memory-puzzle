const cloudbase = require("@cloudbase/node-sdk");
const fs = require("fs");
const path = require("path");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const collection = db.collection("coupon_state");
const STATE_ID = "state";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

const shopItems = [
  { slug: "QQ", name: "亲亲券", cost: 2 },
  { slug: "NC", name: "奶茶券", cost: 10 },
  { slug: "BBW", name: "饱饱碗券", cost: 15 },
  { slug: "QK", name: "请客券（40r以内）", cost: 18 },
  { slug: "GS", name: "挂饰券", cost: 22 },
  { slug: "BX", name: "报销券（70r以内）", cost: 30 }
];

exports.main = async (event) => {
  const request = parseRequest(event);

  if (request.method === "OPTIONS") {
    return response({}, 204);
  }

  if (request.method === "GET" && (request.path === "/" || request.path.endsWith("/index.html"))) {
    return htmlResponse(html);
  }

  if (request.method === "GET" && request.path.endsWith("/sync")) {
    return response(await readState());
  }

  if (request.method === "POST" && request.path.endsWith("/login")) {
    if (String(request.body.password || "") !== ADMIN_PASSWORD) {
      return response({ message: "谷鸡鸡账号密码不对。" }, 403);
    }
    return response({ ok: true });
  }

  if (request.method === "POST" && request.path.endsWith("/coupons")) {
    const parsed = parseCouponCode(request.body.coupon && request.body.coupon.code);
    if (!parsed) return response({ message: "券码格式不对。" }, 400);

    const state = await readState();
    const exists = state.coupons.some((coupon) => normalizeCode(coupon.code) === parsed.code);
    if (!exists) {
      state.coupons.unshift({
        code: parsed.code,
        slug: parsed.slug,
        name: parsed.name,
        cost: parsed.cost,
        status: "pending",
        redeemedAt: request.body.coupon.redeemedAt || new Date().toISOString(),
        usedAt: null
      });
      await writeState(state);
    }
    return response(state);
  }

  if (request.method === "POST" && request.path.endsWith("/verify")) {
    if (String(request.body.password || "") !== ADMIN_PASSWORD) {
      return response({ message: "谷鸡鸡账号密码不对。" }, 403);
    }

    const parsed = parseCouponCode(request.body.code);
    if (!parsed) return response({ message: "券码格式不对。" }, 400);

    const state = await readState();
    const already = state.verifiedCodes.find((entry) => normalizeCode(entry.code) === parsed.code);
    if (already) {
      return response({ message: "这张券已经核销过啦。", verified: already, ...state }, 409);
    }

    let coupon = state.coupons.find((entry) => normalizeCode(entry.code) === parsed.code);
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
      state.coupons.unshift(coupon);
    }

    const verified = {
      code: parsed.code,
      name: parsed.name,
      cost: parsed.cost,
      verifiedAt: new Date().toISOString()
    };
    coupon.status = "used";
    coupon.usedAt = verified.verifiedAt;
    state.verifiedCodes.unshift(verified);
    await writeState(state);

    return response({ ...state, verified });
  }

  return response({ message: "接口不存在。" }, 404);
};

async function readState() {
  try {
    const doc = await collection.doc(STATE_ID).get();
    const data = doc.data && doc.data[0];
    return normalizeState(data);
  } catch (error) {
    const state = { coupons: [], verifiedCodes: [] };
    await writeState(state);
    return state;
  }
}

async function writeState(state) {
  const payload = normalizeState(state);
  try {
    await collection.doc(STATE_ID).set(payload);
  } catch (error) {
    await collection.add({ _id: STATE_ID, ...payload });
  }
}

function normalizeState(value) {
  return {
    coupons: Array.isArray(value && value.coupons) ? value.coupons : [],
    verifiedCodes: Array.isArray(value && value.verifiedCodes) ? value.verifiedCodes : []
  };
}

function parseRequest(event) {
  const method = String(event.httpMethod || event.requestContext?.http?.method || event.method || "GET").toUpperCase();
  const path = String(event.path || event.rawPath || event.requestContext?.http?.path || "/");
  let body = event.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body);
    } catch (error) {
      body = {};
    }
  }
  return { method, path, body };
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

function response(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    body: JSON.stringify(body)
  };
}

function htmlResponse(body) {
  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    },
    body
  };
}
