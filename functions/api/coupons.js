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
  const parsed = parseCouponCode(body.coupon && body.coupon.code);
  if (!parsed) return json({ message: "券码格式不对。" }, 400);

  const state = await readState(context.env.COUPON_STORE);
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
    await writeState(context.env.COUPON_STORE, state);
  }
  return json(state);
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
