const shopItems = [
  { slug: "QQ", name: "亲亲券", cost: 2 },
  { slug: "NC", name: "奶茶券", cost: 10 },
  { slug: "BBW", name: "饱饱碗券", cost: 15 },
  { slug: "QK", name: "请客券（40r以内）", cost: 18 },
  { slug: "GS", name: "挂饰券", cost: 22 },
  { slug: "BX", name: "报销券（70r以内）", cost: 30 }
];

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => ({}));
  const adminPassword = context.env.ADMIN_PASSWORD || "";
  if (!String(body.password || "").trim() || String(body.password || "") !== adminPassword) {
    return json({ message: "谷鸡鸡账号密码不对。" }, 403);
  }

  const parsed = parseCouponCode(body.code);
  if (!parsed) return json({ message: "券码格式不对。" }, 400);

  const state = await readState(context.env.COUPON_STORE);
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
  await writeState(context.env.COUPON_STORE, state);

  return json({ ...state, verified });
}

async function readState(store) {
  const raw = await store.get("state");
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

async function writeState(store, state) {
  await store.put("state", JSON.stringify(state));
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
