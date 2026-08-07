const fullRefreshDefaults = {
  DISCOVERY_MAX_CHECKS: "all",
  RECHECK_ALL: "1",
  MAX_NEW_CHANNELS: "200",
  BOOSTY_SEARCH_MAX_PAGES: "5",
  BOOSTY_SEARCH_MAX_QUERIES: "75",
  BOOSTY_SEARCH_PAGE_SIZE: "40",
  COMMON_CRAWL_MAX_PAGES: "10",
};

for (const [name, value] of Object.entries(fullRefreshDefaults)) {
  if (!process.env[name]) process.env[name] = value;
}

await import("./update-data.mjs");
