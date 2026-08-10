# Firebase Hosting 部署（托辊选型动态页）

本页是纯前端计算（浏览器内即时重算），用 **Firebase Hosting** 即可联网动态浏览/计算，不需要 Cloud Functions。

## 一次性准备

1. 打开 [Firebase Console](https://console.firebase.google.com/) 新建或选择项目  
2. 把 [`.firebaserc`](../.firebaserc) 里的 `YOUR_FIREBASE_PROJECT_ID` 改成你的项目 ID  
3. 本机登录：

```bash
npm i -g firebase-tools
firebase login
```

## 部署

在仓库根目录：

```bash
firebase deploy --only hosting
```

成功后会给出类似：

`https://<project-id>.web.app/`

手机浏览器打开即可改参数、即时计算。

## CI / 无交互部署

```bash
firebase login:ci   # 生成 token
FIREBASE_TOKEN=xxx firebase deploy --only hosting
```

把 `FIREBASE_TOKEN` 和项目 ID 发给代理后，也可由代理代为部署。
