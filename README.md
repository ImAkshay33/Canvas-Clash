# 🎨 PaperClash: Territory Takeover

<div align="center">

![Status](https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)
![Node](https://img.shields.io/badge/node-v14+-green?style=for-the-badge)

> **A thrilling, colorful multiplayer territory-claiming game for your local network**
> 
> *Draw, claim, conquer. Paint your way to victory!* 🖌️

</div>

---

## 🌟 What is PaperClash?

PaperClash is a **fast-paced multiplayer game** inspired by paper.io, where players claim territory by drawing lines across a shared canvas. The twist? **It works on your local WiFi network!**

One player hosts the game server, and friends on the same WiFi can instantly join by simply typing the host's IP address and port into their browser. No downloads, no installations—just pure multiplayer fun! 🎮

### ✨ Key Features

- 🌈 **Colorful Multiplayer Gameplay** - Each player gets a vibrant unique color
- 🏠 **Local Network Play** - Host-based server, WiFi-connected players
- ⚡ **Real-time Action** - Instant canvas updates and smooth animations
- 🎯 **Strategic Depth** - Balance offense and defense to claim victory
- 📱 **Web-Based** - No app install needed; works in any modern browser
- 🛡️ **Simple & Intuitive** - Learn in seconds, master over time
- 🎨 **Beautiful Animations** - Smooth trails, satisfying visual feedback

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v14 or higher
- **npm** or yarn
- Players on the **same WiFi network**

### Installation & Setup

#### 1️⃣ Install Dependencies
```bash
npm install
```

#### 2️⃣ Start the Server
```bash
node server.js
```

You should see output like:
```
Server running on http://localhost:3000
```

#### 3️⃣ Find Your Host IP Address

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

#### 4️⃣ Connect Players

From any device on the same WiFi:
1. Open a browser
2. Enter: `http://<YOUR-HOST-IP>:3000`
   - Example: `http://192.168.1.100:3000`
3. Click to start playing! 🎮

---

## 📁 Project Structure

```
📦 paperclash/
├── 📄 server.js              # Express server & game logic
├── 📁 public/                # Frontend assets
│   ├── 📄 index.html         # Main game page
│   ├── 📄 game.js            # Game mechanics & rendering
│   └── 📄 styles.css         # Styling & animations
├── 📦 package.json           # Dependencies & scripts
└── 📖 README.md              # You are here!
```

---

## 🎮 How to Play

### Basic Gameplay

```
YOUR TURN:
1. Click on the canvas to spawn your character
2. Move your mouse to control direction
3. Draw lines to claim territory
4. Close loops to capture interior space
5. Expand your colored empire!
```

### Rules of Victory

| Action | Result |
|--------|--------|
| 🟦 Draw closed loop | Claim all territory inside |
| ⚠️ Touch your trail | Game Over (respawn) |
| 💥 Hit opponent trail | Game Over (respawn) |
| 🏆 Most territory | Win! |

### Strategy Tips

- 🎯 **Early Aggression**: Claim large territories at game start
- 🛡️ **Defense**: Protect your territory from invaders
- 🌀 **Loop Closure**: Quickly finish loops to secure territory
- 👁️ **Map Awareness**: Watch for opponents sneaking near your border

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5 Canvas, Vanilla JavaScript |
| **Backend** | Node.js, Express.js |
| **Real-time** | WebSockets (Socket.IO or native) |
| **Styling** | CSS3 with smooth animations |

---

## 📊 Game Configuration

Edit `server.js` to customize:

```javascript
// Board size
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Game settings
const GAME_TICK_RATE = 60;        // Updates per second
const TRAIL_WIDTH = 3;             // Pixel width of trails
const SPAWN_SAFETY_RADIUS = 50;    // Safe zone around spawn
```

---

## 🕹️ Controls

| Input | Action |
|-------|--------|
| 🖱️ **Mouse Move** | Control your character direction |
| 🖱️ **Click** | Start/respawn your character |
| ⌨️ **ESC** | Pause (future feature) |

---

## 🌐 Network Architecture

```
┌─────────────────────────────────────┐
│         HOST MACHINE                │
│   Running Node.js Server            │
│   (192.168.1.100:3000)              │
└──────────────┬──────────────────────┘
               │
       ┌───────┼───────┐
       │       │       │
       ▼       ▼       ▼
    Player1  Player2  Player3
    (WiFi)   (WiFi)   (WiFi)
```

All players communicate through the host server. The server syncs game state in real-time via WebSockets.

---

## � Troubleshooting

### ❌ Players can't connect
- **Check WiFi**: Ensure all devices are on the same network
- **Check IP**: Run `ipconfig` (Windows) / `ifconfig` (Mac/Linux)
- **Check Firewall**: Port 3000 might be blocked
- **Restart Server**: Kill and restart `node server.js`

### ❌ Game is lagging
- **Check Connection**: Weak WiFi = delayed updates
- **Reduce Players**: Too many concurrent players slow down the action

---

<div align="center">

### 🎨 Let's gooo! 🎨

```bash
node server.js
```

Then invite your friends and claim territory! 🚀

</div>
