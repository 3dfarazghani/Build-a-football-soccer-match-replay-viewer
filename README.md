# PitchLine 3D — Football Match Replay & Live Stream Viewer

A 3D football (soccer) match viewer built with **Vite**, **vanilla JavaScript (ES modules)**, **Three.js**, and an **Express + WebSocket** backend. Supports both recorded **Metrica Sports Sample_Game_1** CSV replay and a real-time **25 Hz WebSocket live stream** through one shared pipeline:

```
Data Source (Replay or Live WS) -> Normalizer -> Timeline/Buffer -> Scene State -> Renderer
```

## Setup & Running

1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure the **Metrica Sports `Sample_Game_1`** CSV files are in `/public/data/` (already included; source repository: `https://github.com/metrica-sports/sample-data/tree/master/data/Sample_Game_1`):
   - `public/data/Sample_Game_1_RawTrackingData_Home_Team.csv`
   - `public/data/Sample_Game_1_RawTrackingData_Away_Team.csv`
   - `public/data/Sample_Game_1_RawEventsData.csv`

3. Start the Express + Vite + WebSocket server (port `3000`):
   ```bash
   npm run dev
   ```

4. Production build & start:
   ```bash
   npm run build
   npm start
   ```

## Features & Controls

- **Data Source Switcher (`Metrica` | `Hudl Data` | `Live Feed`)**:
  - **Metrica**: Replays local 25 Hz Metrica `Sample_Game_1` CSVs (`0s` buffer delay, full scrubbing, `0.25×`–`4×` speed).
  - **Hudl Data**: Opens a live GitHub catalog browser for `github.com/hudl/open-data` (competitions, seasons, and matches), normalizing StatsBomb `120 × 80` events and `360` freeze-frame snapshots into smooth 3D playback.
  - **Live Feed**: Connects to `/ws` 25 Hz WebSocket stream (`2.5s` buffer delay and **Live Edge** snap).
- **Match Info & Stats Panel**: Click **Match Info & Stats** in the top-right header to view live scoreboard, shots, shots on target, passes, territory share, set pieces, fouls, cards, active players, and the dataset source link.
- **Space**: Play / Pause
- **Left / Right Arrow**: Seek −5s / +5s
- **1 / 2 / 3**: Switch camera mode (`1` Tactical top-down, `2` Broadcast ball-tracking cam, `3` Free OrbitControls)
- **H**: Collapse / expand bottom control dock
- **F**: Toggle FPS counter
- **Event Markers & Highlights**: Click any goal/shot marker on the scrubber or inside **Highlights** to jump to `event.t - 3s` and play.
