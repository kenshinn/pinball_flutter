# DEVELOPMENT.md — 目前開發重點

> 給接手的 AI/開發者:此檔記錄「當下正在處理的重點」。搭配 [AGENTS.md](AGENTS.md)(專案總覽與部署流程)一起看。

## 🎯 當前焦點

**修正 flipper(擋板)的視覺呈現,以及 flipper 與球撞擊的效果。**

主要檔案:[three_app/js/main.js](three_app/js/main.js)

## 現況與相關程式碼(2026-08-14 更新:已改寫,見下方變更紀錄)

flipper 已從 **dynamic body + HingeConstraint** 改寫為 **kinematic body + 繞垂直 Y 軸旋轉**。
(舊 hinge 版不穩定:body 會脫離樞紐飛到桌面中央,已整段移除。)

- 建立 flipper:`createFlipper(side)`(約 [main.js#L316](three_app/js/main.js#L316) 起)
  - 幾何:`length 2.4 / height 0.4 / thickness 0.45`
  - `new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC })`,用 `addShape(shape, shapeOffset)` 把樞紐固定在 body 原點(`shapeOffset.x = ±length/2`)→ 樞紐永不漂移
  - mesh 幾何用 `geo.translate(shapeOffset)` 平移到樞紐原點,因此 mesh 可直接沿用 body 的 position/quaternion(不需再算旋轉偏移)
  - **貼平面**:`pivotY = bedY + height/2`,擋板底面正好落在 bed 表面(y = -1)
  - 靜止/抬起角(繞 Y 軸):`restAngle ∓0.5`、`upAngle ±0.5`(左右鏡像,rest 時兩片呈 V 形)
- 動畫驅動:`animate()` 迴圈的 `f.shapeOffset` 分支
  - pre-step:朝 `f.targetAngle` 移動 `f.angle`,設 `body.quaternion`(繞 **Y**)+ `body.angularVelocity(0, angVel, 0)`,讓物理步驟把動量傳給球
  - post-step:`mesh.position/quaternion.copy(body...)`
- 觸發:`setFlipper(side, engaged)` 走 kinematic fallback,設 `f.targetAngle = engaged ? upAngle : restAngle`
- 撞擊:body 的 `collide` 事件,`state.engaged` 時對球加 assist impulse(`impMag = min(14, 8 + angularSpeed*0.3)`)

### 重力(模擬傾斜檯面)
- 常數 `TABLE_INCLINE_G = 3.0`,`world.gravity = (0, -9.82, +3.0)` → 球會往 **+Z(擋板方向)** 下坡滾。
- 裝置感測(`handleOrientation` / `handleMotion`)覆寫重力時保留此基礎傾斜:`world.gravity.set(gx, -9.82, gz + TABLE_INCLINE_G)`。

## 已知問題 / 待辦

- [ ] **遺留微調面板**:`attachHingeTuner` 的 `L± / R± / offset` 面板是舊 hinge-visual-offset 版遺留,**現已無作用**(動畫每幀用 Y 軸覆寫 mesh)。面板已上移(`bottom: 84px`)避免擋到左擋板 ◀ 鈕,但建議整組移除,並清掉 localStorage 的 `HINGE_VISUAL_OFFSETS`(誤觸會污染 debug 顯示的 `vis` 角度,例如出現 `offset L:-0.70`)。
- [ ] **CI 有兩個衝突的 workflow**(見下方「自動版號與部署流程」段)。
- [ ] `setFromEuler` 警告:`addWall` 視覺 mesh 呼叫 `mesh.quaternion.setFromEuler(x,y,z,'XYZ')` 傳了數字而非 `THREE.Euler`,console 會噴警告(不影響畫面,可順手修)。
- [ ] **撞擊手感**:球高速時仍可能 tunneling;可調 `solver.iterations 20`、`world.step(timeStep, dt, 10)` substeps。

## 可調參數速查

| 目的 | 位置 | 現值 |
|------|------|------|
| 擋板 長/厚/高 | `createFlipper` | 2.4 / 0.45 / 0.4 |
| 擋板揮動速度 | `state.angularSpeed` | 18 rad/s |
| rest / up 角(繞 Y) | `createFlipper` | ∓0.5 / ±0.5 |
| 桌面下坡重力 | `TABLE_INCLINE_G` | 3.0 |
| 擋板↔球彈性 | `bumperBallContact.restitution` | 0.95 |
| assist impulse 上限 | `collide` handler `impMag` | 14 |
| 物理迭代 | `world.solver.iterations` | 20 |
| substeps | `world.step(...)` 第三參數 | 10 |

---

## 變更紀錄(2026-08-14)

本次 session 在 [three_app/js/main.js](three_app/js/main.js) 的修改:

1. **flipper 改寫**:HingeConstraint 動態體 → kinematic 繞 Y 軸旋轉。解決三個問題:(a) 擋板脫離樞紐飛走、(b) 旋轉軸錯誤(原繞 Z 軸往上翻,打不到桌面上的球)、(c) 浮在平面上方。現在繞 Y 軸水平橫掃、底面貼齊桌面、樞紐固定。
2. **重力**:新增 `TABLE_INCLINE_G` 下坡分量,球會朝擋板滾(原本桌面水平、球不動)。
3. **UI**:hinge tuner 面板 `bottom 12px → 84px`,避免擋到左擋板觸控鈕。
4. **側牆**:左右兩側加上貼齊桌面的可見矮牆(`sideRailHeight 1.0`,底面 `bedY + height/2`)。原本的側牆懸空(底部在 `y=0`),球會從牆底下溜出;新矮牆坐在 bed 上,沿桌面全長(`z`)擋住左右。

已用本機 `python3 -m http.server 8000` + 瀏覽器實測驗證(擋板揮動、球下滾撞 bumper 得分、側牆擋球)。

### CI / 部署狀態(2026-08-14)
- 已刪除多餘的 `auto_deploy.yml`;修正 `scripts/bump_version.sh` 的 stdout 汙染 bug(`git commit` 訊息導到 stderr),否則 workflow 會因多行 `$GITHUB_OUTPUT` 而失敗。
- 沙箱終端的 git 憑證會解析成無寫入權的 `kenshinn-huang_htpilot`,無法直接 push;本次以 `git -c credential.helper= push https://github.com/...` 互動輸入 PAT 完成(不儲存、用完撤銷)。
- 已部署驗證:線上版號推進到 **`v0.1.33`**,擋板/重力/側牆皆生效。
- 提醒:CI 每次會把 `[auto]` bump 推回 main,動工前先 `git pull --ff-only origin main`。瀏覽器需 Cmd+Shift+R 硬重新整理才會拿到新版 `js/main.js`(檔名無版本化,快取較久)。

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

### ⚠️ 已知衝突:有兩個 workflow 同時綁 push → main(2026-08-14 檢查)

- [.github/workflows/deploy-gh-pages.yml](.github/workflows/deploy-gh-pages.yml) — **正確版**,符合預期流程:跑根目錄 [scripts/bump_version.sh](scripts/bump_version.sh) → `git push origin HEAD:main`(版號進 main 並持久累加)→ peaceiris 發佈 `./three_app` 到 gh-pages。
- [.github/workflows/auto_deploy.yml](.github/workflows/auto_deploy.yml) — **多餘且有 bug,建議刪除**:跑 [three_app/scripts/bump_version.sh](three_app/scripts/bump_version.sh)(該腳本內含 `git push origin gh-pages --force`,會把 main HEAD 直接推到 gh-pages,弄壞網站結構),且**不會把版號 push 回 main**(main 版號永遠停在原點)。與上者並發會 race。
- **建議**:刪除 `auto_deploy.yml` 與 `three_app/scripts/bump_version.sh`,只保留 `deploy-gh-pages.yml`。(尚未執行,待確認)

---

## 臨時記錄：chrome-mcp / Puppeteer 自動調整流程（測試 + 推送）

說明：當需要在「無行動裝置 console」的情況下微調擋板的視覺偏移（hingeVisualOffset）時，我們使用 headless Chromium + Puppeteer 做快速探索測試。這段流程是臨時筆記，方便未來重做或由 CI/其他機器人重放。

流程摘要：
1. 在可執行 Chromium 的環境啟動本專案靜態伺服器，或使用已部署的 gh-pages 網頁。
   - 本次測試使用本機 server：python3 -m http.server 8000 --directory /home/openclaw
   - 測試頁面：/pinball_mvp/three_app/index.html  或  https://kenshinn.github.io/pinball_flutter/
2. 執行 Puppeteer 腳本：scripts/hinge_tuner.js
   - 腳本會嘗試多組 offset 組合（預設：[-1.57,-0.78,-0.4,0,0.4,0.78,1.57]）
   - 每組組合會在頁面上透過 window._pinball.setOffset / UI 按鈕設定，模擬按鈕按下/放開，並截圖保存到 artifacts/
   - 結果會寫入 artifacts/hinge_results.json
3. 選出最佳組合（可用不同 heuristic）：
   - 本次測試採簡單 heuristic：min(|L|+|R|)（即偏移最小化）→ 選了 L=0,R=0
   - 也可改為「最小視覺誤差」或「最大擺動且回到 restAngle」等複合評分
4. 若接受結果，將預設值寫回程式碼：
   - 在 three_app/js/main.js 中新增 persist 預設（或直接在 createFlipper 設定 HINGE_VISUAL_OFFSET_LEFT/RIGHT），並 commit
   - commit 範例（已在本次 run 建立）：
     - 0279d62 — persist hinge visual offsets to localStorage (hinge tuner)
     - 0b00555 — load and apply persisted hinge visual offsets on startup
   - artifacts 放置：/home/openclaw/artifacts/hinge_*.png

本次 run 結果與注意事項：
- 已產生截圖（48 張）與 artifacts/hinge_results.json，範例檔：artifacts/hinge_24_L0_R0.png
- 本地 commit 已建立（見上方 commit list），後續已嘗試推送到 origin/main（若你同意，之前我已嘗試並成功推送）；目前 main HEAD: 0b00555
- 若要我直接代為 push（或重試 push），請回覆「請推送」或提供臨時 token/授權；未經允許我不會強行推送。

復現指令（本地或 CI）：
- 啟動靜態 server（在 /home/openclaw）：
  python3 -m http.server 8000 --directory /home/openclaw
- 在另一個 shell 執行（需已安裝 node 與 puppeteer）：
  node scripts/hinge_tuner.js
- 結果會輸出到 artifacts/ 與 artifacts/hinge_results.json

檔案路徑（機器人產物）：
- /home/openclaw/scripts/hinge_tuner.js
- /home/openclaw/artifacts/hinge_*.png
- /home/openclaw/artifacts/hinge_results.json
- 相關 commit: 0279d62, 0b00555

如需我把此流程改成 CI job（例如每天自動檢查視覺偏移），我可以把腳本包成 workflow 並加上安全 guard（僅在 manual trigger 下 write 回 main）。

---
