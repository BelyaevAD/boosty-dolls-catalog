import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { activityStatus } from "./lib/catalog.mjs";

const root = path.resolve(import.meta.dirname, "..");
const dataPath = path.join(root, "data", "channels.json");
const siteSource = path.join(root, "site");
const output = path.join(root, "dist");
const siteUrl = normalizeBaseUrl(process.env.SITE_URL || "http://127.0.0.1:4173/");
const repositoryUrl = process.env.REPOSITORY_URL || "https://github.com/BelyaevAD/boosty-dolls-catalog";
const issueUrl = `${repositoryUrl}/issues/new?template=new-channel.yml`;
const locale = "ru-RU";

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("SITE_URL must use http or https.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.toString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("base64");
}

function contentVersion(...values) {
  const hash = crypto.createHash("sha256");
  for (const value of values) hash.update(value);
  return hash.digest("hex").slice(0, 12);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(locale);
}

function formatDate(value, options = {}) {
  if (!value) return "нет данных";
  const date = new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value);
  const formatted = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: options.short ? "short" : "long",
    year: "numeric",
    timeZone: "Asia/Barnaul",
  }).format(date);
  return options.compact ? formatted.replace(/\s*г\.$/, "") : formatted;
}

function subscriptionPrice(channel) {
  const promo = Number(channel.minSubscriptionPromoPriceRub);
  const list = Number(channel.minSubscriptionPriceRub);
  if (Number.isFinite(promo) && promo > 0) {
    return Number.isFinite(list) && list > 0 ? Math.min(promo, list) : promo;
  }
  return Number.isFinite(list) && list > 0 ? list : Number.NaN;
}

function formatSubscriptionPrice(channel) {
  const value = subscriptionPrice(channel);
  return Number.isFinite(value) && value > 0 ? `${formatNumber(value)} ₽` : "—";
}

function oneOffPrice(channel) {
  const value = Number(channel.minOneOffPriceRub);
  return Number.isFinite(value) && value > 0 ? value : Number.NaN;
}

function formatOneOffPrice(channel) {
  const value = oneOffPrice(channel);
  return Number.isFinite(value) ? `${formatNumber(value)} ₽` : "—";
}

function paymentTypes(channel) {
  return Array.isArray(channel.paymentTypes)
    ? channel.paymentTypes.filter((type) => ["subscription", "one-off"].includes(type))
    : [];
}

function paymentTiles(channel, { compact = false } = {}) {
  const tiles = [];
  if (paymentTypes(channel).includes("subscription")) {
    tiles.push(`<span class="payment-price payment-price-subscription">
      <span class="payment-price-label"><span aria-hidden="true">↻</span> Подписка</span>
      <strong>от ${escapeHtml(formatSubscriptionPrice(channel))}</strong>
      <small>в месяц</small>
    </span>`);
  }
  if (paymentTypes(channel).includes("one-off")) {
    tiles.push(`<span class="payment-price payment-price-one-off">
      <span class="payment-price-label"><span aria-hidden="true">◇</span> Разовая покупка</span>
      <strong>от ${escapeHtml(formatOneOffPrice(channel))}</strong>
      <small>за материал</small>
    </span>`);
  }
  return `<span class="payment-prices${compact ? " payment-prices-compact" : ""}">${tiles.join("")}</span>`;
}
function tierPrice(tier) {
  const promo = Number(tier.promoPriceRub);
  const list = Number(tier.priceRub);
  if (Number.isFinite(promo) && promo > 0 && promo < list) {
    return `${formatNumber(promo)} ₽ вместо ${formatNumber(list)} ₽`;
  }
  return `${formatNumber(list)} ₽`;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function safeSlug(value) {
  const slug = String(value || "").toLowerCase();
  if (!/^[a-z0-9_.-]{1,120}$/.test(slug)) throw new Error(`Unsafe slug: ${slug}`);
  return slug;
}

function publicChannelTopics(channel) {
  const topics = Array.isArray(channel.topics) ? channel.topics : [];
  return [...new Set([channel.category, ...topics].filter(Boolean))];
}

function categoryBadge(channel, className = "card-category") {
  const topics = publicChannelTopics(channel);
  const secondaryTopics = topics.slice(1);
  const secondaryCount = Math.max(0, topics.length - 1);
  const topicLabel = `Темы каталога: ${topics.join(", ")}`;
  return `<span
    class="${escapeHtml(className)}"
    title="${escapeHtml(topicLabel)}"
  ><span>${escapeHtml(channel.category)}</span>${secondaryCount
    ? `<span class="topic-extra" aria-hidden="true">+${secondaryCount}</span>`
    : ""}${secondaryTopics.length
    ? `<span class="sr-only">. Также: ${escapeHtml(secondaryTopics.join(", "))}</span>`
    : ""}</span>`;
}

function channelCard(channel, checkedAt) {
  const activity = activityStatus(channel.lastPostAt, checkedAt);
  const lastPostTimestamp = channel.lastPostAt ? Date.parse(channel.lastPostAt) : 0;
  const topics = publicChannelTopics(channel);
  const types = paymentTypes(channel);
  const searchText = [
    channel.name,
    channel.title,
    channel.summary,
    ...topics,
    channel.focus,
    channel.lastPostTitle,
    ...(channel.oneOffItems || []).map((item) => item.title),
  ].filter(Boolean).join(" ");
  const statusHint = activity.days === null
    ? "Дата последней публикации неизвестна"
    : `${activity.days.toLocaleString(locale)} дн. с последней публикации`;
  const slug = safeSlug(channel.slug);
  return `
          <article
            class="channel-card"
            data-slug="${escapeHtml(slug)}"
            data-name="${escapeHtml(channel.name)}"
            data-category="${escapeHtml(channel.category)}"
            data-topics="${escapeHtml(JSON.stringify(topics))}"
            data-payment-types="${escapeHtml(JSON.stringify(types))}"
            data-subscription-price="${Number.isFinite(subscriptionPrice(channel)) ? subscriptionPrice(channel) : ""}"
            data-one-off-price="${Number.isFinite(oneOffPrice(channel)) ? oneOffPrice(channel) : ""}"
            data-activity="${activity.id}"
            data-subscribers="${channel.subscribers}"
            data-last-post="${lastPostTimestamp}"
            data-growth="${channel.growthSinceSnapshot || 0}"
            data-search="${escapeHtml(searchText)}"
          >
            <div class="card-topline">
              ${categoryBadge(channel)}
              <span class="status status-${activity.id}" title="${escapeHtml(statusHint)}">${escapeHtml(activity.label)}</span>
            </div>
            <h3>
              <a href="./channels/${encodeURIComponent(slug)}/" data-open-channel="${escapeHtml(slug)}">${escapeHtml(channel.name)}</a>
            </h3>
            <p class="card-focus">${escapeHtml(channel.focus || channel.title || channel.category)}</p>
            <dl class="card-metrics">
              <div><dt>Публичная аудитория</dt><dd>${formatNumber(channel.subscribers)}</dd></div>
              <div><dt>Последний пост</dt><dd>${escapeHtml(formatDate(channel.lastPostAt, { short: true }))}</dd></div>
            </dl>
            ${paymentTiles(channel)}
            <div class="card-footer">
              <span class="payment-format-note">${types.length === 2 ? "Оба формата оплаты" : types[0] === "subscription" ? "Подписочная модель" : "Разовые материалы"}</span>
              <span class="card-actions">
                <a class="card-detail-link" href="./channels/${encodeURIComponent(slug)}/" data-open-channel="${escapeHtml(slug)}">Подробнее</a>
                <a class="card-link" href="${escapeHtml(channel.boostyUrl)}" target="_blank" rel="noopener noreferrer">Boosty ↗</a>
              </span>
            </div>
          </article>`;
}

function tierLabel(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} тарифов`;
  if (last === 1) return `${count} тариф`;
  if (last >= 2 && last <= 4) return `${count} тарифа`;
  return `${count} тарифов`;
}

function tierLevelLabel(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} уровней`;
  if (last === 1) return `${count} уровень`;
  if (last >= 2 && last <= 4) return `${count} уровня`;
  return `${count} уровней`;
}

function focusTags(focus) {
  return String(focus || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
}

function channelDetailTemplate(channel, checkedAt) {
  const activity = activityStatus(channel.lastPostAt, checkedAt);
  const slug = safeSlug(channel.slug);
  const hasGrowthSnapshot = channel.growthSinceSnapshot !== null &&
    channel.growthSinceSnapshot !== undefined &&
    Number.isFinite(Number(channel.growthSinceSnapshot));
  const growth = hasGrowthSnapshot ? Number(channel.growthSinceSnapshot) : null;
  const growthText = !hasGrowthSnapshot
    ? "нет истории"
    : growth === 0
      ? "без изменений"
      : `${growth > 0 ? "+" : ""}${formatNumber(growth)}`;
  const tiers = (channel.tiers || []).map((tier) => `
                <li>
                  <span>${escapeHtml(tier.name || "Подписка")}</span>
                  <strong>${escapeHtml(tierPrice(tier))}</strong>
                </li>`).join("");
  const oneOffItems = (channel.oneOffItems || []).map((item) => `
                <li>
                  <span>${escapeHtml(item.title || "Платный материал")}</span>
                  <strong>${formatNumber(item.priceRub)} ₽</strong>
                </li>`).join("");
  const subscriptionSection = tiers
    ? `<section class="payment-detail payment-detail-subscription">
        <h3><span aria-hidden="true">↻</span> Уровни подписки</h3>
        <ul class="tier-list tier-list-dialog">${tiers}</ul>
      </section>`
    : "";
  const oneOffSection = oneOffItems
    ? `<section class="payment-detail payment-detail-one-off">
        <h3><span aria-hidden="true">◇</span> Разовые материалы</h3>
        <ul class="tier-list tier-list-dialog">${oneOffItems}</ul>
        <p class="payment-sample-note">Показаны платные материалы среди проверенных публикаций (до 60).</p>
      </section>`
    : "";
  const recentPost = channel.lastPostTitle
    ? `<div><dt>Последний материал</dt><dd>${escapeHtml(channel.lastPostTitle)}</dd></div>`
    : "";

  return `
          <template data-channel-slug="${escapeHtml(slug)}">
            <article class="dialog-channel">
              <div class="dialog-channel-topline">
                ${categoryBadge(channel)}
                <span class="status status-${activity.id}">${escapeHtml(activity.label)}</span>
              </div>
              <h2 id="dialog-title-${escapeHtml(slug)}">${escapeHtml(channel.name)}</h2>
              <p class="dialog-summary">${escapeHtml(channel.summary || channel.title || channel.focus)}</p>
              <div class="focus-tags" aria-label="Темы автора">${focusTags(channel.focus)}</div>

              <dl class="detail-stats detail-stats-dialog">
                <div><dt>Публичная аудитория</dt><dd>${formatNumber(channel.subscribers)}</dd></div>
                <div><dt>Постов</dt><dd>${formatNumber(channel.postsCount)}</dd></div>
                <div><dt>Подписка от</dt><dd>${escapeHtml(formatSubscriptionPrice(channel))}</dd></div>
                <div><dt>Материал от</dt><dd>${escapeHtml(formatOneOffPrice(channel))}</dd></div>
                <div><dt>Рост аудитории</dt><dd>${escapeHtml(growthText)}</dd></div>
              </dl>

              <dl class="dialog-context">
                <div><dt>Последняя публикация</dt><dd>${escapeHtml(formatDate(channel.lastPostAt))}</dd></div>
                ${recentPost}
              </dl>

              <div class="payment-detail-grid">${subscriptionSection}${oneOffSection}</div>

              <div class="dialog-actions">
                <a class="button button-primary" href="${escapeHtml(channel.boostyUrl)}" target="_blank" rel="noopener noreferrer">Перейти на Boosty ↗</a>
                <a class="button button-secondary" href="./channels/${encodeURIComponent(slug)}/">Открыть отдельную страницу</a>
              </div>
              <p class="channel-detail-note">
                Описание подготовлено по публичному профилю и публикациям Boosty.
                Данные проверены ${escapeHtml(formatDate(checkedAt))}.
              </p>
            </article>
          </template>`;
}

function channelRow(channel, checkedAt) {
  const activity = activityStatus(channel.lastPostAt, checkedAt);
  const slug = safeSlug(channel.slug);
  const hasGrowthSnapshot = channel.growthSinceSnapshot !== null &&
    channel.growthSinceSnapshot !== undefined &&
    Number.isFinite(Number(channel.growthSinceSnapshot));
  const growth = hasGrowthSnapshot ? Number(channel.growthSinceSnapshot) : null;
  const growthDate = channel.lastObservedGrowthDate || (growth ? channel.checkedAt : null);
  const growthText = !hasGrowthSnapshot
    ? "—"
    : growth === 0
      ? "без изменений"
      : `${growth > 0 ? "+" : ""}${formatNumber(growth)}${growthDate
        ? ` · ${formatDate(growthDate, { short: true, compact: true })}`
        : ""}`;
  const growthClass = growth > 0 ? "is-positive" : growth < 0 ? "is-negative" : "";
  const subscriptionRange = channel.tierCount
    ? (channel.maxSubscriptionPriceRub > subscriptionPrice(channel)
      ? `${tierLevelLabel(channel.tierCount)} · до ${formatNumber(channel.maxSubscriptionPriceRub)} ₽`
      : tierLevelLabel(channel.tierCount))
    : "нет";
  const oneOffRange = channel.oneOffCountRecent
    ? `${channel.oneOffCountRecent} среди проверенных постов (до 60)${channel.maxOneOffPriceRub > oneOffPrice(channel)
      ? ` · до ${formatNumber(channel.maxOneOffPriceRub)} ₽`
      : ""}`
    : "нет";
  const activityDate = channel.lastPostAt
    ? `<time datetime="${escapeHtml(channel.lastPostAt)}" title="${escapeHtml(formatDate(channel.lastPostAt))}">${escapeHtml(formatDate(channel.lastPostAt, { short: true, compact: true }))}</time>`
    : "<span>дата неизвестна</span>";
  return `
              <tr class="channel-row" data-slug="${escapeHtml(slug)}">
                <th class="table-name" scope="row" data-label="Автор">
                  <span class="table-name-line">
                    <a href="./channels/${encodeURIComponent(slug)}/" data-open-channel="${escapeHtml(slug)}">${escapeHtml(channel.name)}</a>
                    <a class="table-boosty-mini" href="${escapeHtml(channel.boostyUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть ${escapeHtml(channel.name)} на Boosty" title="Открыть на Boosty">Boosty ↗</a>
                  </span>
                </th>
                <td class="table-topic" data-label="Тематика">
                  ${categoryBadge(channel, "table-category")}
                  <span class="table-focus">${escapeHtml(channel.focus || channel.title || channel.category)}</span>
                </td>
                <td class="table-audience table-number" data-label="Аудитория">
                  <strong>${formatNumber(channel.subscribers)}</strong>
                  <span class="table-growth ${growthClass}" ${hasGrowthSnapshot ? "" : 'title="Недостаточно исторических данных"'}>${escapeHtml(growthText)}</span>
                </td>
                <td class="table-activity" data-label="Активность">
                  ${activityDate}
                  <span class="status status-${activity.id}">${escapeHtml(activity.label)}</span>
                </td>
                <td class="table-subscription table-number" data-label="Подписка">
                  <strong>${paymentTypes(channel).includes("subscription") ? `от ${escapeHtml(formatSubscriptionPrice(channel))}` : "—"}</strong>
                  <span>${escapeHtml(subscriptionRange)}</span>
                </td>
                <td class="table-one-off table-number" data-label="Разовая покупка">
                  <strong>${paymentTypes(channel).includes("one-off") ? `от ${escapeHtml(formatOneOffPrice(channel))}` : "—"}</strong>
                  <span>${escapeHtml(oneOffRange)}</span>
                </td>
              </tr>`;
}

function categoryEntries(channels) {
  const counts = new Map();
  for (const channel of channels) {
    for (const topic of publicChannelTopics(channel)) {
      counts.set(topic, (counts.get(topic) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale));
}

function itemListJsonLd(channels, checkedAt) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        url: siteUrl,
        name: "Boosty Dolls Каталог",
        inLanguage: "ru",
        description: "Публичный каталог русскоязычных кукольных авторов, подписок и отдельных платных материалов на Boosty.",
      },
      {
        "@type": "CollectionPage",
        "@id": `${siteUrl}#catalog`,
        url: siteUrl,
        name: "Кукольные авторы и материалы на Boosty",
        isPartOf: { "@id": `${siteUrl}#website` },
        dateModified: checkedAt,
        inLanguage: "ru",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: channels.length,
          itemListElement: channels.map((channel, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: channel.name,
            url: `${siteUrl}channels/${encodeURIComponent(safeSlug(channel.slug))}/`,
          })),
        },
      },
      {
        "@type": "Dataset",
        name: "Каталог русскоязычных кукольных авторов на Boosty",
        description: "Названия, тематики, публичная аудитория, цены подписок и разовых материалов, активность авторов.",
        url: `${repositoryUrl}/tree/main/data`,
        dateModified: checkedAt,
        inLanguage: "ru",
        license: `${repositoryUrl}/blob/main/DATA_LICENSE.md`,
        distribution: {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${repositoryUrl}/raw/main/data/channels.json`,
        },
      },
    ],
  };
}

function channelPage(channel, checkedAt) {
  const slug = safeSlug(channel.slug);
  const canonical = `${siteUrl}channels/${encodeURIComponent(slug)}/`;
  const activity = activityStatus(channel.lastPostAt, checkedAt);
  const summary = channel.summary || channel.title || channel.focus;
  const paymentDescription = [
    paymentTypes(channel).includes("subscription") ? `подписка от ${formatSubscriptionPrice(channel)} в месяц` : "",
    paymentTypes(channel).includes("one-off") ? `разовые материалы от ${formatOneOffPrice(channel)}` : "",
  ].filter(Boolean).join(", ");
  const description = `${channel.name}: ${summary} ${paymentDescription}. Публичная аудитория — ${formatNumber(channel.subscribers)}.`;
  const tiers = (channel.tiers || []).map((tier) => `
              <li><span>${escapeHtml(tier.name || "Подписка")}</span><strong>${escapeHtml(tierPrice(tier))}</strong></li>`).join("");
  const oneOffItems = (channel.oneOffItems || []).map((item) => `
              <li><span>${escapeHtml(item.title || "Платный материал")}</span><strong>${formatNumber(item.priceRub)} ₽</strong></li>`).join("");
  const subscriptionSection = tiers
    ? `<section class="payment-detail payment-detail-subscription"><h2><span aria-hidden="true">↻</span> Уровни подписки</h2><ul class="tier-list">${tiers}</ul></section>`
    : "";
  const oneOffSection = oneOffItems
    ? `<section class="payment-detail payment-detail-one-off"><h2><span aria-hidden="true">◇</span> Разовые материалы</h2><ul class="tier-list">${oneOffItems}</ul><p class="payment-sample-note">Показаны платные материалы среди проверенных публикаций (до 60).</p></section>`
    : "";
  const jsonLd = safeJson({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${channel.name} — кукольный автор на Boosty`,
    url: canonical,
    description,
    inLanguage: "ru",
    dateModified: checkedAt,
    isPartOf: { "@type": "WebSite", name: "Boosty Dolls Каталог", url: siteUrl },
    mainEntity: {
      "@type": "Person",
      name: channel.name,
      url: channel.boostyUrl,
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Каталог", item: siteUrl },
        { "@type": "ListItem", position: 2, name: channel.name, item: canonical },
      ],
    },
  });
  const hash = sha256(jsonLd);
  const upgrade = siteUrl.startsWith("https:") ? "upgrade-insecure-requests" : "";

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#173b3f">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'sha256-${hash}'; style-src 'self'; ${upgrade}">
    <title>${escapeHtml(channel.name)} — ${escapeHtml(channel.category)} | Boosty Dolls Каталог</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="../../assets/styles.css?v=${assetVersion}">
    <meta property="og:type" content="profile">
    <meta property="og:locale" content="ru_RU">
    <meta property="og:title" content="${escapeHtml(channel.name)} — Boosty Dolls Каталог">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:image" content="${escapeHtml(`${siteUrl}assets/og-cover.png`)}">
    <script type="application/ld+json">${jsonLd}</script>
  </head>
  <body class="channel-page-body">
    <header class="channel-page-header">
      <div class="site-header">
        <a class="brand" href="../../"><span class="brand-mark" aria-hidden="true">B/D</span><span>Boosty Dolls Каталог</span></a>
        <nav class="header-nav"><a href="../../#catalog">Все авторы</a></nav>
      </div>
    </header>
    <main class="channel-page">
      <nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="../../">Каталог</a> / ${escapeHtml(channel.name)}</nav>
      <article class="channel-detail">
        ${categoryBadge(channel)}
        <h1>${escapeHtml(channel.name)}</h1>
        <section class="channel-summary-block" aria-labelledby="channel-about">
          <h2 id="channel-about">Об авторе</h2>
          <p class="channel-summary">${escapeHtml(summary)}</p>
          <div class="focus-tags" aria-label="Темы автора">${focusTags(channel.focus)}</div>
        </section>
        <dl class="detail-stats">
          <div><dt>Публичная аудитория</dt><dd>${formatNumber(channel.subscribers)}</dd></div>
          <div><dt>Постов</dt><dd>${formatNumber(channel.postsCount)}</dd></div>
          <div><dt>Подписка от</dt><dd>${escapeHtml(formatSubscriptionPrice(channel))}</dd></div>
          <div><dt>Материал от</dt><dd>${escapeHtml(formatOneOffPrice(channel))}</dd></div>
          <div><dt>Активность</dt><dd>${escapeHtml(activity.label)}</dd></div>
        </dl>
        <div class="payment-detail-grid">${subscriptionSection}${oneOffSection}</div>
        <a class="button button-primary" href="${escapeHtml(channel.boostyUrl)}" target="_blank" rel="noopener noreferrer">Перейти на Boosty ↗</a>
        <p class="channel-detail-note">
          Последняя публикация — ${escapeHtml(formatDate(channel.lastPostAt))}<br>
          Данные проверены ${escapeHtml(formatDate(checkedAt))}. Каталог не связан с Boosty;
          цену, состав и доступность материала перепроверьте у автора.
        </p>
      </article>
    </main>
  </body>
</html>
`;
}

const { meta, channels } = JSON.parse(await fs.readFile(dataPath, "utf8"));
if (!Array.isArray(channels) || channels.length < 1) {
  throw new Error("At least one author is required before building the public catalog.");
}

const checkedAt = meta.checkedAt;
const activityWeight = { fresh: 4, active: 3, rare: 2, archive: 1, unknown: 0 };
const sortedChannels = [...channels].sort((a, b) => {
  const aActivity = activityStatus(a.lastPostAt, checkedAt).id;
  const bActivity = activityStatus(b.lastPostAt, checkedAt).id;
  return (activityWeight[bActivity] || 0) - (activityWeight[aActivity] || 0) ||
    b.subscribers - a.subscribers ||
    Math.min(subscriptionPrice(a) || Number.POSITIVE_INFINITY, oneOffPrice(a) || Number.POSITIVE_INFINITY) -
      Math.min(subscriptionPrice(b) || Number.POSITIVE_INFINITY, oneOffPrice(b) || Number.POSITIVE_INFINITY) ||
    a.name.localeCompare(b.name, locale);
});
const categories = categoryEntries(channels);
const activeCount = channels.filter((channel) => {
  const activity = activityStatus(channel.lastPostAt, checkedAt);
  return activity.id === "fresh" || activity.id === "active";
}).length;
const totalSubscribers = channels.reduce((sum, channel) => sum + channel.subscribers, 0);
const subscriptionCount = channels.filter((channel) => paymentTypes(channel).includes("subscription")).length;
const oneOffCount = channels.filter((channel) => paymentTypes(channel).includes("one-off")).length;
const bothCount = channels.filter((channel) => paymentTypes(channel).length === 2).length;
const medianSubscriptionPrice = median(channels.map(subscriptionPrice));
const medianOneOffPrice = median(channels.map(oneOffPrice));
const description = `${channels.length} проверенных русскоязычных кукольных авторов на Boosty: подписки, мастер-классы, выкройки, курсы и коллекционные медиа.`;
const jsonLd = safeJson(itemListJsonLd(sortedChannels, checkedAt));
const cspHash = sha256(jsonLd);
const [appSource, coreSource, stylesSource, iconsSource] = await Promise.all([
  fs.readFile(path.join(siteSource, "assets", "app.js"), "utf8"),
  fs.readFile(path.join(siteSource, "assets", "catalog-core.js"), "utf8"),
  fs.readFile(path.join(siteSource, "assets", "styles.css"), "utf8"),
  fs.readFile(path.join(siteSource, "assets", "icons.svg"), "utf8"),
]);
const assetVersion = contentVersion(appSource, coreSource, stylesSource, iconsSource);
const versionedAppSource = appSource.replace(
  'from "./catalog-core.js";',
  `from "./catalog-core.js?v=${assetVersion}";`,
);
if (versionedAppSource === appSource) {
  throw new Error("Could not version the catalog-core module import.");
}
const categoryOptions = [...categories]
  .sort((a, b) => a[0].localeCompare(b[0], locale))
  .map(([category, count]) => `<option value="${escapeHtml(category)}" data-topic-label="${escapeHtml(category)}">${escapeHtml(category)} · ${count}</option>`)
  .join("\n              ");
const mobileCategoryLabels = new Map([
  ["Вязаные куклы и амигуруми", "Вязаные / амигуруми"],
  ["Текстильные и интерьерные куклы", "Текстильные / интерьерные"],
  ["BJD и шарнирные куклы", "BJD / шарнирные"],
  ["Авторские и арт-куклы", "Авторские / арт"],
  ["Аксессуары для кукол", "Аксессуары"],
  ["Миниатюры и кукольные дома", "Миниатюры / дома"],
  ["Ремонт, реставрация и история", "Ремонт / история"],
  ["Коллекционирование и кукольные медиа", "Коллекции / медиа"],
  ["Народные, обрядовые и обережные куклы", "Народные / обережные"],
  ["Театральные куклы и марионетки", "Театральные / марионетки"],
]);
const categoryChips = categories
  .map(([category, count]) => `<button class="topic-chip" type="button" data-category-chip="${escapeHtml(category)}" data-topic-label="${escapeHtml(category)}" data-mobile-label="${escapeHtml(mobileCategoryLabels.get(category) || category)}" aria-label="${escapeHtml(`${category}: ${count} авторов`)}" aria-pressed="false"><span class="topic-label">${escapeHtml(category)}</span> <span data-topic-count aria-hidden="true">· ${count}</span></button>`)
  .join("\n          ");

const template = await fs.readFile(path.join(siteSource, "index.template.html"), "utf8");
const indexHtml = template
  .replaceAll("__SITE_URL__", escapeHtml(siteUrl))
  .replaceAll("__REPOSITORY_URL__", escapeHtml(repositoryUrl))
  .replaceAll("__ISSUE_URL__", escapeHtml(issueUrl))
  .replaceAll("__DESCRIPTION__", escapeHtml(description))
  .replaceAll("__CHECKED_AT__", escapeHtml(checkedAt))
  .replaceAll("__CHECKED_AT_HUMAN__", escapeHtml(formatDate(checkedAt)))
  .replaceAll("__CHANNEL_COUNT__", formatNumber(channels.length))
  .replaceAll("__ACTIVE_COUNT__", formatNumber(activeCount))
  .replaceAll("__SUBSCRIPTION_COUNT__", formatNumber(subscriptionCount))
  .replaceAll("__ONE_OFF_COUNT__", formatNumber(oneOffCount))
  .replaceAll("__BOTH_COUNT__", formatNumber(bothCount))
  .replaceAll("__MEDIAN_SUBSCRIPTION_PRICE__", formatNumber(medianSubscriptionPrice))
  .replaceAll("__MEDIAN_ONE_OFF_PRICE__", formatNumber(medianOneOffPrice))
  .replaceAll("__TOTAL_SUBSCRIBERS__", formatNumber(totalSubscribers))
  .replaceAll("__ASSET_VERSION__", assetVersion)
  .replaceAll("__CATEGORY_OPTIONS__", categoryOptions)
  .replaceAll("__CATEGORY_CHIPS__", categoryChips)
  .replaceAll("__CHANNEL_CARDS__", sortedChannels.map((channel) => channelCard(channel, checkedAt)).join("\n"))
  .replaceAll("__CHANNEL_DETAILS__", sortedChannels.map((channel) => channelDetailTemplate(channel, checkedAt)).join("\n"))
  .replaceAll("__CHANNEL_ROWS__", sortedChannels.map((channel) => channelRow(channel, checkedAt)).join("\n"))
  .replaceAll("__JSON_LD__", jsonLd)
  .replaceAll("__CSP_HASH__", `sha256-${cspHash}`)
  .replaceAll("__CSP_UPGRADE__", siteUrl.startsWith("https:") ? "upgrade-insecure-requests" : "");

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.cp(path.join(siteSource, "assets"), path.join(output, "assets"), { recursive: true });
await Promise.all([
  fs.copyFile(path.join(siteSource, "site.webmanifest"), path.join(output, "site.webmanifest")),
  fs.copyFile(path.join(siteSource, "og-cover.html"), path.join(output, "og-cover.html")),
  fs.copyFile(dataPath, path.join(output, "data.json")),
  fs.writeFile(path.join(output, "assets", "app.js"), versionedAppSource),
  fs.writeFile(path.join(output, "index.html"), indexHtml),
]);

for (const channel of channels) {
  const directory = path.join(output, "channels", safeSlug(channel.slug));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "index.html"), channelPage(channel, checkedAt));
}

const sitemapUrls = [
  { loc: siteUrl, priority: "1.0", changefreq: "weekly" },
  ...channels.map((channel) => ({
    loc: `${siteUrl}channels/${encodeURIComponent(safeSlug(channel.slug))}/`,
    priority: "0.7",
    changefreq: "weekly",
  })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((entry) => `  <url>
    <loc>${escapeHtml(entry.loc)}</loc>
    <lastmod>${checkedAt}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;
const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}sitemap.xml
`;
const feedItems = [...channels]
  .sort((a, b) => Date.parse(b.lastPostAt || 0) - Date.parse(a.lastPostAt || 0))
  .slice(0, 30)
  .map((channel) => `    <item>
      <title>${escapeHtml(channel.name)} — ${escapeHtml(channel.category)}</title>
      <link>${siteUrl}channels/${encodeURIComponent(safeSlug(channel.slug))}/</link>
      <guid isPermaLink="true">${siteUrl}channels/${encodeURIComponent(safeSlug(channel.slug))}/</guid>
      <description>${escapeHtml(channel.focus)}</description>
      <pubDate>${new Date(channel.lastPostAt || `${checkedAt}T00:00:00Z`).toUTCString()}</pubDate>
    </item>`)
  .join("\n");
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Boosty Dolls Каталог</title>
    <link>${siteUrl}</link>
    <description>${escapeHtml(description)}</description>
    <language>ru</language>
    <lastBuildDate>${new Date(`${checkedAt}T12:00:00Z`).toUTCString()}</lastBuildDate>
${feedItems}
  </channel>
</rss>
`;
const notFound = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="3; url=${escapeHtml(siteUrl)}"><title>Страница не найдена · Boosty Dolls Каталог</title>
<link rel="stylesheet" href="${escapeHtml(`${siteUrl}assets/styles.css?v=${assetVersion}`)}"></head>
<body class="channel-page-body"><main class="channel-page"><article class="channel-detail">
<p class="eyebrow eyebrow-dark">404</p><h1>Страница не найдена</h1><p class="card-focus">Через несколько секунд вы вернётесь в каталог.</p>
<a class="button button-primary" href="${escapeHtml(siteUrl)}">Открыть каталог</a>
</article></main></body></html>`;

await Promise.all([
  fs.writeFile(path.join(output, "sitemap.xml"), sitemap),
  fs.writeFile(path.join(output, "robots.txt"), robots),
  fs.writeFile(path.join(output, "feed.xml"), feed),
  fs.writeFile(path.join(output, "404.html"), notFound),
  fs.writeFile(path.join(output, ".nojekyll"), ""),
]);

console.log(`Built ${channels.length} author pages in ${output}`);
