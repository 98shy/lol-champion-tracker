const DDRAGON_ROOT = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "16.18.1";
const STORAGE_KEY = "lol-champion-tracker:used-v1";
const RECORD_STORAGE_KEY = "lol-champion-tracker:record-v1";
const CHAMPION_ALIASES = {
  Morgana: ["몰가"],
  Pantheon: ["빵테"],
  Renata: ["레나타"],
  Fiddlesticks: ["피들"],
  Heimerdinger: ["딩거", "하이머"],
  DrMundo: ["문도"],
  MasterYi: ["마이"],
  MonkeyKing: ["손오공"],
  Nunu: ["누누"],
  TahmKench: ["탐켄치"],
};
const KOREAN_INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

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
  stakeCount: document.querySelector("#stakeCount"),
  stakeControls: document.querySelector("#stakeControls"),
  settlementResult: document.querySelector("#settlementResult"),
  championTooltip: document.querySelector("#championTooltip"),
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.used]));
  } catch {
    // 저장소가 차단된 브라우저에서도 화면 조작은 계속 동작합니다.
  }
}

function readStoredRecord() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY));
    const storedStake = Number.parseInt(saved?.stake, 10);
    return {
      wins: Math.max(0, Number.parseInt(saved?.wins, 10) || 0),
      losses: Math.max(0, Number.parseInt(saved?.losses, 10) || 0),
      stake: Number.isFinite(storedStake) ? Math.max(0, Math.round(storedStake / 100) * 100) : 100,
    };
  } catch {
    return { wins: 0, losses: 0, stake: 100 };
  }
}

function saveRecord() {
  try {
    localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(state.record));
  } catch {
    // 저장소가 차단된 브라우저에서도 전적 조작은 계속 동작합니다.
  }
}

function renderRecord() {
  const { wins, losses, stake } = state.record;
  const games = wins + losses;
  const rate = games ? `${Math.round((wins / games) * 100)}%` : "—";
  const settlement = (wins - losses) * stake;
  ui.winCount.textContent = wins;
  ui.lossCount.textContent = losses;
  ui.winControlCount.textContent = wins;
  ui.lossControlCount.textContent = losses;
  ui.winRate.textContent = rate;
  ui.stakeCount.textContent = `${stake.toLocaleString("ko-KR")}개`;
  ui.settlementResult.textContent = `${settlement > 0 ? "+" : ""}${settlement.toLocaleString("ko-KR")}개`;
  ui.settlementResult.classList.toggle("is-positive", settlement > 0);
  ui.settlementResult.classList.toggle("is-negative", settlement < 0);
  ui.recordControls.querySelector('[data-record="win"][data-delta="-1"]').disabled = wins === 0;
  ui.recordControls.querySelector('[data-record="loss"][data-delta="-1"]').disabled = losses === 0;
  ui.stakeControls.querySelector('[data-stake-delta="-100"]').disabled = stake < 100;
  ui.stakeControls.querySelector('[data-stake-delta="-1000"]').disabled = stake < 1000;
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

function normalizeSearchText(value) {
  return value.toLocaleLowerCase("ko-KR").replace(/[\s·.'’_-]+/g, "");
}

function getKoreanInitials(value) {
  return [...value].map((character) => {
    const code = character.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? KOREAN_INITIALS[Math.floor(code / 588)] : character;
  }).join("");
}

function isOrderedAbbreviation(query, target) {
  if (query.length < 2) return false;
  let queryIndex = 0;
  for (const character of target) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }
  return false;
}

function matchesChampionSearch(champion, query) {
  if (!query) return true;
  const searchableNames = [champion.name, champion.id, ...(CHAMPION_ALIASES[champion.id] ?? [])]
    .map(normalizeSearchText);

  if (searchableNames.some((name) => name.includes(query))) return true;
  if (/^[ㄱ-ㅎ]+$/.test(query)) {
    return searchableNames.some((name) => getKoreanInitials(name).includes(query));
  }
  return searchableNames.some((name) => isOrderedAbbreviation(query, name));
}

function getFilteredChampions() {
  const normalizedQuery = normalizeSearchText(state.query);
  return state.champions.filter((champion) => {
    const matchesSearch = matchesChampionSearch(champion, normalizedQuery);
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
  button.dataset.championName = champion.name;
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
  const ban = document.createElement("span");
  ban.className = "champion__ban";
  ban.setAttribute("aria-hidden", "true");
  portrait.append(image, shade, ban);
  button.append(portrait);
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
  ui.undo.disabled = state.history.length === 0;
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

ui.grid.addEventListener("pointermove", (event) => {
  const champion = event.target.closest(".champion");
  if (!champion) {
    ui.championTooltip.hidden = true;
    return;
  }
  ui.championTooltip.textContent = champion.dataset.championName;
  ui.championTooltip.hidden = false;
  const bounds = ui.championTooltip.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - bounds.width - 16);
  const top = Math.min(event.clientY, window.innerHeight - bounds.height - 16);
  ui.championTooltip.style.left = `${Math.max(0, left)}px`;
  ui.championTooltip.style.top = `${Math.max(0, top)}px`;
});

ui.grid.addEventListener("pointerleave", () => {
  ui.championTooltip.hidden = true;
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

ui.recordControls.querySelectorAll("[data-record]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.record === "win" ? "wins" : "losses";
    const delta = Number(button.dataset.delta);
    state.record[key] = Math.max(0, state.record[key] + delta);
    renderRecord();
    saveRecord();
  });
});

ui.stakeControls.querySelectorAll("[data-stake-delta]").forEach((button) => {
  button.addEventListener("click", () => {
    const delta = Number(button.dataset.stakeDelta);
    state.record.stake = Math.max(0, state.record.stake + delta);
    renderRecord();
    saveRecord();
  });
});

ui.recordReset.addEventListener("click", () => {
  if (state.record.wins + state.record.losses === 0) return showToast("초기화할 전적이 없습니다.");
  if (!window.confirm("현재 승패 기록을 모두 초기화할까요?")) return;
  state.record = { ...state.record, wins: 0, losses: 0 };
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
