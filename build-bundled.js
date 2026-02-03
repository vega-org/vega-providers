const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { minify } = require("terser");

const SKIP_MINIFY = process.env.SKIP_MINIFY === "true";

// Find all provider directories
const providersDir = path.join(__dirname, "providers");
const providerDirs = fs
  .readdirSync(providersDir, { withFileTypes: true })
  .filter(
    (dirent) =>
      dirent.isDirectory() &&
      !dirent.name.startsWith(".") &&
      dirent.name !== "extractors",
  )
  .map((dirent) => dirent.name);

console.log(`Found ${providerDirs.length} providers to build`);

async function buildProvider(providerName) {
  const providerPath = path.join(providersDir, providerName);
  const distPath = path.join(__dirname, "dist", providerName);

  // Create dist directory
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
  }

  const modules = ["catalog", "posts", "meta", "stream", "episodes"];
  const results = [];

  for (const moduleName of modules) {
    const modulePath = path.join(providerPath, `${moduleName}.ts`);

    if (!fs.existsSync(modulePath)) {
      continue;
    }

    try {
      // Use esbuild to bundle the module
      const result = await esbuild.build({
        entryPoints: [modulePath],
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "es2015",
        write: false,
        external: [],
        minify: false,
        keepNames: true,
        treeShaking: true,
        outfile: `${moduleName}.js`,
      });

      let code = result.outputFiles[0].text;

      // Post-process the code for React Native compatibility
      // Remove require statements for built-in modules that aren't available
      code = code.replace(/require\(['"]node:.*?['"]\)/g, "{}");

      const exportMatch = code.match(/__export\((\w+),\s*\{([^}]+)\}\);/);

      if (exportMatch) {
        const exportsVar = exportMatch[1];
        const exportsContent = exportMatch[2];

        // Parse the export entries like "funcName: () => funcName"
        const exportEntries = exportsContent
          .split(",")
          .map((entry) => {
            const match = entry.trim().match(/(\w+):\s*\(\)\s*=>\s*(\w+)/);
            return match ? match[1] : null;
          })
          .filter(Boolean);

        // Replace module.exports pattern
        code = code.replace(
          /module\.exports\s*=\s*__toCommonJS\((\w+)\);/g,
          "",
        );

        // Add direct exports assignments at the end
        const directExports = exportEntries
          .map((name) => `exports.${name} = ${name};`)
          .join("\n");

        // Add the exports before the final comment
        code = code.replace(
          /\/\/ Annotate the CommonJS export names for ESM import in node:/,
          `${directExports}\n// Annotate the CommonJS export names for ESM import in node:`,
        );
      }

      // Also handle the "0 && (module.exports = {...})" pattern at the end
      code = code.replace(
        /0\s*&&\s*\(module\.exports\s*=\s*\{[^}]*\}\);?/g,
        "",
      );

      // Minify if not skipped
      if (!SKIP_MINIFY) {
        const minified = await minify(code, {
          compress: {
            drop_console: true,
            passes: 2,
          },
          mangle: {
            keep_fnames: false,
          },
          format: {
            comments: false,
          },
        });

        if (minified.code) {
          code = minified.code;
        }
      }

      // Write the output
      const outputPath = path.join(distPath, `${moduleName}.js`);
      fs.writeFileSync(outputPath, code);

      results.push({
        moduleName,
        size: code.length,
      });

      console.log(
        `✓ ${providerName}/${moduleName}.js (${(code.length / 1024).toFixed(1)}kb)`,
      );
    } catch (error) {
      console.error(
        `✗ Error building ${providerName}/${moduleName}:`,
        error.message,
      );
    }
  }

  return { providerName, modules: results };
}

async function buildAll() {
  const startTime = Date.now();
  console.log(
    `Building providers${SKIP_MINIFY ? " (without minification)" : ""}...\n`,
  );

  // Clear dist directory
  const distDir = path.join(__dirname, "dist");
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  // Build all providers
  const results = await Promise.all(providerDirs.map(buildProvider));

  const totalModules = results.reduce((sum, r) => sum + r.modules.length, 0);
  const totalSize = results.reduce(
    (sum, r) => sum + r.modules.reduce((s, m) => s + m.size, 0),
    0,
  );

  const endTime = Date.now();
  console.log(
    `\n✓ Built ${totalModules} modules from ${providerDirs.length} providers in ${((endTime - startTime) / 1000).toFixed(2)}s`,
  );
  console.log(`  Total size: ${(totalSize / 1024).toFixed(1)}kb`);
}

buildAll().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
