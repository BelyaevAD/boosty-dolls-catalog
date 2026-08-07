import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clampPrice,
  compareChannels,
  defaultSortDirection,
  matchesFilters,
  normalizeText,
  paymentTypeMatches,
  resultLabel,
  topicFacetCounts,
} from "../site/assets/catalog-core.js";
import {
  CATEGORIES,
  activityStatus,
  currentPromoPrice,
  extractBoostySlugs,
  findPublicContactKinds,
  inferClassification,
  languageMetrics,
  assessRussianLanguage,
  sanitizePublicSummary,
} from "../scripts/lib/catalog.mjs";

function channel(overrides = {}) {
  return {
    name: "Мастерская кукол",
    category: "Авторские и арт-куклы",
    topics: ["Авторские и арт-куклы"],
    paymentTypes: ["subscription"],
    activity: "fresh",
    subscriptionPrice: 200,
    oneOffPrice: null,
    subscribers: 10,
    lastPost: Date.parse("2026-08-01T00:00:00Z"),
    growth: 0,
    searchText: "мастерская куклы bjd выкройки",
    ...overrides,
  };
}

test("filter reset handler cannot recursively reset the form", () => {
  const appSource = readFileSync(new URL("../site/assets/app.js", import.meta.url), "utf8");
  const resetFiltersBody = appSource.match(/function resetFilters\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(resetFiltersBody, /form\.reset\(\)/);
  assert.doesNotMatch(resetFiltersBody, /applyFilters|resetFilters/);
  assert.match(appSource, /form\.addEventListener\("reset", \(\) => setTimeout\(applyResetState, 0\)\)/);
  assert.doesNotMatch(appSource, /form\.addEventListener\("reset", \(\) => queueMicrotask/);
});

test("normalizeText handles Russian text and whitespace", () => {
  assert.equal(normalizeText("  Ёлка\nКУКЛА  "), "елка кукла");
});

test("clampPrice validates and caps price", () => {
  assert.equal(clampPrice("250"), 250);
  assert.equal(clampPrice("-5"), 0);
  assert.equal(clampPrice("999999"), 500000);
  assert.equal(clampPrice("oops"), null);
});

test("payment filters distinguish subscription, one-off and both", () => {
  const both = channel({ paymentTypes: ["subscription", "one-off"], oneOffPrice: 500 });
  assert.equal(paymentTypeMatches(both, "subscription"), true);
  assert.equal(paymentTypeMatches(both, "one-off"), true);
  assert.equal(paymentTypeMatches(both, "both"), true);
  assert.equal(paymentTypeMatches(channel(), "both"), false);
});

test("matchesFilters applies independent price limits", () => {
  const both = channel({ paymentTypes: ["subscription", "one-off"], oneOffPrice: 500 });
  assert.equal(matchesFilters(both, { maxSubscriptionPrice: 250 }), true);
  assert.equal(matchesFilters(both, { maxSubscriptionPrice: 150 }), false);
  assert.equal(matchesFilters(both, { maxOneOffPrice: 600 }), true);
  assert.equal(matchesFilters(both, { maxOneOffPrice: 400 }), false);
  assert.equal(matchesFilters(channel(), { maxOneOffPrice: 1000 }), false);
});

test("matchesFilters supports text, topics, activity and growth", () => {
  const sample = channel({
    topics: ["BJD и шарнирные куклы", "Одежда и выкройки"],
    growth: 4,
  });
  assert.equal(matchesFilters(sample, { query: "BJD" }), true);
  assert.equal(matchesFilters(sample, { category: "Одежда и выкройки" }), true);
  assert.equal(matchesFilters(sample, { activity: "archive" }), false);
  assert.equal(matchesFilters(sample, { growth: true }), true);
});

test("topic facets keep multi-label counts", () => {
  const items = [
    channel({ topics: ["BJD и шарнирные куклы", "Одежда и выкройки"] }),
    channel({ category: "Кастом и OOAK", topics: ["Кастом и OOAK"], paymentTypes: ["one-off"], subscriptionPrice: null, oneOffPrice: 300 }),
  ];
  const facet = topicFacetCounts(items, {}, CATEGORIES);
  assert.equal(facet.total, 2);
  assert.equal(facet.counts.get("BJD и шарнирные куклы"), 1);
  assert.equal(facet.counts.get("Одежда и выкройки"), 1);
  assert.equal(facet.counts.get("Кастом и OOAK"), 1);
});

test("sorts use independent subscription and one-off prices", () => {
  const cheapSubscription = channel({ name: "A", subscriptionPrice: 100 });
  const expensiveSubscription = channel({ name: "B", subscriptionPrice: 500 });
  assert.ok(compareChannels(cheapSubscription, expensiveSubscription, "subscriptionPrice", "asc") < 0);

  const cheapItem = channel({ name: "C", paymentTypes: ["one-off"], subscriptionPrice: null, oneOffPrice: 200 });
  const expensiveItem = channel({ name: "D", paymentTypes: ["one-off"], subscriptionPrice: null, oneOffPrice: 900 });
  assert.ok(compareChannels(cheapItem, expensiveItem, "oneOffPrice", "asc") < 0);
  assert.equal(defaultSortDirection("oneOffPrice"), "asc");
});

test("resultLabel uses author forms", () => {
  assert.equal(resultLabel(1), "1 автор");
  assert.equal(resultLabel(2), "2 автора");
  assert.equal(resultLabel(11), "11 авторов");
  assert.equal(resultLabel(25), "25 авторов");
});

test("classification recognizes core doll categories", () => {
  assert.equal(inferClassification("вязаная кукла крючком мастер класс").category, "Вязаные куклы и амигуруми");
  assert.equal(inferClassification("текстильная интерьерная кукла из ткани").category, "Текстильные и интерьерные куклы");
  assert.equal(inferClassification("создание BJD шарнирной куклы").category, "BJD и шарнирные куклы");
  assert.equal(inferClassification("авторская арт-кукла из полимерной глины").category, "Авторские и арт-куклы");
  assert.equal(inferClassification("создание куклы реборн младенца").category, "Реборн-куклы");
  assert.equal(inferClassification("создание куклы и курс реборн").category, "Реборн-куклы");
  assert.equal(inferClassification("кастом OOAK Blythe repaint").category, "Кастом и OOAK");
  assert.equal(inferClassification("выкройка одежды для куклы Barbie").category, "Одежда и выкройки");
  assert.equal(inferClassification("кукольный домик миниатюра 1:12").category, "Миниатюры и кукольные дома");
});

test("language metrics recognize Russian and bilingual text", () => {
  const metrics = languageMetrics("Авторские куклы and doll making");
  assert.ok(metrics.cyrillic > 10);
  assert.ok(metrics.cyrillicShare > 0.4);
});

test("language qualification uses content rather than author or channel names", () => {
  const russianPosts = assessRussianLanguage({
    ownerName: "Doll Maker",
    channelTitle: "Studio BJD",
    description: "Авторская мастерская шарнирных кукол и аксессуаров. Показываю процесс создания и делюсь полезными материалами.",
    postTitles: ["Как сделать шарниры для куклы", "Новая выкройка платья для BJD"],
    tierNames: ["Поддержка мастерской", "Закрытые мастер-классы"],
  });
  assert.equal(russianPosts.isRussian, true);

  const russianNameOnly = assessRussianLanguage({
    ownerName: "Русская кукольница",
    channelTitle: "Мастерская кукол",
    description: "Doll artist and printable patterns for collectors.",
    postTitles: ["New doll release", "BJD faceup tutorial"],
    tierNames: ["Support", "Premium tutorials"],
  });
  assert.equal(russianNameOnly.isRussian, false);

  const russianPostsWithoutDescription = assessRussianLanguage({
    description: "",
    postTitles: [
      "Новая выкройка одежды для куклы",
      "Разбираем посадку рукава и строим основу",
      "Материалы для следующего мастер-класса",
    ],
    tierNames: ["Поддержать автора", "Все мастер-классы"],
  });
  assert.equal(russianPostsWithoutDescription.isRussian, true);

  const russianTeasersWithLatinTitles = assessRussianLanguage({
    description: "Doll studio",
    postTitles: ["BJD WIP", "Faceup process"],
    postTexts: [
      "Показываю новый этап работы над шарнирной куклой и рассказываю о материалах.",
      "В этом выпуске подробно разбираю роспись лица и закрепление результата.",
    ],
    tierNames: ["Support"],
  });
  assert.equal(russianTeasersWithLatinTitles.isRussian, true);
});

test("contact sanitizer removes public contact data", () => {
  const source = "Авторские куклы. Пишите в Telegram @dollmaker или на doll@example.com";
  const clean = sanitizePublicSummary(source);
  assert.deepEqual(findPublicContactKinds(clean), []);
  assert.ok(clean.includes("Авторские куклы"));
  const invitation = sanitizePublicSummary(
    "Здесь можно скачать выкройки. Всегда готова помочь, ответить на вопросы, пишите, обращайтесь.",
  );
  assert.deepEqual(findPublicContactKinds(invitation), []);
  for (const contact of [
    "Instagram @shashkina.dolls",
    "Связаться тг. @Help_Hope или в личные сообщения",
    "Напишите мне или в личные сообщения.",
  ]) {
    assert.notDeepEqual(findPublicContactKinds(contact), []);
    assert.deepEqual(findPublicContactKinds(sanitizePublicSummary(contact)), []);
  }
});

test("currentPromoPrice returns only active promotions", () => {
  const level = {
    promos: [
      { startTime: 100, endTime: 300, discount: { currencyPrices: { RUB: 150 } } },
      { startTime: 400, endTime: 500, discount: { currencyPrices: { RUB: 50 } } },
    ],
  };
  assert.equal(currentPromoPrice(level, 200), 150);
  assert.equal(currentPromoPrice(level, 350), null);
});

test("activityStatus uses explicit bands", () => {
  assert.equal(activityStatus("2026-08-01T00:00:00Z", "2026-08-06").id, "fresh");
  assert.equal(activityStatus("2026-06-01T00:00:00Z", "2026-08-06").id, "active");
  assert.equal(activityStatus("2025-01-01T00:00:00Z", "2026-08-06").id, "archive");
});

test("extractBoostySlugs accepts only canonical safe slugs", () => {
  const slugs = extractBoostySlugs("https://boosty.to/Doll.One and https://boosty.to/about/help");
  assert.deepEqual(slugs, ["doll.one"]);
});
