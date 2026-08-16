# 擋板漸進轉動行程與按壓時間動態角度系統 (Progressive Flipper Stroke Range)

本計畫旨在透過**按壓時間動態決定目標旋轉角度（Hold-duration Dynamic Target Angle）**，解決玩家在右擋板尖端快速點擊時，擋板因轉動過滿（轉過水平線）而容易把球甩進右上角落的問題。

---

## User Review Required

> [!IMPORTANT]
> - **短按點擊 (Quick Tap / 短按)**：
>   - 擋板轉動角度被安全限制在**水平附近（$\theta_{tap} \approx \pm 0.06$）**，不再衝滿全行程。
>   - 擋板擊球表面永遠維持朝向**對角線（右擋板朝左上紅色箭頭，左擋板朝右上）**，尖端打擊 100% 穩定送向對角目標，**絕不會因為輕點一下就甩進右上死角！**
> - **長按蓄力 (Firm Hold / 長按)**：
>   - 隨著按住時間（0~100ms）平滑開放最大旋轉行程（$\theta_{full} \approx \mp 0.46$），只有在玩家刻意按住時才會衝滿頂角打出反手高角度球！

---

## Proposed Changes

### [three_app/js/main.js](file:///Users/kenshinn_huang/projects/pinball_flutter/three_app/js/main.js)

#### 1. 擋板漸進目標角度 (Dynamic Target Angle)
- 在 `animate()` 物理迴圈中，當 `f.engaged` 時動態計算 `targetAngle`：
  $$\text{chargeRatio} = \min(1.0, \frac{\text{holdMs}}{100\text{ms}})$$
  $$f.targetAngle = \theta_{tap} + \text{chargeRatio} \times (\theta_{full} - \theta_{tap})$$
  - **右擋板**：$\theta_{rest} = +0.58 \to \theta_{tap} = +0.06 \to \theta_{full} = -0.46$
  - **左擋板**：$\theta_{rest} = -0.58 \to \theta_{tap} = -0.06 \to \theta_{full} = +0.46$
- 當放開按鍵時（`!f.engaged`），`targetAngle` 立即切回 `restAngle`，乾脆回彈。

#### 2. 擊球法線與衝力自適應
- 配合動態角度，尖端擊球在短按時將以極度穩定的對角線法線（$nx \approx -0.45 \sim -0.55 < 0$）出球，徹底解決右上偏角問題。

---

## Verification Plan

### Manual Verification (在 Chrome / 手機測試)
1. **短按尖端測試**：球滑至右擋板尖端時快速點擊，觀察擋板是否只轉動至水平附近，球精準沿著對角線（紅色箭頭）飛向左側 Drop Targets 與紅色 Bumper。
2. **長按蓄力測試**：按住按鍵不放，觀察擋板平滑轉動至最高頂角，打出高推力重砲擊球。
