# GTA 車庫管理系統

Firebase Firestore + React + Vite，部署到 Vercel。

## 本地開發

```bash
npm install
npm run dev
```

## 部署到 Vercel

1. 把這個資料夾推到 GitHub repo
2. 到 [vercel.com](https://vercel.com) → Import Project → 選你的 repo
3. Framework 選 **Vite**，其他設定保持預設
4. 按 Deploy

完成後 Vercel 會給你一個網址，手機/電腦都能用。

## Firestore 安全規則

Firebase Console → Firestore → 規則，貼上：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## 功能

- ✅ 新增 / 編輯 / 刪除車輛
- ✅ 移動車輛到其他車庫（自動檢查容量）
- ✅ 新增車庫（自訂名稱與格數）
- ✅ 匯入 Google Sheets 匯出的 CSV
- ✅ 匯出 CSV
- ✅ 多裝置即時同步（Firebase Firestore）
- ✅ 手機優化介面
