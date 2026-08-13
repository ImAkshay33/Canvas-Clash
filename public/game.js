const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const joinPanel = document.querySelector("#join-panel");
const joinForm = document.querySelector("#join-form");
const nameInput = document.querySelector("#name");
const statusEl = document.querySelector("#status");
const urlsEl = document.querySelector("#urls");
const playersEl = document.querySelector("#players");

const WORLD_WIDTH = 600;
const WORLD_HEIGHT = 600;

const localState = {
  mode: "menu",
  selfId: null,
  world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, playerRadius: 5, gridCols: 1200, gridRows: 1200 },
  players: [],
  socket: null,
  input: { up: false, down: false, left: false, right: false },
  pointerActive: false,
  pointerOrigin: null,
  pointerCurrent: null,
  tick: 0,
  selfAlive: true,
  selfRespawnAt: 0,
  grid: null,
  lastDeltaSize: 0,
};

const camera = {
  x: WORLD_WIDTH / 2,
  y: WORLD_HEIGHT / 2,
  targetX: WORLD_WIDTH / 2,
  targetY: WORLD_HEIGHT / 2,
  zoom: 2.15,
};

// Offscreen canvas for fast territory pixel blitting
const offscreenCanvas = document.createElement("canvas");
offscreenCanvas.width = 1200;
offscreenCanvas.height = 1200;
const offscreenCtx = offscreenCanvas.getContext("2d");

const numIdToColor = {};

let lastSentAngle = null;
let lastSentActive = null;

function connect(name) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}`);
  localState.socket = socket;
  localState.mode = "connecting";
  statusEl.textContent = "Connecting";

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "join", name }));
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "welcome") {
      localState.selfId = message.selfId;
      localState.world = message.world;
      localState.mode = "playing";
      joinPanel.classList.add("hidden");
      statusEl.textContent = "Playing";
      renderUrls(message.lanUrls || []);
      lastSentAngle = null;
      lastSentActive = null;
    }
    if (message.type === "territoryFull") {
      const gridCols = localState.world.gridCols || 1200;
      const gridRows = localState.world.gridRows || 1200;
      offscreenCanvas.width = gridCols;
      offscreenCanvas.height = gridRows;
      localState.grid = new Uint16Array(gridCols * gridRows);
      decodeRLE(message.rle, localState.grid);
      redrawOffscreenCanvas();
    }
    if (message.type === "state") {
      localState.tick = message.tick;

      // Update or create players
      message.players.forEach((snap) => {
        let p = localState.players.find((x) => x.id === snap.id);
        if (!p) {
          p = {
            id: snap.id,
            numId: snap.numId,
            name: snap.name,
            color: snap.color,
            updates: [],
          };
          localState.players.push(p);
        }

        // Push updates for client-side interpolation
        p.updates.push({
          x: snap.x,
          y: snap.y,
          heading: snap.heading,
          t: Date.now(),
        });

        // Sync general properties
        p.numId = snap.numId;
        p.alive = snap.alive;
        p.score = snap.score;
        p.percent = snap.percent;
        p.protected = snap.protected;
        p.trail = snap.trail;
        p.respawnAt = snap.alive ? 0 : Date.now() + snap.respawnInMs;

        if (p.id === localState.selfId) {
          localState.selfAlive = snap.alive;
          localState.selfRespawnAt = snap.alive ? 0 : Date.now() + snap.respawnInMs;
        }
      });

      // Clear disconnected players
      const snapshotIds = message.players.map((x) => x.id);
      localState.players = localState.players.filter((x) => snapshotIds.includes(x.id));

      // If new colors/players mapping found, redraw full territory canvas
      if (updateNumIdToColor()) {
        redrawOffscreenCanvas();
      }

      // Apply dynamic territory changes
      localState.lastDeltaSize = message.deltas ? message.deltas.length / 2 : 0;
      if (message.deltas && localState.grid) {
        const gridCols = localState.world.gridCols || 1200;
        for (let i = 0; i < message.deltas.length; i += 2) {
          const idx = message.deltas[i];
          const val = message.deltas[i + 1];
          localState.grid[idx] = val;

          const col = idx % gridCols;
          const row = Math.floor(idx / gridCols);
          if (val === 0) {
            offscreenCtx.clearRect(col, row, 1, 1);
          } else {
            const color = numIdToColor[val] || "#cccccc";
            offscreenCtx.fillStyle = color;
            offscreenCtx.fillRect(col, row, 1, 1);
          }
        }
      }

      renderPlayersSidebar();
    }
    if (message.type === "eliminated") {
      const p = localState.players.find((x) => x.id === message.id);
      if (p) {
        p.alive = false;
        p.trail = [];
        p.respawnAt = Date.now() + message.respawnInMs;
      }
      if (message.id === localState.selfId) {
        localState.selfAlive = false;
        localState.selfRespawnAt = Date.now() + message.respawnInMs;
      }
    }
  });

  socket.addEventListener("close", () => {
    localState.mode = "disconnected";
    joinPanel.classList.remove("hidden");
    statusEl.textContent = "Disconnected";
  });

  socket.addEventListener("error", () => {
    statusEl.textContent = "Connection blocked";
  });
}

function decodeRLE(rle, grid) {
  let idx = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const val = rle[i];
    const count = rle[i + 1];
    for (let j = 0; j < count; j++) {
      grid[idx++] = val;
    }
  }
}

function updateNumIdToColor() {
  let changed = false;
  for (const player of localState.players) {
    if (numIdToColor[player.numId] !== player.color) {
      numIdToColor[player.numId] = player.color;
      changed = true;
    }
  }
  return changed;
}

function redrawOffscreenCanvas() {
  const gridCols = localState.world.gridCols || 1200;
  const gridRows = localState.world.gridRows || 1200;
  if (!localState.grid) return;

  offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
  for (let i = 0; i < localState.grid.length; i++) {
    const owner = localState.grid[i];
    if (owner > 0) {
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      const color = numIdToColor[owner] || "#cccccc";
      offscreenCtx.fillStyle = color;
      offscreenCtx.fillRect(col, row, 1, 1);
    }
  }
}

function renderUrls(urls) {
  urlsEl.innerHTML = "";
  const current = `${location.protocol}//${location.host}`;
  const allUrls = [...new Set([current, ...urls])];
  for (const url of allUrls) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = url;
    link.textContent = url;
    li.append(link);
    urlsEl.append(li);
  }
}

function renderPlayersSidebar() {
  const sorted = [...localState.players].sort((a, b) => b.score - a.score);
  playersEl.innerHTML = "";
  for (const player of sorted) {
    const li = document.createElement("li");
    const pct = player.percent ? player.percent.toFixed(1) + "%" : "0%";
    li.textContent = `${player.name}: ${pct}`;
    li.style.color = player.color;
    playersEl.append(li);
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

function lerpAngle(a, b, amt) {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * amt;
}

function getInterpolatedState(player, renderTime) {
  if (!player.updates || player.updates.length === 0) {
    return { x: player.x, y: player.y, heading: player.heading };
  }

  while (player.updates.length > 2 && player.updates[1].t < renderTime) {
    player.updates.shift();
  }

  if (player.updates.length === 1) {
    return player.updates[0];
  }

  const a = player.updates[0];
  const b = player.updates[1];

  if (renderTime < a.t) return a;
  if (renderTime > b.t) return b;

  const t = (renderTime - a.t) / (b.t - a.t);
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    heading: lerpAngle(a.heading, b.heading, t),
  };
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const viewWidth = canvas.width / ratio;
  const viewHeight = canvas.height / ratio;

  ctx.clearRect(0, 0, viewWidth, viewHeight);
  updateCamera(viewWidth, viewHeight);
  drawBackground(viewWidth, viewHeight);

  ctx.save();
  const offsetX = viewWidth / 2 - camera.x * camera.zoom;
  const offsetY = viewHeight / 2 - camera.y * camera.zoom;
  ctx.translate(offsetX, offsetY);
  ctx.scale(camera.zoom, camera.zoom);

  drawArena();

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreenCanvas, 0, 0, localState.world.width, localState.world.height);

  for (const player of localState.players) drawTrail(player);
  for (const player of localState.players) drawPlayer(player);
  ctx.restore();

  // Screen-space UI Overlays
  if (localState.mode === "playing") {
    drawLeaderboard(viewWidth, viewHeight);
    drawMinimap(viewWidth, viewHeight);
    if (!localState.selfAlive && localState.selfRespawnAt > 0) {
      drawDeadOverlay(viewWidth, viewHeight);
    }
  } else {
    drawIdleOverlay(viewWidth, viewHeight);
  }
}

function drawBackground(width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#d9f4ee");
  gradient.addColorStop(0.5, "#eef7e8");
  gradient.addColorStop(1, "#f8dbc9");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawArena() {
  ctx.fillStyle = "#f2f7ef";
  ctx.fillRect(0, 0, localState.world.width, localState.world.height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  for (let i = 0; i < 120; i++) {
    const x = (i * 47) % localState.world.width;
    const y = (i * 83) % localState.world.height;
    ctx.beginPath();
    ctx.arc(x, y, 0.55 + (i % 3) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(24, 44, 36, 0.24)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, localState.world.width, localState.world.height);
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawTrail(player) {
  if (!player.alive || player.trail.length < 1) return;

  const ip = getInterpolatedState(player, Date.now() - 80);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  player.trail.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(ip.x, ip.y);

  // Draw glow shadow path
  ctx.strokeStyle = hexToRgba(player.color, 0.35);
  ctx.lineWidth = 10;
  ctx.stroke();

  // Core bright path
  ctx.strokeStyle = player.color;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.restore();
}

function drawPlayer(player) {
  if (!player.alive) return;

  const ip = getInterpolatedState(player, Date.now() - 80);

  ctx.save();
  ctx.fillStyle = player.color;
  ctx.strokeStyle = "#1a202c";
  ctx.lineWidth = 2;

  // Head dot
  ctx.beginPath();
  ctx.arc(ip.x, ip.y, localState.world.playerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner highlight
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ip.x, ip.y, localState.world.playerRadius - 1.5, 0, Math.PI * 2);
  ctx.stroke();

  // Pulsing spawn protection shield
  if (player.protected) {
    const pulse = 0.45 + 0.35 * Math.sin(Date.now() / 150);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ip.x, ip.y, localState.world.playerRadius + 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = player.color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = pulse * 0.5;
    ctx.beginPath();
    ctx.arc(ip.x, ip.y, localState.world.playerRadius + 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawLeaderboard(width, height) {
  const sorted = [...localState.players].sort((a, b) => b.score - a.score);

  const boxWidth = 190;
  const boxHeight = 30 + Math.min(10, sorted.length) * 20;
  const padding = 15;
  const rx = width - boxWidth - padding;
  const ry = padding;

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.strokeStyle = "rgba(20, 31, 27, 0.12)";
  ctx.lineWidth = 1;
  ctx.fillRect(rx, ry, boxWidth, boxHeight);
  ctx.strokeRect(rx, ry, boxWidth, boxHeight);

  ctx.fillStyle = "#20312b";
  ctx.font = "bold 11px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("LEADERBOARD", rx + 12, ry + 10);

  ctx.font = "11px Trebuchet MS, sans-serif";
  sorted.slice(0, 10).forEach((p, index) => {
    const yOffset = ry + 30 + index * 20;

    // Player color dot
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(rx + 16, yOffset + 6, 4, 0, Math.PI * 2);
    ctx.fill();

    // Name text
    ctx.fillStyle = p.id === localState.selfId ? "#172019" : "rgba(32, 49, 43, 0.72)";
    ctx.font = p.id === localState.selfId ? "bold 11px Trebuchet MS, sans-serif" : "11px Trebuchet MS, sans-serif";
    const name = p.name + (p.id === localState.selfId ? " (You)" : "");
    ctx.fillText(name.slice(0, 14), rx + 26, yOffset);

    // Percentage text
    const pctStr = p.percent ? p.percent.toFixed(1) + "%" : "0.0%";
    ctx.textAlign = "right";
    ctx.fillText(pctStr, rx + boxWidth - 12, yOffset);
    ctx.textAlign = "left";
  });
  ctx.restore();
}

function drawMinimap(width, height) {
  const size = Math.max(104, Math.min(132, Math.round(Math.min(width, height) * 0.2)));
  const padding = 15;
  const mx = width - size - padding;
  const my = height - size - padding;

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.fillRect(mx, my, size, size);
  ctx.strokeStyle = "rgba(20, 31, 27, 0.2)";
  ctx.lineWidth = 2;
  ctx.strokeRect(mx, my, size, size);

  ctx.globalAlpha = 0.78;
  ctx.drawImage(offscreenCanvas, mx, my, size, size);
  ctx.globalAlpha = 1;

  for (const player of localState.players) {
    if (!player.alive) continue;
    const ip = getInterpolatedState(player, Date.now() - 80);
    const px = mx + (ip.x / WORLD_WIDTH) * size;
    const py = my + (ip.y / WORLD_HEIGHT) * size;

    const isLocal = player.id === localState.selfId;
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(px, py, isLocal ? 4.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (isLocal) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawIdleOverlay(width, height) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.fillRect(0, 0, width, height);
}

function drawDeadOverlay(width, height) {
  const remaining = Math.max(0, localState.selfRespawnAt - Date.now());
  const secs = Math.ceil(remaining / 1000);

  ctx.save();
  ctx.fillStyle = "rgba(20, 31, 27, 0.58)";
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;

  // Visual countdown progress circle
  const progress = remaining / 2000;
  const radius = 64;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(239, 68, 68, 0.15)";
  ctx.beginPath();
  ctx.arc(cx, cy - 20, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(239, 68, 68, 0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy - 20, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(height * 0.08)}px Trebuchet MS, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(secs > 0 ? secs : "...", cx, cy - 20);

  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = `13px Trebuchet MS, sans-serif`;
  ctx.fillText("Respawning", cx, cy + 60);
  ctx.restore();
}

function sendInputAngle(angle, active) {
  if (!localState.socket || localState.socket.readyState !== WebSocket.OPEN) return;

  const roundedAngle = Math.round(angle * 1000) / 1000;

  if (roundedAngle !== lastSentAngle || active !== lastSentActive) {
    localState.socket.send(
      JSON.stringify({
        type: "input",
        angle: roundedAngle,
        active: active,
      })
    );
    lastSentAngle = roundedAngle;
    lastSentActive = active;
  }
}

const keysPressed = {
  w: false,
  a: false,
  s: false,
  d: false,
  arrowup: false,
  arrowdown: false,
  arrowleft: false,
  arrowright: false,
};

function handleKeyDown(event) {
  const key = event.key.toLowerCase();
  if (key in keysPressed) {
    keysPressed[key] = true;
    updateKeyboardDirection();
  }
}

function handleKeyUp(event) {
  const key = event.key.toLowerCase();
  if (key in keysPressed) {
    keysPressed[key] = false;
    updateKeyboardDirection();
  }
}

function updateKeyboardDirection() {
  const up = keysPressed.w || keysPressed.arrowup;
  const down = keysPressed.s || keysPressed.arrowdown;
  const left = keysPressed.a || keysPressed.arrowleft;
  const right = keysPressed.d || keysPressed.arrowright;

  const dx = (right ? 1 : 0) - (left ? 1 : 0);
  const dy = (down ? 1 : 0) - (up ? 1 : 0);

  if (dx !== 0 || dy !== 0) {
    const angle = Math.atan2(dy, dx);
    sendInputAngle(angle, true);
  } else {
    sendInputAngle(0, false);
  }
}

function preferredZoom(width, height) {
  const base = Math.min(width, height);
  if (base < 520) return 2.45;
  if (base < 760) return 2.25;
  return 2.05;
}

function updateCamera(width, height) {
  camera.zoom += (preferredZoom(width, height) - camera.zoom) * 0.05;

  const halfWorldW = width / (camera.zoom * 2);
  const halfWorldH = height / (camera.zoom * 2);
  camera.targetX = clamp(camera.targetX, halfWorldW, localState.world.width - halfWorldW);
  camera.targetY = clamp(camera.targetY, halfWorldH, localState.world.height - halfWorldH);
  camera.x += (camera.targetX - camera.x) * 0.16;
  camera.y += (camera.targetY - camera.y) * 0.16;
  camera.x = clamp(camera.x, halfWorldW, localState.world.width - halfWorldW);
  camera.y = clamp(camera.y, halfWorldH, localState.world.height - halfWorldH);
}

function clamp(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

function loop() {
  if (localState.mode === "playing") {
    const localPlayer = localState.players.find((p) => p.id === localState.selfId);
    if (localPlayer) {
      const ip = getInterpolatedState(localPlayer, Date.now() - 80);
      camera.targetX = ip.x;
      camera.targetY = ip.y;
    }
  }

  draw();
  requestAnimationFrame(loop);
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  connect(nameInput.value || "Player");
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f" && document.fullscreenEnabled) {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }
  handleKeyDown(event);
});
window.addEventListener("keyup", handleKeyUp);

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  localState.pointerActive = true;
  localState.pointerOrigin = { x: event.clientX, y: event.clientY };
  localState.pointerCurrent = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointermove", (event) => {
  if (!localState.pointerActive) return;
  event.preventDefault();
  const dx = event.clientX - localState.pointerOrigin.x;
  const dy = event.clientY - localState.pointerOrigin.y;
  const dist = Math.hypot(dx, dy);
  
  if (dist > 3) {
    const angle = Math.atan2(dy, dx);
    sendInputAngle(angle, true);

    const maxRadius = 34;
    if (dist > maxRadius) {
      localState.pointerOrigin.x = event.clientX - (dx / dist) * maxRadius;
      localState.pointerOrigin.y = event.clientY - (dy / dist) * maxRadius;
    }
  }
});

canvas.addEventListener("pointerup", () => {
  localState.pointerActive = false;
  sendInputAngle(0, false);
});
canvas.addEventListener("pointercancel", () => {
  localState.pointerActive = false;
  sendInputAngle(0, false);
});

window.render_game_to_text = () => {
  const localPlayer = localState.players.find((p) => p.id === localState.selfId);
  return JSON.stringify({
    coordinateSystem: "World origin is top-left; x increases right; y increases down.",
    mode: localState.mode,
    selfId: localState.selfId,
    tick: localState.tick,
    camera: { x: camera.x, y: camera.y },
    player: localPlayer
      ? {
          id: localPlayer.id,
          name: localPlayer.name,
          x: getInterpolatedState(localPlayer, Date.now() - 80).x,
          y: getInterpolatedState(localPlayer, Date.now() - 80).y,
          alive: localPlayer.alive,
          protected: localPlayer.protected,
          score: localPlayer.score,
          trailPoints: localPlayer.trail ? localPlayer.trail.length : 0,
        }
      : null,
    minimapPlayers: localState.players.filter((p) => p.alive).length,
    lastTerritoryDeltaSize: localState.lastDeltaSize,
  });
};

window.advanceTime = () => {
  draw();
};

resizeCanvas();
renderUrls([]);
loop();
