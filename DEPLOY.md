# 部署到 Render

这个小游戏需要公网同步时，请部署 `server.js`，不要只上传 `index.html`。

## 1. 推到 GitHub

把整个文件夹推到一个 GitHub 仓库，至少包含这些文件：

- `index.html`
- `server.js`
- `package.json`
- `render.yaml`

## 2. Render Blueprint

打开 Render Blueprint：

https://dashboard.render.com/blueprint/new

选择你的 GitHub 仓库。Render 会读取 `render.yaml`，自动创建：

- Node Web Service
- Postgres 数据库

## 3. 设置密码

Render 要求填写 `ADMIN_PASSWORD` 时，填你设置的谷鸡鸡账号密码。

## 4. 发给小程微

部署完成后，Render 会给一个类似这样的地址：

```text
https://chengwei-memory-puzzle.onrender.com
```

你和小程微都打开这个地址，核销状态就能同步。

注意：Render 免费 Postgres 通常适合短期使用；长期稳定保存建议升级数据库计划。
