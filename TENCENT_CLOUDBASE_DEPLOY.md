# 腾讯云 CloudBase 部署

Cloudflare 的 `workers.dev` 如果普通网络打不开，就换国内的腾讯云 CloudBase。

## 1. 创建云开发环境

打开腾讯云 CloudBase 控制台，创建一个云开发环境：

https://console.cloud.tencent.com/tcb

需要腾讯云账号和实名认证。

## 2. 创建数据库集合

进入环境后，打开数据库，创建集合：

```text
coupon_state
```

权限建议先设为“仅云函数可读写”。

## 3. 部署云函数

创建云函数：

```text
函数名：api
运行环境：Node.js
代码目录：cloudfunctions/api
环境变量：ADMIN_PASSWORD=你设置的谷鸡鸡账号密码
```

部署函数依赖时，需要让腾讯云安装 `@cloudbase/node-sdk`。

## 4. 配置 HTTP 访问

进入 HTTP 访问服务，把路径 `/api` 指向云函数 `api`，并开启路径透传。

最后接口应能这样访问：

```text
https://你的环境域名/api/sync
```

## 5. 上传静态网站

进入静态网站托管，上传：

```text
index.html
```

把静态网站根路径 `/` 指向静态托管。

## 6. 测试

打开腾讯云给你的默认域名：

```text
https://你的环境域名/
```

测试：

1. 小程微账号兑换券。
2. 谷鸡鸡账号输入你在环境变量里设置的密码。
3. 核销券码。
4. 回小程微账号查看是否显示“已核销”。
