import {
  DEFAULT_LIMIT,
  clampPrice,
  compareChannels,
  defaultSortDirection,
  matchesFilters,
  resultLabel,
  topicFacetCounts,
} from "./catalog-core.js";

const ALLOWED_VIEWS = new Set(["cards", "table"]);
const ALLOWED_DIRECTIONS = new Set(["asc", "desc"]);
const ALLOWED_PAYMENTS = new Set(["", "subscription", "one-off", "both"]);

const form = document.querySelector("#filters");
const grid = document.querySelector("#channel-grid");
const tableView = document.querySelector("#channel-table-view");
const tableBody = document.querySelector("#channel-table-body");
const tableRows = new Map(
  [...document.querySelectorAll(".channel-row")].map((row) => [row.dataset.slug, row]),
);

function parseStringArray(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
      : fallback;
  } catch {
    return fallback;
  }
}

function parseOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const channels = [...document.querySelectorAll(".channel-card")].map((element) => ({
  cardElement: element,
  rowElement: tableRows.get(element.dataset.slug),
  slug: element.dataset.slug,
  name: element.dataset.name,
  category: element.dataset.category,
  topics: parseStringArray(element.dataset.topics, [element.dataset.category].filter(Boolean)),
  paymentTypes: parseStringArray(element.dataset.paymentTypes),
  activity: element.dataset.activity,
  subscriptionPrice: parseOptionalNumber(element.dataset.subscriptionPrice),
  oneOffPrice: parseOptionalNumber(element.dataset.oneOffPrice),
  subscribers: Number(element.dataset.subscribers || 0),
  lastPost: Number(element.dataset.lastPost || 0),
  growth: Number(element.dataset.growth || 0),
  searchText: element.dataset.search || "",
}));

const resultSummary = document.querySelector("#result-summary");
const emptyState = document.querySelector("#empty-state");
const loadMore = document.querySelector("#load-more");
const loadMoreWrap = document.querySelector(".load-more-wrap");
const activeFilters = document.querySelector("#active-filters");
const queryInput = document.querySelector("#query");
const categoryInput = document.querySelector("#category");
const paymentInput = document.querySelector("#payment-type");
const activityInput = document.querySelector("#activity");
const maxSubscriptionInput = document.querySelector("#max-subscription-price");
const maxOneOffInput = document.querySelector("#max-one-off-price");
const sortInput = document.querySelector("#sort");
const growthInput = document.querySelector("#growth");
const mobileFiltersToggle = document.querySelector(".mobile-filters-toggle");
const viewButtons = [...document.querySelectorAll("[data-view]")];
const sortButtons = [...document.querySelectorAll("[data-sort-key]")];
const categoryChips = [...document.querySelectorAll("[data-category-chip]")];
const paymentButtons = [...document.querySelectorAll("[data-payment-filter]")];
const categoryOptions = [...categoryInput.options];
const topicValues = categoryOptions.map((option) => option.value).filter(Boolean);
const topicMoreButton = document.querySelector(".topic-more");
const sortAnnouncement = document.querySelector("#table-sort-announcement");
const channelDialog = document.querySelector("#channel-dialog");
const channelDialogContent = document.querySelector("#channel-dialog-content");
const channelTemplates = new Map(
  [...document.querySelectorAll("template[data-channel-slug]")]
    .map((template) => [template.dataset.channelSlug, template]),
);

let visibleLimit = DEFAULT_LIMIT;
let currentView = "table";
let sortDirection = defaultSortDirection(sortInput.value);
let lastDialogTrigger = null;

function readFilters() {
  return {
    query: queryInput.value.slice(0, 100),
    category: categoryInput.value,
    paymentType: ALLOWED_PAYMENTS.has(paymentInput.value) ? paymentInput.value : "",
    activity: activityInput.value,
    maxSubscriptionPrice: clampPrice(maxSubscriptionInput.value),
    maxOneOffPrice: clampPrice(maxOneOffInput.value),
    sort: sortInput.value,
    direction: sortDirection,
    growth: growthInput.checked,
  };
}

function updateUrl(filters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.category) params.set("category", filters.category);
  if (filters.paymentType) params.set("payment", filters.paymentType);
  if (filters.activity) params.set("activity", filters.activity);
  if (filters.maxSubscriptionPrice !== null) params.set("maxSubscriptionPrice", String(filters.maxSubscriptionPrice));
  if (filters.maxOneOffPrice !== null) params.set("maxOneOffPrice", String(filters.maxOneOffPrice));
  if (filters.sort !== "recommended") params.set("sort", filters.sort);
  if (filters.direction !== defaultSortDirection(filters.sort)) params.set("direction", filters.direction);
  if (filters.growth) params.set("growth", "1");
  if (currentView === "cards") params.set("view", "cards");
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

function paymentLabel(value) {
  return {
    subscription: "Подписка",
    "one-off": "Разовая покупка",
    both: "Оба формата",
  }[value] || "Любая оплата";
}

function renderActiveFilters(filters) {
  activeFilters.replaceChildren();
  const addChip = (label, clearFilter, focusTarget) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.textContent = `${label} ×`;
    button.setAttribute("aria-label", `Убрать фильтр: ${label}`);
    button.addEventListener("click", () => {
      clearFilter();
      applyFilters();
      queueMicrotask(() => focusTarget?.focus());
    });
    activeFilters.append(button);
  };

  if (filters.query) addChip(`Поиск: ${filters.query}`, () => { queryInput.value = ""; }, queryInput);
  if (filters.category) addChip(filters.category, () => { categoryInput.value = ""; }, categoryInput);
  if (filters.paymentType) addChip(paymentLabel(filters.paymentType), () => { paymentInput.value = ""; }, paymentInput);
  if (filters.activity) {
    addChip(activityInput.options[activityInput.selectedIndex].text, () => { activityInput.value = ""; }, activityInput);
  }
  if (filters.maxSubscriptionPrice !== null) {
    addChip(
      `Подписка до ${filters.maxSubscriptionPrice.toLocaleString("ru-RU")}\u00A0₽`,
      () => { maxSubscriptionInput.value = ""; },
      maxSubscriptionInput,
    );
  }
  if (filters.maxOneOffPrice !== null) {
    addChip(
      `Материал до ${filters.maxOneOffPrice.toLocaleString("ru-RU")}\u00A0₽`,
      () => { maxOneOffInput.value = ""; },
      maxOneOffInput,
    );
  }
  if (filters.growth) addChip("С ростом аудитории", () => { growthInput.checked = false; }, growthInput);

  if (activeFilters.childElementCount > 1) {
    const clearAll = document.createElement("button");
    clearAll.type = "button";
    clearAll.className = "filter-clear-all";
    clearAll.textContent = "Сбросить все";
    clearAll.addEventListener("click", resetFilters);
    activeFilters.append(clearAll);
  }
  activeFilters.hidden = activeFilters.childElementCount === 0;
}

function updateTopicFacet(filters) {
  const { total, counts } = topicFacetCounts(channels, filters, topicValues);
  const allOption = categoryOptions.find((option) => option.value === "");
  if (allOption) allOption.textContent = `Все темы · ${total.toLocaleString("ru-RU")}`;

  for (const option of categoryOptions) {
    if (!option.value) continue;
    const count = counts.get(option.value) || 0;
    const label = option.dataset.topicLabel || option.value;
    const active = option.value === filters.category;
    option.textContent = `${label} · ${count.toLocaleString("ru-RU")}`;
    option.disabled = count === 0 && !active;
  }

  for (const chip of categoryChips) {
    const topic = chip.dataset.categoryChip;
    const count = counts.get(topic) || 0;
    const label = chip.dataset.topicLabel || topic;
    const active = topic === filters.category;
    chip.querySelector("[data-topic-count]")?.replaceChildren(document.createTextNode(`· ${count.toLocaleString("ru-RU")}`));
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
    chip.setAttribute("aria-label", `${label}: ${resultLabel(count)}${active ? ", выбрано" : ""}`);
    chip.disabled = count === 0 && !active;
  }
}

function updatePaymentButtons(filters) {
  for (const button of paymentButtons) {
    const active = button.dataset.paymentFilter === filters.paymentType;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function updateMobileFiltersToggle(filters) {
  if (!mobileFiltersToggle) return;
  const activeCount = [
    filters.category,
    filters.paymentType,
    filters.activity,
    filters.maxSubscriptionPrice !== null,
    filters.maxOneOffPrice !== null,
    filters.growth,
  ].filter(Boolean).length;
  const expanded = form.classList.contains("is-expanded");
  mobileFiltersToggle.textContent = expanded ? "Скрыть фильтры" : activeCount ? `Фильтры · ${activeCount}` : "Фильтры";
  mobileFiltersToggle.setAttribute("aria-expanded", String(expanded));
}

function updateSortHeaders(filters) {
  const activeButton = sortButtons.find((button) => button.dataset.sortKey === filters.sort);
  for (const button of sortButtons) {
    const column = button.parentElement;
    const active = button.dataset.sortKey === filters.sort;
    if (active) column.setAttribute("aria-sort", filters.direction === "asc" ? "ascending" : "descending");
    else column.removeAttribute("aria-sort");
    const indicator = button.querySelector(".sort-indicator");
    if (indicator) indicator.textContent = active ? (filters.direction === "asc" ? "↑" : "↓") : "↕";
  }
  if (sortAnnouncement) {
    sortAnnouncement.textContent = activeButton
      ? `Таблица отсортирована: ${activeButton.textContent.replace(/[↕↑↓]/g, "").trim()}, ${filters.direction === "asc" ? "по возрастанию" : "по убыванию"}.`
      : "Таблица отсортирована по рекомендованному порядку.";
  }
}

function updateViewControls() {
  grid.hidden = currentView !== "cards";
  tableView.hidden = currentView !== "table";
  for (const button of viewButtons) {
    const active = button.dataset.view === currentView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function applyFilters({ resetLimit = true } = {}) {
  if (resetLimit) visibleLimit = DEFAULT_LIMIT;
  const filters = readFilters();
  const matched = channels
    .filter((channel) => matchesFilters(channel, filters))
    .sort((a, b) => compareChannels(a, b, filters.sort, filters.direction));

  for (const channel of channels) {
    channel.cardElement.hidden = true;
    if (channel.rowElement) channel.rowElement.hidden = true;
  }
  for (const [index, channel] of matched.entries()) {
    grid.append(channel.cardElement);
    channel.cardElement.hidden = index >= visibleLimit;
    if (channel.rowElement) {
      tableBody.append(channel.rowElement);
      channel.rowElement.hidden = index >= visibleLimit;
    }
  }

  resultSummary.textContent = `Найдено: ${resultLabel(matched.length)}`;
  emptyState.hidden = matched.length !== 0;
  const remaining = Math.max(0, matched.length - visibleLimit);
  loadMore.textContent = remaining ? `Показать ещё ${Math.min(DEFAULT_LIMIT, remaining).toLocaleString("ru-RU")}` : "Показать ещё";
  loadMore.hidden = remaining === 0;
  loadMoreWrap.hidden = remaining === 0;

  renderActiveFilters(filters);
  updateTopicFacet(filters);
  updatePaymentButtons(filters);
  updateMobileFiltersToggle(filters);
  updateSortHeaders(filters);
  updateViewControls();
  updateUrl(filters);
}

function setView(view) {
  currentView = ALLOWED_VIEWS.has(view) ? view : "table";
  applyFilters({ resetLimit: false });
}

function resetFilters() {
  form.reset();
}

function applyResetState() {
  sortDirection = defaultSortDirection(sortInput.value);
  applyFilters();
}

function openChannelDialog(slug, trigger) {
  const template = channelTemplates.get(slug);
  if (!template || !channelDialog?.showModal) return false;
  const fragment = template.content.cloneNode(true);
  const heading = fragment.querySelector("h2");
  channelDialogContent.replaceChildren(fragment);
  if (heading?.id) channelDialog.setAttribute("aria-labelledby", heading.id);
  lastDialogTrigger = trigger;
  channelDialog.showModal();
  channelDialog.querySelector("[data-close-dialog]")?.focus();
  return true;
}

function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  queryInput.value = (params.get("q") || "").slice(0, 100);

  const category = params.get("category") || "";
  if ([...categoryInput.options].some((option) => option.value === category)) categoryInput.value = category;

  const payment = params.get("payment") || "";
  paymentInput.value = ALLOWED_PAYMENTS.has(payment) ? payment : "";

  const activity = params.get("activity") || "";
  if ([...activityInput.options].some((option) => option.value === activity)) activityInput.value = activity;

  const maxSubscriptionPrice = clampPrice(params.get("maxSubscriptionPrice"));
  maxSubscriptionInput.value = maxSubscriptionPrice === null ? "" : String(maxSubscriptionPrice);
  const maxOneOffPrice = clampPrice(params.get("maxOneOffPrice"));
  maxOneOffInput.value = maxOneOffPrice === null ? "" : String(maxOneOffPrice);

  const sort = params.get("sort") || "recommended";
  if ([...sortInput.options].some((option) => option.value === sort)) sortInput.value = sort;
  const direction = params.get("direction");
  sortDirection = ALLOWED_DIRECTIONS.has(direction) ? direction : defaultSortDirection(sortInput.value);
  growthInput.checked = params.get("growth") === "1";
  currentView = ALLOWED_VIEWS.has(params.get("view")) ? params.get("view") : "table";
}

form.addEventListener("input", (event) => {
  if (event.target === sortInput) sortDirection = defaultSortDirection(sortInput.value);
  applyFilters();
});
form.addEventListener("change", (event) => {
  if (event.target === sortInput) sortDirection = defaultSortDirection(sortInput.value);
  applyFilters();
});
form.addEventListener("reset", () => setTimeout(applyResetState, 0));

for (const button of paymentButtons) {
  button.addEventListener("click", () => {
    paymentInput.value = ALLOWED_PAYMENTS.has(button.dataset.paymentFilter) ? button.dataset.paymentFilter : "";
    applyFilters();
    document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
for (const button of viewButtons) button.addEventListener("click", () => setView(button.dataset.view));
for (const chip of categoryChips) {
  chip.addEventListener("click", () => {
    categoryInput.value = categoryInput.value === chip.dataset.categoryChip ? "" : chip.dataset.categoryChip;
    applyFilters();
  });
}
for (const button of sortButtons) {
  button.addEventListener("click", () => {
    const key = button.dataset.sortKey;
    if (![...sortInput.options].some((option) => option.value === key)) return;
    if (sortInput.value === key) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortInput.value = key;
      sortDirection = defaultSortDirection(key);
    }
    applyFilters({ resetLimit: false });
  });
}

topicMoreButton?.addEventListener("click", () => {
  const expanded = topicMoreButton.getAttribute("aria-expanded") === "true";
  topicMoreButton.setAttribute("aria-expanded", String(!expanded));
  topicMoreButton.textContent = expanded ? "Ещё темы" : "Скрыть темы";
  document.querySelector("#popular-topics")?.classList.toggle("is-expanded", !expanded);
});
mobileFiltersToggle?.addEventListener("click", () => {
  form.classList.toggle("is-expanded");
  updateMobileFiltersToggle(readFilters());
});
loadMore.addEventListener("click", () => {
  visibleLimit += DEFAULT_LIMIT;
  applyFilters({ resetLimit: false });
});
for (const button of document.querySelectorAll("[data-reset-filters]")) button.addEventListener("click", resetFilters);

document.addEventListener("click", (event) => {
  const detailLink = event.target.closest("[data-open-channel]");
  if (
    detailLink &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    openChannelDialog(detailLink.dataset.openChannel, detailLink)
  ) {
    event.preventDefault();
    return;
  }
  if (event.target.closest("[data-close-dialog]")) channelDialog?.close();
});
channelDialog?.addEventListener("click", (event) => {
  if (event.target === channelDialog) channelDialog.close();
});
channelDialog?.addEventListener("close", () => {
  channelDialogContent.replaceChildren();
  lastDialogTrigger?.focus();
  lastDialogTrigger = null;
});

restoreFromUrl();
applyFilters({ resetLimit: false });
