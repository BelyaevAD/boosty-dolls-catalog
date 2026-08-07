import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CATEGORIES, findPublicContactKinds } from "./lib/catalog.mjs";

const root = path.resolve(import.meta.dirname, "..");
const [publicCatalog, rawCatalog, manualExclusions, latestUpdate] = await Promise.all([
  fs.readFile(path.join(root, "data", "channels.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "data", "raw", "boosty-candidates.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "data", "manual-exclusions.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "data", "latest-update.json"), "utf8").then(JSON.parse),
]);

const { meta, channels } = publicCatalog;
assert.equal(meta.schemaVersion, 2, "Unsupported public data schema.");
assert.match(meta.checkedAt, /^\d{4}-\d{2}-\d{2}$/, "checkedAt must be an ISO date.");
assert.ok(Array.isArray(channels), "channels must be an array.");
assert.ok(channels.length >= 90, "The public catalog must contain at least 90 qualified authors.");
assert.equal(meta.channelCount, channels.length, "meta.channelCount must match channels.length.");

const knownCategories = new Set(CATEGORIES);
const allowedPaymentTypes = new Set(["subscription", "one-off"]);
const slugs = new Set();
const urls = new Set();

for (const channel of channels) {
  assert.match(channel.slug, /^[a-z0-9_.-]{1,120}$/, `Unsafe slug: ${channel.slug}`);
  assert.ok(!slugs.has(channel.slug), `Duplicate slug: ${channel.slug}`);
  slugs.add(channel.slug);

  assert.equal(channel.boostyUrl, `https://boosty.to/${channel.slug}`, `Unexpected Boosty URL for ${channel.slug}`);
  assert.equal(channel.language, "ru", `Only Russian-language channels may be published: ${channel.slug}`);
  assert.ok(!urls.has(channel.boostyUrl), `Duplicate URL: ${channel.boostyUrl}`);
  urls.add(channel.boostyUrl);

  assert.ok(channel.name && channel.name.length <= 180, `Invalid name for ${channel.slug}`);
  assert.ok(knownCategories.has(channel.category), `Unknown category for ${channel.slug}`);
  assert.ok(Array.isArray(channel.topics) && channel.topics.length >= 1 && channel.topics.length <= 4, `Invalid topics for ${channel.slug}`);
  assert.equal(channel.topics[0], channel.category, `Primary category must be first for ${channel.slug}`);
  assert.equal(new Set(channel.topics).size, channel.topics.length, `Duplicate topics for ${channel.slug}`);
  for (const topic of channel.topics) assert.ok(knownCategories.has(topic), `Unknown topic "${topic}" for ${channel.slug}`);

  assert.ok(channel.focus, `Missing focus for ${channel.slug}`);
  assert.ok(channel.summary && channel.summary.length <= 420, `Invalid summary for ${channel.slug}`);
  assert.ok(!/https?:\/\//i.test(channel.summary), `External URL leaked into summary for ${channel.slug}`);
  assert.deepEqual(findPublicContactKinds(channel.summary), [], `Personal contact data leaked into summary for ${channel.slug}`);
  assert.deepEqual(
    findPublicContactKinds(`${channel.title || ""} ${channel.lastPostTitle || ""}`),
    [],
    `Personal contact data leaked into public text for ${channel.slug}`,
  );

  assert.ok(Number.isInteger(channel.subscribers) && channel.subscribers >= 0, `Invalid subscribers for ${channel.slug}`);
  assert.ok(Number.isInteger(channel.postsCount) && channel.postsCount > 0, `Invalid posts count for ${channel.slug}`);
  assert.ok(Array.isArray(channel.paymentTypes) && channel.paymentTypes.length >= 1 && channel.paymentTypes.length <= 2, `Invalid payment types for ${channel.slug}`);
  assert.equal(new Set(channel.paymentTypes).size, channel.paymentTypes.length, `Duplicate payment type for ${channel.slug}`);
  for (const type of channel.paymentTypes) assert.ok(allowedPaymentTypes.has(type), `Unknown payment type for ${channel.slug}`);

  const hasSubscription = channel.paymentTypes.includes("subscription");
  assert.equal(Array.isArray(channel.tiers) && channel.tiers.length > 0, hasSubscription, `Subscription data mismatch for ${channel.slug}`);
  if (hasSubscription) {
    assert.ok(Number.isFinite(channel.minSubscriptionPriceRub) && channel.minSubscriptionPriceRub > 0, `Missing subscription price for ${channel.slug}`);
    assert.ok(Number.isFinite(channel.maxSubscriptionPriceRub) && channel.maxSubscriptionPriceRub >= channel.minSubscriptionPriceRub, `Invalid subscription range for ${channel.slug}`);
    for (const tier of channel.tiers) {
      assert.ok(Number.isFinite(tier.priceRub) && tier.priceRub > 0, `Invalid tier price for ${channel.slug}`);
      assert.deepEqual(findPublicContactKinds(tier.name), [], `Contact data leaked into a tier name for ${channel.slug}`);
    }
  } else {
    assert.equal(channel.minSubscriptionPriceRub, null, `Unexpected subscription price for ${channel.slug}`);
    assert.equal(channel.tierCount, 0, `Unexpected tiers for ${channel.slug}`);
  }

  const hasOneOff = channel.paymentTypes.includes("one-off");
  assert.equal(Array.isArray(channel.oneOffItems) && channel.oneOffItems.length > 0, hasOneOff, `One-off data mismatch for ${channel.slug}`);
  if (hasOneOff) {
    assert.ok(Number.isFinite(channel.minOneOffPriceRub) && channel.minOneOffPriceRub > 0, `Missing one-off price for ${channel.slug}`);
    assert.ok(Number.isFinite(channel.maxOneOffPriceRub) && channel.maxOneOffPriceRub >= channel.minOneOffPriceRub, `Invalid one-off range for ${channel.slug}`);
    for (const item of channel.oneOffItems) {
      assert.ok(item.title && item.title.length <= 240, `Invalid one-off title for ${channel.slug}`);
      assert.ok(Number.isFinite(item.priceRub) && item.priceRub > 0, `Invalid one-off item price for ${channel.slug}`);
      assert.deepEqual(findPublicContactKinds(item.title), [], `Contact data leaked into a one-off title for ${channel.slug}`);
    }
  } else {
    assert.equal(channel.minOneOffPriceRub, null, `Unexpected one-off price for ${channel.slug}`);
    assert.equal(channel.oneOffCountRecent, 0, `Unexpected one-off items for ${channel.slug}`);
  }

  assert.ok(!Object.hasOwn(channel, "minPriceRub"), `Ambiguous legacy price leaked for ${channel.slug}`);
  assert.ok(!Object.hasOwn(channel, "externalLinks"), `External links must not be published for ${channel.slug}`);
  assert.ok(!Object.hasOwn(channel, "description"), `Raw descriptions must not be published for ${channel.slug}`);
  assert.ok(!Object.hasOwn(channel, "discoveryQueries"), `Discovery evidence must not be published for ${channel.slug}`);
  if (channel.lastPostAt) assert.ok(Number.isFinite(Date.parse(channel.lastPostAt)), `Invalid lastPostAt for ${channel.slug}`);
}

assert.equal(rawCatalog.meta.schemaVersion, 2, "Unsupported raw data schema.");
assert.ok(rawCatalog.candidates.length >= channels.length, "Raw candidate list cannot be smaller than public catalog.");
assert.equal(rawCatalog.meta.candidateCount, rawCatalog.candidates.length, "Raw candidate count mismatch.");
const rawSlugs = new Set(rawCatalog.candidates.map((candidate) => candidate.slug));
for (const slug of slugs) assert.ok(rawSlugs.has(slug), `Published author missing from raw list: ${slug}`);

assert.equal(manualExclusions.schemaVersion, 2, "Unsupported manual exclusions schema.");
const excludedSlugs = new Set();
for (const entry of manualExclusions.exclusions) {
  assert.match(entry.slug, /^[a-z0-9_.-]{1,120}$/, `Unsafe excluded slug: ${entry.slug}`);
  assert.ok(!excludedSlugs.has(entry.slug), `Duplicate manual exclusion: ${entry.slug}`);
  assert.ok(entry.reason, `Missing exclusion reason for ${entry.slug}`);
  excludedSlugs.add(entry.slug);
  assert.ok(!slugs.has(entry.slug), `Manually excluded author is published: ${entry.slug}`);
}

assert.equal(latestUpdate.schemaVersion, 2, "Unsupported update report schema.");
assert.ok(Number.isInteger(latestUpdate.maxNewChannels), "Missing new-channel publication limit.");
assert.ok(latestUpdate.maxNewChannels >= 0 && latestUpdate.maxNewChannels <= 200, "New-channel publication limit must stay between 0 and 200.");
assert.equal(latestUpdate.hardNewChannelLimit, 200, "Hard publication limit must remain 200.");
assert.ok(latestUpdate.added.length <= latestUpdate.maxNewChannels, "The update published more channels than allowed.");
assert.equal(latestUpdate.qualifiedDeferredCount, latestUpdate.qualifiedDeferred.length, "Deferred qualified count mismatch.");
assert.deepEqual(latestUpdate.errors, [], "The latest update has request errors.");
assert.equal(latestUpdate.totalOutstandingFetchErrors, 0, "Outstanding fetch errors must be zero.");

console.log(`Validated ${channels.length} public authors and ${rawCatalog.candidates.length} raw candidates.`);
