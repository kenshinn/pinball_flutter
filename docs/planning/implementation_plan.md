# Phase 5: 可擊倒靶位與頂部球道燈 (Drop Targets & Rollover Lanes)

本計畫旨在引進實體大型彈珠台最具可玩性與策略深度的兩大經典機關：**左側 3 連可擊倒落靶 (3-Bank Drop Targets)** 與 **頂部 A-B-C 球道燈 (Top Rollover Lanes with Lane Change)**，為玩家提供明確的打靶目標與倍率累積成就感。

---

## User Review Required

> [!NOTE]
> - **無縫整合現有物理與渲染**：所有落靶下沉動畫、球道感應與光影粒子皆在 Three.js + Cannon-es 既有架構下高效率執行，零外部模型載入延遲。
> - **支援彈珠台經典神技「Lane Change」**：揮動左/右擋板時，頂部已點亮的燈位會即時左右輪轉切換，讓玩家可主動控燈接球！

---

## Proposed Changes

### [three_app/js/main.js](file:///Users/kenshinn_huang/projects/pinball_flutter/three_app/js/main.js)

#### 1. 🎯 左側 3 連可擊倒落靶 (3-Bank Drop Targets)
- **位置與外觀**：位於左側中段（$X = -3.1, Z \in [-0.6, 0.2, 1.0]$），3 個亮黃霓虹立體靶位。
- **打擊機制**：
  - 球撞擊單靶時：靶位「啪！」地快速沉入地面下（下沉動畫），物理阻擋暫時停用，獎勵 **+250 分**、火花粒子與機械擊倒音效。
  - **全靶擊倒 (Bank Cleared)**：3 靶全倒時觸發 **`🎯 TARGETS CLEARED! +2,000`** 特效與雙重震感，1 秒後全體自動彈回地面重置！

#### 2. 💡 頂部 A-B-C 球道燈 (Top Rollover Lanes)
- **位置與外觀**：位於頂部 Bumpers 上方（$Z = -5.0$），設有 3 條平行導軌通道（$X = -1.2, 0.0, 1.2$），地面嵌入 `[A] [B] [C]` 霓虹光圈標籤。
- **滾過點亮**：球滾過未點亮的通道時，該道霓虹燈瞬間爆亮，獲得 **+150 分** 與高音鐘鳴。
- **控燈換位 (Lane Change)**：按壓左/右擋板時，已點亮的球道燈會同步向左/向右循環輪轉，方便玩家控燈。
- **全亮升級倍率 (Multiplier Upgrade)**：當 A-B-C 三燈全亮時，全場得分倍率永久/當局提升（×2 $\to$ ×3 $\to$ ×4），閃爍慶祝後重置為未點亮，可反覆挑戰！

#### 3. 🔊 音效與觸覺支援
- 新增落靶啪嗒聲（`playDropTargetHit`）與全靶彈起重置聲（`playBankReset`）。
- 新增球道燈點亮音效與倍率升級勝利和弦。

---

## Verification Plan

### Manual Verification (在 Chrome / 手機測試)
1. **落靶測試**：擊球撞擊左側 3 個黃色靶位，確認每擊中一個靶位即下沉入地面；3 靶全倒時確認彈出 +2,000 分橫幅並在 1 秒後自動升起重置。
2. **頂部球道燈測試**：球穿過頂部 A/B/C 通道，確認對應字母點亮；按壓左右擋板測試 Lane Change 是否能左右切換燈號。
3. **全道獎勵測試**：A-B-C 全亮時確認觸發倍率升級提示。
