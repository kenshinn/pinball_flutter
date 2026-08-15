# 擋板短按/長按動態力道系統 (Progressive Flipper Physics & Power Scaling)

本計畫旨在透過**按壓時間感知（Hold-duration Dynamic Acceleration）**與**可變角速度/衝力權重模型（Progressive Impulse & Tangent Curve）**，徹底解決擋板瞬間衝頂與出球角度死板的問題，實現實體彈珠台經典的「短按輕挑傳球 (Soft Tap / Feathering)」與「長按重砲擊發 (Power Smash)」！

---

## User Review Required

> [!IMPORTANT]
> - **短按 (Quick Tap / Feathering)**：按住時間極短（< 50ms）時，擋板從溫和的角速度（`12 rad/s`）起步，若提早放開會在半行程平滑回彈，擊球力道溫和（`10 ~ 16`），保留球體滾動切線慣性，極度適合細膩微操與雙擋板互傳。
> - **長按 (Firm Press / Power Smash)**：按住時角速度在 90ms 內迅速加速至極限（`30 rad/s`），全力衝至最大角度，擊球力道暴增（`18 ~ 32`），球如火箭般直衝頂部通道與目標靶位！

---

## Proposed Changes

### [three_app/js/main.js](file:///Users/kenshinn_huang/projects/pinball_flutter/three_app/js/main.js)

#### 1. 擋板按壓時間與角速度動態曲線 (Hold-duration Acceleration)
- 在 `flipper` 結構中加入 `pressStartTime` 與 `currentSpeed`。
- `setFlipper(side, true)` 時記錄按下時刻，初始速度由 `12 rad/s` 起步。
- 在 `animate()` 物理步進中：
  - 根據 `holdMs = now - f.pressStartTime` 動態計算角速度：
    $$\text{currentSpeed} = 12.0 + \min(1.0, \frac{\text{holdMs}}{90\text{ms}}) \times 18.0 \quad (12 \to 30\text{ rad/s})$$
  - 若在揮動過程中放開（`setFlipper(side, false)`），`targetAngle` 立即切回 `restAngle`，擋板能在中途提前回落，實現短按半行程輕挑球。

#### 2. 擊球物理力道動態縮放 (Dynamic Impulse & Variable Angle)
- 在 `resolveFlipperBall_V2` 中引入 **揮擊角速度權重（Speed Ratio）** 與 **按壓蓄力比例（Hold Ratio）**：
  - **基礎擊球速度（Kick Speed）**：
    $$\text{kickSpeed} = (10.0 + \text{holdRatio} \times 8.0) + \text{tipFactor} \times (6.0 + \text{holdRatio} \times 8.0)$$
  - **出球角度動態變化（Variable Ejection Angle）**：
    - 短按時提高切線慣性保留比重（`tangentRatio: 0.55`），球沿著擋板斜向輕柔滑出。
    - 長按時以強大的法線衝力強勢壓向正上方（`tangentRatio: 0.20`），球直衝上層球道。

#### 3. 打擊音效與震動分級回饋
- 擊球時依據 `holdRatio` 動態調節音效音高（380Hz $\to$ 740Hz）與微震強度（8ms $\to$ 24ms）。

---

## Verification Plan

### Manual Verification (在 Chrome / 手機測試)
1. **短按輕點測試**：極快速輕按 A 或 D（或手機螢幕兩側），觀察擋板動作是否更柔和，球被輕輕挑起、速度較慢、角度偏向側方。
2. **長按蓄力測試**：按住 A 或 D 不放，觀察擋板全速暴衝至頂角，擊中球時是否發出高亢強擊聲，球猛烈向上噴射。
