const shopItems = [
  { slug: "QQ", name: "亲亲券", cost: 2 },
  { slug: "NC", name: "奶茶券", cost: 10 },
  { slug: "BBW", name: "饱饱碗券", cost: 15 },
  { slug: "QK", name: "请客券（40r以内）", cost: 18 },
  { slug: "GS", name: "挂饰券", cost: 22 },
  { slug: "BX", name: "报销券（70r以内）", cost: 30 }
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/sync") {
      return json(await readState(env));
    }

    if (request.method === "POST" && url.pathname === "/api/login") {
      const body = await request.json().catch(() => ({}));
      if (String(body.password || "") !== String(env.ADMIN_PASSWORD || "")) {
        return json({ message: "谷鸡鸡账号密码不对。" }, 403);
      }
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/coupons") {
      if (!env.COUPON_STORE) return missingKv();
      const body = await request.json().catch(() => ({}));
      const parsed = parseCouponCode(body.coupon && body.coupon.code);
      if (!parsed) return json({ message: "券码格式不对。" }, 400);

      const state = await readState(env);
      const exists = state.coupons.some((coupon) => normalizeCode(coupon.code) === parsed.code);
      if (!exists) {
        state.coupons.unshift({
          code: parsed.code,
          slug: parsed.slug,
          name: parsed.name,
          cost: parsed.cost,
          status: "pending",
          redeemedAt: body.coupon.redeemedAt || new Date().toISOString(),
          usedAt: null
        });
        await writeState(env, state);
      }
      return json(state);
    }

    if (request.method === "POST" && url.pathname === "/api/verify") {
      if (!env.COUPON_STORE) return missingKv();
      const body = await request.json().catch(() => ({}));
      if (String(body.password || "") !== String(env.ADMIN_PASSWORD || "")) {
        return json({ message: "谷鸡鸡账号密码不对。" }, 403);
      }

      const parsed = parseCouponCode(body.code);
      if (!parsed) return json({ message: "券码格式不对。" }, 400);

      const state = await readState(env);
      const already = state.verifiedCodes.find((entry) => normalizeCode(entry.code) === parsed.code);
      if (already) {
        return json({ message: "这张券已经核销过啦。", verified: already, ...state }, 409);
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
      await writeState(env, state);

      return json({ ...state, verified });
    }

    return env.ASSETS.fetch(request);
  }
};

async function readState(env) {
  if (!env.COUPON_STORE) return { coupons: [], verifiedCodes: [] };
  const raw = await env.COUPON_STORE.get("state");
  if (!raw) return { coupons: [], verifiedCodes: [] };
  try {
    const parsed = JSON.parse(raw);
    return {
      coupons: Array.isArray(parsed.coupons) ? parsed.coupons : [],
      verifiedCodes: Array.isArray(parsed.verifiedCodes) ? parsed.verifiedCodes : []
    };
  } catch (error) {
    return { coupons: [], verifiedCodes: [] };
  }
}

async function writeState(env, state) {
  await env.COUPON_STORE.put("state", JSON.stringify(state));
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

function missingKv() {
  return json({ message: "还没有绑定 COUPON_STORE，先在 Cloudflare 里添加 KV 绑定。" }, 503);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
