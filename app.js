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

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  setupDates();
  setupPickers();
  bindEvents();
  render();
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
  return date.toISOString().slice(0, 10);
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
  renderAchievements();
  renderSettings();
}

function renderHome() {
  const list = $("#habitList");
  list.innerHTML = "";
  const currentDay = today.getDay();
  const todaysHabits = state.habits.filter(habit => habit.days.includes(currentDay));
  $("#emptyHome").classList.toggle("visible", state.habits.length === 0);

  const habitsToShow = todaysHabits.length ? todaysHabits : state.habits;
  habitsToShow.forEach(habit => {
    const doneToday = isDoneToday(habit);
    const card = document.createElement("article");
    card.className = `habit-card ${doneToday ? "done-today" : ""}`;
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
      <p>${habit.days.map(day => dayNames[day]).join(", ") || "Каждый день"}</p>
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
    item.innerHTML = "<strong>Пока тихо</strong><small>Тут будут ваши выполненные привычки.</small>";
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
  const card = $("#heatmapCard");
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
    <div class="heatmap-scroll" id="heatmapScroll">
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

  const scroll = card.querySelector("#heatmapScroll");
  scroll.scrollLeft = scroll.scrollWidth;
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
  const habit = {
    id: id || crypto.randomUUID(),
    name: $("#habitName").value.trim(),
    icon: $("#habitIcon").value,
    color: selectedColor,
    days: selectedDays.length ? selectedDays : [0, 1, 2, 3, 4, 5, 6],
    time: $("#habitTime").value,
    completions: state.habits.find(item => item.id === id)?.completions || {}
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
  const cursor = new Date();
  for (let i = 0; i < 365; i += 1) {
    const key = dateKey(cursor);
    const day = cursor.getDay();
    if (habit.days.includes(day)) {
      if (habit.completions?.[key]) streak += 1;
      else break;
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
