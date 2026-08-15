# Phase 4: 加強手機體驗 (觸覺震動回饋 Haptics & 機械真實音效 SFX)

本計畫旨在透過 **Web Haptics API** 與 **Web Audio API 純代碼機械音效合成**，全面升級手機與平板的觸覺打擊手感與聽覺沉浸感，讓 WebGL 彈珠台擁有如同實體大型機台般的強烈打擊反饋。

---

## User Review Required

> [!NOTE]
> - **觸覺震動 (Haptics)**：使用現代標準 `navigator.vibrate`。在 Android Chrome 等支援設備上提供不同力度的微震動；在不支援的設備（如部分 iOS Safari）自動靜默降級，不影響遊玩。
> - **機械音效 (SFX)**：全數採用 Web Audio API 實時純代碼合成（Procedural Generation），**不依賴任何外部音訊檔案**，無額外網路負擔、零載入延遲。

---

## Proposed Changes

### [three_app/js/main.js](file:///Users/kenshinn_huang/projects/pinball_flutter/three_app/js/main.js)

#### 1. 📳 觸覺震動系統 (Haptic Engine)
- 封裝 `Haptic` 管理器，針對不同事件提供專屬的微震動 Pattern：
  - **擋板擊發 (Flipper Action)**：`12ms` 輕脆微震，模擬電磁閥（Solenoid）吸合擊發感。
  - **Bumper 撞擊 (Bumper Pop)**：`28ms` 結實打擊震動。
  - **擋板擊球 (Flipper Solid Hit)**：`20ms` 物理反彈衝擊震。
  - **開局救球 (Ball Saved)**：`[25, 40, 50]` 雙波節奏勝利震動。
  - **底洞出界 (Ball Drain)**：`[40, 50, 30]` 沉重失誤震動。

#### 2. 🔊 實體彈珠台機械合成音效 (Procedural Pinball SFX)
- 升級現有單調的 `playPing()`，實作多種實體機台經典音效：
  1. **擋板電磁閥啪嗒聲 (Flipper Clack)**：低頻 90Hz 方波衝擊 + 高通金屬卡榫白噪音（20ms），按壓擋板時即時響起。
  2. **Bumper 復古鐘聲泛音 (Chime / Bell)**：雙震盪器和弦（880Hz + 1320Hz 雙音衰減），打擊感更加立體清脆。
  3. **發球噴射推進音 (Launch Jet)**：頻率滑音（220Hz $\to$ 660Hz）營造彈簧/氣壓發射感。
  4. **救球勝利琶音 (Saver Fanfare)**：大三和弦清脆琶音（C5 $\to$ E5 $\to$ G5）。
  5. **鋼珠金屬滾動聲 (Ball Rolling Friction)**：隨球體物理速度動態調整音量的微弱金屬摩擦濾波音。

---

## Verification Plan

### Manual Verification (在手機或瀏覽器中測試)
1. **擋板操作**：點擊螢幕左右側揮動擋板，聆聽是否有電磁閥「啪嗒」聲，手機上感受 12ms 的微震動反饋。
2. **Bumper 撞擊**：發球撞擊中央三大 Bumper，確認立體金屬鐘聲與 28ms 的打擊震感。
3. **Ball Saver 救球**：讓球滑入底洞，確認救球橫幅彈出時伴隨雙音琶音與雙重震動。
