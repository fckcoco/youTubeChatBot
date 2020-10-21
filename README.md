# youTubeChatBot
## API 账号设置
1. 前往 [Google API Console](https://console.developers.google.com/)
2. 创建一个新的**项目（Project）**
3. 从**库**中启用**YouTube Data API v3**
4. 前往**凭据**创建 **OAuth 客户端 ID**, 在**已获授权的重定向 URI**中填入```http://localhost:12000/callback```
5. 如果没有创建过**OAuth 同意屏幕**的话则还需创建[**OAuth 同意屏幕**](https://console.cloud.google.com/apis/credentials/consent)
6. 从创建的客户端中获取**客户端ID(clientId)**, **已获授权的重定向 URI(redirectURI)** 和 **客户端密钥(clientSecret)** 并填入```config.js```

## 前置条件
Nodejs, Npm

## 安装
```npm install```

## 使用
- ```node server.js```
- 前往浏览器打开http://localhost:12000
