export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => ({}));
  if (String(body.password || "") !== context.env.ADMIN_PASSWORD) {
    return json({ message: "谷鸡鸡账号密码不对。" }, 403);
  }
  return json({ ok: true });
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
