# 擋板防穿模方案對照與回退指南 (Flipper Anti-Tunneling Solutions)

已為您完整註記並保留 **Solution V1** 與 **Solution V2**，隨時可在代碼中一鍵無縫切換或回退！

---

## 📊 方案對照與原理

| 特性 | Solution V2 (當前預設 `v2_capsule_swept`) | Solution V1 (舊版備份 `v1_discrete_kinematic`) |
| :--- | :--- | :--- |
| **碰撞原理** | **點到線段膠囊體解析投影 + 全深度掃掠** (Point-to-Segment Capsule Analytical Swept) | **離散 Kinematic Box 碰撞 + 簡單法向推力** (Discrete Box & Normal Offset) |
| **Cannon 剛體排斥** | `body.collisionResponse = false` (防止薄 Box 穿透時反向往下排斥) | `body.collisionResponse = true` (使用 Cannon-es 預設剛體排斥) |
| **揮擊動態捕獲** | 依據角速度與旋轉半徑賦予 $16 \sim 26$ 的徑向爆炸發射力 + 3D 火花 | 依據固定目標速度增加法向推力 |
| **靜止/按住狀態** | 作為剛體實體牆 (Rigid Constraint)，提供 0.25 彈性反彈與滑動 | 依賴 Cannon 剛體 contact material |

---

## 🔄 如何切換或回退到舊版 (Rollback Guide)

若您想隨時換回舊版 **Solution V1**：
1. 開啟 [`three_app/js/main.js`](file:///Users/kenshinn_huang/projects/pinball_flutter/three_app/js/main.js)
2. 找到最頂端的開關變數：
   ```javascript
   // 改為 'v1_discrete_kinematic'
   const FLIPPER_SOLVER_VERSION = 'v1_discrete_kinematic';
   ```
3. 在 `createFlipper()` 內將 `body.collisionResponse = false;` 改為 `body.collisionResponse = true;` 即可完全恢復舊版物理行為！

---

## 🔍 當前狀態
目前專案預設使用 **Solution V2**，並在代碼與 `DEVELOPMENT.md` 中完整保留了 V1 的實作邏輯與切換說明。
