export async function onRequestGet(context) {
  const state = await readState(context.env.COUPON_STORE);
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
