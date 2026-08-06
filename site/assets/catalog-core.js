export const DEFAULT_LIMIT = 24;
export const MAX_PRICE = 500_000;

export const DEFAULT_SORT_DIRECTIONS = Object.freeze({
  recommended: "desc",
  subscribers: "desc",
  recent: "desc",
  activity: "desc",
  subscriptionPrice: "asc",
  oneOffPrice: "asc",
  name: "asc",
  category: "asc",
  growth: "desc",
});

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampPrice(value) {
  if (value === "" || value === null || value === undefined) return null;
  const price = Number(value);
  if (!Number.isFinite(price)) return null;
  return Math.min(MAX_PRICE, Math.max(0, Math.round(price)));
}

export function channelTopics(channel) {
  const topics = Array.isArray(channel?.topics) ? channel.topics : [];
  return [...new Set(
    [channel?.category, ...topics]
      .filter((topic) => typeof topic === "string")
      .map((topic) => topic.trim())
      .filter(Boolean),
  )];
}

export function paymentTypeMatches(channel, paymentType) {
  const types = new Set(Array.isArray(channel.paymentTypes) ? channel.paymentTypes : []);
  if (!paymentType) return true;
  if (paymentType === "both") return types.has("subscription") && types.has("one-off");
  return types.has(paymentType);
}

export function matchesFilters(channel, filters = {}, { ignoreCategory = false } = {}) {
  const query = normalizeText(filters.query);
  if (query && !normalizeText(channel.searchText).includes(query)) return false;
  if (!ignoreCategory && filters.category && !channelTopics(channel).includes(filters.category)) return false;
  if (!paymentTypeMatches(channel, filters.paymentType)) return false;
  if (filters.activity && channel.activity !== filters.activity) return false;

  const maxSubscriptionPrice = clampPrice(filters.maxSubscriptionPrice);
  if (maxSubscriptionPrice !== null) {
    if (!Number.isFinite(channel.subscriptionPrice) || channel.subscriptionPrice > maxSubscriptionPrice) return false;
  }

  const maxOneOffPrice = clampPrice(filters.maxOneOffPrice);
  if (maxOneOffPrice !== null) {
    if (!Number.isFinite(channel.oneOffPrice) || channel.oneOffPrice > maxOneOffPrice) return false;
  }

  if (filters.growth && channel.growth <= 0) return false;
  return true;
}

export function topicFacetCounts(channels, filters = {}, availableTopics = []) {
  const counts = new Map(
    availableTopics
      .filter((topic) => typeof topic === "string" && topic.trim())
      .map((topic) => [topic, 0]),
  );
  let total = 0;

  for (const channel of channels) {
    if (!matchesFilters(channel, filters, { ignoreCategory: true })) continue;
    total += 1;
    for (const topic of channelTopics(channel)) counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return { total, counts };
}

export function defaultSortDirection(sort) {
  return DEFAULT_SORT_DIRECTIONS[sort] || "asc";
}

function finitePrice(value) {
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export function compareChannels(a, b, sort = "recommended", direction = defaultSortDirection(sort)) {
  let comparison;
  if (sort === "subscribers") {
    comparison = b.subscribers - a.subscribers || a.name.localeCompare(b.name, "ru");
  } else if (sort === "recent") {
    comparison = b.lastPost - a.lastPost || b.subscribers - a.subscribers;
  } else if (sort === "activity") {
    const weight = { fresh: 4, active: 3, rare: 2, archive: 1, unknown: 0 };
    comparison = (weight[b.activity] || 0) - (weight[a.activity] || 0) || b.lastPost - a.lastPost;
  } else if (sort === "subscriptionPrice") {
    comparison = finitePrice(a.subscriptionPrice) - finitePrice(b.subscriptionPrice) ||
      b.subscribers - a.subscribers;
  } else if (sort === "oneOffPrice") {
    comparison = finitePrice(a.oneOffPrice) - finitePrice(b.oneOffPrice) ||
      b.subscribers - a.subscribers;
  } else if (sort === "name") {
    comparison = a.name.localeCompare(b.name, "ru");
  } else if (sort === "category") {
    comparison = a.category.localeCompare(b.category, "ru") || a.name.localeCompare(b.name, "ru");
  } else if (sort === "growth") {
    comparison = b.growth - a.growth || b.subscribers - a.subscribers;
  } else {
    const weight = { fresh: 4, active: 3, rare: 2, archive: 1, unknown: 0 };
    const bothA = a.paymentTypes.length === 2 ? 1 : 0;
    const bothB = b.paymentTypes.length === 2 ? 1 : 0;
    comparison =
      (weight[b.activity] || 0) - (weight[a.activity] || 0) ||
      bothB - bothA ||
      Math.log10(b.subscribers + 1) - Math.log10(a.subscribers + 1) ||
      a.name.localeCompare(b.name, "ru");
  }
  return direction === defaultSortDirection(sort) ? comparison : -comparison;
}

export function resultLabel(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? "авторов"
    : last === 1
      ? "автор"
      : last >= 2 && last <= 4
        ? "автора"
        : "авторов";
  return `${count.toLocaleString("ru-RU")} ${noun}`;
}

