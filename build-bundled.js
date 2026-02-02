const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { minify } = require("terser");

// Build configuration
const PROVIDERS_DIR = "./providers";
const DIST_DIR = "./dist";
const TEMP_DIR = "./temp-build";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  build: (msg) => console.log(`${colors.magenta}🔨${colors.reset} ${msg}`),
  file: (msg) => console.log(`${colors.cyan}📄${colors.reset} ${msg}`),
};

/**
 * Bundled provider builder - creates self-contained JS files without imports
 */
class BundledProviderBuilder {
  constructor() {
    this.startTime = Date.now();
    this.providers = [];
  }

  /**
   * Clean the dist and temp directories
   */
  cleanDirs() {
    if (fs.existsSync(DIST_DIR)) {
      fs.rmSync(DIST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(DIST_DIR, { recursive: true });

    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  /**
   * Discover all provider directories (excluding extractors and utility files)
   */
  discoverProviders() {
    const items = fs.readdirSync(PROVIDERS_DIR, { withFileTypes: true });
    const excludeDirs = ["extractors", "extractors copy"];

    this.providers = items
      .filter((item) => item.isDirectory())
      .filter((item) => !item.name.startsWith("."))
      .filter((item) => !excludeDirs.includes(item.name))
      .map((item) => item.name);

    log.info(
      `Found ${this.providers.length} providers: ${this.providers.join(", ")}`,
    );
  }

  /**
   * Compile TypeScript to JavaScript first
   */
  compileTypeScript() {
    log.build("Compiling TypeScript files...");

    try {
      execSync("npx tsc", {
        stdio: "pipe",
        encoding: "utf8",
      });
      return true;
    } catch (error) {
      log.error("TypeScript compilation failed:");
      if (error.stdout) console.log(error.stdout);
      if (error.stderr) console.log(error.stderr);
      return false;
    }
  }

  /**
   * Bundle each provider module to be self-contained
   * This inlines all imports from extractors into the provider files
   */
  bundleProviders() {
    log.build("Bundling provider modules...");

    for (const provider of this.providers) {
      const providerDistDir = path.join(DIST_DIR, provider);

      if (!fs.existsSync(providerDistDir)) {
        continue;
      }

      const files = [
        "stream.js",
        "catalog.js",
        "posts.js",
        "meta.js",
        "episodes.js",
      ];

      for (const file of files) {
        const filePath = path.join(providerDistDir, file);
        if (fs.existsSync(filePath)) {
          this.bundleFile(filePath, provider);
        }
      }
    }
  }

  /**
   * Bundle a single file by inlining all local imports
   */
  bundleFile(filePath, provider) {
    let content = fs.readFileSync(filePath, "utf8");

    // Find all require statements - both destructuring and non-destructuring patterns
    // Pattern 1: const { x, y } = require("path")
    const destructuringRegex =
      /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\);?/g;
    // Pattern 2: const hubcloud_1 = require("path")
    const simpleRequireRegex =
      /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\);?/g;

    const imports = [];
    let match;

    while ((match = destructuringRegex.exec(content)) !== null) {
      imports.push({
        full: match[0],
        names: match[1],
        varName: null,
        path: match[2],
        isDestructuring: true,
      });
    }

    while ((match = simpleRequireRegex.exec(content)) !== null) {
      // Skip if already matched by destructuring regex
      if (imports.some((i) => i.full === match[0])) continue;
      imports.push({
        full: match[0],
        names: null,
        varName: match[1],
        path: match[2],
        isDestructuring: false,
      });
    }

    // Process each import
    for (const imp of imports) {
      // Skip external modules (axios, cheerio, etc.) - they come from context
      if (!imp.path.startsWith(".") && !imp.path.startsWith("/")) {
        // Remove the require statement for external modules
        content = content.replace(imp.full, `// External: ${imp.path}`);
        continue;
      }

      // Resolve the import path
      const importDir = path.dirname(filePath);
      let resolvedPath = path.resolve(importDir, imp.path);

      // Add .js extension if needed
      if (!resolvedPath.endsWith(".js")) {
        resolvedPath += ".js";
      }

      if (fs.existsSync(resolvedPath)) {
        // Read the imported file
        let importedContent = fs.readFileSync(resolvedPath, "utf8");

        // Remove exports.X = X pattern and just keep the functions
        importedContent = importedContent.replace(
          /exports\.\w+\s*=\s*\w+;?/g,
          "",
        );

        // Remove Object.defineProperty exports
        importedContent = importedContent.replace(
          /Object\.defineProperty\(exports,\s*"__esModule"[^;]+;/g,
          "",
        );

        // Remove require statements from imported file too (they use context)
        importedContent = importedContent.replace(
          /(?:const|let|var)\s+\{[^}]+\}\s*=\s*require\s*\(\s*["'][^"']+["']\s*\);?/g,
          "",
        );
        importedContent = importedContent.replace(
          /(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*["'][^"']+["']\s*\);?/g,
          "",
        );

        // Clean up the content
        importedContent = importedContent.replace(/"use strict";?/g, "");

        // Check if this is an extractor file
        if (
          imp.path.includes("extractor") ||
          resolvedPath.includes("extractor")
        ) {
          // Insert the extractor function at the top of the file
          content = content.replace(
            imp.full,
            `// Inlined from: ${imp.path}\n${importedContent.trim()}`,
          );

          // For non-destructuring imports, we need to replace function calls
          // TypeScript outputs: (0, hubcloud_1.hubcloudExtractor)(...)
          // We need to replace with just: hubcloudExtractor(...)
          if (!imp.isDestructuring && imp.varName) {
            // Find the exported function name - look for exports.funcName or function funcNameExtractor
            // The exports pattern looks like: exports.hubcloudExtractor = hubcloudExtractor;
            const exportsMatch = importedContent.match(
              /exports\.(\w+Extractor)\s*=/,
            );
            // Also try matching the function definition directly
            const funcDefMatch = importedContent.match(
              /function\s+(\w+Extractor)\s*\(/,
            );
            const funcName = exportsMatch?.[1] || funcDefMatch?.[1];

            if (funcName) {
              // Replace (0, varName.funcName) or (0,varName.funcName) with just funcName
              const callPattern = new RegExp(
                `\\(0,\\s*${imp.varName}\\.${funcName}\\)`,
                "g",
              );
              content = content.replace(callPattern, funcName);
              // Also replace varName.funcName (without the (0, ) wrapper)
              const simpleCallPattern = new RegExp(
                `${imp.varName}\\.${funcName}`,
                "g",
              );
              content = content.replace(simpleCallPattern, funcName);
            }
          }
        } else if (imp.path.includes("types")) {
          // Types are not needed at runtime, just remove the import
          content = content.replace(imp.full, `// Types removed: ${imp.path}`);
        } else {
          // Other local imports - inline them
          content = content.replace(
            imp.full,
            `// Inlined from: ${imp.path}\n${importedContent.trim()}`,
          );
        }
      } else {
        // File doesn't exist, comment out the import
        content = content.replace(imp.full, `// Not found: ${imp.path}`);
      }
    }

    // Clean up the content
    content = content.replace(/"use strict";?/g, "");
    content = content.replace(
      /Object\.defineProperty\(exports,\s*"__esModule"[^;]+;/g,
      "",
    );

    // Write the bundled file
    fs.writeFileSync(filePath, content);
  }

  /**
   * Minify all JavaScript files
   */
  async minifyFiles() {
    const keepConsole = process.env.KEEP_CONSOLE === "true";
    log.build(
      `Minifying JavaScript files... ${
        keepConsole ? "(keeping console logs)" : "(removing console logs)"
      }`,
    );

    const minifyFile = async (filePath) => {
      try {
        const code = fs.readFileSync(filePath, "utf8");
        const result = await minify(code, {
          compress: {
            drop_console: !keepConsole,
            drop_debugger: true,
            pure_funcs: keepConsole
              ? ["console.debug"]
              : [
                  "console.debug",
                  "console.log",
                  "console.info",
                  "console.warn",
                ],
          },
          mangle: false,
          format: {
            comments: false,
          },
        });

        if (result.code) {
          fs.writeFileSync(filePath, result.code);
          return true;
        }
        return false;
      } catch (error) {
        log.error(`Error minifying ${filePath}: ${error.message}`);
        return false;
      }
    };

    const findJsFiles = (dir) => {
      const files = [];
      if (!fs.existsSync(dir)) return files;

      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          files.push(...findJsFiles(fullPath));
        } else if (item.isFile() && item.name.endsWith(".js")) {
          files.push(fullPath);
        }
      }
      return files;
    };

    const jsFiles = findJsFiles(DIST_DIR);
    let minifiedCount = 0;
    let totalSizeBefore = 0;
    let totalSizeAfter = 0;

    for (const filePath of jsFiles) {
      const statsBefore = fs.statSync(filePath);
      totalSizeBefore += statsBefore.size;

      const success = await minifyFile(filePath);
      if (success) {
        const statsAfter = fs.statSync(filePath);
        totalSizeAfter += statsAfter.size;
        minifiedCount++;
      }
    }

    const compressionRatio =
      totalSizeBefore > 0
        ? (
            ((totalSizeBefore - totalSizeAfter) / totalSizeBefore) *
            100
          ).toFixed(1)
        : 0;

    log.success(
      `Minified ${minifiedCount}/${jsFiles.length} files. ` +
        `Size reduced by ${compressionRatio}% (${totalSizeBefore} → ${totalSizeAfter} bytes)`,
    );
  }

  /**
   * Clean up temp directory
   */
  cleanup() {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  }

  /**
   * Build everything
   */
  async build() {
    const isWatchMode = process.env.NODE_ENV === "development";

    if (isWatchMode) {
      console.log(
        `\n${colors.cyan}🔄 Auto-build triggered${colors.reset} ${new Date().toLocaleTimeString()}`,
      );
    } else {
      console.log(
        `\n${colors.bright}🚀 Starting bundled provider build...${colors.reset}\n`,
      );
    }

    this.cleanDirs();
    this.discoverProviders();

    const compiled = this.compileTypeScript();
    if (!compiled) {
      log.error("Build failed due to compilation errors");
      process.exit(1);
    }

    this.bundleProviders();

    if (!process.env.SKIP_MINIFY) {
      await this.minifyFiles();
    } else {
      log.info("Skipping minification (SKIP_MINIFY=true)");
    }

    this.cleanup();

    const buildTime = Date.now() - this.startTime;
    log.success(`Build completed in ${buildTime}ms`);

    if (isWatchMode) {
      console.log(`${colors.green}👀 Watching for changes...${colors.reset}\n`);
    } else {
      console.log(
        `${colors.bright}✨ Build completed successfully!${colors.reset}\n`,
      );
    }
  }
}

// Run the build
const builder = new BundledProviderBuilder();
builder.build().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
