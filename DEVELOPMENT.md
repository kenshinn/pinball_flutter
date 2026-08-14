# DEVELOPMENT.md — 目前開發重點

> 給接手的 AI/開發者:此檔記錄「當下正在處理的重點」。搭配 [AGENTS.md](AGENTS.md)(專案總覽與部署流程)一起看。

## 🎯 當前焦點

**修正 flipper(擋板)的視覺呈現,以及 flipper 與球撞擊的效果。**

主要檔案:[three_app/js/main.js](three_app/js/main.js)

## 現況與相關程式碼

flipper 目前用 **dynamic body + HingeConstraint(繞 Y 軸)** 實作,由 motor 驅動角度:

- 建立 flipper:`createFlipper(side)`(約 [三處 main.js#L284](three_app/js/main.js#L284) 起)
  - 幾何:`length 2.6 / height 0.48 / thickness 0.2`
  - 樞紐 `pivot`(mass 0)+ `HingeConstraint`,`maxForce 1e7`
  - 靜止/抬起角:`restAngle ±0.45`、`upAngle ±1.05`
- 撞擊處理:`body` 的 `collide` 事件(約 [main.js#L340](three_app/js/main.js#L340))
  - 只有在 `state.engaged`(擋板正在揮動)時,對球施加 assist impulse
  - impulse 依 contact normal(`contact.ni`)方向,`impMag = min(12, 6 + upSpeed)`
- 驅動角度:`setFlipper(side, engaged)`(約 [main.js#L379](three_app/js/main.js#L379))
  - 以 `enableMotor` + `setMotorSpeed` 把角度推向 target
- 視覺同步:render loop 中 `f.mesh.position/quaternion.copy(f.body...)`(約 [main.js#L691](three_app/js/main.js#L691) 起)

## 已知問題 / 待修

- [ ] **呈現**:flipper mesh 與 physics body 對位、抬起動畫是否平順(檢查 hinge 版與 kinematic fallback 兩條路徑的 mesh 同步)。
- [ ] **撞擊手感**:球被擋板打擊時的回彈力道/方向;tunneling(高速穿透)問題。
  - 相關參數:`bumperBallContact.restitution 0.95 / friction 0.015`、`solver.iterations 20`、`world.step(timeStep, dt, 10)` 的 substeps。
  - assist impulse 目前只在 `engaged` 時觸發,靜止碰撞不加力。

## 可調參數速查

| 目的 | 位置 | 現值 |
|------|------|------|
| 擋板重量 | `createFlipper` body mass | 3 |
| 抬起/落下速度 | `state.upSpeed / downSpeed` | 12 / 8 |
| 擋板↔球彈性 | `bumperBallContact.restitution` | 0.95 |
| assist impulse 上限 | `collide` handler `impMag` | 12 |
| 物理迭代 | `world.solver.iterations` | 20 |
| substeps | `world.step(...)` 第三參數 | 10 |

## 驗證方式

1. 改 [three_app/js/main.js](three_app/js/main.js) → commit → `git push origin main`。
2. 等 CI 部署,開 **https://kenshinn.github.io/pinball_flutter/** 驗證(用右上角版本徽章 `vX.Y.Z` 確認是否為最新)。
3. 桌機用方向鍵 / A、D 控制左右擋板;Space spawn 球。觀察擋板打球的回饋。

---

## 自動版號與部署流程（已設定）

為了快速迭代，我加入了自動在每次推送 main 時遞增 patch 版號的流程，並在部署到 gh-pages 前自動執行：

- 新增腳本：scripts/bump_version.sh
  - 讀取 three_app/index.html 裡第一個符合 vMAJOR.MINOR.PATCH 的字串
  - 會把 PATCH 加 1、寫回 index.html，並在 three_app/VERSION.txt 留下新版本字串
  - 若最後一個 commit 已由 GitHub Actions 自動產生（含 `[auto]`），則會跳過以避免無限迴圈
- CI: .github/workflows/deploy-gh-pages.yml
  - 在部署前執行 bump_version.sh（若檔案更新會在 workspace commit）
  - 將 bump 出來的 commit push 回 main（由 workflow 使用 GITHUB_TOKEN 推送）
  - 接著把 three_app 資料夾發佈到 gh-pages
- 發佈時會把新版本寫入 three_app/VERSION.txt 與 three_app/index.html（版本徽章），方便查驗

注意：第一次 run 時 workflow 會 commit 並 push 新版號（commit message 標註 `[auto]`），因此後續工作流會跳過再次自動 bump，避免循環。

如果你要調整版號規則（例如改為 minor bump 或 tag 觸發），我可以把腳本改成 semantic-release 樣式或改為手動標籤觸發。
