# Canvas Clash — MVP Structure

## Goal
A lightweight real-time multiplayer territory-claiming game that is easy to run locally and easy to extend.

## Current Architecture
- `server.js` — authoritative game/server logic and WebSocket communication
- `public/index.html` — game shell and UI
- `public/game.js` — client rendering, controls, and gameplay presentation
- `public/styles.css` — visual styling and responsive layout

## MVP Responsibilities

### Server
- Player sessions and nicknames
- Authoritative movement/game state
- Territory and trail management
- Collision/elimination rules
- Match lifecycle
- Leaderboard state
- WebSocket state broadcasting

### Client
- Join/lobby experience
- Canvas rendering
- Keyboard + pointer/touch controls
- HUD and leaderboard
- Minimap
- Elimination/respawn states
- Match completion/restart UX

## Future Structure
```text
Canvas-Clash/
├── server.js
├── public/
│   ├── index.html
│   ├── game.js
│   └── styles.css
├── docs/
│   └── MVP.md
└── README.md
```

## Next Enhancements
- Room/lobby codes
- Match timer and configurable game modes
- Persistent player statistics
- Better anti-cheat validation
- Spectator mode
- Deployment configuration
- Automated tests for game rules
