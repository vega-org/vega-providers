const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

// Load extractors and utilities
let providerContext;
try {
  const { getBaseUrl } = require("./dist/getBaseUrl.js");
  const { hubcloudExtracter } = require("./dist/hubcloudExtractor.js");
  const { gofileExtracter } = require("./dist/gofileExtracter.js");
  const { superVideoExtractor } = require("./dist/superVideoExtractor.js");
  const { gdFlixExtracter } = require("./dist/gdFlixExtractor.js");

  providerContext = {
    axios,
    cheerio,
    getBaseUrl,
    commonHeaders: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    extractors: {
      hubcloudExtracter,
      gofileExtracter,
      superVideoExtractor,
      gdFlixExtracter,
    },
    Crypto: {},
  };
} catch (error) {
  console.log(
    "⚠️  Could not load provider context. Run 'npm run build' first."
  );
  providerContext = null;
}

/**
 * Helper to pick random items from array
 */
function pickRandom(arr, count = 1) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return count === 1 ? shuffled[0] : shuffled.slice(0, count);
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Provider testing utility - Full integration test
 */
class ProviderTester {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.postsToTest = options.postsToTest || 2;
    this.linksToTest = options.linksToTest || 2;
    this.signal = new AbortController().signal;
    this.results = {};
  }

  /**
   * Load provider module
   */
  loadModule(providerName, moduleName) {
    try {
      const modulePath = `./dist/${providerName}/${moduleName}.js`;
      // Clear cache to get fresh module
      delete require.cache[require.resolve(modulePath)];
      return require(modulePath);
    } catch (error) {
      return null;
    }
  }

  /**
   * Load manifest to get enabled providers
   */
  loadManifest() {
    try {
      const manifestPath = path.join(__dirname, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        console.log("⚠️  manifest.json not found");
        return [];
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      return manifest;
    } catch (error) {
      console.log("⚠️  Failed to load manifest:", error.message);
      return [];
    }
  }

  /**
   * Get available providers from dist folder (excluding disabled ones)
   */
  getAvailableProviders() {
    const distPath = path.join(__dirname, "dist");
    if (!fs.existsSync(distPath)) {
      console.log("❌ dist folder not found. Run 'npm run build' first.");
      return [];
    }

    // Load manifest to check for disabled providers
    const manifest = this.loadManifest();
    const disabledProviders = manifest
      .filter((p) => p.disabled === true)
      .map((p) => p.value);

    if (disabledProviders.length > 0) {
      console.log(
        `\n⏭️  Skipping disabled providers: ${disabledProviders.join(", ")}`
      );
    }

    const providers = fs
      .readdirSync(distPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .filter((name) => {
        // Skip disabled providers
        if (disabledProviders.includes(name)) {
          return false;
        }
        // Check if it has required modules
        const hasRequired = [
          "catalog.js",
          "posts.js",
          "meta.js",
          "stream.js",
        ].every((file) => fs.existsSync(path.join(distPath, name, file)));
        return hasRequired;
      });

    return providers;
  }

  /**
   * Test a single provider with full flow
   */
  async testProvider(providerName) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🧪 Testing Provider: ${providerName}`);
    console.log("=".repeat(60));

    const result = {
      provider: providerName,
      catalog: { success: false, data: null, error: null },
      posts: { success: false, data: null, error: null },
      meta: { success: false, data: null, error: null },
      episodes: { success: false, data: null, error: null, skipped: false },
      stream: { success: false, data: null, error: null, skipped: false },
      summary: { passed: 0, failed: 0, skipped: 0 },
    };

    try {
      // Step 1: Load and test catalog
      console.log("\n📂 Step 1: Loading Catalog...");
      const catalogModule = this.loadModule(providerName, "catalog");
      if (!catalogModule) {
        throw new Error("Catalog module not found");
      }

      const catalog = catalogModule.catalog || [];
      // const genres = catalogModule.genres || [];
      const allFilters = [...catalog];

      if (allFilters.length === 0) {
        throw new Error("No filters found in catalog");
      }

      result.catalog.success = true;
      result.catalog.data = {
        catalogCount: catalog.length,
      };
      console.log(`   ✅ Found ${catalog.length} catalog items`);

      // Pick a random filter
      const randomFilter = pickRandom(allFilters);
      console.log(
        `   🎲 Selected random filter: "${randomFilter.title}" (${randomFilter.filter})`
      );

      // Step 2: Test getPosts with random filter
      console.log("\n📝 Step 2: Testing getPosts...");
      const postsModule = this.loadModule(providerName, "posts");
      if (!postsModule || !postsModule.getPosts) {
        throw new Error("getPosts function not found");
      }

      const posts = await postsModule.getPosts({
        filter: randomFilter.filter,
        page: 1,
        providerValue: providerName,
        signal: this.signal,
        providerContext,
      });

      if (!Array.isArray(posts) || posts.length === 0) {
        throw new Error("getPosts returned empty or invalid result");
      }

      result.posts.success = true;
      result.posts.data = { count: posts.length };
      console.log(`   ✅ Got ${posts.length} posts`);

      // Pick random posts to test
      const postsToTest = pickRandom(
        posts,
        Math.min(this.postsToTest, posts.length)
      );
      console.log(
        `   🎲 Selected ${postsToTest.length} random posts for meta testing`
      );

      // Step 3: Test getMeta with random posts
      console.log("\n📋 Step 3: Testing getMeta...");
      const metaModule = this.loadModule(providerName, "meta");
      if (!metaModule || !metaModule.getMeta) {
        throw new Error("getMeta function not found");
      }

      const metaResults = [];
      for (const post of postsToTest) {
        console.log(`\n   📌 Testing: "${post.title.substring(0, 50)}..."`);
        console.log(`      Link: ${post.link}`);

        try {
          await sleep(500); // Small delay between requests
          const meta = await metaModule.getMeta({
            link: post.link,
            providerContext,
          });

          if (!meta || !meta.linkList) {
            console.log(
              `      ⚠️  Meta returned but linkList is empty/missing`
            );
            continue;
          }

          metaResults.push({ post, meta });
          console.log(
            `      ✅ Got meta: type=${meta.type}, links=${meta.linkList.length}`
          );

          // Show link structure
          meta.linkList.forEach((link, i) => {
            const hasEpisodes = !!link.episodesLink;
            const hasDirectLinks =
              link.directLinks && link.directLinks.length > 0;
            console.log(
              `         [${i + 1}] ${link.title.substring(0, 30)} - ${
                hasEpisodes ? "📺 Episodes" : ""
              }${hasDirectLinks ? "🎬 Direct" : ""}`
            );
          });
        } catch (err) {
          console.log(`      ❌ Error: ${err.message}`);
        }
      }

      if (metaResults.length === 0) {
        throw new Error("No valid meta data retrieved");
      }

      result.meta.success = true;
      result.meta.data = { testedCount: metaResults.length };

      // Step 4: Test episodes OR stream based on meta content
      console.log("\n🔗 Step 4: Testing Episodes/Stream...");

      // Find links with episodes
      const episodeLinks = [];
      const directLinks = [];

      for (const { meta } of metaResults) {
        for (const link of meta.linkList) {
          if (link.episodesLink) {
            episodeLinks.push({ meta, link });
          }
          if (link.directLinks && link.directLinks.length > 0) {
            directLinks.push({ meta, link });
          }
        }
      }

      // Test episodes if available
      if (episodeLinks.length > 0) {
        console.log(`\n   📺 Found ${episodeLinks.length} episode links`);
        const episodesModule = this.loadModule(providerName, "episodes");

        if (episodesModule && episodesModule.getEpisodes) {
          const testEpisodeLink = pickRandom(episodeLinks);
          console.log(
            `   🎲 Testing episodes from: ${testEpisodeLink.link.title}`
          );
          console.log(`      URL: ${testEpisodeLink.link.episodesLink}`);

          try {
            const episodes = await episodesModule.getEpisodes({
              url: testEpisodeLink.link.episodesLink,
              providerContext,
            });

            if (Array.isArray(episodes) && episodes.length > 0) {
              result.episodes.success = true;
              result.episodes.data = { count: episodes.length };
              console.log(`      ✅ Got ${episodes.length} episodes`);

              // Show first few episodes
              episodes.slice(0, 3).forEach((ep, i) => {
                console.log(`         [${i + 1}] ${ep.title}`);
              });

              // Test stream with random episode
              console.log(`\n   🎬 Testing stream with random episode...`);
              const randomEpisode = pickRandom(episodes);
              console.log(`      Episode: ${randomEpisode.title}`);

              try {
                const streamModule = this.loadModule(providerName, "stream");
                if (streamModule && streamModule.getStream) {
                  const streams = await streamModule.getStream({
                    link: randomEpisode.link,
                    type: "series",
                    signal: this.signal,
                    providerContext,
                  });

                  if (Array.isArray(streams) && streams.length > 0) {
                    result.stream.success = true;
                    result.stream.data = {
                      count: streams.length,
                      type: "series",
                    };
                    console.log(`      ✅ Got ${streams.length} stream(s)`);
                    streams.forEach((s, i) => {
                      console.log(
                        `         [${i + 1}] ${s.server} - ${
                          s.quality || "unknown"
                        } quality`
                      );
                    });
                  } else {
                    console.log(`      ⚠️  No streams returned`);
                    result.stream.error = "No streams returned";
                  }
                }
              } catch (err) {
                console.log(`      ❌ Stream error: ${err.message}`);
                result.stream.error = err.message;
              }
            } else {
              console.log(`      ⚠️  No episodes returned`);
              result.episodes.error = "No episodes returned";
            }
          } catch (err) {
            console.log(`      ❌ Episodes error: ${err.message}`);
            result.episodes.error = err.message;
          }
        } else {
          console.log(`   ⚠️  getEpisodes function not found`);
          result.episodes.skipped = true;
          result.episodes.error = "Function not available";
        }
      } else {
        result.episodes.skipped = true;
        console.log(`   ℹ️  No episode links found, skipping episodes test`);
      }

      // Test direct links/stream if episodes not tested or no episode links
      if (directLinks.length > 0 && !result.stream.success) {
        console.log(`\n   🎬 Found ${directLinks.length} direct link entries`);

        const testDirectLink = pickRandom(directLinks);
        const linksToTest = pickRandom(
          testDirectLink.link.directLinks,
          Math.min(this.linksToTest, testDirectLink.link.directLinks.length)
        );

        console.log(
          `   🎲 Testing ${linksToTest.length} random direct link(s)`
        );

        const streamModule = this.loadModule(providerName, "stream");
        if (streamModule && streamModule.getStream) {
          for (const directLink of Array.isArray(linksToTest)
            ? linksToTest
            : [linksToTest]) {
            console.log(`\n      Testing: ${directLink.title}`);
            console.log(`      Link: ${directLink.link}`);

            try {
              await sleep(500);
              const streams = await streamModule.getStream({
                link: directLink.link,
                type: directLink.type || "movie",
                signal: this.signal,
                providerContext,
              });

              if (Array.isArray(streams) && streams.length > 0) {
                result.stream.success = true;
                result.stream.data = {
                  count: streams.length,
                  type: directLink.type || "movie",
                };
                console.log(`      ✅ Got ${streams.length} stream(s)`);
                streams.forEach((s, i) => {
                  console.log(
                    `         [${i + 1}] ${s.server} - ${
                      s.quality || "unknown"
                    } quality`
                  );
                });
                break; // One success is enough
              } else {
                console.log(`      ⚠️  No streams returned`);
              }
            } catch (err) {
              console.log(`      ❌ Stream error: ${err.message}`);
              result.stream.error = err.message;
            }
          }
        } else {
          console.log(`   ❌ getStream function not found`);
          result.stream.error = "Function not available";
        }
      } else if (
        !result.stream.success &&
        directLinks.length === 0 &&
        episodeLinks.length === 0
      ) {
        result.stream.skipped = true;
        console.log(`   ℹ️  No links to test stream with`);
      }
    } catch (error) {
      console.log(`\n❌ Test failed: ${error.message}`);

      // Determine which step failed
      if (!result.catalog.success) {
        result.catalog.error = error.message;
      } else if (!result.posts.success) {
        result.posts.error = error.message;
      } else if (!result.meta.success) {
        result.meta.error = error.message;
      }
    }

    // Calculate summary
    const steps = ["catalog", "posts", "meta", "episodes", "stream"];
    for (const step of steps) {
      if (result[step].success) {
        result.summary.passed++;
      } else if (result[step].skipped) {
        result.summary.skipped++;
      } else if (result[step].error) {
        result.summary.failed++;
      }
    }

    // Print summary
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📊 Provider Summary: ${providerName}`);
    console.log("─".repeat(60));
    console.log(`   ✅ Passed:  ${result.summary.passed}`);
    console.log(`   ❌ Failed:  ${result.summary.failed}`);
    console.log(`   ⏭️  Skipped: ${result.summary.skipped}`);

    // List which steps passed/failed/skipped
    console.log("\n   Step Results:");
    for (const step of steps) {
      if (result[step].success) {
        console.log(`      ✅ ${step}`);
      } else if (result[step].skipped) {
        console.log(`      ⏭️  ${step} (skipped)`);
      } else if (result[step].error) {
        console.log(`      ❌ ${step}: ${result[step].error}`);
      } else {
        console.log(`      ⚪ ${step} (not tested)`);
      }
    }

    const statusIcon = result.summary.failed === 0 ? "✅" : "❌";
    console.log(
      `\n   ${statusIcon} Overall: ${
        result.summary.failed === 0 ? "PASSED" : "FAILED"
      }`
    );

    return result;
  }

  /**
   * Test all providers
   */
  async testAllProviders() {
    console.log("🚀 Starting comprehensive provider tests...\n");

    if (!providerContext) {
      console.log("❌ Provider context not loaded. Run 'npm run build' first.");
      return null;
    }

    const providers = this.getAvailableProviders();
    if (providers.length === 0) {
      console.log("❌ No providers found.");
      return null;
    }

    console.log(`📦 Found ${providers.length} providers to test:`);
    providers.forEach((p) => console.log(`   • ${p}`));

    const results = {};
    let passed = 0;
    let failed = 0;

    for (const provider of providers) {
      try {
        results[provider] = await this.testProvider(provider);
        if (results[provider].summary.failed === 0) {
          passed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.log(
          `\n❌ Critical error testing ${provider}: ${error.message}`
        );
        failed++;
        results[provider] = { error: error.message };
      }

      // Small delay between providers
      await sleep(1000);
    }

    // Final summary
    console.log(`\n${"═".repeat(60)}`);
    console.log("📊 FINAL TEST SUMMARY");
    console.log("═".repeat(60));
    console.log(`   Total Providers: ${providers.length}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);

    // List failed providers with details
    if (failed > 0) {
      console.log(`\n${"─".repeat(60)}`);
      console.log("❌ FAILED PROVIDERS:");
      console.log("─".repeat(60));

      for (const [name, result] of Object.entries(results)) {
        if (result.error) {
          // Critical error
          console.log(`\n   ❌ ${name}`);
          console.log(`      Error: ${result.error}`);
        } else if (result.summary?.failed > 0) {
          // Step failures
          console.log(`\n   ❌ ${name}`);
          const steps = ["catalog", "posts", "meta", "episodes", "stream"];
          for (const step of steps) {
            if (result[step]?.error && !result[step]?.skipped) {
              console.log(`      • ${step}: ${result[step].error}`);
            }
          }
        }
      }
    }

    // List passed providers
    if (passed > 0) {
      console.log(`\n${"─".repeat(60)}`);
      console.log("✅ PASSED PROVIDERS:");
      console.log("─".repeat(60));
      const passedProviders = Object.entries(results)
        .filter(([_, result]) => result.summary?.failed === 0 && !result.error)
        .map(([name]) => name);
      console.log(`   ${passedProviders.join(", ")}`);
    }

    console.log(`\n${"═".repeat(60)}`);

    return results;
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  const providerName = args[0];

  // Check for options
  const postsToTest =
    parseInt(args.find((a) => a.startsWith("--posts="))?.split("=")[1]) || 2;
  const linksToTest =
    parseInt(args.find((a) => a.startsWith("--links="))?.split("=")[1]) || 2;

  const tester = new ProviderTester({ postsToTest, linksToTest });

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🎯 Vega Providers Integration Tester
=====================================

Usage: node test-providers.js [provider] [options]

Arguments:
  provider          Name of specific provider to test (optional)
                    If not provided, tests all providers

Options:
  --posts=N         Number of random posts to test (default: 2)
  --links=N         Number of random direct links to test (default: 2)
  --help, -h        Show this help message

Test Flow:
  1. Load catalog → pick random filter
  2. Call getPosts with filter
  3. Pick random posts → call getMeta
  4. If episodesLink → call getEpisodes → getStream
  5. If directLinks → call getStream

Examples:
  node test-providers.js                    # Test all providers
  node test-providers.js vega               # Test only vega provider
  node test-providers.js mod --posts=3      # Test mod with 3 random posts
  node test-providers.js --posts=1 --links=1 # Quick test all providers
    `);
    return;
  }

  if (providerName && !providerName.startsWith("--")) {
    await tester.testProvider(providerName);
  } else {
    await tester.testAllProviders();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ProviderTester;
