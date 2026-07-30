# 不绑卡部署到 Cloudflare

Cloudflare Pages 免费版可以部署网页，Cloudflare 官网写着免费开始不需要信用卡。

## 1. 提交并推送

确认 GitHub 仓库里包含：

- `index.html`
- `functions/api/sync.js`
- `functions/api/login.js`
- `functions/api/coupons.js`
- `functions/api/verify.js`

## 2. 创建 Pages 项目

打开：

https://dash.cloudflare.com/

进入 `Workers & Pages`，选择 `Pages`，连接 GitHub 仓库：

```text
jikaigu90-blip/chengwei-memory-puzzle
```

构建设置：

```text
Framework preset: None
Build command: 留空
Build output directory: /
```

## 3. 创建 KV

进入 `Workers & Pages` -> `KV`，创建一个 namespace，比如：

```text
chengwei_coupon_store
```

然后回到 Pages 项目：

`Settings` -> `Functions` -> `KV namespace bindings`

添加绑定：

```text
Variable name: COUPON_STORE
KV namespace: chengwei_coupon_store
```

## 4. 设置谷鸡鸡密码

在 Pages 项目：

`Settings` -> `Environment variables`

添加：

```text
ADMIN_PASSWORD=80238023
```

## 5. 重新部署

回到 `Deployments`，点 `Retry deployment` 或重新部署最新版本。

部署完成后，把 Cloudflare 给你的 `*.pages.dev` 链接发给小程微。
