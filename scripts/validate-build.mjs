import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist");
const catalog = JSON.parse(await fs.readFile(path.join(root, "data", "channels.json"), "utf8"));
const [index, sitemap, robots, icons, builtApp] = await Promise.all([
  fs.readFile(path.join(output, "index.html"), "utf8"),
  fs.readFile(path.join(output, "sitemap.xml"), "utf8"),
  fs.readFile(path.join(output, "robots.txt"), "utf8"),
  fs.readFile(path.join(output, "assets", "icons.svg"), "utf8"),
  fs.readFile(path.join(output, "assets", "app.js"), "utf8"),
]);

assert.ok(index.includes("<title>Boosty Dolls"), "Missing page title.");
assert.ok(index.includes("application/ld+json"), "Missing structured data.");
assert.equal((index.match(/class="channel-card"/g) || []).length, catalog.channels.length, "Rendered card count mismatch.");
assert.equal((index.match(/class="channel-row"/g) || []).length, catalog.channels.length, "Rendered table row count mismatch.");
assert.equal((index.match(/<template data-channel-slug=/g) || []).length, catalog.channels.length, "Rendered modal count mismatch.");
assert.equal((index.match(/data-payment-types=/g) || []).length, catalog.channels.length, "Payment data mismatch.");
assert.equal((index.match(/data-subscription-price=/g) || []).length, catalog.channels.length, "Subscription price data mismatch.");
assert.equal((index.match(/data-one-off-price=/g) || []).length, catalog.channels.length, "One-off price data mismatch.");
assert.ok(!/__[A-Z0-9_]+__/u.test(index), "Unresolved build placeholder.");
assert.match(index, /assets\/app\.js\?v=[a-f0-9]{12}/u, "Main script must be cache-versioned.");
assert.match(index, /assets\/icons\.svg\?v=[a-f0-9]{12}#icon-github/u, "Icon sprite must be cache-versioned.");
assert.match(builtApp, /catalog-core\.js\?v=[a-f0-9]{12}/u, "Core module import must be cache-versioned.");

assert.equal((index.match(/scope="row" data-label="Автор"/g) || []).length, catalog.channels.length, "Table row headers are missing.");
assert.equal((index.match(/<col class="col-/g) || []).length, 6, "The comparison table must use six columns.");
assert.ok(index.includes('data-payment-filter="subscription"'), "Subscription lane is missing.");
assert.ok(index.includes('data-payment-filter="one-off"'), "One-off lane is missing.");
assert.ok(index.includes('data-payment-filter="both"'), "Combined payment filter is missing.");
assert.ok(index.includes('id="max-subscription-price"'), "Independent subscription price filter is missing.");
assert.ok(index.includes('id="max-one-off-price"'), "Independent one-off price filter is missing.");
assert.ok(index.includes('data-sort-key="subscriptionPrice"'), "Subscription sorting is missing.");
assert.ok(index.includes('data-sort-key="oneOffPrice"'), "One-off sorting is missing.");

assert.ok(index.includes('class="card-grid" id="channel-grid" hidden'), "Cards must be hidden initially.");
assert.ok(index.includes('class="table-shell" id="channel-table-view"'), "Table must be visible initially.");
assert.ok(index.includes('id="channel-dialog"'), "Author dialog is missing.");
assert.ok(index.includes('class="github-support" id="support"'), "GitHub support callout is missing.");

assert.ok(index.includes("frame-src 'none'"), "CSP must deny frames.");
assert.ok(!index.includes("'unsafe-inline'"), "CSP must not allow inline scripts.");
assert.equal((index.match(/<iframe\b/giu) || []).length, 0, "Third-party iframes are forbidden.");
assert.ok(!/<script\b[^>]+src=["']https?:\/\//iu.test(index), "Remote scripts are forbidden.");
assert.ok(!/<img\b[^>]+src=["']https?:\/\//iu.test(index), "Remote images are forbidden.");
assert.ok(!index.includes("externalLinks"), "External link data leaked into the page.");
assert.ok(!index.includes("discoveryQueries"), "Discovery evidence leaked into the page.");

for (const id of ["icon-github", "icon-grid", "icon-table", "icon-search"]) {
  assert.ok(icons.includes(`id="${id}"`), `Missing local icon ${id}`);
}

assert.equal((sitemap.match(/<url>/g) || []).length, catalog.channels.length + 1, "Sitemap URL count mismatch.");
assert.ok(robots.includes("Sitemap:"), "robots.txt must reference the sitemap.");

for (const channel of catalog.channels) {
  const page = path.join(output, "channels", channel.slug, "index.html");
  const stat = await fs.stat(page);
  assert.ok(stat.isFile(), `Missing author page for ${channel.slug}`);
  const html = await fs.readFile(page, "utf8");
  assert.ok(html.includes("Boosty Dolls Каталог"), `Wrong branding on ${channel.slug}`);
  if (channel.paymentTypes.includes("subscription")) assert.ok(html.includes("Уровни подписки"), `Missing subscription section for ${channel.slug}`);
  if (channel.paymentTypes.includes("one-off")) assert.ok(html.includes("Разовые материалы"), `Missing one-off section for ${channel.slug}`);
}

for (const link of index.matchAll(/<a\b[^>]*\btarget="_blank"[^>]*>/giu)) {
  assert.match(link[0], /\brel="[^"]*\bnoopener\b[^"]*"/iu, "External links must use noopener.");
  assert.match(link[0], /\brel="[^"]*\bnoreferrer\b[^"]*"/iu, "External links must use noreferrer.");
}

for (const icon of index.matchAll(/<svg\b[^>]*class="[^"]*\bicon\b[^"]*"[^>]*>/giu)) {
  assert.match(icon[0], /\baria-hidden="true"/iu, "Decorative icons must be hidden.");
  assert.match(icon[0], /\bfocusable="false"/iu, "Decorative icons must not receive focus.");
}

console.log(`Validated static site with ${catalog.channels.length} author pages.`);

