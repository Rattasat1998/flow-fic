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
    jsEntryKeys: ['[project]/src/components/home/HomePageClient.tsx'],
    cssEntryKeys: ['[project]/src/app/page'],
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
    jsEntryKeys: ['[project]/src/app/story/[id]/StoryDetailsClient.tsx'],
    cssEntryKeys: ['[project]/src/app/story/[id]/page'],
    entryKeys: ['[project]/src/app/story/[id]/page'],
    jsBudgetBytes: 310 * 1024,
    cssBudgetBytes: 154 * 1024,
  },
  {
    label: '/story/[id]/read',
    manifestPath: '.next/server/app/story/[id]/read/page_client-reference-manifest.js',
    jsEntryKeys: ['[project]/src/app/story/[id]/read/page.tsx'],
    cssEntryKeys: ['[project]/src/app/story/[id]/read/page'],
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

  return {
    manifest: manifestByPath[routeKey],
    routeKey,
  };
}

function asArray(value) {
  if (!Array.isArray(value)) return [];
  return value;
}

function normalizeCssEntries(entries) {
  return entries.map((entry) => (typeof entry === 'string' ? entry : entry?.path)).filter(Boolean);
}

function normalizeJsEntries(entries) {
  return entries.filter((entry) => typeof entry === 'string' && entry.includes('.js'));
}

function toPosix(value) {
  return String(value).replace(/\\/g, '/');
}

function resolveProjectAlias(value) {
  const normalized = toPosix(value).trim();
  if (normalized === '[project]') return toPosix(PROJECT_ROOT);
  if (normalized.startsWith('[project]/')) {
    return `${toPosix(PROJECT_ROOT)}/${normalized.slice('[project]/'.length)}`;
  }

  return normalized;
}

function stripQuery(value) {
  const index = value.indexOf('?');
  return index === -1 ? value : value.slice(0, index);
}

function stripKnownExtension(value) {
  return value.replace(/\.(?:tsx?|jsx?|mjs|cjs)$/, '');
}

function keyMatches(candidateKey, availableKey) {
  const candidateResolved = resolveProjectAlias(candidateKey);
  const availableResolved = resolveProjectAlias(availableKey);
  if (candidateResolved === availableResolved) return true;
  if (availableResolved.startsWith(`${candidateResolved}?`) || candidateResolved.startsWith(`${availableResolved}?`)) {
    return true;
  }

  const candidateBase = stripKnownExtension(stripQuery(candidateResolved));
  const availableBase = stripKnownExtension(stripQuery(availableResolved));
  return candidateBase === availableBase;
}

function findManifestKey(availableKeys, candidateKeys) {
  for (const candidate of candidateKeys) {
    const match = availableKeys.find((available) => keyMatches(candidate, available));
    if (match) return match;
  }

  return null;
}

function buildRouteEntryCandidates(routeKey) {
  const normalizedRouteKey = toPosix(routeKey || '');
  const routeBase = `[project]/src/app${normalizedRouteKey}`;
  return [
    routeBase,
    `${routeBase}.tsx`,
    `${routeBase}.ts`,
    `${routeBase}.jsx`,
    `${routeBase}.js`,
  ];
}

function getRouteDirectoryAbs(routeKey) {
  const normalizedRouteKey = toPosix(routeKey || '');
  if (!normalizedRouteKey || normalizedRouteKey === '/page') return null;

  const routeWithoutPage = normalizedRouteKey.replace(/\/page$/, '');
  if (!routeWithoutPage) return null;

  return `${toPosix(PROJECT_ROOT)}/src/app${routeWithoutPage}`;
}

function pickRouteScopedClientModule(manifest, routeKey) {
  const routeDirectory = getRouteDirectoryAbs(routeKey);
  if (!routeDirectory) return null;

  const modules = manifest.clientModules || {};
  const scopedCandidates = Object.keys(modules)
    .filter((moduleKey) => resolveProjectAlias(moduleKey).startsWith(`${routeDirectory}/`))
    .map((moduleKey) => ({
      moduleKey,
      chunkCount: normalizeJsEntries(asArray(modules[moduleKey]?.chunks)).length,
    }))
    .filter((entry) => entry.chunkCount > 0)
    .sort((a, b) => b.chunkCount - a.chunkCount);

  return scopedCandidates[0]?.moduleKey || null;
}

function resolveJsAssets(manifest, routeKey, candidateKeys) {
  const entryJSFiles = manifest.entryJSFiles;
  if (entryJSFiles && typeof entryJSFiles === 'object') {
    const matchedEntryKey = findManifestKey(Object.keys(entryJSFiles), candidateKeys);
    if (matchedEntryKey) {
      return {
        source: 'entryJSFiles',
        matchedKey: matchedEntryKey,
        assets: normalizeJsEntries(asArray(entryJSFiles[matchedEntryKey])),
      };
    }
  }

  const clientModules = manifest.clientModules || {};
  const clientModuleKeys = Object.keys(clientModules);
  let matchedClientModuleKey = findManifestKey(clientModuleKeys, candidateKeys);

  if (!matchedClientModuleKey) {
    matchedClientModuleKey = pickRouteScopedClientModule(manifest, routeKey);
  }

  if (!matchedClientModuleKey) {
    return {
      source: 'clientModules',
      matchedKey: null,
      assets: [],
    };
  }

  return {
    source: 'clientModules',
    matchedKey: matchedClientModuleKey,
    assets: normalizeJsEntries(asArray(clientModules[matchedClientModuleKey]?.chunks)),
  };
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
  const { manifest, routeKey } = readRouteManifest(path.join(PROJECT_ROOT, config.manifestPath));
  const routeEntryCandidates = buildRouteEntryCandidates(routeKey);
  const jsCandidateKeys = [
    ...(config.jsEntryKeys || []),
    ...(config.entryKeys || []),
    ...routeEntryCandidates,
  ];
  const cssCandidateKeys = [
    ...(config.cssEntryKeys || []),
    ...(config.entryKeys || []),
    ...routeEntryCandidates,
  ];

  const entryCssFilesByKey = manifest.entryCSSFiles || {};
  const selectedCssEntryKey = findManifestKey(Object.keys(entryCssFilesByKey), cssCandidateKeys);
  if (!selectedCssEntryKey) {
    throw new Error(
      `CSS entry key not found for ${config.label} in ${config.manifestPath}.` +
      ` Checked keys: ${cssCandidateKeys.join(', ')}`
    );
  }

  const jsResolution = resolveJsAssets(manifest, routeKey, jsCandidateKeys);
  if (!jsResolution.matchedKey) {
    throw new Error(
      `JS entry key not found for ${config.label} in ${config.manifestPath}.` +
      ` Checked keys: ${jsCandidateKeys.join(', ')}`
    );
  }

  const entryJsFiles = jsResolution.assets;
  const entryCssFiles = normalizeCssEntries(asArray(entryCssFilesByKey[selectedCssEntryKey]));

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
