# 🎨 Canvas Clash

<div align="center">

![Status](https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge)
![Node](https://img.shields.io/badge/node-builtin-green?style=for-the-badge)
![Players](https://img.shields.io/badge/players-2--12-blue?style=for-the-badge)

> **A fast-paced multiplayer territory game inspired by Paper.io**
> 
> *Move, expand, dominate. Play on local WiFi with zero setup.* 🎮

</div>

---

## 🌟 What is Canvas Clash?

Canvas Clash is a **real-time multiplayer territory game** inspired by Paper.io. You control a character that moves across a grid, leaving a colored trail. Complete loops to claim territory. Eliminate opponents by crashing into them or trapping them.

**The magic**: Host on your laptop, friends on your WiFi open a browser, type your IP:port—*instant multiplayer*. No app downloads, no installations, no external dependencies. Just pure competitive fun! 🎮

### ✨ Key Features

- 🌈 **Colorful Multiplayer** - Each player gets a unique color; host can play too
- 🏠 **Zero Dependencies** - Pure Node.js, runs instantly without npm install
- ⚡ **Real-time Gameplay** - 30 FPS server tick, instant updates to all browsers
- 🎯 **Strategic Combat** - Claim territory, trap opponents, survive the chaos
- 📱 **Mobile-Friendly** - Works on phones, tablets, and desktops (any browser)
- ⚙️ **Simple & Fast** - Download, run `node server.js`, play
- 🗺️ **Live Minimap** - Bottom-right minimap shows all players and territories
- 📊 **Real-time Leaderboard** - Top 10 players ranked by territory percentage
- 🔥 **Optimal for 2-6 Players** - Works with more, but 2-6 is sweet spot for gameplay

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v14+ installed
- **Any modern browser** (Chrome, Firefox, Safari, Edge)
- All devices on **same WiFi network**
- **No npm install required** – pure Node.js, zero dependencies!

### Installation & Setup

#### 1️⃣ Start the Server
```bash
node server.js
```

Server starts on `http://localhost:8005` (or custom PORT via env var)

#### 2️⃣ Find Your Host IP Address

**On Windows (PowerShell):**
```powershell
ipconfig
# Look for "IPv4 Address" (usually something like 192.168.x.x)
```

**On Mac/Linux:**
```bash
ifconfig
# Look for "inet" address under your WiFi adapter
```

#### 3️⃣ Connect Players

From any device on the same WiFi:
1. Open a browser (mobile, tablet, or desktop)
2. Enter: `http://<YOUR-HOST-IP>:8005`
   - Example: `http://192.168.1.100:8005`
3. **Host can also play!** Open the same URL on your machine
4. Click the canvas to spawn and start playing! 🎮

---

## 📁 Project Structure

```
📦 canvas-clash/
├── 📄 server.js              # Node.js server & game logic
├── 📁 public/                # Frontend assets
│   ├── 📄 index.html         # Game page
│   ├── 📄 game.js            # Game mechanics
│   └── 📄 styles.css         # Styling
├── 📦 package.json           # No dependencies!
└── 📖 README.md              # You are here!
```

---

## 🎮 How to Play

### Basic Gameplay

```
1. Click on the canvas to spawn your character
2. Move using WASD, Arrow Keys, or drag mouse to control direction
3. Your trail claims territory behind you
4. Complete loops to lock in territory
5. Crash into enemies to eliminate them!
```

### Multiple Control Methods

You can control your character using **any** of these methods:

- **⌨️ WASD Keys**: Classic directional movement
- **⬅️ Arrow Keys**: Full directional support
- **🖱️ Mouse/Touch Drag**: Click and drag from center to control direction (works on mobile!)
- **F Key**: Toggle fullscreen for immersive gameplay
- **Multiple Inputs**: Combine keys for diagonal movement

### Rules & Mechanics

**Scoring:**
- Your **score = percentage of territory you own** (shown in leaderboard)
- Complete loops to claim enclosed territory

**Elimination:**
| Action | Result |
|--------|--------|
| 🔄 Complete a loop | Claim all interior territory (auto flood-fill) |
| 💀 Head-on collision with opponent | Both players eliminated |
| 💀 Crash into opponent's trail | Trail owner eliminated, you continue |
| ⚠️ Touch your own trail | Game Over (respawn in 2 sec) |
| 🟦 Most territory at game end | Win! |

**Respawn & Protection:**
- 🛡️ **Spawn Protection**: 3 sec invulnerability after respawn (visual pulsing rings)
- ⏱️ **Respawn Delay**: 2 sec countdown before you respawn
- 📍 **Safe Spawn**: Algorithm finds spawn location ≥95 units from other players
- 💀 **Territory Loss**: ALL your territory reverts to neutral when eliminated
- **Grace Period**: 12 trail points behind you are "safe" (can escape tight spots)

### Strategy Tips

- 🎯 **Aggressive Loop Closing**: Quickly complete loops to lock territory before opponents invade
- 🛡️ **Defensive Borders**: Build walls on your territory edges; opponents lose ALL territory when eliminated
- 💣 **Trap & Eliminate**: Herd opponents into corners and crash to eliminate them
- 👁️ **Use the Minimap**: Check bottom-right minimap to track opponents and safe areas
- 🏃 **Escape Routes**: Always leave an exit from your territory; 12-point grace period helps you escape
- 🤝 **Watch Spawn Zones**: New players spawn ~95 units away; predict and intercept early
- 📊 **Leaderboard Strategy**: Weak leader? Ignore them; focus on preventing third place from overtaking you
- ⚡ **Early Expansion**: Claim large territories early; harder to reclaim later

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5 Canvas, Vanilla JavaScript |
| **Backend** | Node.js (native `http` module only) |
| **Real-time** | WebSockets (native) |
| **Styling** | CSS3 animations |
| **Dependencies** | None (pure Node.js) |

---

## 📊 Game Configuration & Tuning

Edit `server.js` to tweak gameplay parameters:

```javascript
const WORLD_WIDTH = 600;             // Play area width (units)
const WORLD_HEIGHT = 600;            // Play area height (units)
const GRID_SIZE = 0.5;               // Territory grid cell size
const PLAYER_SPEED = 78;             // Movement speed (units/sec)
const MAX_TURN_RATE = Math.PI * 3.25; // Turn rate (radians/sec)
const TICK_RATE = 30;                // Server simulation rate (Hz)
const BROADCAST_RATE = 20;           // State broadcast rate (Hz)
const RESPAWN_DELAY_MS = 2000;       // Time before respawn
const SPAWN_PROTECTION_MS = 3000;    // Invulnerability duration
const SAFE_SPAWN_MIN_DIST = 95;      // Min distance from other players
const START_RADIUS_CELLS = 24;       // Starting territory radius
const TRAIL_POINT_STEP = 0.85;       // Distance between trail points
const TRAIL_HIT_RADIUS = 5.8;        // Trail collision radius
const SELF_TRAIL_SKIP_POINTS = 12;   // Grace period for self-collision
const MAX_PLAYERS = 12;              // Max concurrent players (soft limit)
const PORT = 8005;                   // Or set via process.env.PORT
```

---

## 🕹️ Controls

| Input | Action |
|-------|--------|
| ⬅️ **WASD Keys** | Move in four directions |
| ⬅️ **Arrow Keys** | Directional movement (same as WASD) |
| 🖱️ **Mouse/Touch Drag** | Drag to move character (dead zone: 3px, max radius: 34px) |
| 🖱️ **Click on Canvas** | Spawn/respawn your character |
| ⌨️ **F Key** | Toggle fullscreen mode |
| **Multiple Keys** | Combine for diagonal movement (e.g., W+D for up-right)

---

## 🌐 Network Architecture & Browser Support

```
┌─────────────────────────────────────┐
│      HOST MACHINE                   │
│  Node.js Server (Player too!)        │
│  Listens on 0.0.0.0:8005             │
└────────────┬────────────────────────┘
             │ WebSocket (30 Hz updates)
    ┌────────┼────────┐
    │        │        │
    ▼        ▼        ▼
  Host    Player2  Player3
 (Browser) (WiFi)   (WiFi)
   + 
 Tablets/Phones
```

**How It Works:**
1. Host runs `node server.js` on port 8005
2. Server broadcasts game state via WebSocket 20x/sec
3. All players render at 60 FPS locally (with 80ms client interpolation)
4. Game maintains 30 Hz simulation tick for consistent physics

**Browser Support:**
- ✅ Desktop browsers (Chrome, Firefox, Safari, Edge)
- ✅ Mobile browsers (any modern WebSocket-capable browser)
- ✅ Tablets (iPad, Android tablets)
- ✅ Touch & pointer events supported
- ✅ Responsive design (mobile, tablet, desktop layouts)

---
## 🎨 Game Features in Detail

### Minimap
- **Location**: Bottom-right corner (15px margin)
- **Size**: ~104-132 pixels (responsive to screen size)
- **Shows**: All living players as colored dots, territory colors, arena borders
- **Local Player**: White-stroked circle for easy identification
- **Updates**: Real-time as territory changes

### Leaderboard
- **Location**: Top-right corner
- **Displays**: Top 10 players ranked by territory %
- **You Indicator**: Your name in bold
- **Updates**: Real-time scoring based on owned territory
- **Scoring**: `(your cells / total cells) × 100 = your %`

### Visual Effects
- **Trails**: Glowing effect (10px shadow) + 4px core path in player color
- **Player**: Circle with dark stroke and white highlight
- **Spawn Shield**: Pulsing concentric rings (white outer, colored inner)
- **Arena**: Gradient background + decorative semi-transparent circles
- **Dead Screen**: Dark overlay with respawn countdown circle (red)

---
## � Troubleshooting

### ❌ Players can't connect
- **Same Network?** Ensure all devices are on the same WiFi
- **Find Host IP**: Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- **Verify URL**: Use `http://192.168.x.x:8005` (note port 8005)
- **Firewall?** Port 8005 might be blocked by antivirus/firewall (add exception)
- **Restart Server**: Kill and rerun `node server.js`

### ❌ Game is laggy/choppy
- **WiFi signal**: Weak signal = delayed updates. Move closer to router or use 5GHz band
- **Connection quality**: Run `ping <host-ip>` to check latency (should be <50ms)
- **Too many players**: Optimal is 2-6 players; >6 may cause slowdown
- **Use LAN**: Wired connection from host = best stability

### ❌ No input response
- **Click to spawn first**: You must click canvas before moving
- **Multiple input methods**: Try arrow keys if WASD not working, or try mouse drag
- **Fullscreen mode**: Press F if stuck in weird UI state
- **Refresh page**: Reload browser tab if stuck

### ❌ Minimap not visible
- **Check screen size**: Minimap appears in bottom-right (needs space)
- **Fullscreen**: Try toggling fullscreen (F key)
- **Browser zoom**: Reset zoom to 100% (Ctrl+0)

---

<div align="center">

### 🎨 Let's gooo! 🎨

```bash
node server.js
```

Then invite your friends and claim territory! 🚀

</div>
