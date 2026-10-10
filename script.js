// ====== Constants ======
const TASKS_KEY = "taskManager.tasks";
const GAME_KEY = "taskManager.game";
const XP_PER_TASK = 10;
const POINTS_PER_LEVEL = 3;
const DAILY_GOAL = 3;
const DAILY_BONUS = 25;

const STAT_KEYS = [
  ["str", "STR"],
  ["agi", "AGI"],
  ["int", "INT"],
  ["vit", "VIT"],
  ["sense", "SENSE"],
];

// Rank is decided by level (E -> S)
const RANKS = [
  { min: 1, letter: "E" },
  { min: 3, letter: "D" },
  { min: 5, letter: "C" },
  { min: 7, letter: "B" },
  { min: 9, letter: "A" },
  { min: 11, letter: "S" },
];

const HINTS = [
  "Small steps still count as progress.",
  "Done is better than perfect.",
  "Start messy, finish proud.",
  "Your future self is counting on you.",
  "One task at a time. That's the whole trick.",
  "Momentum beats motivation.",
  "Tiny wins stack up fast.",
];

const CHEERS = [
  "Well done, {name}.",
  "Your strength is growing.",
  "Another gate cleared.",
  "Keep this pace.",
  "The System approves.",
  "You are getting stronger.",
];

const ADD_LINES = [
  "Task registered.",
  "A new challenge has appeared.",
  "Quest accepted. Don't stop now.",
  "Added to your Quest Log.",
];

const BADGES = [
  { id: "awakened", name: "Awakened", desc: "Register your first task", test: (g) => g.added >= 1 },
  { id: "first-clear", name: "First Clear", desc: "Clear 1 task", test: (g) => g.completed >= 1 },
  { id: "gate-runner", name: "Gate Runner", desc: "Clear 5 tasks", test: (g) => g.completed >= 5 },
  { id: "monster-slayer", name: "Monster Slayer", desc: "Clear 10 tasks", test: (g) => g.completed >= 10 },
  { id: "relentless", name: "Relentless", desc: "Keep a 3-day streak", test: (g) => g.streak >= 3 },
  { id: "diligent", name: "Diligent", desc: "Complete a Daily Quest", test: (g) => g.dailyClears >= 1 },
  { id: "arise", name: "Arise", desc: "Clear every pending task (3+ on the board)", test: (g) => g.cleanSweep },
];

// Badge ids from the previous version, mapped to the new ones
const LEGACY_BADGE_IDS = {
  "first-step": "awakened",
  "first-win": "first-clear",
  "high-five": "gate-runner",
  slayer: "monster-slayer",
  "on-fire": "relentless",
  "clean-sweep": "arise",
};

const PALETTES = {
  cyan: ["#5ad2ff", "#2f7bff", "#ffffff", "#8be9ff", "#3b6cff"],
  gold: ["#ffcf5a", "#fff0b3", "#ffffff", "#ffb020"],
  purple: ["#a56bff", "#d6bbff", "#7c4dff", "#ffffff", "#5ad2ff"],
};

// ====== Level / rank maths ======
// Level 1 needs 30 XP, level 2 needs 40, level 3 needs 50, and so on
function xpNeeded(level) {
  return 30 + (level - 1) * 10;
}

function getLevelInfo(xp) {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpNeeded(level)) {
    remaining -= xpNeeded(level);
    level += 1;
  }
  return { level: level, into: remaining, need: xpNeeded(level) };
}

function rankFor(level) {
  let letter = RANKS[0].letter;
  RANKS.forEach((r) => {
    if (level >= r.min) letter = r.letter;
  });
  return letter;
}

function titleFor(level) {
  return level >= 15 ? "Shadow Monarch" : rankFor(level) + "-Rank Hunter";
}

// ====== State ======
let tasks = loadTasks();
let game = loadGame();
let currentFilter = "all";

// ====== DOM references ======
const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const errorMsg = document.getElementById("error-msg");
const list = document.getElementById("task-list");
const counter = document.getElementById("task-counter");
const emptyMsg = document.getElementById("empty-msg");
const filterButtons = document.querySelectorAll(".filter-btn");
const clearBtn = document.getElementById("clear-completed");

const rankEmblem = document.getElementById("rank-emblem");
const playerTitle = document.getElementById("player-title");
const levelLabel = document.getElementById("level-label");
const streakEl = document.getElementById("streak");
const xpBar = document.getElementById("xp-bar");
const xpFill = document.getElementById("xp-fill");
const xpText = document.getElementById("xp-text");
const pointsLabel = document.getElementById("points-label");
const statsEl = document.getElementById("stats");
const dailyText = document.getElementById("daily-text");
const dailyCount = document.getElementById("daily-count");
const dailyFill = document.getElementById("daily-fill");
const coachMsg = document.getElementById("coach-msg");
const hintEl = document.getElementById("hint");
const badgesEl = document.getElementById("badges");
const titlesCount = document.getElementById("titles-count");
const soundBtn = document.getElementById("sound-btn");
const voiceBtn = document.getElementById("voice-btn");
const nameForm = document.getElementById("name-form");
const nicknameInput = document.getElementById("nickname-input");

const overlay = document.getElementById("sys-overlay");
const sysTitle = document.getElementById("sys-title");
const sysBody = document.getElementById("sys-body");
const canvas = document.getElementById("confetti");
const ctx = canvas.getContext ? canvas.getContext("2d") : null;

// ====== Helpers ======
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dayKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + m + "-" + d;
}

// ====== Nickname + System lines ======
function cleanNickname(raw) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 16);
}

function getName() {
  return game.nickname || "Player";
}

// "You have 3 tasks left."
function pendingLine(count) {
  return "You have " + count + (count === 1 ? " task" : " tasks") + " left.";
}

function pendingCount() {
  return tasks.filter((t) => !t.completed).length;
}

// ====== localStorage ======
function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(TASKS_KEY));
    if (!Array.isArray(saved)) return [];
    // Tasks that were already completed before XP existed don't give XP later
    return saved.map((t) => ({ ...t, rewarded: t.rewarded !== undefined ? t.rewarded : !!t.completed }));
  } catch (err) {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (err) {
    // storage may be unavailable; app still works in memory
  }
}

function loadGame() {
  const base = {
    xp: 0,
    streak: 0,
    lastDay: null,
    completed: 0,
    added: 0,
    cleanSweep: false,
    dailyClears: 0,
    welcomed: false,
    nickname: "",
    points: 0,
    stats: { str: 10, agi: 10, int: 10, vit: 10, sense: 10 },
    daily: { day: null, done: 0, claimed: false },
    badges: [],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(GAME_KEY));
    if (saved && typeof saved === "object") {
      const merged = { ...base, ...saved };
      merged.stats = { ...base.stats, ...(saved.stats || {}) };
      merged.daily = { ...base.daily, ...(saved.daily || {}) };
      merged.nickname = cleanNickname(String(saved.nickname || ""));
      merged.badges = (Array.isArray(saved.badges) ? saved.badges : [])
        .map((id) => LEGACY_BADGE_IDS[id] || id)
        .filter((id, i, arr) => arr.indexOf(id) === i);
      // Players from the older version get the points they would have earned
      if (saved.points === undefined) {
        merged.points = (getLevelInfo(merged.xp).level - 1) * POINTS_PER_LEVEL;
      }
      return merged;
    }
  } catch (err) {
    // fall through to defaults
  }
  return base;
}

function saveGame() {
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify(game));
  } catch (err) {
    // ignore
  }
}

// ====== Game logic ======
function updateStreak() {
  const now = new Date();
  const today = dayKey(now);
  if (game.lastDay === today) return;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  game.streak = game.lastDay === dayKey(yesterday) ? game.streak + 1 : 1;
  game.lastDay = today;
}

// A streak only counts if you cleared something today or yesterday
function getDisplayStreak() {
  if (!game.lastDay) return 0;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const alive = game.lastDay === dayKey(now) || game.lastDay === dayKey(yesterday);
  return alive ? game.streak : 0;
}

// Resets the Daily Quest when a new day starts
function rolloverDaily() {
  const today = dayKey(new Date());
  if (game.daily.day !== today) {
    game.daily = { day: today, done: 0, claimed: false };
  }
}

function checkBadges() {
  const unlocked = [];
  BADGES.forEach((badge) => {
    if (!game.badges.includes(badge.id) && badge.test(game)) {
      game.badges.push(badge.id);
      unlocked.push(badge);
    }
  });
  return unlocked;
}

// Called once per task, the first time it gets cleared
function rewardCompletion(x, y) {
  const before = getLevelInfo(game.xp);
  const rankBefore = rankFor(before.level);

  rolloverDaily();
  let gained = XP_PER_TASK;
  game.completed += 1;
  game.daily.done += 1;
  updateStreak();

  let dailyDone = false;
  if (!game.daily.claimed && game.daily.done >= DAILY_GOAL) {
    game.daily.claimed = true;
    game.dailyClears += 1;
    gained += DAILY_BONUS;
    dailyDone = true;
  }
  game.xp += gained;

  const after = getLevelInfo(game.xp);
  const levelsGained = after.level - before.level;
  const pointsGained = levelsGained * POINTS_PER_LEVEL;
  game.points += pointsGained;
  const rankAfter = rankFor(after.level);

  const pendingLeft = tasks.filter((t) => !t.completed).length;
  const boardCleared = pendingLeft === 0 && tasks.length >= 3;
  if (boardCleared) game.cleanSweep = true;

  const newBadges = checkBadges();
  saveGame();

  // Build System notifications (shown one after another)
  const notices = [];
  if (dailyDone) {
    notices.push({ title: "DAILY QUEST COMPLETE", lines: ["Reward: +" + DAILY_BONUS + " XP"], sound: "daily" });
  }
  newBadges.forEach((b) => {
    notices.push({ title: "NEW TITLE ACQUIRED", lines: [b.name, b.desc], sound: "title" });
  });
  if (levelsGained > 0) {
    notices.push({
      title: "LEVEL UP",
      lines: ["LEVEL " + after.level, "You gained " + pointsGained + " ability points."],
      big: true,
      kind: "levelup",
      sound: "levelup",
    });
  }
  if (rankAfter !== rankBefore) {
    notices.push({
      title: "RANK UP",
      lines: ["RANK " + rankBefore + " → " + rankAfter, "You are now a " + titleFor(after.level) + "."],
      big: true,
      kind: "rankup",
      sound: "rankup",
    });
  }
  if (boardCleared) {
    notices.push({ title: "ARISE", lines: ["All tasks cleared."], big: true, kind: "arise", sound: "arise" });
  }
  if (notices.length === 0) {
    notices.push({
      title: "FINISHED",
      lines: ["+" + XP_PER_TASK + " XP", pick(CHEERS).replace("{name}", getName())],
      soft: true,
    });
  }
  notices.forEach(notify);

  // Particle burst: from the checkbox normally, from the screen centre for big moments
  const isBig = notices.some((n) => n.big);
  if (boardCleared) {
    burst(150, window.innerWidth / 2, window.innerHeight / 2, "purple");
  } else if (rankAfter !== rankBefore) {
    burst(150, window.innerWidth / 2, window.innerHeight / 2, "gold");
  } else if (isBig) {
    burst(130, window.innerWidth / 2, window.innerHeight / 2, "cyan");
  } else {
    burst(36, x, y, "cyan");
  }

  if (levelsGained > 0 || rankAfter !== rankBefore) {
    const target = rankAfter !== rankBefore ? rankEmblem : levelLabel;
    target.classList.remove("pulse");
    void target.offsetWidth; // restart the animation
    target.classList.add("pulse");
  }
}

function spendPoint(key) {
  if (game.points <= 0 || game.stats[key] === undefined) return;
  game.stats[key] += 1;
  game.points -= 1;
  saveGame();
  render();
  Sound.play("stat");
}

// ====== Task actions ======
function addTask(text) {
  tasks.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text: text,
    completed: false,
    rewarded: false,
  });
  game.added += 1;
  const newBadges = checkBadges();
  saveTasks();
  saveGame();
  render();
  Sound.play("add");

  newBadges.forEach((b) => notify({ title: "NEW TITLE ACQUIRED", lines: [b.name, b.desc], sound: "title" }));
  if (newBadges.length === 0) {
    notify({ title: "NEW TASK REGISTERED", lines: [pick(ADD_LINES)], soft: true });
  }
}

function toggleTask(id, x, y) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  task.completed = !task.completed;

  // XP is awarded only the first time, so un-checking and re-checking can't farm XP
  const firstTime = task.completed && !task.rewarded;
  if (firstTime) task.rewarded = true;

  saveTasks();
  Sound.play(task.completed ? "clear" : "uncheck");
  if (task.completed) Voice.say("Finished.", { interrupt: true }); // the System speaks
  if (firstTime) {
    rewardCompletion(x, y);
  } else if (task.completed) {
    notify({ title: "FINISHED", lines: ["Task re-cleared. No extra XP."], soft: true });
  }
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
  Sound.play("delete");
  notify({ title: "TASK ABANDONED", lines: ["No penalty this time."], soft: true });
}

function clearCompleted() {
  tasks = tasks.filter((t) => !t.completed);
  saveTasks();
  render();
  Sound.play("delete");
}

// ====== Rendering (DOM manipulation) ======
function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = "task-item" + (task.completed ? " completed" : "");
  li.dataset.id = task.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", "Mark task as completed");

  const span = document.createElement("span");
  span.className = "task-text";
  span.textContent = task.text; // textContent avoids HTML injection

  const tag = document.createElement("span");
  tag.className = "xp-tag";
  tag.textContent = task.completed ? "CLEARED" : "+" + XP_PER_TASK + " XP";

  const del = document.createElement("button");
  del.type = "button";
  del.className = "delete-btn";
  del.setAttribute("aria-label", "Delete task");
  del.textContent = "✕";

  li.append(checkbox, span, tag, del);
  return li;
}

function getVisibleTasks() {
  if (currentFilter === "completed") return tasks.filter((t) => t.completed);
  if (currentFilter === "pending") return tasks.filter((t) => !t.completed);
  return tasks;
}

function getCoachMessage(pending, total) {
  if (total === 0) return "No tasks registered. Add your first task to begin growing stronger.";
  if (pending === 0) return "All tasks cleared. Rest well, " + getName() + ". You earned it.";
  if (pending === 1) return "One task remains. Finish it.";
  return pending + " tasks remaining. The only way to level up is to act.";
}

function renderStatus(pending, total) {
  const info = getLevelInfo(game.xp);
  const rank = rankFor(info.level);
  const streak = getDisplayStreak();

  rankEmblem.textContent = rank;
  rankEmblem.dataset.rank = rank;
  playerTitle.textContent = titleFor(info.level);
  levelLabel.textContent = "LV. " + info.level;
  streakEl.textContent = "STREAK " + streak + (streak === 1 ? " DAY" : " DAYS");

  xpFill.style.width = (info.into / info.need) * 100 + "%";
  xpText.textContent = info.into + " / " + info.need + " XP";
  xpBar.setAttribute("aria-valuemax", String(info.need));
  xpBar.setAttribute("aria-valuenow", String(info.into));

  // Abilities (spend points with the + buttons)
  pointsLabel.textContent = "POINTS " + game.points;
  statsEl.replaceChildren();
  STAT_KEYS.forEach(([key, label]) => {
    const row = document.createElement("li");
    row.className = "stat-row";

    const name = document.createElement("span");
    name.className = "stat-name";
    name.textContent = label;

    const value = document.createElement("span");
    value.className = "stat-value";
    value.textContent = String(game.stats[key]);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stat-btn";
    btn.dataset.stat = key;
    btn.textContent = "+";
    btn.disabled = game.points <= 0;
    btn.setAttribute("aria-label", "Increase " + label);

    row.append(name, value, btn);
    statsEl.appendChild(row);
  });

  // Daily Quest (read-only here, so a new day shows 0 until something is cleared)
  const today = dayKey(new Date());
  const daily = game.daily.day === today ? game.daily : { done: 0, claimed: false };
  const done = Math.min(daily.done, DAILY_GOAL);
  dailyText.textContent = "Clear " + DAILY_GOAL + " tasks today. Reward: +" + DAILY_BONUS + " XP";
  dailyCount.textContent = daily.claimed ? "COMPLETE" : done + " / " + DAILY_GOAL;
  dailyFill.style.width = (done / DAILY_GOAL) * 100 + "%";
  dailyFill.classList.toggle("done", !!daily.claimed);

  coachMsg.textContent = getCoachMessage(pending, total);
  hintEl.textContent = "[HINT] " + HINTS[new Date().getDay() % HINTS.length];
}

function renderTitles() {
  badgesEl.replaceChildren();
  BADGES.forEach((badge) => {
    const unlocked = game.badges.includes(badge.id);
    const li = document.createElement("li");
    li.className = "title-item" + (unlocked ? "" : " locked");

    const name = document.createElement("span");
    name.className = "title-name";
    name.textContent = (unlocked ? "◆ " : "◇ ") + badge.name;

    const desc = document.createElement("span");
    desc.className = "title-desc";
    desc.textContent = badge.desc;

    li.append(name, desc);
    badgesEl.appendChild(li);
  });
  titlesCount.textContent = game.badges.length + " / " + BADGES.length;
}

function render() {
  list.replaceChildren();

  const visible = getVisibleTasks();
  visible.forEach((task) => list.appendChild(createTaskElement(task)));

  // Pending counter
  const pending = tasks.filter((t) => !t.completed).length;
  counter.textContent = pending + (pending === 1 ? " pending task" : " pending tasks");

  // Empty-state message
  if (visible.length === 0) {
    if (tasks.length === 0) {
      emptyMsg.textContent = "No tasks yet. Add one above!";
    } else if (currentFilter === "completed") {
      emptyMsg.textContent = "No completed tasks yet.";
    } else {
      emptyMsg.textContent = "Nothing pending. You're all caught up!";
    }
  } else {
    emptyMsg.textContent = "";
  }

  // Show "Clear completed" only when there is something to clear
  clearBtn.hidden = !tasks.some((t) => t.completed);

  // Highlight active filter
  filterButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === currentFilter);
  });

  renderStatus(pending, tasks.length);
  renderTitles();
}

// ====== System notifications ======
const noticeQueue = [];
let noticeShowing = false;
let noticeTimer = null;
let currentNotice = null;

// "soft" notices (task added / cleared / abandoned) replace each other instead of
// piling up. Important ones (level up, titles, daily quest...) always wait their turn.
function notify(notice) {
  if (notice.soft) {
    for (let i = noticeQueue.length - 1; i >= 0; i--) {
      if (noticeQueue[i].soft) noticeQueue.splice(i, 1);
    }
    if (noticeShowing && currentNotice && currentNotice.soft) {
      noticeQueue.unshift(notice);
      showNextNotice(); // swap the visible soft notice right away
      return;
    }
  }
  noticeQueue.push(notice);
  if (!noticeShowing) showNextNotice();
}

function showNextNotice() {
  const n = noticeQueue.shift();
  currentNotice = n || null;
  if (!n) {
    noticeShowing = false;
    overlay.className = "sys-overlay";
    return;
  }
  noticeShowing = true;

  sysTitle.textContent = n.title;
  sysBody.replaceChildren();
  n.lines.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    sysBody.appendChild(p);
  });

  overlay.className = "sys-overlay show" + (n.big ? " big" : "") + (n.kind ? " " + n.kind : "");
  if (n.sound) Sound.play(n.sound);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(dismissNotice, n.big ? 4200 : 2400);
}

function dismissNotice() {
  if (!noticeShowing) return;
  clearTimeout(noticeTimer);
  noticeShowing = false;
  overlay.classList.remove("show");
  setTimeout(() => {
    if (!noticeShowing) showNextNotice();
  }, 300);
}

// ====== Particles ======
const reduceMotion = window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false };
let particles = [];
let animating = false;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function burst(count, x, y, paletteName) {
  if (!ctx || reduceMotion.matches) return;
  const colors = PALETTES[paletteName] || PALETTES.cyan;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 8;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 3 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 0,
      max: 60 + Math.random() * 50,
    });
  }

  if (!animating) {
    animating = true;
    requestAnimationFrame(tick);
  }
}

function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => p.life < p.max);

  particles.forEach((p) => {
    p.vy += 0.12; // light gravity
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life += 1;

    ctx.save();
    ctx.globalAlpha = 1 - p.life / p.max;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  });

  if (particles.length > 0) {
    requestAnimationFrame(tick);
  } else {
    animating = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ====== Validation ======
function showError(message) {
  errorMsg.textContent = message;
  input.classList.add("invalid");
}

function clearError() {
  errorMsg.textContent = "";
  input.classList.remove("invalid");
}

// ====== Event listeners ======
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();

  if (text === "") {
    showError("Please enter a task before adding.");
    Sound.play("error");
    input.focus();
    return;
  }

  clearError();
  addTask(text);
  input.value = "";
  input.focus();
});

input.addEventListener("input", clearError);

// Event delegation: one listener handles checkbox + delete for every task
list.addEventListener("click", (e) => {
  const item = e.target.closest(".task-item");
  if (!item) return;
  const id = item.dataset.id;

  if (e.target.matches(".delete-btn")) {
    deleteTask(id);
  } else if (e.target.matches("input[type='checkbox']")) {
    // Particles start from the checkbox (works for mouse and keyboard)
    const rect = e.target.getBoundingClientRect();
    toggleTask(id, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
});

// Spend ability points
statsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-stat]");
  if (btn) spendPoint(btn.dataset.stat);
});

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentFilter = btn.dataset.filter;
    render();
    Sound.play("tick");
  });
});

// Sound on/off button (the choice is remembered)
function renderSoundButton() {
  const on = !Sound.isMuted();
  soundBtn.textContent = "SOUND: " + (on ? "ON" : "OFF");
  soundBtn.setAttribute("aria-pressed", String(on));
}

soundBtn.addEventListener("click", () => {
  Sound.setMuted(!Sound.isMuted());
  renderSoundButton();
  Sound.play("tick"); // plays only when turning sound on
});

// Voice on/off button (also remembered)
function renderVoiceButton() {
  if (!Voice.isSupported()) {
    voiceBtn.textContent = "VOICE: N/A";
    voiceBtn.disabled = true;
    voiceBtn.setAttribute("aria-pressed", "false");
    return;
  }
  const on = Voice.isEnabled();
  voiceBtn.textContent = "VOICE: " + (on ? "ON" : "OFF");
  voiceBtn.setAttribute("aria-pressed", String(on));
}

voiceBtn.addEventListener("click", () => {
  Voice.setEnabled(!Voice.isEnabled());
  renderVoiceButton();
  if (Voice.isEnabled()) Voice.say("System voice online.");
});

// Nickname: saved when you press SET / Enter, or when you click away
function saveNickname() {
  const cleaned = cleanNickname(nicknameInput.value);
  nicknameInput.value = cleaned;
  if (cleaned === game.nickname) return;

  game.nickname = cleaned;
  saveGame();
  render();
  Sound.play("ding");
  notify({
    title: cleaned ? "NAME REGISTERED" : "NAME CLEARED",
    lines: [cleaned ? "Welcome, " + cleaned + "." : "You are Player again."],
    soft: true,
  });
}

nameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  saveNickname();
  nicknameInput.blur();
});
nicknameInput.addEventListener("change", saveNickname);

// Browsers only allow audio and speech after the first click / key press, so unlock then
document.addEventListener("pointerdown", Sound.unlock, true);
document.addEventListener("keydown", Sound.unlock, true);

// The System speaks "You have N tasks left." once, on your first click or key press
let greetingPending = true;
function speakGreetingOnce() {
  if (!greetingPending) return;
  greetingPending = false;
  const pending = pendingCount();
  if (pending > 0) Voice.say(pendingLine(pending));
}
document.addEventListener("click", speakGreetingOnce, true);
document.addEventListener("keydown", speakGreetingOnce, true);

clearBtn.addEventListener("click", clearCompleted);
overlay.addEventListener("click", dismissNotice);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") dismissNotice();
});
window.addEventListener("resize", resizeCanvas);

// ====== Init ======
resizeCanvas();
nicknameInput.value = game.nickname;
render();
renderSoundButton();
renderVoiceButton();

if (!game.welcomed) {
  game.welcomed = true;
  saveGame();
  notify({
    title: "SYSTEM INITIALIZED",
    lines: ["You have been chosen as a Player.", "Register a nickname, then clear tasks to grow stronger."],
    big: true,
    sound: "ding",
  });
}

// Welcome back: show how many tasks are left (it is spoken after your first click)
const pendingAtStart = pendingCount();
if (pendingAtStart > 0) {
  notify({ title: "WELCOME BACK", lines: [getName(), pendingLine(pendingAtStart)], soft: true });
}
