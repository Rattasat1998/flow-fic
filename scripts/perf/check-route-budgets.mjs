import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PROJECT_ROOT = process.cwd();

// Baseline from optimized build snapshot (2026-03-27):
// /                JS 411.1KB, CSS 117.4KB
// /story/[id]      JS 295.4KB, CSS 145.4KB
// /story/[id]/read JS 418.4KB, CSS 147.7KB
// Budgets keep route-level guardrails with limited headroom above measured baseline.
const ROUTE_BUDGETS = [
  {
    label: '/',
    manifestPath: '.next/server/app/page_client-reference-manifest.js',
    entryKeys: [
      '[project]/src/components/home/HomePageClient.tsx',
      '[project]/src/app/page',
    ],
    jsBudgetBytes: 432 * 1024,
    cssBudgetBytes: 124 * 1024,
  },
  {
    label: '/story/[id]',
    manifestPath: '.next/server/app/story/[id]/page_client-reference-manifest.js',
    entryKeys: ['[project]/src/app/story/[id]/page'],
    jsBudgetBytes: 310 * 1024,
    cssBudgetBytes: 154 * 1024,
  },
  {
    label: '/story/[id]/read',
    manifestPath: '.next/server/app/story/[id]/read/page_client-reference-manifest.js',
    entryKeys: ['[project]/src/app/story/[id]/read/page'],
    jsBudgetBytes: 460 * 1024,
    cssBudgetBytes: 156 * 1024,
  },
];

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function readRouteManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}. Run "npm run build" first.`);
  }

  const source = fs.readFileSync(manifestPath, 'utf8');
  const sandbox = { globalThis: {} };
  vm.runInNewContext(source, sandbox);

  const manifestByPath = sandbox.globalThis.__RSC_MANIFEST;
  if (!manifestByPath || typeof manifestByPath !== 'object') {
    throw new Error(`Invalid RSC manifest format: ${manifestPath}`);
  }

  const routeKey = Object.keys(manifestByPath)[0];
  if (!routeKey || !manifestByPath[routeKey]) {
    throw new Error(`No route key found in manifest: ${manifestPath}`);
  }

  return manifestByPath[routeKey];
}

function asArray(value) {
  if (!Array.isArray(value)) return [];
  return value;
}

function normalizeCssEntries(entries) {
  return entries.map((entry) => (typeof entry === 'string' ? entry : entry?.path)).filter(Boolean);
}

function sumAssetBytes(assetPaths) {
  const uniquePaths = [...new Set(assetPaths)];
  let totalBytes = 0;

  uniquePaths.forEach((assetPath) => {
    const relative = String(assetPath).replace(/^\/+/, '');
    const absolutePath = path.join(PROJECT_ROOT, '.next', relative);
    if (!fs.existsSync(absolutePath)) return;
    totalBytes += fs.statSync(absolutePath).size;
  });

  return totalBytes;
}

function evaluateRouteBudget(config) {
  const manifest = readRouteManifest(path.join(PROJECT_ROOT, config.manifestPath));
  const selectedEntryKey = config.entryKeys.find((key) => {
    return (manifest.entryJSFiles && key in manifest.entryJSFiles)
      || (manifest.entryCSSFiles && key in manifest.entryCSSFiles);
  });

  if (!selectedEntryKey) {
    throw new Error(
      `Entry key not found for ${config.label} in ${config.manifestPath}.` +
      ` Checked keys: ${config.entryKeys.join(', ')}`
    );
  }

  const entryJsFiles = asArray(manifest.entryJSFiles?.[selectedEntryKey]);
  const entryCssFiles = normalizeCssEntries(asArray(manifest.entryCSSFiles?.[selectedEntryKey]));

  const jsBytes = sumAssetBytes(entryJsFiles);
  const cssBytes = sumAssetBytes(entryCssFiles);

  return {
    ...config,
    jsBytes,
    cssBytes,
    jsPass: jsBytes <= config.jsBudgetBytes,
    cssPass: cssBytes <= config.cssBudgetBytes,
  };
}

function printResult(result) {
  const jsStatus = result.jsPass ? 'PASS' : 'FAIL';
  const cssStatus = result.cssPass ? 'PASS' : 'FAIL';

  console.log(
    `${result.label} | JS ${formatKb(result.jsBytes)} / ${formatKb(result.jsBudgetBytes)} (${jsStatus})` +
    ` | CSS ${formatKb(result.cssBytes)} / ${formatKb(result.cssBudgetBytes)} (${cssStatus})`
  );
}

try {
  const results = ROUTE_BUDGETS.map(evaluateRouteBudget);
  results.forEach(printResult);

  const hasFailure = results.some((result) => !result.jsPass || !result.cssPass);
  if (hasFailure) {
    console.error('\nRoute bundle budget check failed.');
    process.exit(1);
  }

  console.log('\nRoute bundle budget check passed.');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Route bundle budget check could not run: ${message}`);
  process.exit(1);
}
