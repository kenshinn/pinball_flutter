# 擋板揮擊時機連續出球角度系統 (Continuous Dynamic Flipper Aiming Physics)

本計畫旨在引進實體彈珠台真實的**連續接觸面姿態角度模型（Continuous Contact Angle Dynamics）**，使出球方向完全由玩家的**揮擊時機（Timing：早揮 / 中揮 / 晚揮）**與**球體接觸點（Blade Position $t$）**自然決定，具備完整的瞄準扇面（Aim Arc）。

---

## User Review Required

> [!IMPORTANT]
> - **晚揮 (Late Flip / 球在尖端時擊發)**：擋板處於下方靜止傾斜姿態，出球精準飛向**對角線（Cross-table shot，右擋板直衝左上紅色箭頭，左擋板直衝右上）**！
> - **中揮 (Mid-timing Flip / 擋板轉至水平時擊發)**：出球直衝**正上方（Up the middle，中央黃色 Bumper 與頂部 A-B-C 球道燈）**！
> - **早揮 (Early Flip / 擋板抬至頂部時擊發)**：出球飛向**同側上方（Backhand shot，右擋板衝右上通道，左擋板衝左上通道）**！

---

## Proposed Changes

### [three_app/js/main.js](file:///Users/kenshinn_huang/projects/pinball_flutter/three_app/js/main.js)

#### 1. 連續瞬時表面法線模型 (Continuous Dynamic Surface Normal)
- 移除前一版絕對值強制鎖死，採用嚴格的旋轉瞬時法線：
  $$\vec{N} = (-\sin\theta, -\cos\theta)$$
- 隨擋板旋轉即時角 $\theta(t)$ 動態平滑變化：
  - **右擋板（Right Flipper，$\theta: +0.58 \to -0.52$）**：
    - $\theta = +0.58$（晚揮/尖端）：$\vec{N} = (-0.55, -0.83) \implies$ **左上方對角線 (Cross-table)**
    - $\theta = 0.00$（中揮/水平）：$\vec{N} = (0.00, -1.00) \implies$ **正上方 (Center Up)**
    - $\theta = -0.52$（早揮/頂部）：$\vec{N} = (+0.50, -0.87) \implies$ **右上方 (Backhand)**
  - **左擋板（Left Flipper，$\theta: -0.58 \to +0.52$）**：
    - $\theta = -0.58$（晚揮/尖端）：$\vec{N} = (+0.55, -0.83) \implies$ **右上方對角線 (Cross-table)**
    - $\theta = 0.00$（中揮/水平）：$\vec{N} = (0.00, -1.00) \implies$ **正上方 (Center Up)**
    - $\theta = +0.52$（早揮/頂部）：$\vec{N} = (-0.50, -0.87) \implies$ **左上方 (Backhand)**

#### 2. 線速度與切線動量連續加權
- 結合旋轉線速度 $v_{\text{rot}} = |\omega| \times (t \cdot L)$ 與球體原有切向滾動慣性，讓鋼珠出球角度平滑連貫、極具控球手感與瞄準深度！

---

## Verification Plan

### Manual Verification (在 Chrome / 手機測試)
1. **晚揮測試**：等球滑至右擋板尖端（下緣）時按下，確認球朝**左上方對角線（紅色箭頭路徑）**飛向 Drop Targets！
2. **中揮測試**：球在擋板中段、擋板揮至半途時擊中，確認球直衝**正上方中央 Bumper**！
3. **早揮測試**：球剛進入擋板根部時提早按下，確認球被順勢推向**同側上方（右上）**！
