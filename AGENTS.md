# AGENTS.md — AI 接手指南

給接手此專案的 AI/開發者,快速掌握專案、開發流程與驗證方式。

## 專案概觀

WebGL 物理彈珠沙盒 (pinball-like),three.js + cannon-es 實作,另含一個最小 Flutter web shell 以 iframe 內嵌 three.js app。

- `three_app/` — 獨立 web app(主要開發目標)
  - `index.html` — 進入點,內含版本徽章 `<div id="version">vX.Y.Z</div>`
  - `js/main.js` — 主要邏輯(場景、物理、輸入)
  - `scripts/bump_version.sh` — 自動遞增 patch 版本並 push 到 gh-pages(CI 使用)
- `flutter_shell/` — Flutter web 外殼,以 iframe 內嵌 `three_app/index.html`
  - `lib/main.dart`, `pubspec.yaml`
- `.github/workflows/auto_deploy.yml` — push 到 main 時自動部署到 gh-pages

## 開發模式(重要)

**快速迭代:快速修改 → 直接 push 到 `main`。** 沒有 PR / feature branch 流程。

1. 在 `three_app/`(通常是 `js/main.js` 或 `index.html`)修改。
2. commit 後 `git push origin main`。
3. GitHub Actions 自動:
   - 執行 `bump_version.sh` 遞增版本徽章並 commit 回 main。
   - 用 `peaceiris/actions-gh-pages` 把 `three_app/` 發佈到 `gh-pages` 分支。
4. 請人開下方 URL 驗證並回饋問題。

## 驗證 URL

發佈後由使用者驗證的線上網址:

**https://kenshinn.github.io/pinball_flutter/**

> 部署到 gh-pages 後可能需要數十秒才生效;版本徽章 `vX.Y.Z` 可用來確認是否為最新版。

## 本機執行

```bash
# 獨立 three_app(建議用 static server,module import 通常不允許 file://)
python3 -m http.server 8000    # 或: npx http-server . -p 8000
# 開啟 http://localhost:8000/three_app/

# Flutter shell(web)
cd flutter_shell
flutter pub get
flutter run -d chrome
```

## CI / 部署細節

- Workflow 觸發:`push` 到 `main`。
- 以 `if: github.actor != 'github-actions'` 避免 bot commit 造成無限迴圈。
- 部署使用內建 `secrets.GITHUB_TOKEN`(GitHub Actions 自動提供,**不需**手動設定)。
- `publish_dir: ./three_app`、`publish_branch: gh-pages`、force overwrite。

## Repository

- Remote:`https://github.com/kenshinn/pinball_flutter.git`
- Pages 來源:`gh-pages` 分支

## 認證 / Token(請勿把 token 明文寫入本檔或任何 commit)

- **CI 部署**:使用 GitHub Actions 內建 `GITHUB_TOKEN`,無需額外設定。
- **本機手動 push**:優先使用 macOS Keychain / git credential helper,或本機環境變數。
  若腳本需要,透過環境變數注入,不要寫死在檔案:
  ```bash
  export GITHUB_TOKEN="<你的 PAT,存在本機,勿 commit>"
  ```
- 需要額外權限的 PAT 請存放於:
  - GitHub repo → Settings → Secrets and variables → Actions,或
  - 本機環境變數 / 密碼管理器。
- **PAT 有設定到期日,過期需重新產生並更新上述存放位置。切勿寫入版本控管。**

## 下一步候選(來自 MVP 規劃)

- 加入 flippers(擋板)與 bumpers
- 計分、材質、音效、關卡預設、觸控 UI
