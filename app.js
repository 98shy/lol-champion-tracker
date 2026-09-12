const DDRAGON_ROOT = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "16.18.1";
const STORAGE_KEY = "lol-champion-tracker:used-v1";
const RECORD_STORAGE_KEY = "lol-champion-tracker:record-v1";

const state = {
  champions: [],
  used: new Set(readStoredUsed()),
  version: "",
  query: "",
  role: "all",
  status: "all",
  history: [],
  record: readStoredRecord(),
};

const ui = {
  grid: document.querySelector("#championGrid"),
  loading: document.querySelector("#loadingState"),
  error: document.querySelector("#errorState"),
  empty: document.querySelector("#emptyState"),
  search: document.querySelector("#searchInput"),
  roles: document.querySelector("#roleFilters"),
  statuses: document.querySelector("#statusFilters"),
  usedCount: document.querySelector("#usedCount"),
  totalCount: document.querySelector("#totalCount"),
  progressPercent: document.querySelector("#progressPercent"),
  progressBar: document.querySelector("#progressBar"),
  progressMessage: document.querySelector("#progressMessage"),
  resultCount: document.querySelector("#resultCount"),
  patchInfo: document.querySelector("#patchInfo"),
  undo: document.querySelector("#undoButton"),
  reset: document.querySelector("#resetButton"),
  retry: document.querySelector("#retryButton"),
  toast: document.querySelector("#toast"),
  winCount: document.querySelector("#winCount"),
  lossCount: document.querySelector("#lossCount"),
  winControlCount: document.querySelector("#winControlCount"),
  lossControlCount: document.querySelector("#lossControlCount"),
  winRate: document.querySelector("#winRate"),
  recordControls: document.querySelector(".record-card__controls"),
  recordReset: document.querySelector("#recordResetButton"),
};

let toastTimer;

function readStoredUsed() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveUsed() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.used]));
}

function readStoredRecord() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY));
    return {
      wins: Math.max(0, Number.parseInt(saved?.wins, 10) || 0),
      losses: Math.max(0, Number.parseInt(saved?.losses, 10) || 0),
    };
  } catch {
    return { wins: 0, losses: 0 };
  }
}

function saveRecord() {
  localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(state.record));
}

function renderRecord() {
  const { wins, losses } = state.record;
  const games = wins + losses;
  const rate = games ? `${Math.round((wins / games) * 100)}%` : "—";
  ui.winCount.textContent = wins;
  ui.lossCount.textContent = losses;
  ui.winControlCount.textContent = wins;
  ui.lossControlCount.textContent = losses;
  ui.winRate.textContent = rate;
  ui.recordControls.querySelector('[data-record="win"][data-delta="-1"]').disabled = wins === 0;
  ui.recordControls.querySelector('[data-record="loss"][data-delta="-1"]').disabled = losses === 0;
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadChampions() {
  ui.loading.hidden = false;
  ui.error.hidden = true;
  ui.grid.hidden = true;

  try {
    let version = FALLBACK_VERSION;
    try {
      const versions = await getJSON(`${DDRAGON_ROOT}/api/versions.json`);
      if (versions[0]) version = versions[0];
    } catch {
      // 최신 버전 확인만 실패하면 검증된 기본 버전으로 계속 진행합니다.
    }

    const payload = await getJSON(`${DDRAGON_ROOT}/cdn/${version}/data/ko_KR/champion.json`);
    state.version = version;
    state.champions = Object.values(payload.data).sort((a, b) =>
      a.name.localeCompare(b.name, "ko-KR")
    );

    const validIds = new Set(state.champions.map((champion) => champion.id));
    state.used = new Set([...state.used].filter((id) => validIds.has(id)));
    saveUsed();

    ui.patchInfo.textContent = `Riot Data Dragon · 패치 ${version}`;
    ui.loading.hidden = true;
    ui.grid.hidden = false;
    render();
  } catch (error) {
    console.error(error);
    ui.loading.hidden = true;
    ui.error.hidden = false;
  }
}

function getFilteredChampions() {
  const normalizedQuery = state.query.trim().toLocaleLowerCase("ko-KR");
  return state.champions.filter((champion) => {
    const matchesSearch = !normalizedQuery ||
      champion.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery) ||
      champion.id.toLocaleLowerCase("en-US").includes(normalizedQuery);
    const matchesRole = state.role === "all" || champion.tags.includes(state.role);
    const isUsed = state.used.has(champion.id);
    const matchesStatus = state.status === "all" ||
      (state.status === "used" && isUsed) ||
      (state.status === "unused" && !isUsed);
    return matchesSearch && matchesRole && matchesStatus;
  });
}

function createChampionButton(champion) {
  const isUsed = state.used.has(champion.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `champion${isUsed ? " is-used" : ""}`;
  button.dataset.championId = champion.id;
  button.setAttribute("aria-pressed", String(isUsed));
  button.setAttribute("aria-label", `${champion.name}, ${isUsed ? "사용 완료" : "미사용"}`);

  const portrait = document.createElement("span");
  portrait.className = "champion__portrait";
  const image = document.createElement("img");
  image.src = `${DDRAGON_ROOT}/cdn/${state.version}/img/champion/${champion.image.full}`;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";

  const shade = document.createElement("span");
  shade.className = "champion__shade";
  const check = document.createElement("span");
  check.className = "champion__check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";
  const name = document.createElement("span");
  name.className = "champion__name";
  name.textContent = champion.name;

  portrait.append(image, shade, check);
  button.append(portrait, name);
  return button;
}

function render() {
  const filtered = getFilteredChampions();
  const fragment = document.createDocumentFragment();
  filtered.forEach((champion) => fragment.append(createChampionButton(champion)));
  ui.grid.replaceChildren(fragment);
  ui.empty.hidden = filtered.length !== 0 || state.champions.length === 0;
  ui.grid.hidden = filtered.length === 0;
  ui.resultCount.textContent = `${filtered.length}명 표시 중`;
  updateProgress();
}

function updateProgress() {
  const used = state.used.size;
  const total = state.champions.length;
  const percent = total ? Math.round((used / total) * 100) : 0;
  ui.usedCount.textContent = used;
  ui.totalCount.textContent = total || "—";
  ui.progressPercent.textContent = `${percent}%`;
  ui.progressBar.style.width = `${percent}%`;
  ui.undo.disabled = state.history.length === 0;

  if (!total) return;
  if (used === 0) ui.progressMessage.textContent = "첫 챔피언을 선택해 여정을 시작하세요.";
  else if (used === total) ui.progressMessage.textContent = "모든 챔피언을 플레이했습니다. 완벽해요!";
  else ui.progressMessage.textContent = `앞으로 ${total - used}명의 챔피언이 남았습니다.`;
}

function toggleChampion(id) {
  const wasUsed = state.used.has(id);
  state.history.push([...state.used]);
  if (wasUsed) state.used.delete(id);
  else state.used.add(id);
  saveUsed();
  render();

  const champion = state.champions.find((item) => item.id === id);
  showToast(`${champion?.name ?? id} · ${wasUsed ? "미사용으로 변경" : "사용 완료"}`);
}

function showToast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => ui.toast.classList.remove("is-visible"), 1800);
}

ui.grid.addEventListener("click", (event) => {
  const champion = event.target.closest(".champion");
  if (champion) toggleChampion(champion.dataset.championId);
});

ui.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

ui.roles.addEventListener("click", (event) => {
  const button = event.target.closest("[data-role]");
  if (!button) return;
  state.role = button.dataset.role;
  ui.roles.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
  render();
});

ui.statuses.addEventListener("click", (event) => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  state.status = button.dataset.status;
  ui.statuses.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
  render();
});

ui.undo.addEventListener("click", () => {
  const previous = state.history.pop();
  if (!previous) return;
  state.used = new Set(previous);
  saveUsed();
  render();
  showToast("마지막 변경을 취소했습니다.");
});

ui.reset.addEventListener("click", () => {
  if (!state.used.size) return showToast("초기화할 기록이 없습니다.");
  if (!window.confirm(`${state.used.size}명의 사용 기록을 모두 초기화할까요?`)) return;
  state.history.push([...state.used]);
  state.used.clear();
  saveUsed();
  render();
  showToast("모든 사용 기록을 초기화했습니다.");
});

ui.retry.addEventListener("click", loadChampions);

ui.recordControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-record]");
  if (!button) return;
  const key = button.dataset.record === "win" ? "wins" : "losses";
  const delta = Number(button.dataset.delta);
  state.record[key] = Math.max(0, state.record[key] + delta);
  saveRecord();
  renderRecord();
});

ui.recordReset.addEventListener("click", () => {
  if (state.record.wins + state.record.losses === 0) return showToast("초기화할 전적이 없습니다.");
  if (!window.confirm("현재 승패 기록을 모두 초기화할까요?")) return;
  state.record = { wins: 0, losses: 0 };
  saveRecord();
  renderRecord();
  showToast("승패 기록을 초기화했습니다.");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== ui.search) {
    event.preventDefault();
    ui.search.focus();
  }
  if (event.key === "Escape" && document.activeElement === ui.search) {
    ui.search.value = "";
    state.query = "";
    ui.search.blur();
    render();
  }
});

renderRecord();
loadChampions();
