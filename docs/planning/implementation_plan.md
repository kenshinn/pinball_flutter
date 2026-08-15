# 彈珠台遊戲體驗與視覺提升方案 (Pinball Enhancements)

本計畫旨在全面升級 WebGL 彈珠台的視覺立體感、打擊回饋爽快度、觸控操作手感以及遊戲機制，並清理過去迭代留下的過期調校代碼。

## User Review Required

> [!NOTE]
> 為了不干擾現有的流暢物理模擬，所有視覺升級（陰影、粒子火花、自發光脈衝）皆在 Three.js 渲染層執行，不會增加 Cannon-es 物理運算負擔。

## Proposed Changes

---

### Phase 1: 視覺光影與打擊感提升 (Visual & Effects)

#### [MODIFY] [three_app/js/main.js](file:///Users/kenshinn_huang/projects/pinball_flutter/three_app/js/main.js)
1. **動態陰影 (Soft Shadows)**：
   - 啟用 `renderer.shadowMap.enabled = true`，採用 `THREE.PCFSoftShadowMap`。
   - 配置主方向光源 `dir.castShadow = true`，設置適當的陰影範圍（`shadow.camera` left/right/top/bottom 與 `shadow.mapSize` 1024x1024）。
   - 檯面底板 `floorMesh.receiveShadow = true`，球體 `ballMesh.castShadow = true`，擋板與 Bumpers 開啟陰影投射與接收。
2. **真實金屬球體與材質升級**：
   - 鋼珠採用高金屬度與低粗糙度（`metalness: 0.95, roughness: 0.1`），反射場景光線，營造真實鋼珠質感。
   - Bumpers 與邊軌強化自發光（`emissive`），受擊時觸發強烈的光暈脈衝動畫（Glow Pulse）。
3. **3D 撞擊粒子火花系統 (Spark Particle System)**：
   - 新增輕量級 3D 粒子管理器（`SparkManager`），當球撞擊 Bumpers、Kickers 或擋板時，在 3D 碰撞座標噴發 15~20 顆彩色霓虹火花粒子，隨物理速度擴散淡出。

---

### Phase 2: 遊戲機制與操作手感升級 (Gameplay & Controls)

#### [MODIFY] [three_app/js/main.js](file:///Users/kenshinn_huang/projects/pinball_flutter/three_app/js/main.js)
1. **全螢幕分區觸控 (Full-Screen Split Touch)**：
   - 手機/平板觸控時，支援直接按住螢幕左半邊/右半邊任意位置觸發左/右擋板，不再受限於底部按鈕的小區域。
2. **開局救球機制 (Ball Saver)**：
   - 發球後的 8 秒內為保護時間；若此時球掉入底洞，觸發 "BALL SAVED!" 橫幅特效並自動免費補發球，大幅降低開局秒出界的挫折感。

---

### Phase 3: 代碼重構與清理 (Tech Debt Cleanup)

#### [MODIFY] [three_app/js/main.js](file:///Users/kenshinn_huang/projects/pinball_flutter/three_app/js/main.js)
1. **移除遺留的 Hinge Tuner**：
   - 徹底移除已無作用的 `attachHingeTuner` 相關代碼與 `localStorage` 讀取邏輯。
2. **修復 `setFromEuler` 警告**：
   - 修正 `addWall` 中的 Euler 參數傳遞，消除瀏覽器控制台潛在警告。

---

## Verification Plan

### Manual Verification (在 IDE Simple Browser 預覽)
1. **陰影與金屬球體**：觀察球滾動時檯面上是否有平滑陰影，球體是否呈現鏡面金屬質感。
2. **粒子火花**：發射球撞擊 Bumpers 與 Corner Kickers，觀察碰撞點是否有霓虹粒子火花噴發。
3. **Ball Saver**：發球後立即讓球落入底洞，確認是否觸發 "BALL SAVED" 並自動補發球。
4. **觸控/操作**：測試左鍵/右鍵、A/D、按鈕與點擊螢幕左右兩側是否正常反應。
