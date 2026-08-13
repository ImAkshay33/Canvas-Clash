const crypto = require("crypto");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");

const PORT = Number(globalThis.PAPER_LAN_PORT || (typeof process !== "undefined" && process.env.PORT) || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const TICK_RATE = 30;
const BROADCAST_RATE = 20;

const WORLD_WIDTH = 600;
const WORLD_HEIGHT = 600;
const GRID_SIZE = 0.5;
const GRID_COLS = WORLD_WIDTH / GRID_SIZE; // 1200
const GRID_ROWS = WORLD_HEIGHT / GRID_SIZE; // 1200

const PLAYER_RADIUS = 4.6;
const PLAYER_SPEED = 78;
const MAX_TURN_RATE = Math.PI * 3.25;

const RESPAWN_DELAY_MS = 2000;
const SPAWN_PROTECTION_MS = 3000;
const SAFE_SPAWN_MIN_DIST = 95;
const START_RADIUS_CELLS = 24;
const TRAIL_POINT_STEP = 0.85;
const TRAIL_HIT_RADIUS = PLAYER_RADIUS + 1.2;
const SELF_TRAIL_SKIP_POINTS = 12;
const MAX_PLAYERS = 12;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const COLORS = [
  "#ff5f6d",
  "#2ec4b6",
  "#ffbe0b",
  "#4dabf7",
  "#95d5b2",
  "#f783ac",
  "#f4a261",
  "#b197fc",
  "#40c057",
  "#ffd43b",
  "#48cae4",
  "#ff8787",
];

const state = {
  players: new Map(),
  nextColorIndex: 0,
  nextNumId: 1,
  tick: 0,
};

const territoryGrid = new Uint16Array(GRID_COLS * GRID_ROWS);
let changedCells = new Set();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function makeId() {
  return crypto.randomBytes(6).toString("hex");
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

function send(ws, payload) {
  if (ws.destroyed || !ws.writable) return;
  ws.write(encodeWebSocketFrame(JSON.stringify(payload)));
}

function broadcast(payload) {
  for (const player of state.players.values()) {
    send(player.ws, payload);
  }
}

const toCol = (x) => clamp(Math.floor(x / GRID_SIZE), 0, GRID_COLS - 1);
const toRow = (y) => clamp(Math.floor(y / GRID_SIZE), 0, GRID_ROWS - 1);

function cellIndexAtWorld(x, y) {
  return toRow(y) * GRID_COLS + toCol(x);
}

function setCellOwner(cellIdx, owner) {
  if (territoryGrid[cellIdx] === owner) return;
  territoryGrid[cellIdx] = owner;
  changedCells.add(cellIdx);
}

function findSafeSpawnSpot(excludePlayerId = null, attempts = 40) {
  const margin = 50; // spawn margin in world units
  const excluded = excludePlayerId ? state.players.get(excludePlayerId) : null;
  const excludedNumId = excluded ? excluded.numId : null;
  const living = [...state.players.values()].filter(
    (p) => p.alive && p.id !== excludePlayerId
  );

  let bestSpot = null;
  let bestDist = -1;

  for (let i = 0; i < attempts; i++) {
    const candidate = {
      x: margin + Math.random() * (WORLD_WIDTH - margin * 2),
      y: margin + Math.random() * (WORLD_HEIGHT - margin * 2),
    };

    let minDist = Infinity;
    for (const p of living) {
      minDist = Math.min(minDist, distance(candidate, p));
      if (minDist < SAFE_SPAWN_MIN_DIST) break;
    }

    const col = toCol(candidate.x);
    const row = toRow(candidate.y);
    let hasNearbyTerritory = false;
    const territoryRadius = Math.round(40 / GRID_SIZE);
    for (let r = -territoryRadius; r <= territoryRadius && !hasNearbyTerritory; r += 4) {
      for (let c = -territoryRadius; c <= territoryRadius; c += 4) {
        const testCol = col + c;
        const testRow = row + r;
        if (testCol < 0 || testCol >= GRID_COLS || testRow < 0 || testRow >= GRID_ROWS) continue;
        const owner = territoryGrid[testRow * GRID_COLS + testCol];
        if (owner > 0 && owner !== excludedNumId) {
          hasNearbyTerritory = true;
          minDist = Math.min(minDist, 0);
          break;
        }
      }
    }

    if (living.length === 0) minDist = Infinity;

    if (minDist > bestDist) {
      bestDist = minDist;
      bestSpot = candidate;
      if (minDist >= SAFE_SPAWN_MIN_DIST) break;
    }
  }

  // Fallback to random spot if no safe spot satisfies the min distance
  if (!bestSpot) {
    bestSpot = {
      x: margin + Math.random() * (WORLD_WIDTH - margin * 2),
      y: margin + Math.random() * (WORLD_HEIGHT - margin * 2),
    };
  }
  return bestSpot;
}

function carveStartingTerritory(player, spot) {
  const centerCol = Math.round(spot.x / GRID_SIZE);
  const centerRow = Math.round(spot.y / GRID_SIZE);
  for (let r = -START_RADIUS_CELLS; r <= START_RADIUS_CELLS; r++) {
    for (let c = -START_RADIUS_CELLS; c <= START_RADIUS_CELLS; c++) {
      if (Math.hypot(c, r) <= START_RADIUS_CELLS) {
        const col = clamp(centerCol + c, 0, GRID_COLS - 1);
        const row = clamp(centerRow + r, 0, GRID_ROWS - 1);
        const cellIdx = row * GRID_COLS + col;
        setCellOwner(cellIdx, player.numId);
      }
    }
  }
}

function findNearestOwnedCell(x, y, numId) {
  const centerCol = toCol(x);
  const centerRow = toRow(y);

  // Search in expanding squares up to radius 25 cells
  for (let r = 1; r <= 25; r++) {
    for (let c = -r; c <= r; c++) {
      const rowsToCheck = [centerRow - r, centerRow + r];
      for (const row of rowsToCheck) {
        if (row >= 0 && row < GRID_ROWS) {
          const col = clamp(centerCol + c, 0, GRID_COLS - 1);
          if (territoryGrid[row * GRID_COLS + col] === numId) {
            return { x: col * GRID_SIZE, y: row * GRID_SIZE };
          }
        }
      }

      if (c > -r && c < r) {
        const colsToCheck = [centerCol - r, centerCol + r];
        for (const col of colsToCheck) {
          if (col >= 0 && col < GRID_COLS) {
            const row = clamp(centerRow + c, 0, GRID_ROWS - 1);
            if (territoryGrid[row * GRID_COLS + col] === numId) {
              return { x: col * GRID_SIZE, y: row * GRID_SIZE };
            }
          }
        }
      }
    }
  }
  return null;
}

function updateTrailAndTerritory(player) {
  const cellOwner = territoryGrid[cellIndexAtWorld(player.x, player.y)];

  if (cellOwner === player.numId) {
    if (player.trail.length > 0) {
      player.trail.push({ x: player.x, y: player.y });
      captureTerritory(player);
      player.trail = [];
    }
  } else {
    if (player.trail.length === 0) {
      const startCell = findNearestOwnedCell(player.x, player.y, player.numId);
      if (startCell) {
        player.trail.push(startCell);
      }
    }

    const last = player.trail[player.trail.length - 1];
    if (!last || Math.hypot(player.x - last.x, player.y - last.y) >= TRAIL_POINT_STEP) {
      player.trail.push({ x: player.x, y: player.y });
    }
  }
}

function encodeRLE(grid) {
  const rle = [];
  let currentVal = grid[0];
  let count = 1;
  for (let i = 1; i < grid.length; i++) {
    if (grid[i] === currentVal) {
      count++;
    } else {
      rle.push(currentVal, count);
      currentVal = grid[i];
      count = 1;
    }
  }
  rle.push(currentVal, count);
  return rle;
}

function addPlayer(ws, requestedName) {
  const id = makeId();
  const color = COLORS[state.nextColorIndex % COLORS.length];
  state.nextColorIndex += 1;
  const numId = state.nextNumId++;

  const index = state.players.size;
  const name = cleanName(requestedName || `Player ${index + 1}`);

  const player = {
    id,
    numId,
    ws,
    name,
    color,
    x: -9999,
    y: -9999,
    heading: 0,
    targetHeading: 0,
    inputActive: false,
    speed: PLAYER_SPEED,
    alive: true,
    trail: [],
    lastTrailPoint: null,
    respawnAt: 0,
    spawnProtectedUntil: Date.now() + SPAWN_PROTECTION_MS,
    territoryCellCount: 0,
  };

  state.players.set(id, player);

  const spawn = findSafeSpawnSpot(id);
  player.x = spawn.x;
  player.y = spawn.y;
  // Initialize facing towards center of map
  player.heading = Math.atan2(WORLD_HEIGHT / 2 - player.y, WORLD_WIDTH / 2 - player.x);
  player.targetHeading = player.heading;

  carveStartingTerritory(player, spawn);
  recalculateScores();

  send(ws, {
    type: "welcome",
    selfId: id,
    world: {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      playerRadius: PLAYER_RADIUS,
      gridSize: GRID_SIZE,
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
    },
    lanUrls: getLanAddresses().map((ip) => `http://${ip}:${PORT}`),
  });

  send(ws, {
    type: "territoryFull",
    rle: encodeRLE(territoryGrid),
  });

  return player;
}

function cleanName(name) {
  const trimmed = String(name).replace(/[^\w .-]/g, "").trim();
  return trimmed.slice(0, 18) || "Player";
}

function updateHeading(player, dt) {
  if (player.inputActive) {
    let diff = normalizeAngle(player.targetHeading - player.heading);
    const maxStep = MAX_TURN_RATE * dt;
    if (Math.abs(diff) <= maxStep) {
      player.heading = player.targetHeading;
    } else {
      player.heading += Math.sign(diff) * maxStep;
    }
    player.heading = normalizeAngle(player.heading);
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function movePlayer(player, dt) {
  player.x += Math.cos(player.heading) * player.speed * dt;
  player.y += Math.sin(player.heading) * player.speed * dt;
  player.x = clamp(player.x, 0, WORLD_WIDTH);
  player.y = clamp(player.y, 0, WORLD_HEIGHT);
}



function drawLine(x0, y0, x1, y1, callback) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    callback(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function rasterizeTrailToGrid(trail) {
  const boundaryCells = new Set();
  for (let i = 0; i < trail.length - 1; i++) {
    const p1 = trail[i];
    const p2 = trail[i + 1];
    const col1 = toCol(p1.x);
    const row1 = toRow(p1.y);
    const col2 = toCol(p2.x);
    const row2 = toRow(p2.y);
    drawLine(col1, row1, col2, row2, (col, row) => {
      boundaryCells.add(row * GRID_COLS + col);
    });
  }
  return boundaryCells;
}

function captureTerritory(player) {
  const boundaryCells = rasterizeTrailToGrid(player.trail);
  for (const cellIdx of boundaryCells) {
    setCellOwner(cellIdx, player.numId);
  }

  const visited = new Uint8Array(GRID_COLS * GRID_ROWS);
  const queue = new Uint32Array(GRID_COLS * GRID_ROWS);
  let head = 0;
  let tail = 0;

  for (let col = 0; col < GRID_COLS; col++) {
    const idxTop = col;
    if (territoryGrid[idxTop] !== player.numId) {
      visited[idxTop] = 1;
      queue[tail++] = idxTop;
    }
    const idxBottom = (GRID_ROWS - 1) * GRID_COLS + col;
    if (territoryGrid[idxBottom] !== player.numId) {
      visited[idxBottom] = 1;
      queue[tail++] = idxBottom;
    }
  }

  for (let row = 1; row < GRID_ROWS - 1; row++) {
    const idxLeft = row * GRID_COLS;
    if (territoryGrid[idxLeft] !== player.numId) {
      visited[idxLeft] = 1;
      queue[tail++] = idxLeft;
    }
    const idxRight = row * GRID_COLS + (GRID_COLS - 1);
    if (territoryGrid[idxRight] !== player.numId) {
      visited[idxRight] = 1;
      queue[tail++] = idxRight;
    }
  }

  while (head < tail) {
    const curr = queue[head++];
    const col = curr % GRID_COLS;
    const row = Math.floor(curr / GRID_COLS);

    if (row > 0) {
      const next = curr - GRID_COLS;
      if (visited[next] === 0 && territoryGrid[next] !== player.numId) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    if (row < GRID_ROWS - 1) {
      const next = curr + GRID_COLS;
      if (visited[next] === 0 && territoryGrid[next] !== player.numId) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    if (col > 0) {
      const next = curr - 1;
      if (visited[next] === 0 && territoryGrid[next] !== player.numId) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    if (col < GRID_COLS - 1) {
      const next = curr + 1;
      if (visited[next] === 0 && territoryGrid[next] !== player.numId) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  for (let i = 0; i < territoryGrid.length; i++) {
    if (visited[i] === 0 && territoryGrid[i] !== player.numId) {
      setCellOwner(i, player.numId);
    }
  }

  for (const other of state.players.values()) {
    if (other.id === player.id || !other.alive) continue;
    if (Date.now() < (other.spawnProtectedUntil || 0)) continue;
    if (territoryGrid[cellIndexAtWorld(other.x, other.y)] === player.numId) {
      eliminate(other);
    }
  }

  recalculateScores();
}

function recalculateScores() {
  const counts = {};
  for (const player of state.players.values()) {
    counts[player.numId] = 0;
  }
  for (let i = 0; i < territoryGrid.length; i++) {
    const owner = territoryGrid[i];
    if (owner > 0 && counts[owner] !== undefined) {
      counts[owner]++;
    }
  }
  for (const player of state.players.values()) {
    player.territoryCellCount = counts[player.numId] || 0;
  }
}

function pointNearTrail(x, y, trail, radius, skipRecent = 0) {
  if (trail.length < 2) return false;
  const end = Math.max(1, trail.length - skipRecent);
  for (let i = 0; i < end - 1; i++) {
    const a = trail[i];
    const b = trail[i + 1];
    if (distancePointToSegment(x, y, a.x, a.y, b.x, b.y) <= radius) {
      return true;
    }
  }
  return false;
}

function hitsOwnTrail(player) {
  return pointNearTrail(player.x, player.y, player.trail, TRAIL_HIT_RADIUS, SELF_TRAIL_SKIP_POINTS);
}

function checkCollisions() {
  const players = [...state.players.values()].filter((player) => player.alive);
  const now = Date.now();

  for (const player of players) {
    if (!player.alive || now < (player.spawnProtectedUntil || 0)) continue;

    if (hitsOwnTrail(player)) {
      eliminate(player);
      continue;
    }

    for (const trailOwner of players) {
      if (trailOwner.id === player.id || !trailOwner.alive || trailOwner.trail.length < 2) continue;
      if (now < (trailOwner.spawnProtectedUntil || 0)) continue;
      if (pointNearTrail(player.x, player.y, trailOwner.trail, TRAIL_HIT_RADIUS)) {
        eliminate(trailOwner);
      }
    }
  }

  for (const player of players) {
    if (!player.alive || now < (player.spawnProtectedUntil || 0)) continue;
    for (const other of players) {
      if (other.id <= player.id || !other.alive) continue;
      if (now < (other.spawnProtectedUntil || 0)) continue;
      if (Math.hypot(player.x - other.x, player.y - other.y) < PLAYER_RADIUS * 2) {
        eliminate(player);
        eliminate(other);
        break;
      }
    }
  }
}

function eliminate(player) {
  player.alive = false;
  player.trail = [];
  player.lastTrailPoint = null;

  // Release territory back to neutral
  for (let i = 0; i < territoryGrid.length; i++) {
    if (territoryGrid[i] === player.numId) {
      setCellOwner(i, 0);
    }
  }
  player.territoryCellCount = 0;
  player.spawnProtectedUntil = 0;
  player.respawnAt = Date.now() + RESPAWN_DELAY_MS;
  broadcast({ type: "eliminated", id: player.id, respawnInMs: RESPAWN_DELAY_MS });
  recalculateScores();
}

function respawn(player) {
  const spawn = findSafeSpawnSpot(player.id);
  player.x = spawn.x;
  player.y = spawn.y;
  player.heading = Math.atan2(WORLD_HEIGHT / 2 - player.y, WORLD_WIDTH / 2 - player.x);
  player.targetHeading = player.heading;
  player.alive = true;
  player.trail = [];
  player.lastTrailPoint = null;
  player.spawnProtectedUntil = Date.now() + SPAWN_PROTECTION_MS;
  player.respawnAt = 0;
  carveStartingTerritory(player, spawn);
  recalculateScores();
}

function update(dt) {
  state.tick += 1;

  for (const player of state.players.values()) {
    if (!player.alive) {
      if (Date.now() >= player.respawnAt) respawn(player);
      continue;
    }

    updateHeading(player, dt);
    movePlayer(player, dt);
    updateTrailAndTerritory(player);
  }

  checkCollisions();
}

function broadcastState() {
  const snapshots = [...state.players.values()].map((player) => ({
    id: player.id,
    numId: player.numId,
    name: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
    heading: player.heading,
    alive: player.alive,
    score: player.territoryCellCount,
    percent: (player.territoryCellCount / (GRID_COLS * GRID_ROWS)) * 100,
    protected: Date.now() < (player.spawnProtectedUntil || 0),
    trail: player.trail.map((p) => [p.x, p.y]),
    respawnInMs: player.alive ? 0 : Math.max(0, player.respawnAt - Date.now()),
  }));

  let deltas = [];
  if (changedCells.size > 0) {
    for (const cellIdx of changedCells) {
      deltas.push(cellIdx, territoryGrid[cellIdx]);
    }
    changedCells = new Set();
  }

  const payload = {
    type: "state",
    tick: state.tick,
    players: snapshots,
  };

  if (deltas.length > 0) {
    payload.deltas = deltas;
  }

  broadcast(payload);
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const safePath = path.normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, contents) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(contents);
  });
}

function encodeWebSocketFrame(payload) {
  const data = Buffer.from(payload);
  const length = data.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, data]);
}

function decodeWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  if (opcode === 0x8) return { close: true };
  let offset = 2;
  let length = buffer[1] & 0x7f;
  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }
  const masked = Boolean(buffer[1] & 0x80);
  let mask;
  if (masked) {
    mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }
  const payload = buffer.slice(offset, offset + length);
  if (masked) {
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] ^= mask[i % 4];
    }
  }
  return { text: payload.toString("utf8") };
}

function handleSocket(socket) {
  let player = null;
  socket.on("data", (buffer) => {
    const frame = decodeWebSocketFrame(buffer);
    if (!frame) return;
    if (frame.close) {
      socket.end();
      return;
    }
    try {
      const message = JSON.parse(frame.text);
      if (message.type === "join" && !player && state.players.size < MAX_PLAYERS) {
        player = addPlayer(socket, message.name);
      }
      if (message.type === "input" && player) {
        if (typeof message.angle === "number") {
          player.targetHeading = message.angle;
          player.inputActive = Boolean(message.active);
        }
      }
    } catch {
      send(socket, { type: "error", message: "Bad message" });
    }
  });
  socket.on("close", () => {
    if (player) {
      eliminate(player);
      state.players.delete(player.id);
    }
  });
  socket.on("error", () => {
    if (player) {
      eliminate(player);
      state.players.delete(player.id);
    }
  });
}

const server = http.createServer(serveFile);

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n")
  );
  handleSocket(socket);
});

server.listen(PORT, "0.0.0.0", () => {
  const urls = [`http://localhost:${PORT}`, ...getLanAddresses().map((ip) => `http://${ip}:${PORT}`)];
  console.log("Paper LAN server running:");
  for (const url of urls) console.log(`  ${url}`);
  console.log("Clients only need a browser on the same Wi-Fi.");
});

// Simulation update at 30Hz
setInterval(() => update(1 / TICK_RATE), 1000 / TICK_RATE);

// Broadcast update at 20Hz
setInterval(broadcastState, 1000 / BROADCAST_RATE);
