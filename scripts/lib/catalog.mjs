const API_BASE = "https://api.boosty.to";
const BOOSTY_REQUEST_INTERVAL_MS = Math.max(100, Number(process.env.BOOSTY_REQUEST_INTERVAL_MS) || 250);
const BOOSTY_POST_PAGE_SIZE = 20;
const MAX_ASSESSMENT_POSTS = 60;
let nextBoostyRequestAt = 0;
let boostyBackoffUntil = 0;
let boostySchedulerTail = Promise.resolve();

export const CATEGORY_RULES = [
  {
    category: "Вязаные куклы и амигуруми",
    terms: ["вязан кук", "кукла крюч", "кукла спиц", "амигуруми кук", "вязани кук", "crochet doll"],
  },
  {
    category: "Текстильные и интерьерные куклы",
    terms: ["текстильн кук", "интерьерн кук", "кукла из ткани", "тряпичн кук", "вальдорфск кук", "кукла из фетра", "кукла из капрон", "чулочн кук", "тильд", "fabric doll", "cloth doll"],
  },
  {
    category: "BJD и шарнирные куклы",
    terms: ["шарнирн кук", "кукла на шарнир", "bjd", "бжд", "ball jointed doll", "скульптинг bjd", "печат bjd"],
  },
  {
    category: "Авторские и арт-куклы",
    terms: ["кукл ручн", "создани кук", "авторск кук", "арт-кукл", "art doll", "скульптинг кук", "лепк кук", "полимерн глин кук", "папье маше кук", "фарфоров кук", "кукольн скульптур", "la doll", "ладолл", "doll making"],
  },
  {
    category: "Реборн-куклы",
    terms: ["реборн", "реборн кук", "кукл реборн", "reborn doll", "кукла младенец", "кукла-младенец"],
  },
  {
    category: "Кастом и OOAK",
    terms: ["кастом кук", "кастомизац кук", "ooak", "custom doll", "blythe custom", "блайз кастом", "перерисовк кук", "перепрошивк волос", "reroot", "repaint doll", "монстер хай кастом", "monster high custom", "barbie custom"],
  },
  {
    category: "Одежда и выкройки",
    terms: ["одежд для кук", "кукольн одежд", "выкройк кук", "выкройк одежд", "doll clothes", "doll pattern", "вязани для кук", "шить для кук", "наряд для кук", "гардероб кук", "паола рейна одежд", "paola reina clothes"],
  },
  {
    category: "Аксессуары для кукол",
    terms: ["аксессуар для кук", "кукольн обув", "обув для кук", "парик для кук", "кукольн парик", "глаз для кук", "кукольн сум", "doll shoes", "doll wig", "doll eyes", "головн убор для кук", "реквизит для кук"],
  },
  {
    category: "Миниатюры и кукольные дома",
    terms: ["кукольн миниатюр", "кукольн дом", "кукольн мебель", "румбокс", "room box", "dollhouse", "doll house", "миниатюр 1:12", "миниатюр 1:6", "мебель 1:6", "мебель 1:12"],
  },
  {
    category: "Коллекционирование и кукольные медиа",
    terms: ["коллекц кук", "коллекционер кук", "обзор кук", "распаковк кук", "новост кук", "кукольн блог", "doll review", "doll collection", "кукольн фотограф", "фотоистори кук", "кукольн стопмоушн"],
  },
  {
    category: "Ремонт, реставрация и история",
    terms: ["истори кук", "антикварн кук", "винтажн кук", "реставрац кук", "ремонт кук", "восстановлен кук", "doll restoration", "музей кук"],
  },
  {
    category: "Народные, обрядовые и обережные куклы",
    terms: ["народн кук", "традиционн кук", "обрядов кук", "обережн кук", "кукла оберег", "кукла-оберег", "кукла мотанк", "мотанк", "кукла закрутк", "кукла столбушк", "славянск кук"],
  },
  {
    category: "Театральные куклы и марионетки",
    terms: ["театральн кук", "кукольн театр", "кукла для театр", "кукла для спектакл", "марионет", "перчаточн кук", "тростев кук", "ростов кук", "puppet theatre", "puppet making"],
  },
];

export const CATEGORIES = Object.freeze(CATEGORY_RULES.map((rule) => rule.category));
const CATEGORY_SET = new Set(CATEGORIES);
const DEFAULT_CATEGORY = "Авторские и арт-куклы";

export const FOCUS_TERMS = [
  ["Вязаные куклы", ["вязан кук", "кукла крюч", "кукла спиц", "crochet doll", "амигуруми кук"], "Вязаные куклы и амигуруми"],
  ["Текстильные куклы", ["текстильн кук", "интерьерн кук", "тильд", "fabric doll", "cloth doll"], "Текстильные и интерьерные куклы"],
  ["BJD / шарнирные куклы", ["bjd", "бжд", "шарнирн кук", "ball jointed doll"], "BJD и шарнирные куклы"],
  ["Авторские арт-куклы", ["авторск кук", "арт-кукл", "art doll", "скульптинг кук", "лепк кук"], "Авторские и арт-куклы"],
  ["Реборн", ["реборн", "reborn doll"], "Реборн-куклы"],
  ["Кастом / OOAK", ["кастом кук", "ooak", "custom doll", "repaint doll", "reroot"], "Кастом и OOAK"],
  ["Blythe", ["blythe", "блайз"], "Кастом и OOAK"],
  ["Barbie / Fashion dolls", ["barbie", "барби", "fashion doll"], "Кастом и OOAK"],
  ["Monster High", ["monster high", "монстер хай"], "Кастом и OOAK"],
  ["Одежда и выкройки", ["одежд для кук", "кукольн одежд", "выкройк кук", "doll clothes", "doll pattern"], "Одежда и выкройки"],
  ["Аксессуары", ["аксессуар для кук", "кукольн обув", "парик для кук", "глаз для кук"], "Аксессуары для кукол"],
  ["Миниатюра 1:12", ["миниатюр 1:12", "мебель 1:12", "dollhouse"], "Миниатюры и кукольные дома"],
  ["Миниатюра 1:6", ["миниатюр 1:6", "мебель 1:6", "room box", "румбокс"], "Миниатюры и кукольные дома"],
  ["Коллекционирование / обзоры", ["коллекц кук", "обзор кук", "распаковк кук", "doll review"], "Коллекционирование и кукольные медиа"],
  ["История / реставрация", ["истори кук", "антикварн кук", "реставрац кук", "ремонт кук"], "Ремонт, реставрация и история"],
  ["Народные / обережные куклы", ["народн кук", "обрядов кук", "обережн кук", "кукла мотанк", "кукла оберег"], "Народные, обрядовые и обережные куклы"],
  ["Театральные куклы / марионетки", ["театральн кук", "кукольн театр", "марионет", "перчаточн кук", "тростев кук"], "Театральные куклы и марионетки"],
];
const FOCUS_TOPIC_BY_LABEL = new Map(
  FOCUS_TERMS.map(([label, , topic]) => [label, topic]),
);

export const DISCOVERY_QUERIES = [
  "site:boosty.to вязаные куклы мастер-класс",
  "site:boosty.to текстильная авторская кукла",
  "site:boosty.to BJD шарнирные куклы",
  "site:boosty.to кастом куклы OOAK Blythe",
  "site:boosty.to одежда выкройки для кукол",
  "site:boosty.to кукольная миниатюра домик",
  "site:boosty.to коллекция обзор кукол",
  "site:boosty.to реставрация ремонт кукол",
  "site:boosty.to реборн кукла мастер-класс",
  "site:boosty.to арт-кукла полимерная глина",
  "site:boosty.to кукольная обувь парики аксессуары",
  "site:boosty.to кукольная фотография фотоистории",
  "site:boosty.to народная обрядовая обережная кукла",
  "site:boosty.to кукла мотанка закрутка столбушка",
  "site:boosty.to театральная кукла марионетка",
  "site:boosty.to кукольный театр перчаточная кукла",
  "site:boosty.to чулочная кукла кукла из капрона",
  "site:boosty.to Dollfie Pullip Fashion Royalty кукла",
  "site:boosty.to STL 3D печать куклы",
];

export const BOOSTY_POST_SEARCH_QUERIES = [
  "куклы ручной работы",
  "вязаная кукла",
  "кукла крючком",
  "амигуруми кукла",
  "текстильная кукла",
  "интерьерная кукла",
  "кукла тильда",
  "авторская кукла",
  "арт кукла",
  "шарнирная кукла",
  "BJD кукла",
  "БЖД кукла",
  "создание BJD куклы",
  "3D модель BJD куклы",
  "кастом куклы",
  "OOAK кукла",
  "Blythe кастом куклы",
  "Блайз кастом",
  "Monster High кастом куклы",
  "Barbie кастом куклы",
  "одежда для кукол",
  "выкройка кукольной одежды",
  "одежда для BJD",
  "одежда для Blythe",
  "одежда для Barbie",
  "одежда для Paola Reina",
  "одежда для Blythe куклы",
  "одежда для Monster High куклы",
  "одежда для Obitsu куклы",
  "одежда для Smart Doll куклы",
  "одежда для кукол Готц",
  "вязание одежды для кукол",
  "шитье одежды для кукол",
  "кукольная обувь",
  "парик для куклы",
  "глаза для куклы",
  "аксессуары для кукол",
  "головные уборы для кукол",
  "сумки для кукол",
  "реквизит для кукол",
  "кукольная миниатюра",
  "кукольный домик",
  "румбокс",
  "мебель для кукол",
  "диорама для кукол",
  "миниатюра 1:12",
  "миниатюра 1:6",
  "реборн кукла",
  "создание реборн",
  "кукла младенец ручной работы",
  "реставрация кукол",
  "ремонт кукол",
  "перепрошивка волос куклы",
  "перерисовка лица куклы",
  "история кукол",
  "антикварные куклы",
  "винтажные куклы",
  "коллекция кукол",
  "обзор кукол",
  "распаковка кукол",
  "новости кукол",
  "кукольная фотография",
  "фотоистории кукол",
  "стоп-моушн с куклами",
  "скульптинг куклы",
  "лепка куклы",
  "кукла из полимерной глины",
  "кукла папье маше",
  "фарфоровая кукла ручной работы",
  "кукла из капрона",
  "чулочная кукла",
  "вальдорфская кукла",
  "кукла из фетра",
  "тряпичная кукла",
  "народная кукла",
  "традиционная кукла",
  "обрядовая кукла",
  "обережная кукла",
  "кукла оберег",
  "кукла мотанка",
  "кукла закрутка",
  "изготовление театральной куклы",
  "изготовление кукол для кукольного театра",
  "мастер класс марионетка",
  "перчаточная кукла",
  "тростевая кукла",
  "Pullip кукла",
  "Dollfie кукла",
  "Fashion Royalty кукла",
  "Rainbow High кукла",
  "STL кукла",
  "3D печать куклы",
  "мастер класс кукла",
  "выкройка куклы",
  "курс по куклам",
];

const ALL_RELEVANCE_TERMS = [...new Set(CATEGORY_RULES.flatMap((rule) => rule.terms))];
const RESERVED_SLUGS = new Set(["about", "app", "apply", "help", "privacy", "search", "terms"]);

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const TERM_PATTERN_CACHE = new Map();

function termMatches(text, term) {
  const haystack = String(text || "").toLocaleLowerCase("ru");
  const needle = String(term || "").toLocaleLowerCase("ru").trim();
  if (!needle) return false;
  if (/[а-яё]/iu.test(needle)) {
    let pattern = TERM_PATTERN_CACHE.get(`ru:${needle}`);
    if (!pattern) {
      const parts = needle
        .split(/\s+/u)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      pattern = new RegExp(parts.map((part) => `${part}[а-яё]*`).join("[\\s/–—-]+"), "iu");
      TERM_PATTERN_CACHE.set(`ru:${needle}`, pattern);
    }
    return pattern.test(haystack);
  }

  let pattern = TERM_PATTERN_CACHE.get(needle);
  if (!pattern) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startsWithWord = /^[\p{L}\p{N}_]/u.test(needle);
    const endsWithWord = /[\p{L}\p{N}_]$/u.test(needle);
    pattern = new RegExp(
      `${startsWithWord ? "(?<![\\p{L}\\p{N}_])" : ""}` +
      `${escaped}` +
      `${endsWithWord ? "(?![\\p{L}\\p{N}_])" : ""}`,
      "iu",
    );
    TERM_PATTERN_CACHE.set(needle, pattern);
  }
  return pattern.test(haystack);
}

export function countMatches(text, terms) {
  return terms.filter((term) => termMatches(text, term)).length;
}

export function qualifiesDollRelevance({
  relevanceScore = 0,
  profileRelevanceScore = 0,
  relevantPostCount = 0,
  assessedPostCount = 0,
  targetedPostEvidence = false,
} = {}) {
  const score = Number(relevanceScore) || 0;
  const profileScore = Number(profileRelevanceScore) || 0;
  const postCount = Number(relevantPostCount) || 0;
  const assessedCount = Number(assessedPostCount) || 0;
  const relevantPostShare = assessedCount > 0 ? postCount / assessedCount : 0;
  const repeatedPostEvidence = postCount >= 2 && (
    assessedCount <= 20 ||
    relevantPostShare >= 0.1 ||
    postCount >= 5
  );
  if (score < 1) return false;
  if (repeatedPostEvidence) return true;
  if (profileScore >= 1 && targetedPostEvidence) return true;
  return score >= 2 && profileScore >= 1;
}

export function profileLooksOutOfScope(text) {
  return /(?:фанфик|\bфик(?:и|ов|ам)?\b|фикбук|ficbook|author\.today|ранобэ|новелл|перевод(?:чик|ил|жу|ы|ов|ить)|писател|литератур|(?:пишу|пишущ\w*|автор)\s+(?:книг|роман|рассказ)|аудиокниг|озвуч|стрим|настольн\w*\s+игр|\bнри\b|комикс|аниме|манг|видеоигр|компьютерн\w*\s+игр|музык|песен|вокал|аранжиров|\basmr\b|асмр|шоу[\s-]*бизнес|конспир)/iu.test(String(text || ""));
}

export function languageMetrics(text) {
  const value = String(text || "");
  const cyrillic = (value.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const total = cyrillic + latin;
  return {
    cyrillic,
    latin,
    cyrillicShare: total ? cyrillic / total : 0,
  };
}

function russianTextSample(value, { minCyrillic = 4, minShare = 0.55 } = {}) {
  const metrics = languageMetrics(value);
  return metrics.cyrillic >= minCyrillic && metrics.cyrillicShare >= minShare;
}

export function assessRussianLanguage({
  description = "",
  postTitles = [],
  postTexts = [],
  tierNames = [],
  oneOffTitles = [],
  ownerName = "",
  channelTitle = "",
} = {}) {
  const normalizedPostTitles = unique(postTitles.map((value) => String(value || "").trim()).filter(Boolean));
  const normalizedPostTexts = unique(postTexts.map((value) => String(value || "").trim()).filter(Boolean));
  const postSamples = unique([...normalizedPostTitles, ...normalizedPostTexts]);
  const normalizedCommercialTitles = unique([
    ...tierNames,
    ...oneOffTitles,
  ].map((value) => String(value || "").trim()).filter(Boolean));
  const descriptionMetrics = languageMetrics(description);
  const postsMetrics = languageMetrics(postSamples.join(" "));
  const commercialMetrics = languageMetrics(normalizedCommercialTitles.join(" "));
  const aggregateMetrics = languageMetrics(unique([
    String(description || "").trim(),
    ...postSamples,
    ...normalizedCommercialTitles,
  ].filter(Boolean)).join(" "));
  const identityMetrics = languageMetrics(`${ownerName || ""} ${channelTitle || ""}`);

  const russianPostTitleCount = normalizedPostTitles.filter((title) => russianTextSample(title)).length;
  const russianPostTextCount = normalizedPostTexts.filter((sample) => russianTextSample(sample, {
    minCyrillic: 12,
    minShare: 0.55,
  })).length;
  const russianPostSampleCount = russianPostTitleCount + russianPostTextCount;
  const russianCommercialTitleCount = normalizedCommercialTitles.filter((title) => russianTextSample(title)).length;
  const signals = {
    description: descriptionMetrics.cyrillic >= 20 && descriptionMetrics.cyrillicShare >= 0.6,
    posts: russianPostSampleCount >= 2 && postsMetrics.cyrillic >= 20 && postsMetrics.cyrillicShare >= 0.55,
    commercial: russianCommercialTitleCount >= 2 && commercialMetrics.cyrillic >= 20 && commercialMetrics.cyrillicShare >= 0.55,
  };
  const strongSignalCount = Object.values(signals).filter(Boolean).length;
  const sparseRussianDescription = signals.description &&
    postSamples.length < 2 &&
    normalizedCommercialTitles.length < 2 &&
    descriptionMetrics.cyrillic >= 35 &&
    descriptionMetrics.cyrillicShare >= 0.7;
  const aggregateRussian = aggregateMetrics.cyrillic >= 40 &&
    aggregateMetrics.cyrillicShare >= 0.58 &&
    strongSignalCount >= 1;
  const corroboratedRussian = strongSignalCount >= 2 &&
    aggregateMetrics.cyrillic >= 30 &&
    aggregateMetrics.cyrillicShare >= 0.52;
  const majorityRussianCorpus = aggregateMetrics.cyrillic >= 80 &&
    aggregateMetrics.cyrillicShare >= 0.5 &&
    russianPostTitleCount >= 5 &&
    russianPostTextCount >= 5;

  return {
    isRussian: aggregateRussian || corroboratedRussian || sparseRussianDescription || majorityRussianCorpus,
    signals,
    strongSignalCount,
    majorityRussianCorpus,
    russianPostTitleCount,
    russianPostTextCount,
    russianPostSampleCount,
    russianCommercialTitleCount,
    aggregate: aggregateMetrics,
    description: descriptionMetrics,
    posts: postsMetrics,
    commercial: commercialMetrics,
    identity: identityMetrics,
  };
}

export function inferClassification(text) {
  const ranked = CATEGORY_RULES
    .map((rule, index) => ({ category: rule.category, score: countMatches(text, rule.terms), index }))
    .sort((a, b) =>
      b.score - a.score ||
      Number(a.category === DEFAULT_CATEGORY) - Number(b.category === DEFAULT_CATEGORY) ||
      a.index - b.index
    );
  const category = ranked[0]?.score ? ranked[0].category : DEFAULT_CATEGORY;
  const focus = FOCUS_TERMS
    .filter(([, terms]) => countMatches(text, terms) > 0)
    .slice(0, 3)
    .map(([label]) => label);
  return {
    category,
    topics: topicsFromCategoryScores(category, ranked, focus),
    focus: focus.length ? focus.join("; ") : category,
    categoryScores: ranked.filter((item) => item.score > 0),
  };
}

export function topicsFromCategoryScores(
  primaryCategory,
  categoryScores = [],
  focus = [],
) {
  const primary = CATEGORY_SET.has(primaryCategory) ? primaryCategory : DEFAULT_CATEGORY;
  const focusLabels = Array.isArray(focus)
    ? focus
    : String(focus || "").split(";").map((label) => label.trim()).filter(Boolean);
  const focusTopics = focusLabels
    .map((label) => FOCUS_TOPIC_BY_LABEL.get(label) || (CATEGORY_SET.has(label) ? label : null))
    .filter(Boolean);
  const ranked = categoryScores
    .filter((item) =>
      CATEGORY_SET.has(item?.category) &&
      Number.isFinite(Number(item.score)) &&
      Number(item.score) > 0
    )
    .map((item) => ({ category: item.category, score: Number(item.score) }))
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category, "ru"));
  const topScore = ranked[0]?.score || 0;
  const secondaryTopics = ranked
    .filter((item) =>
      item.category !== primary &&
      item.score >= 2 &&
      item.score >= Math.ceil(topScore * 0.4)
    )
    .map((item) => item.category);
  return unique([
    primary,
    ...focusTopics,
    ...secondaryTopics,
  ]).slice(0, 4);
}

export function normalizeChannelTopics(row = {}) {
  const primary = CATEGORY_SET.has(row.category) ? row.category : DEFAULT_CATEGORY;
  const explicitTopics = Array.isArray(row.topics)
    ? row.topics.filter((topic) => CATEGORY_SET.has(topic))
    : [];
  if (explicitTopics.length) return unique([primary, ...explicitTopics]).slice(0, 4);

  const classification = inferClassification([
    row.name,
    row.title,
    row.summary,
    row.lastPostTitle,
  ].filter(Boolean).join(" ").toLocaleLowerCase("ru"));
  if (classification.categoryScores.length === 0) return [primary];
  return topicsFromCategoryScores(
    primary,
    classification.categoryScores,
    classification.focus,
  );
}

export function parseRichText(blocks = []) {
  const parts = [];
  for (const block of blocks || []) {
    if (!block?.content) continue;
    try {
      const parsed = JSON.parse(block.content);
      if (Array.isArray(parsed) && parsed[0]) parts.push(String(parsed[0]));
      else if (typeof parsed === "string") parts.push(parsed);
    } catch {
      if (typeof block.content === "string") parts.push(block.content);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu;
const EXPLICIT_URL_PATTERN = /\b(?:https?:\/\/|mailto:|tel:|tg:\/\/|www\.)[^\s)\]}>,]+/giu;
const SOCIAL_LINK_PATTERN = /\b(?:t(?:elegram)?\.me|vk\.com|vk\.me|wa\.me|api\.whatsapp\.com|discord\.gg|discord\.com\/invite|viber\.com)\/[^\s)\]}>,]+/giu;
const BARE_URL_PATTERN = /(?<![\p{L}\p{N}_@])(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+(?:ru|com|org|net|io|dev|ai|pro|me|gg|рф)(?:\/[^\s)\]}>,]*)?/giu;
const CRYPTO_ADDRESS_PATTERN = /(?<![\p{L}\p{N}])(?:0x[a-f0-9]{40}|bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})(?![\p{L}\p{N}])/giu;
const HANDLE_PATTERN = /@[\p{L}\p{N}_](?:[\p{L}\p{N}_.-]{1,118}[\p{L}\p{N}_])?/giu;
const PHONE_CANDIDATE_PATTERN = /(?:\+\s*)?\d[\d\s().-]{5,}\d/gu;
const CONTACT_CONTEXT_PATTERN = /(?:telegram|телеграм|(?:^|[^\p{L}\p{N}_])тг(?:$|[^\p{L}\p{N}_])|instagram|инстаграм|ютуб|youtube|вконтакте|\bvk\b|discord|whatsapp|ватсап|viber|вайбер|соцсет|аккаунт|профил|канал|сообществ)/iu;
const CONTACT_INTENT_PATTERN = /(?<![\p{L}\p{N}_])(?:напишите|пишите|пиши|свяжитесь|связаться|обращайтесь|задать\s+вопрос|по\s+вопросам|прежде\s+чем\s+написать|перед\s+тем,?\s+как\s+писать|before\s+writing|contact\s+me)(?![\p{L}\p{N}_])/iu;
const DIRECT_CONTACT_INVITATION_PATTERN = /(?<![\p{L}\p{N}_])(?:напишите|пишите|пиши|свяжитесь|связаться|обращайтесь|личн(?:ые|ое)\s+сообщени(?:я|е|ях)?|contact\s+me|private\s+messages?)(?![\p{L}\p{N}_])/iu;
const CONTACT_DESTINATION_PATTERN = /(?:личн(?:ые|ое|ых)\s+сообщени|личк|личку|(?:^|[^\p{L}\p{N}_])(?:лс|тг)(?:$|[^\p{L}\p{N}_])|telegram|телеграм|discord|whatsapp|ватсап|viber|вайбер|вконтакте|\bvk\b|почт|e-?mail|телефон|phone|тут|здесь|private\s+messages?)/iu;
const SOCIAL_PRESENCE_PATTERN = /(?:^|[^\p{L}\p{N}_])(?:я|мы)\s+(?:есть\s+)?в(?:$|[^\p{L}\p{N}_])/iu;
const PHONE_CONTEXT_PATTERN = /(?:тел(?:ефон)?\.?|phone|whatsapp|ватсап|viber|вайбер|звон|связ)/iu;
const CARD_CONTEXT_PATTERN = /(?:карт(?:а|у|ы|е)|card|сбер|перевод|поддерж(?:ать|ка|ите)?|донат|donat|donation|кошел[её]к|wallet)/iu;
const LABELED_CONTACT_IDENTIFIER_PATTERN = /(?<![\p{L}\p{N}_])(?:для\s+связи|контакты?|почт(?:а|е|у)?|e-?mail|telegram|телеграм|(?:^|[^\p{L}\p{N}_])тг|youtube|ютуб|вконтакте|(?:^|[^\p{L}\p{N}_])vk|discord|whatsapp|ватсап|viber|вайбер)\s*(?:-?канал)?\s*(?::|[—–]\s*|-\s+)\s*@?[\p{L}\p{N}_.-]{3,}/giu;
const LINK_PROMOTION_PATTERN = /(?:мой|мои|наш|наша|веду\s+блог|подписывай|канал|группа|социалк|сайт|github|gitlab|ютуб|youtube|telegram|телеграм|вконтакте|\bvk\b|discord|twitch|твич|patreon|патреон|linkedin|линкедин|instagram|инстаграм|записаться|консультац)/iu;
const TRAILING_CONTACT_BLOCK_PATTERN = /(?:^|\s)(?:(?:мой|мои|наш|наша|канал\s+в|группа|дорожная\s+карта|канал|чат)\s+)?(?:telegram|телеграм|тг|youtube|ютуб|vk|вконтакте|discord|github|gitlab|twitch|твич|patreon|патреон|linkedin|линкедин|instagram|инстаграм|сайт|социалки)(?:\s*[-—–:]\s*(?:telegram|телеграм|тг|youtube|ютуб|vk|вконтакте|discord|github|gitlab|twitch|твич|patreon|патреон|linkedin|линкедин|instagram|инстаграм|сайт|социалки))*\s*[-—–:]*$/giu;
const TECHNICAL_DOMAIN_TOKENS = new Set(["asp.net", "vb.net", "n8n.io"]);

function regexTest(pattern, value) {
  pattern.lastIndex = 0;
  const matches = pattern.test(value);
  pattern.lastIndex = 0;
  return matches;
}

function isTechnicalDomainToken(value) {
  return TECHNICAL_DOMAIN_TOKENS.has(String(value || "").toLocaleLowerCase("en").replace(/\/$/u, ""));
}

function phoneCandidateKind(value, offset, candidate) {
  const digits = candidate.replace(/\D/g, "");
  if (candidate.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return "phone";
  if (digits.length === 11 && /^[78]/u.test(digits)) return "phone";

  const context = value.slice(Math.max(0, offset - 36), offset + candidate.length + 36);
  if (digits.length >= 7 && digits.length <= 15 && PHONE_CONTEXT_PATTERN.test(context)) return "phone";
  if (digits.length >= 13 && digits.length <= 19 && CARD_CONTEXT_PATTERN.test(context)) return "payment-number";
  return null;
}

function removeContactInstructionSegments(value) {
  return value.split(/(?<=[.!?])\s+|\n+/u).map((segment) => {
    const hasIntent = CONTACT_INTENT_PATTERN.test(segment);
    const hasDestination = CONTACT_DESTINATION_PATTERN.test(segment) ||
      regexTest(SOCIAL_LINK_PATTERN, segment) ||
      regexTest(EXPLICIT_URL_PATTERN, segment);
    const isSocialPresence = SOCIAL_PRESENCE_PATTERN.test(segment) &&
      (regexTest(SOCIAL_LINK_PATTERN, segment) || regexTest(EXPLICIT_URL_PATTERN, segment));
    const hasPublicLink = regexTest(SOCIAL_LINK_PATTERN, segment) ||
      regexTest(EXPLICIT_URL_PATTERN, segment) ||
      [...segment.matchAll(BARE_URL_PATTERN)].some((match) => !isTechnicalDomainToken(match[0]));
    const promotesExternalLink = hasPublicLink && LINK_PROMOTION_PATTERN.test(segment);
    const directlyInvitesContact = DIRECT_CONTACT_INVITATION_PATTERN.test(segment);
    return (hasIntent && hasDestination) || directlyInvitesContact || isSocialPresence || promotesExternalLink ? " " : segment;
  }).join(" ");
}

export function findPublicContactKinds(value) {
  const text = String(value || "");
  const kinds = new Set();
  if (regexTest(EMAIL_PATTERN, text)) kinds.add("email");
  if (regexTest(EXPLICIT_URL_PATTERN, text)) kinds.add("url");
  if (regexTest(SOCIAL_LINK_PATTERN, text)) kinds.add("social-link");
  for (const match of text.matchAll(BARE_URL_PATTERN)) {
    if (!isTechnicalDomainToken(match[0])) kinds.add("bare-url");
  }
  if (regexTest(CRYPTO_ADDRESS_PATTERN, text)) kinds.add("payment-address");
  if (regexTest(LABELED_CONTACT_IDENTIFIER_PATTERN, text)) kinds.add("contact-identifier");
  if (CONTACT_INTENT_PATTERN.test(text) && CONTACT_DESTINATION_PATTERN.test(text)) {
    kinds.add("contact-instruction");
  }

  for (const match of text.matchAll(HANDLE_PATTERN)) {
    if (match[0]) kinds.add("social-handle");
  }
  for (const match of text.matchAll(PHONE_CANDIDATE_PATTERN)) {
    const kind = phoneCandidateKind(text, match.index, match[0]);
    if (kind) kinds.add(kind);
  }
  return [...kinds].sort();
}

export function sanitizePublicSummary(value) {
  let text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "‹")
    .replaceAll("&gt;", "›");
  text = removeContactInstructionSegments(text);
  text = text
    .replace(LABELED_CONTACT_IDENTIFIER_PATTERN, " ")
    .replace(EMAIL_PATTERN, " ")
    .replace(EXPLICIT_URL_PATTERN, " ")
    .replace(SOCIAL_LINK_PATTERN, " ")
    .replace(BARE_URL_PATTERN, (url) => isTechnicalDomainToken(url) ? url : " ")
    .replace(CRYPTO_ADDRESS_PATTERN, " ")
    .replace(HANDLE_PATTERN, " ")
    .replace(PHONE_CANDIDATE_PATTERN, (candidate, offset, source) =>
      phoneCandidateKind(source, offset, candidate) ? " " : candidate
    )
    .replace(
      /(?:мой\s+сайт|мои\s+ссылки|видео|чат|анонсы|telegram|телеграм|youtube|ютуб|вконтакте|vk|discord|сайт|соцсети)\s*(?:-?канал)?\s*:\s*/giu,
      " ",
    )
    .replace(
      /(?:основной\s+youtube|больше\s+ссылок(?:\s+тут)?)[\s\S]*$/giu,
      " ",
    )
    .replace(/(?:^|\s)(?:сотрудничество|для\s+связи|контакты?|поддержать|донат|перевод)\s*[:—–-]+\s*(?=$|[.!?])/giu, " ")
    .replace(/(?:^|([.!?])\s+)(?:я|мы)\s+(?:есть\s+)?в\s*(?=$|[.!?])/giu, "$1 ")
    .replace(TRAILING_CONTACT_BLOCK_PATTERN, " ")
    .replace(/[«“"]\s*[»”"]/gu, " ")
    .replace(/\[\s*\]|\(\s*\)/gu, " ")
    .replace(/\(\s*[,;]\s*/gu, "(")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([.!?])(?:\s*[.!?])+/g, "$1")
    .replace(/\s+и\.$/giu, ".")
    .replace(/[,;:—–-]+\s*$/gu, "")
    .replace(/\s+([)\]])/g, "$1")
    .trim();
  return text;
}

export function buildChannelSummary({
  description = "",
  title = "",
  focus = "",
  category = DEFAULT_CATEGORY,
} = {}) {
  const clean = sanitizePublicSummary;
  const shorten = (value, limit = 420) => {
    if (value.length <= limit) return value;
    const excerpt = value.slice(0, limit + 1);
    const sentenceEnd = Math.max(
      excerpt.lastIndexOf(". "),
      excerpt.lastIndexOf("! "),
      excerpt.lastIndexOf("? "),
    );
    if (sentenceEnd >= Math.min(180, Math.floor(limit * 0.55)) && sentenceEnd < limit) {
      return excerpt.slice(0, sentenceEnd + 1).trim();
    }
    const wordEnd = excerpt.lastIndexOf(" ");
    const end = wordEnd > 0 ? Math.min(wordEnd, limit - 1) : limit - 1;
    return `${excerpt.slice(0, end).trim()}…`;
  };

  const cleanedDescription = clean(description);
  if (cleanedDescription.length >= 24) return shorten(cleanedDescription);

  const cleanedTitle = clean(title).replace(/[.!?]+$/, "");
  const cleanedFocus = clean(focus || category).replace(/[.!?]+$/, "");
  if (cleanedTitle && normalizeComparable(cleanedTitle) !== normalizeComparable(cleanedFocus)) {
    return shorten(`${cleanedTitle}. Основные темы: ${cleanedFocus}.`);
  }
  return shorten(`Автор публикует материалы по темам: ${cleanedFocus || category}.`);
}

function normalizeComparable(value) {
  return String(value || "")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function currentPromoPrice(level, nowSeconds) {
  const active = (Array.isArray(level.promos) ? level.promos : []).filter((promo) =>
    !promo.isFinished &&
    (!promo.startTime || promo.startTime <= nowSeconds) &&
    (!promo.endTime || promo.endTime >= nowSeconds)
  );
  const prices = active
    .flatMap((promo) => [promo.discount, ...(promo.discounts || [])])
    .map((discount) => discount?.currencyPrices?.RUB ?? discount?.price)
    .filter((price) => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

export function localIsoDate(timeZone = "Asia/Barnaul", date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function activityStatus(lastPostAt, checkedAt) {
  if (!lastPostAt) return { id: "unknown", label: "Нет данных", days: null };
  const checked = new Date(`${checkedAt}T23:59:59+07:00`);
  const lastPost = new Date(lastPostAt);
  const days = Math.max(0, Math.floor((checked - lastPost) / 86400000));
  if (days <= 30) return { id: "fresh", label: "Свежий", days };
  if (days <= 90) return { id: "active", label: "Активный", days };
  if (days <= 365) return { id: "rare", label: "Редкий", days };
  return { id: "archive", label: "Архивный", days };
}

export function extractBoostySlugs(text) {
  const decoded = String(text)
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/");
  const slugs = [];
  const pattern = /https?:\/\/(?:www\.)?boosty\.to\/(?:about\/)?([a-zA-Z0-9_.-]+)/gi;
  for (const match of decoded.matchAll(pattern)) {
    const slug = match[1].toLowerCase();
    if (!RESERVED_SLUGS.has(slug)) slugs.push(slug);
  }
  return unique(slugs);
}

async function reserveBoostyRequestSlot() {
  let releaseTurn;
  const turn = new Promise((resolve) => {
    releaseTurn = resolve;
  });
  const previousTurn = boostySchedulerTail;
  boostySchedulerTail = turn;
  await previousTurn;
  try {
    while (true) {
      const waitUntil = Math.max(nextBoostyRequestAt, boostyBackoffUntil);
      const waitMs = waitUntil - Date.now();
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      nextBoostyRequestAt = Date.now() + BOOSTY_REQUEST_INTERVAL_MS;
      return;
    }
  } finally {
    releaseTurn();
  }
}

export async function fetchBoostyJson(url) {
  const parsedUrl = new URL(url);
  if (parsedUrl.origin !== API_BASE) throw new Error(`Unexpected Boosty API origin: ${parsedUrl.origin}`);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await reserveBoostyRequestSlot();

    try {
      const response = await fetch(parsedUrl, {
        signal: AbortSignal.timeout(20_000),
        headers: {
          accept: "application/json",
          "accept-language": "ru-RU,ru;q=0.9,en;q=0.6",
          "user-agent": "BoostyDollsCatalog/1.0 (+https://github.com/BelyaevAD/boosty-dolls-catalog)",
        },
      });
      if (response.ok) return response.json();
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`HTTP ${response.status} for ${parsedUrl}`);
      }

      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = Number(retryAfterHeader);
      const retryAfterDate = retryAfterHeader && !Number.isFinite(retryAfterSeconds)
        ? Date.parse(retryAfterHeader)
        : Number.NaN;
      const retryAfterMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1_000
        : Number.isFinite(retryAfterDate)
          ? Math.max(0, retryAfterDate - Date.now())
          : 0;
      const exponentialBackoff = response.status === 429
        ? Math.min(60_000, 10_000 * 2 ** attempt)
        : Math.min(15_000, 1_500 * 2 ** attempt);
      const waitMs = Math.max(retryAfterMs, exponentialBackoff);
      if (response.status === 429) boostyBackoffUntil = Math.max(boostyBackoffUntil, Date.now() + waitMs);
    } catch (error) {
      if (!/fetch|timeout|aborted/i.test(String(error?.message || error)) || attempt === 5) throw error;
    }
    if (attempt < 5) {
      const waitUntil = Math.max(
        boostyBackoffUntil,
        Date.now() + Math.min(15_000, 1_500 * 2 ** attempt),
      );
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitUntil - Date.now())));
    }
  }
  throw new Error(`Retries exhausted for ${parsedUrl}`);
}

function validBoostySlug(value) {
  const slug = String(value || "").toLowerCase();
  if (!/^[a-z0-9_.-]{1,120}$/.test(slug)) {
    throw new Error(`Invalid Boosty slug: ${slug}`);
  }
  return slug;
}

export async function fetchBoostyBlog(slug) {
  const safeSlug = validBoostySlug(slug);
  return fetchBoostyJson(`${API_BASE}/v1/blog/${encodeURIComponent(safeSlug)}`);
}

export async function fetchBoostyPosts(slug, { limit = MAX_ASSESSMENT_POSTS } = {}) {
  const safeSlug = validBoostySlug(slug);
  const safeLimit = Math.min(
    MAX_ASSESSMENT_POSTS,
    Math.max(1, Number.parseInt(String(limit), 10) || MAX_ASSESSMENT_POSTS),
  );
  const posts = [];
  const seenPostIds = new Set();
  let offset = "";

  while (posts.length < safeLimit) {
    const url = new URL(`${API_BASE}/v1/blog/${encodeURIComponent(safeSlug)}/post/`);
    url.searchParams.set("limit", String(Math.min(BOOSTY_POST_PAGE_SIZE, safeLimit - posts.length)));
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetchBoostyJson(url);
    for (const post of response.data || []) {
      const postId = String(post?.id || `${post?.publishTime || post?.createdAt || ""}:${post?.title || ""}`);
      if (seenPostIds.has(postId)) continue;
      seenPostIds.add(postId);
      posts.push(post);
      if (posts.length >= safeLimit) break;
    }

    if (response.extra?.isLast || !response.extra?.offset || posts.length >= safeLimit) break;
    const nextOffset = String(response.extra.offset);
    if (!/^\d{1,20}:\d{1,20}$/u.test(nextOffset)) {
      throw new Error(`Unexpected Boosty pagination offset for ${safeSlug}`);
    }
    offset = nextOffset;
  }

  return posts;
}

export function assessBoostyBlog(blog) {
  const descriptionText = parseRichText(blog?.description || []);
  const combinedText = [
    blog?.owner?.name,
    blog?.title,
    descriptionText,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").toLowerCase();
  const languageEvidence = assessRussianLanguage({
    description: descriptionText,
    ownerName: blog?.owner?.name,
    channelTitle: blog?.title,
  });
  return {
    descriptionText,
    combinedText,
    relevanceScore: countMatches(combinedText, ALL_RELEVANCE_TERMS),
    language: languageEvidence.aggregate,
    languageEvidence,
    isRussian: languageEvidence.isRussian,
    hasPosts: Number(blog?.count?.posts ?? 0) > 0,
    notBanned: !/banned|заблокирован/i.test(`${blog?.owner?.name || ""} ${blog?.title || ""}`),
    hasAdultContent: Boolean(blog?.hasAdultContent || blog?.flags?.hasAdultContent),
  };
}

export async function fetchBoostyChannel(seed, previous, checkedAt) {
  const slug = validBoostySlug(seed.slug);

  const blog = seed.blog || await fetchBoostyBlog(slug);
  const [levelsResult, fetchedPosts] = await Promise.all([
    fetchBoostyJson(`${API_BASE}/v1/blog/${encodeURIComponent(slug)}/subscription_level/?show_free_level=true&sort_by=on_time&offset=0&limit=50&order=gt`),
    fetchBoostyPosts(slug),
  ]);

  const nowSeconds = Math.floor(new Date(`${checkedAt}T23:59:59+07:00`).getTime() / 1000);
  const levels = (levelsResult.data || []).filter((level) =>
    Number(level.currencyPrices?.RUB ?? level.price) > 0 &&
    !level.deleted &&
    !level.isArchived &&
    !level.flags?.isArchived &&
    !level.isHidden &&
    !level.flags?.isHidden
  );
  const tiers = levels.map((level) => ({
    name: String(level.name || "").slice(0, 160),
    priceRub: Number(level.currencyPrices?.RUB ?? level.price),
    promoPriceRub: currentPromoPrice(level, nowSeconds),
  }));

  const posts = fetchedPosts
    .filter((post) => post?.isPublished !== false && !post?.isDeleted)
    .sort((a, b) => (b.publishTime || b.createdAt || 0) - (a.publishTime || a.createdAt || 0));
  const oneOffItems = posts
    .filter((post) => Number(post.currencyPrices?.RUB ?? post.price) > 0)
    .map((post) => ({
      title: String(post.title || "Платный материал").slice(0, 240),
      priceRub: Number(post.currencyPrices?.RUB ?? post.price),
      publishedAt: post.publishTime ? new Date(post.publishTime * 1000).toISOString() : null,
    }));
  const lastPost = posts[0] || null;
  const profileAssessment = assessBoostyBlog(blog);
  const descriptionText = profileAssessment.descriptionText;
  const profileText = `${blog.title || ""} ${descriptionText}`;
  const assessmentPosts = posts.slice(0, MAX_ASSESSMENT_POSTS);
  const assessmentPostTitles = assessmentPosts.map((post) => post.title || "").filter(Boolean);
  const assessmentPostTexts = assessmentPosts
    .map((post) => parseRichText([...(post.teaser || []), ...(post.data || [])]).slice(0, 2_000))
    .filter(Boolean);
  const combinedText = [
    blog.owner?.name,
    blog.title,
    descriptionText,
    ...assessmentPostTitles,
    ...assessmentPostTexts,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").toLowerCase();

  const relevanceScore = countMatches(combinedText, ALL_RELEVANCE_TERMS);
  const languageEvidence = assessRussianLanguage({
    description: descriptionText,
    postTitles: assessmentPostTitles,
    postTexts: assessmentPostTexts,
    tierNames: tiers.map((tier) => tier.name),
    oneOffTitles: oneOffItems.map((item) => item.title),
    ownerName: blog.owner?.name,
    channelTitle: blog.title,
  });
  const classification = inferClassification(combinedText);
  const subscribers = Number(blog.count?.subscribers ?? 0);
  const historicalSubscribers = Number.isFinite(previous?.subscribers) ? previous.subscribers : null;
  const growthSinceSnapshot = historicalSubscribers === null ? null : subscribers - historicalSubscribers;
  const listPrices = tiers.map((tier) => tier.priceRub).filter(Number.isFinite);
  const promoPrices = tiers.map((tier) => tier.promoPriceRub).filter(Number.isFinite);
  const oneOffPrices = oneOffItems.map((item) => item.priceRub).filter(Number.isFinite);
  const relevantPostCount = posts.filter((post) => countMatches([
    post.title,
    parseRichText([...(post.teaser || []), ...(post.data || [])]),
    ...(post.tags || []).map((tag) => tag?.title),
  ].filter(Boolean).join(" "), ALL_RELEVANCE_TERMS) > 0).length;
  const isRussian = languageEvidence.isRussian;
  const hasPosts = Number(blog.count?.posts ?? 0) > 0;
  const notBanned = !/banned|заблокирован/i.test(`${blog.owner?.name || ""} ${blog.title || ""}`);
  const hasAdultContent = profileAssessment.hasAdultContent;
  const outOfScopeProfile = profileLooksOutOfScope(profileText) && profileAssessment.relevanceScore < 1;
  const targetedPostEvidence = seed.discoveryHints?.targetedPost === true;
  const hasDollRelevance = qualifiesDollRelevance({
    relevanceScore,
    profileRelevanceScore: profileAssessment.relevanceScore,
    relevantPostCount,
    assessedPostCount: assessmentPosts.length,
    targetedPostEvidence,
  });

  return {
    slug: blog.blogUrl || slug,
    name: blog.owner?.name || blog.blogUrl || slug,
    title: blog.title || "",
    boostyUrl: `https://boosty.to/${blog.blogUrl || slug}`,
    category: classification.category,
    topics: classification.topics,
    categoryScores: classification.categoryScores,
    focus: classification.focus,
    reason: `Профильный русскоязычный кукольный автор: ${classification.focus}.`,
    summary: buildChannelSummary({
      description: descriptionText,
      title: blog.title,
      focus: classification.focus,
      category: classification.category,
    }),
    subscribers,
    postsCount: Number(blog.count?.posts ?? 0),
    lastPostAt: lastPost?.publishTime ? new Date(lastPost.publishTime * 1000).toISOString() : null,
    lastPostTitle: String(lastPost?.title || "").slice(0, 300),
    minSubscriptionPriceRub: listPrices.length ? Math.min(...listPrices) : null,
    maxSubscriptionPriceRub: listPrices.length ? Math.max(...listPrices) : null,
    minSubscriptionPromoPriceRub: promoPrices.length ? Math.min(...promoPrices) : null,
    tierCount: tiers.length,
    tiers,
    minOneOffPriceRub: oneOffPrices.length ? Math.min(...oneOffPrices) : null,
    maxOneOffPriceRub: oneOffPrices.length ? Math.max(...oneOffPrices) : null,
    oneOffCountRecent: oneOffItems.length,
    oneOffItems,
    paymentTypes: [
      ...(tiers.length ? ["subscription"] : []),
      ...(oneOffItems.length ? ["one-off"] : []),
    ],
    checkedAt,
    historicalSubscribers,
    growthSinceSnapshot,
    lastObservedGrowthDate: growthSinceSnapshot > 0 ? checkedAt : previous?.lastObservedGrowthDate || null,
    relevanceScore,
    profileRelevanceScore: profileAssessment.relevanceScore,
    relevantPostCount,
    assessedPostCount: assessmentPosts.length,
    relevantPostShare: assessmentPosts.length ? relevantPostCount / assessmentPosts.length : 0,
    targetedPostEvidence,
    hasDollRelevance,
    outOfScopeProfile,
    isRussian,
    languageEvidence,
    hasPosts,
    hasPaidLevels: tiers.length > 0,
    hasOneOff: oneOffItems.length > 0,
    hasAdultContent,
    notBanned,
    qualifies: isRussian &&
      hasDollRelevance &&
      !outOfScopeProfile &&
      hasPosts &&
      (tiers.length > 0 || oneOffItems.length > 0) &&
      !hasAdultContent &&
      notBanned,
  };
}

export async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {
          ...items[index],
          fetchError: String(error?.message || error),
        };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

export function toPublicChannel(row) {
  const tiers = (row.tiers || []).map((tier) => ({
    name: sanitizePublicSummary(tier.name || "Подписка").slice(0, 160) || "Подписка",
    priceRub: Number(tier.priceRub),
    promoPriceRub: Number.isFinite(tier.promoPriceRub) ? Number(tier.promoPriceRub) : null,
  }));
  const category = CATEGORY_SET.has(row.category) ? row.category : DEFAULT_CATEGORY;
  const topics = normalizeChannelTopics({ ...row, category });
  const oneOffItems = (row.oneOffItems || []).slice(0, 6).map((item) => ({
    title: sanitizePublicSummary(item.title || "Платный материал").slice(0, 240) || "Платный материал",
    priceRub: Number(item.priceRub),
    publishedAt: item.publishedAt || null,
  })).filter((item) => Number.isFinite(item.priceRub) && item.priceRub > 0);
  const paymentTypes = [
    ...(tiers.length ? ["subscription"] : []),
    ...(oneOffItems.length ? ["one-off"] : []),
  ];
  return {
    slug: String(row.slug).toLowerCase(),
    language: "ru",
    name: String(row.name || row.slug).slice(0, 180),
    title: sanitizePublicSummary(row.title).slice(0, 220),
    boostyUrl: `https://boosty.to/${String(row.slug).toLowerCase()}`,
    category,
    topics,
    focus: String(row.focus || category).slice(0, 320),
    reason: String(row.reason || "").slice(0, 360),
    summary: buildChannelSummary({
      description: row.summary || row.description,
      title: row.title,
      focus: row.focus,
      category,
    }),
    subscribers: Math.max(0, Number(row.subscribers) || 0),
    postsCount: Math.max(0, Number(row.postsCount) || 0),
    lastPostAt: row.lastPostAt || null,
    lastPostTitle: sanitizePublicSummary(row.lastPostTitle).slice(0, 300),
    paymentTypes,
    minSubscriptionPriceRub: Number.isFinite(row.minSubscriptionPriceRub) ? Number(row.minSubscriptionPriceRub) : null,
    maxSubscriptionPriceRub: Number.isFinite(row.maxSubscriptionPriceRub) ? Number(row.maxSubscriptionPriceRub) : null,
    minSubscriptionPromoPriceRub: Number.isFinite(row.minSubscriptionPromoPriceRub) ? Number(row.minSubscriptionPromoPriceRub) : null,
    tierCount: tiers.length,
    tiers,
    minOneOffPriceRub: Number.isFinite(row.minOneOffPriceRub) ? Number(row.minOneOffPriceRub) : null,
    maxOneOffPriceRub: Number.isFinite(row.maxOneOffPriceRub) ? Number(row.maxOneOffPriceRub) : null,
    oneOffCountRecent: Math.max(0, Number(row.oneOffCountRecent) || oneOffItems.length),
    oneOffItems,
    checkedAt: row.checkedAt,
    historicalSubscribers: Number.isFinite(row.historicalSubscribers) ? Number(row.historicalSubscribers) : null,
    growthSinceSnapshot: Number.isFinite(row.growthSinceSnapshot) ? Number(row.growthSinceSnapshot) : null,
    lastObservedGrowthDate: row.lastObservedGrowthDate || null,
  };
}
