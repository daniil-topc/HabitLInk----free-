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
    notifyFriends: true,
    appIcon: "∞"
  },
  habits: [
    {
      id: crypto.randomUUID(),
      name: "Бег по утрам",
      icon: "✱",
      color: "#59633f",
      days: [2, 4, 6, 0],
      time: "09:00",
      completions: {}
    }
  ],
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
  return {
    ...structuredClone(defaultState),
    ...saved,
    settings: { ...defaultState.settings, ...(saved.settings || {}) },
    habits: Array.isArray(saved.habits) ? saved.habits : defaultState.habits,
    feed: Array.isArray(saved.feed) ? saved.feed : []
  };
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
    if (action === "edit-quote") editQuote();
    if (action === "open-menu") showToast("Меню поддержки можно заменить своими ссылками.");
    if (action === "open-premium") showToast("В этой версии всё бесплатно.");
    if (action === "export-data") exportData();
    if (action === "reset-data") resetData();
    if (action === "invite") inviteFriend();
  });

  $("#habitForm").addEventListener("submit", handleHabitSubmit);
  $("#notifyGeneral").addEventListener("change", event => updateSetting("notifyGeneral", event.target.checked));
  $("#notifyFriends").addEventListener("change", event => updateSetting("notifyFriends", event.target.checked));
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
    const card = document.createElement("article");
    card.className = "habit-card";
    card.style.setProperty("--habit-color", habit.color);
    card.innerHTML = `
      <div class="habit-top">
        <div class="habit-icon">${escapeHtml(habit.icon)}</div>
        <button class="done-button ${isDoneToday(habit) ? "done" : ""}" type="button" aria-label="Отметить">${isDoneToday(habit) ? "✓" : "⌄"}</button>
      </div>
      <h2>${escapeHtml(habit.name)}</h2>
      <p>${habit.days.map(day => dayNames[day]).join(", ") || "Каждый день"}</p>
      <div class="habit-bottom">
        <div class="week-dashes">${weekOrder().map(day => `<span class="${habit.days.includes(day) ? "active" : ""}"></span>`).join("")}</div>
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
    item.className = "feed-item";
    item.innerHTML = "<strong>Пока тихо</strong><small>Отметьте привычку, и событие появится здесь.</small>";
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
  $("#notifyFriends").checked = state.settings.notifyFriends;
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
  selectedDays = habit ? [...habit.days] : [1, 2, 3, 4, 5];
  selectedColor = habit?.color || colors[0];
  renderPickers();
  $("#habitDialog").showModal();
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

async function inviteFriend() {
  const text = "Присоединяйся к моему HabitLink: личному трекеру привычек.";
  try {
    await navigator.clipboard.writeText(text);
    showToast("Приглашение скопировано.");
  } catch {
    showToast(text);
  }
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
