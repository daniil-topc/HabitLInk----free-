const STORAGE_KEY = "habitlink.personal.v1";
const today = new Date();
const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const dayFull = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const colors = ["#59633f", "#6b5747", "#5f786e", "#6f5d82", "#8b6f44", "#4e6784", "#764f56"];
const appIcons = ["∞", "◉", "⌁", "✦"];
const achievements = [
  { id: "first", group: "Общие", icon: "👣", label: "1 привычка", unlocked: s => s.habits.length >= 1 },
  { id: "three", group: "Общие", icon: "⚡", label: "3 привычки", unlocked: s => s.habits.length >= 3 },
  { id: "five", group: "Общие", icon: "⛵", label: "5 привычек", unlocked: s => s.habits.length >= 5 },
  { id: "streak7", group: "Серии", icon: "✱", label: "7 дней", unlocked: s => bestStreak(s) >= 7 },
  { id: "streak14", group: "Серии", icon: "✱", label: "14 дней", unlocked: s => bestStreak(s) >= 14 },
  { id: "streak21", group: "Серии", icon: "✱", label: "21 день", unlocked: s => bestStreak(s) >= 21 }
];

const SKIP_REASONS = [
  { id: "time", icon: "⏳", label: "Не было времени", theme: "нехватка времени" },
  { id: "forgot", icon: "💭", label: "Забыл", theme: "забывчивость" },
  { id: "motivation", icon: "🪫", label: "Не было мотивации", theme: "нехватка мотивации" },
  { id: "busy", icon: "📌", label: "Был занят", theme: "занятость" }
];

const defaultState = {
  profileQuote: "маленькими шагами",
  settings: {
    weekStart: "monday",
    privateMode: false,
    notifyGeneral: true,
    notifyActivity: true,
    appIcon: "∞"
  },
  habits: [],
  feed: []
};

let state = loadState();
let activeScreen = "home";
let selectedDays = [];
let selectedColor = colors[0];
let chartMode = "days";
let skipQueue = [];

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  setupDates();
  setupPickers();
  bindEvents();
  render();
  checkMissedHabits();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? mergeState(saved) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeState(saved) {
  const savedHabits = Array.isArray(saved.habits) ? saved.habits : [];
  return {
    ...structuredClone(defaultState),
    ...saved,
    settings: { ...defaultState.settings, ...(saved.settings || {}) },
    habits: removeOldStarterHabit(savedHabits),
    feed: Array.isArray(saved.feed) ? saved.feed : []
  };
}

function removeOldStarterHabit(habits) {
  if (habits.length !== 1) return habits;
  const [habit] = habits;
  const isOldStarter =
    habit?.name === "Бег по утрам" &&
    habit?.icon === "✱" &&
    habit?.color === "#59633f" &&
    habit?.time === "09:00" &&
    Array.isArray(habit?.days) &&
    habit.days.join(",") === "2,4,6,0" &&
    Object.keys(habit?.completions || {}).length === 0;
  return isOldStarter ? [] : habits;
}

function saveState() {
  if (state.feed.length > 50) state.feed = state.feed.slice(0, 50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setupDates() {
  const label = formatDate(today);
  $("#todayLabel").textContent = label;
  $("#feedDateLabel").textContent = label;
}

function formatDate(date) {
  return `${dayNames[date.getDay()]}, ${date.getDate()} ${date.toLocaleString("ru-RU", { month: "long" })}`;
}

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function setupPickers() {
  const weekdayPicker = $("#weekdayPicker");
  weekdayPicker.innerHTML = "";
  [1, 2, 3, 4, 5, 6, 0].forEach(day => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.day = day;
    button.textContent = dayNames[day];
    button.addEventListener("click", () => {
      selectedDays = selectedDays.includes(day)
        ? selectedDays.filter(item => item !== day)
        : [...selectedDays, day];
      renderPickers();
    });
    weekdayPicker.append(button);
  });

  const colorPicker = $("#colorPicker");
  colorPicker.innerHTML = "";
  colors.forEach(color => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.color = color;
    button.style.background = color;
    button.addEventListener("click", () => {
      selectedColor = color;
      renderPickers();
    });
    colorPicker.append(button);
  });

  const skipReasons = $("#skipReasons");
  skipReasons.innerHTML = "";
  SKIP_REASONS.forEach(reason => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skip-reason-button";
    button.dataset.skipReason = reason.id;
    button.innerHTML = `<span>${reason.icon}</span>${reason.label}`;
    skipReasons.append(button);
  });

  const iconPicker = $("#appIconPicker");
  iconPicker.innerHTML = "";
  appIcons.forEach(icon => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-choice";
    button.dataset.icon = icon;
    button.textContent = icon;
    button.addEventListener("click", () => {
      state.settings.appIcon = icon;
      saveState();
      renderSettings();
    });
    iconPicker.append(button);
  });
}

function bindEvents() {
  document.body.addEventListener("click", event => {
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) navigate(routeButton.dataset.route);

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === "open-habit") openHabitDialog();
    if (action === "close-habit") $("#habitDialog").close();
    if (action === "edit-quote") editQuote();
    if (action === "open-menu") showToast("Меню поддержки можно заменить своими ссылками.");
    if (action === "open-premium") showToast("В этой версии всё бесплатно.");
    if (action === "export-data") exportData();
    if (action === "reset-data") resetData();
    if (action === "delete-habit") deleteHabit();
  });

  $("#habitForm").addEventListener("submit", handleHabitSubmit);
  $("#skipDialog").addEventListener("click", event => {
    const button = event.target.closest("[data-skip-reason]");
    if (button) answerSkip(button.dataset.skipReason);
  });
  $("#notifyGeneral").addEventListener("change", event => updateSetting("notifyGeneral", event.target.checked));
  $("#notifyActivity").addEventListener("change", event => updateSetting("notifyActivity", event.target.checked));
  $("#privateMode").addEventListener("change", event => updateSetting("privateMode", event.target.checked));
  $("#importFile").addEventListener("change", importData);

  $$("[data-setting='weekStart']").forEach(button => {
    button.addEventListener("click", () => updateSetting("weekStart", button.dataset.value));
  });
}

function navigate(screen) {
  activeScreen = screen;
  $$(".screen").forEach(item => item.classList.toggle("active", item.dataset.screen === screen));
  $$(".tab").forEach(item => item.classList.toggle("active", item.dataset.route === screen));
  $(".tabbar").style.display = ["home", "feed", "profile"].includes(screen) ? "grid" : "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function render() {
  renderHome();
  renderProfile();
  renderFeed();
  renderHeatmap();
  renderAnalytics();
  renderAchievements();
  renderSettings();
}

function renderHome() {
  const list = $("#habitList");
  list.innerHTML = "";
  const currentDay = today.getDay();
  $("#emptyHome").classList.toggle("visible", state.habits.length === 0);

  const habitsToShow = [...state.habits].sort((a, b) =>
    Number(b.days.includes(currentDay)) - Number(a.days.includes(currentDay))
  );
  habitsToShow.forEach(habit => {
    const doneToday = isDoneToday(habit);
    const isToday = habit.days.includes(currentDay);
    const card = document.createElement("article");
    card.className = `habit-card ${doneToday ? "done-today" : ""} ${isToday ? "" : "not-today"}`;
    card.style.setProperty("--habit-color", habit.color);
    card.innerHTML = `
      <div class="habit-top">
        <div class="habit-icon">${escapeHtml(habit.icon)}</div>
        <button class="done-button ${doneToday ? "done" : ""}" type="button" aria-label="Отметить">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5 10 17l9-10"/>
          </svg>
        </button>
      </div>
      <h2>${escapeHtml(habit.name)}</h2>
      <p>${habit.days.map(day => dayNames[day]).join(", ") || "Каждый день"}${isToday ? "" : " · не сегодня"}</p>
      <div class="habit-bottom">
        <div class="week-dashes">${weekOrder().map(day => `<span class="${weekDashClass(habit, day, doneToday)}"></span>`).join("")}</div>
        <div class="streak">🔥 ${habitStreak(habit)}</div>
      </div>
    `;
    card.querySelector(".done-button").addEventListener("click", () => toggleHabit(habit.id));
    card.addEventListener("dblclick", () => openHabitDialog(habit.id));
    list.append(card);
  });
}

function renderProfile() {
  $("#profileQuote").textContent = state.profileQuote || "маленькими шагами";
  const unlocked = achievements.filter(item => item.unlocked(state)).length;
  $("#achievementPreview").textContent = `${unlocked}/${achievements.length}`;
}

function renderFeed() {
  const list = $("#feedList");
  list.innerHTML = "";
  const feed = state.settings.privateMode ? [] : state.feed.slice(0, 12);
  if (!feed.length) {
    const item = document.createElement("article");
    item.className = "feed-item feed-empty";
    item.innerHTML = "<strong>Пока тихо</strong><small>Тут будут ваши выполненные привычк��.</small>";
    list.append(item);
    return;
  }
  feed.forEach(entry => {
    const item = document.createElement("article");
    item.className = "feed-item";
    item.innerHTML = `<strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.time)}</small>`;
    list.append(item);
  });
}

const HEATMAP_WEEKS = 26;

function completionCounts() {
  const counts = {};
  state.habits.forEach(habit => {
    Object.entries(habit.completions || {}).forEach(([key, done]) => {
      if (done) counts[key] = (counts[key] || 0) + 1;
    });
  });
  return counts;
}

function heatLevel(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

function heatmapStats(counts) {
  const keys = Object.keys(counts).sort();
  const todayKey = dateKey();
  if (!keys.length) {
    return { total: 0, average: "0", activePct: 0, bestStreak: 0, currentStreak: 0 };
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const firstDate = new Date(`${keys[0]}T00:00:00`);
  const daysSpan = Math.max(1, Math.round((new Date(`${todayKey}T00:00:00`) - firstDate) / 86400000) + 1);
  const activeDays = keys.length;

  let best = 0;
  let run = 0;
  const cursor = new Date(firstDate);
  for (let i = 0; i < daysSpan; i += 1) {
    run = counts[dateKey(cursor)] ? run + 1 : 0;
    best = Math.max(best, run);
    cursor.setDate(cursor.getDate() + 1);
  }

  let current = 0;
  const back = new Date();
  if (!counts[dateKey(back)]) back.setDate(back.getDate() - 1);
  while (counts[dateKey(back)]) {
    current += 1;
    back.setDate(back.getDate() - 1);
  }

  return {
    total,
    average: (total / daysSpan).toFixed(1).replace(".", ","),
    activePct: Math.round((activeDays / daysSpan) * 100),
    bestStreak: best,
    currentStreak: current
  };
}

function renderHeatmap() {
  renderHeatmapInto($("#heatmapCard"));
  renderHeatmapInto($("#analyticsHeatmap"));
}

function renderHeatmapInto(card) {
  if (!card) return;
  const counts = completionCounts();
  const stats = heatmapStats(counts);
  const weekStartDay = state.settings.weekStart === "monday" ? 1 : 0;
  const todayKey = dateKey();

  const gridEnd = new Date();
  const shift = (gridEnd.getDay() - weekStartDay + 7) % 7;
  gridEnd.setDate(gridEnd.getDate() + (6 - shift));
  const gridStart = new Date(gridEnd);
  gridStart.setDate(gridStart.getDate() - HEATMAP_WEEKS * 7 + 1);

  const weeks = [];
  const monthLabels = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < HEATMAP_WEEKS; w += 1) {
    const cells = [];
    let label = "";
    for (let d = 0; d < 7; d += 1) {
      const key = dateKey(cursor);
      const count = counts[key] || 0;
      const isFuture = key > todayKey;
      const classes = ["heat-cell"];
      if (!isFuture) classes.push(`level-${heatLevel(count)}`);
      if (isFuture) classes.push("future");
      if (key === todayKey) classes.push("today");
      cells.push(`<button type="button" class="${classes.join(" ")}" data-date="${key}" data-count="${count}" ${isFuture ? "disabled" : ""} aria-label="${key}: ${count}"></button>`);
      if (cursor.getDate() === 1) {
        label = cursor.toLocaleString("ru-RU", { month: "short" }).replace(".", "");
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(`<div class="heat-week">${cells.join("")}</div>`);
    monthLabels.push(`<span>${label}</span>`);
  }

  card.innerHTML = `
    <div class="heatmap-head">
      <h2>Активность</h2>
      <small>${stats.total} отметок за всё время</small>
    </div>
    <div class="heatmap-scroll">
      <div class="heat-months">${monthLabels.join("")}</div>
      <div class="heat-grid">${weeks.join("")}</div>
    </div>
    <div class="heatmap-legend">
      <small>Меньше</small>
      <span class="heat-cell level-0"></span>
      <span class="heat-cell level-1"></span>
      <span class="heat-cell level-2"></span>
      <span class="heat-cell level-3"></span>
      <span class="heat-cell level-4"></span>
      <small>Больше</small>
    </div>
    <div class="heatmap-stats">
      <div><b>${stats.activePct}%</b><small>дней активно</small></div>
      <div><b>${stats.average}</b><small>в день</small></div>
      <div><b>${stats.bestStreak}</b><small>лучшая серия</small></div>
      <div><b class="streak-now">${stats.currentStreak}</b><small>текущая серия</small></div>
    </div>
  `;

  card.querySelector(".heat-grid").addEventListener("click", event => {
    const cell = event.target.closest(".heat-cell[data-date]");
    if (!cell) return;
    const date = new Date(`${cell.dataset.date}T00:00:00`);
    const label = date.toLocaleString("ru-RU", { day: "numeric", month: "long" });
    const count = Number(cell.dataset.count);
    showToast(count ? `${label}: выполнено ${count}` : `${label}: без отметок`);
  });

  const scroll = card.querySelector(".heatmap-scroll");
  scroll.scrollLeft = scroll.scrollWidth;
}

function habitStartKey(habit) {
  if (habit.createdAt) return habit.createdAt;
  const keys = Object.keys(habit.completions || {}).sort();
  return keys[0] || dateKey();
}

function shiftKey(offset) {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return { key: dateKey(date), day: date.getDay(), date };
}

function periodStats(daysBack) {
  let scheduled = 0;
  let completed = 0;
  for (let i = 0; i < daysBack; i += 1) {
    const { key, day } = shiftKey(i);
    state.habits.forEach(habit => {
      if (!habit.days.includes(day) || key < habitStartKey(habit)) return;
      scheduled += 1;
      if (habit.completions?.[key]) completed += 1;
    });
  }
  return { scheduled, completed, pct: scheduled ? Math.round((completed / scheduled) * 100) : 0 };
}

function habitBestStreak(habit) {
  const doneKeys = Object.keys(habit.completions || {}).filter(key => habit.completions[key]).sort();
  if (!doneKeys.length) return 0;
  const todayKey = dateKey();
  let best = 0;
  let run = 0;
  const cursor = new Date(`${doneKeys[0]}T12:00:00`);
  while (dateKey(cursor) <= todayKey) {
    const key = dateKey(cursor);
    if (habit.days.includes(cursor.getDay())) {
      if (habit.completions[key]) {
        run += 1;
        best = Math.max(best, run);
      } else if (key !== todayKey) {
        run = 0;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
}

function bestStreakInfo() {
  let best = { length: 0, name: "пока нет серий" };
  state.habits.forEach(habit => {
    const length = habitBestStreak(habit);
    if (length > best.length) best = { length, name: `${habit.icon} ${habit.name}` };
  });
  return best;
}

function renderAnalytics() {
  const summary = $("#analyticsSummary");
  if (!summary) return;
  const week = periodStats(7);
  const month = periodStats(30);
  const best = bestStreakInfo();
  summary.innerHTML = `
    <div class="summary-tile"><b>${week.pct}%</b><small>за неделю</small><span>${week.completed} из ${week.scheduled}</span></div>
    <div class="summary-tile"><b>${month.pct}%</b><small>за месяц</small><span>${month.completed} из ${month.scheduled}</span></div>
    <div class="summary-tile wide"><b>🔥 ${best.length} ${dayWord(best.length)}</b><small>лучший период</small><span>${escapeHtml(best.name)}</span></div>
  `;
  renderProgressChart();
  renderComparison();
  renderSkipAnalytics();
}

function dayWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "дня";
  return "дней";
}

function renderProgressChart() {
  const card = $("#progressChartCard");
  if (!card) return;
  const isDays = chartMode === "days";
  const points = [];
  if (isDays) {
    for (let i = 13; i >= 0; i -= 1) {
      const { key, day, date } = shiftKey(i);
      let scheduled = 0;
      let completed = 0;
      state.habits.forEach(habit => {
        if (!habit.days.includes(day) || key < habitStartKey(habit)) return;
        scheduled += 1;
        if (habit.completions?.[key]) completed += 1;
      });
      points.push({
        pct: scheduled ? Math.round((completed / scheduled) * 100) : 0,
        empty: !scheduled,
        label: String(date.getDate()),
        title: `${date.toLocaleString("ru-RU", { day: "numeric", month: "short" })}: ${completed} из ${scheduled}`
      });
    }
  } else {
    for (let w = 7; w >= 0; w -= 1) {
      let scheduled = 0;
      let completed = 0;
      let label = "";
      for (let d = 6; d >= 0; d -= 1) {
        const { key, day, date } = shiftKey(w * 7 + d);
        if (d === 6) label = `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
        state.habits.forEach(habit => {
          if (!habit.days.includes(day) || key < habitStartKey(habit)) return;
          scheduled += 1;
          if (habit.completions?.[key]) completed += 1;
        });
      }
      points.push({
        pct: scheduled ? Math.round((completed / scheduled) * 100) : 0,
        empty: !scheduled,
        label,
        title: `Неделя с ${label}: ${completed} из ${scheduled}`
      });
    }
  }
  card.innerHTML = `
    <div class="analytics-head">
      <h2>График прогресса</h2>
      <div class="chart-toggle">
        <button type="button" data-chart-mode="days" class="${isDays ? "active" : ""}">Дни</button>
        <button type="button" data-chart-mode="weeks" class="${!isDays ? "active" : ""}">Недели</button>
      </div>
    </div>
    <div class="chart-bars ${isDays ? "mode-days" : "mode-weeks"}">
      ${points.map(point => `
        <div class="chart-col" title="${point.title}">
          <div class="chart-track"><div class="chart-fill ${point.empty ? "empty" : ""}" style="height:${Math.max(point.pct, point.empty ? 0 : 4)}%"></div></div>
          <small>${point.label}</small>
        </div>
      `).join("")}
    </div>
  `;
  card.querySelectorAll("[data-chart-mode]").forEach(button => {
    button.addEventListener("click", () => {
      chartMode = button.dataset.chartMode;
      renderProgressChart();
    });
  });
}

function renderComparison() {
  const card = $("#compareCard");
  if (!card) return;
  const rows = state.habits.map(habit => {
    let scheduled = 0;
    let completed = 0;
    for (let i = 0; i < 30; i += 1) {
      const { key, day } = shiftKey(i);
      if (!habit.days.includes(day) || key < habitStartKey(habit)) continue;
      scheduled += 1;
      if (habit.completions?.[key]) completed += 1;
    }
    return { habit, scheduled, completed, pct: scheduled ? Math.round((completed / scheduled) * 100) : 0 };
  }).sort((a, b) => b.pct - a.pct);
  card.innerHTML = `
    <div class="analytics-head">
      <h2>Сравнение привычек</h2>
      <small>за 30 дней</small>
    </div>
    ${rows.length ? rows.map(row => `
      <div class="compare-row">
        <span class="compare-name">${escapeHtml(row.habit.icon)} ${escapeHtml(row.habit.name)}</span>
        <div class="compare-track"><div class="compare-fill" style="width:${row.pct}%;background:${row.habit.color}"></div></div>
        <b>${row.pct}%</b>
      </div>
    `).join("") : `<p class="analytics-empty">Добавьте привычки, чтобы сравнивать их.</p>`}
  `;
}

function collectSkips() {
  const counts = {};
  let total = 0;
  state.habits.forEach(habit => {
    Object.values(habit.skips || {}).forEach(reason => {
      if (reason === "dismissed") return;
      counts[reason] = (counts[reason] || 0) + 1;
      total += 1;
    });
  });
  return { counts, total };
}

function renderSkipAnalytics() {
  const card = $("#skipReasonCard");
  if (!card) return;
  const { counts, total } = collectSkips();
  const rows = SKIP_REASONS.map(reason => ({ ...reason, count: counts[reason.id] || 0 })).sort((a, b) => b.count - a.count);
  const top = rows[0];
  card.innerHTML = `
    <div class="analytics-head">
      <h2>Причины пропусков</h2>
      <small>${total ? `ответов: ${total}` : ""}</small>
    </div>
    ${total ? `
      <p class="skip-insight">Главная причина пропусков — <b>${top.theme}</b>.</p>
      ${rows.map(row => `
        <div class="compare-row">
          <span class="compare-name">${row.icon} ${row.label}</span>
          <div class="compare-track"><div class="compare-fill accent" style="width:${Math.round((row.count / total) * 100)}%"></div></div>
          <b>${row.count}</b>
        </div>
      `).join("")}
    ` : `<p class="analytics-empty">Когда вы пропустите привычку, приложение спросит почему. Через время здесь появится аналитика причин — и станет понятно, что мешает чаще всего.</p>`}
  `;
}

function checkMissedHabits() {
  skipQueue = [];
  state.habits.forEach(habit => {
    const startKey = habitStartKey(habit);
    for (let i = 1; i <= 7; i += 1) {
      const { key, day } = shiftKey(i);
      if (key < startKey) continue;
      if (!habit.days.includes(day)) continue;
      if (habit.completions?.[key]) continue;
      if (habit.skips?.[key]) continue;
      skipQueue.push({ habitId: habit.id, key });
    }
  });
  skipQueue.sort((a, b) => b.key.localeCompare(a.key));
  skipQueue = skipQueue.slice(0, 3);
  processSkipQueue();
}

function processSkipQueue() {
  const dialog = $("#skipDialog");
  if (!dialog) return;
  if (!skipQueue.length) {
    if (dialog.open) dialog.close();
    return;
  }
  const item = skipQueue[0];
  const habit = state.habits.find(entry => entry.id === item.habitId);
  if (!habit) {
    skipQueue.shift();
    processSkipQueue();
    return;
  }
  const date = new Date(`${item.key}T12:00:00`);
  $("#skipContext").innerHTML = `${escapeHtml(habit.icon)} <b>${escapeHtml(habit.name)}</b> — пропуск ${date.toLocaleString("ru-RU", { day: "numeric", month: "long" })}`;
  if (!dialog.open) dialog.showModal();
}

function answerSkip(reasonId) {
  const item = skipQueue.shift();
  if (item) {
    const habit = state.habits.find(entry => entry.id === item.habitId);
    if (habit) {
      habit.skips ||= {};
      habit.skips[item.key] = reasonId;
      saveState();
    }
  }
  if (skipQueue.length) {
    processSkipQueue();
  } else {
    $("#skipDialog").close();
    renderAnalytics();
    if (reasonId !== "dismissed") showToast("Спасибо! Ответы копятся в Аналитике.");
  }
}

function renderAchievements() {
  const grouped = achievements.reduce((groups, item) => {
    groups[item.group] ||= [];
    groups[item.group].push(item);
    return groups;
  }, {});
  $("#achievementList").innerHTML = Object.entries(grouped).map(([group, items]) => `
    <article class="achievement-card">
      <h2>${group === "Общие" ? "✱" : "🔥"} ${group}</h2>
      <div class="badges">
        ${items.map(item => `
          <div class="badge ${item.unlocked(state) ? "unlocked" : ""}">
            <div class="badge-icon">${item.icon}</div>
            <small>${item.label}</small>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function renderSettings() {
  $("#notifyGeneral").checked = state.settings.notifyGeneral;
  $("#notifyActivity").checked = state.settings.notifyActivity;
  $("#privateMode").checked = state.settings.privateMode;
  $("#mondayFirst").classList.toggle("active", state.settings.weekStart === "monday");
  $("#sundayFirst").classList.toggle("active", state.settings.weekStart === "sunday");
  $$(".icon-choice").forEach(button => button.classList.toggle("active", button.dataset.icon === state.settings.appIcon));
}

function renderPickers() {
  $$("#weekdayPicker button").forEach(button => {
    button.classList.toggle("active", selectedDays.includes(Number(button.dataset.day)));
  });
  $$("#colorPicker button").forEach(button => {
    button.classList.toggle("active", button.dataset.color === selectedColor);
  });
}

function openHabitDialog(id) {
  const habit = state.habits.find(item => item.id === id);
  $("#habitDialogTitle").textContent = habit ? "Редактировать привычку" : "Новая привычка";
  $("#habitId").value = habit?.id || "";
  $("#habitName").value = habit?.name || "";
  $("#habitIcon").value = habit?.icon || "✱";
  $("#habitTime").value = habit?.time || "";
  $("#deleteHabitButton").hidden = !habit;
  selectedDays = habit ? [...habit.days] : [1, 2, 3, 4, 5];
  selectedColor = habit?.color || colors[0];
  renderPickers();
  $("#habitDialog").showModal();
}

function weekDashClass(habit, day, doneToday) {
  const classes = [];
  if (habit.days.includes(day)) classes.push("active");
  if (doneToday && day === today.getDay()) classes.push("done-day");
  return classes.join(" ");
}

function handleHabitSubmit(event) {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  const id = $("#habitId").value;
  const existing = state.habits.find(item => item.id === id);
  const habit = {
    id: id || crypto.randomUUID(),
    name: $("#habitName").value.trim(),
    icon: $("#habitIcon").value,
    color: selectedColor,
    days: (selectedDays.length ? [...selectedDays] : [0, 1, 2, 3, 4, 5, 6])
      .sort((a, b) => weekOrder().indexOf(a) - weekOrder().indexOf(b)),
    time: $("#habitTime").value,
    completions: existing?.completions || {},
    skips: existing?.skips || {},
    createdAt: existing?.createdAt || dateKey()
  };
  if (!habit.name) return;
  state.habits = id ? state.habits.map(item => item.id === id ? habit : item) : [habit, ...state.habits];
  saveState();
  $("#habitDialog").close();
  render();
  showToast(id ? "Привычка обновлена." : "Привычка создана.");
}

function toggleHabit(id) {
  const habit = state.habits.find(item => item.id === id);
  if (!habit) return;
  const key = dateKey();
  habit.completions[key] = !habit.completions[key];
  if (!habit.completions[key]) {
    delete habit.completions[key];
  } else {
    state.feed.unshift({
      title: `${habit.icon} ${habit.name} выполнена`,
      time: new Date().toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    });
  }
  saveState();
  render();
}

function isDoneToday(habit) {
  return Boolean(habit.completions?.[dateKey()]);
}

function habitStreak(habit) {
  let streak = 0;
  const todayKey = dateKey();
  const cursor = new Date();
  for (let i = 0; i < 365; i += 1) {
    const key = dateKey(cursor);
    const day = cursor.getDay();
    if (habit.days.includes(day)) {
      if (habit.completions?.[key]) {
        streak += 1;
      } else if (key !== todayKey) {
        break;
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function bestStreak(data) {
  return Math.max(0, ...data.habits.map(habitStreak));
}

function weekOrder() {
  return state.settings.weekStart === "monday" ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
}

function updateSetting(key, value) {
  state.settings[key] = value;
  saveState();
  render();
}

function editQuote() {
  const quote = prompt("Цитата в профиле", state.profileQuote || "маленькими шагами");
  if (!quote?.trim()) return;
  state.profileQuote = quote.trim().slice(0, 42);
  saveState();
  renderProfile();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `habitlink-${dateKey()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = mergeState(JSON.parse(reader.result));
      saveState();
      render();
      showToast("Данные импортированы.");
    } catch {
      showToast("Не получилось прочитать JSON.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function resetData() {
  if (!confirm("Удалить все привычки и настройки?")) return;
  state = structuredClone(defaultState);
  saveState();
  render();
  showToast("Данные очищены.");
}

function deleteHabit() {
  const id = $("#habitId").value;
  const habit = state.habits.find(item => item.id === id);
  if (!habit) return;
  if (!confirm(`Удалить привычку «${habit.name}»?`)) return;
  state.habits = state.habits.filter(item => item.id !== id);
  state.feed.unshift({
    title: `${habit.icon} ${habit.name} удалена`,
    time: new Date().toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
  });
  saveState();
  $("#habitDialog").close();
  render();
  showToast("Привычка удалена.");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
