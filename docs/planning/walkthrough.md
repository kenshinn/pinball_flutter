# Phase 1: 視覺光影與打擊感提升 成果摘要 (Visual & Effects)

本階段已成功為彈珠台導入柔和動態陰影、鏡面金屬鋼珠材質、霓虹自發光呼吸脈衝以及 3D 碰撞粒子火花系統！

---

## 🎨 升級項目與亮點

### 1. PCF Soft Shadows (動態柔和陰影)
- 啟用 WebGLRenderer 的 `PCFSoftShadowMap` 與高解析度陰影貼圖（2048×2048）。
- 主光源（DirectionalLight）投射真實陰影，鋼珠、擋板、Bumpers 圓柱柱體均在深色檯面上投下立體陰影。
- 補光（Fill Light）為邊緣帶來冷色調微光，大幅增強 3D 空間景深。

### 2. Metallic Chrome Pinball (真實鏡面鋼珠)
- 鋼珠材質升級為極高金屬度與低粗糙度（`metalness: 0.95, roughness: 0.12`）。
- 鋼珠在燈光與不同角度滾動時呈現閃耀的鏡面高光。

### 3. 3D Spark Particle System (3D 撞擊霓虹火花)
- 實作了輕量高效的物件池化 3D 粒子系統（`SparkManager`），零 GC 壓力。
- **觸發時機**：
  - **Bumpers 受擊**：碰撞瞬間噴出對應顏色（霓虹粉紅、青藍、金黃）的 18 顆火花。
  - **Corner Kickers 彈射**：噴射出霓虹青綠色擴散火花。
  - **Flippers 擋板揮擊**：揮中球瞬間產生動態火花。
  - **鋼珠高速撞牆**：產生白色微型火花。

### 4. 自發光呼吸脈衝 (Glow Pulse)
- Bumpers 與 Corner Kickers 的 `emissiveIntensity` 在被擊中瞬間爆發高亮（2.8x），並在動畫循環中平滑衰減，提供極佳的受擊回饋感。

---

## 🔍 驗證方式
在 IDE 內部的 **Simple Browser** 分頁點擊 **🔄 重新整理**，發射彈珠即可即時體驗全新的光影、鏡面鋼珠與粒子火花！
