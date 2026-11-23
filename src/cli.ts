#!/usr/bin/env node
/**
 * CacheSmith CLI Interface
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import http from 'http';
import https from 'https';
import { CacheLinter } from './core/linter.js';
import { CacheKeyNormalizer } from './core/keyNormalizer.js';
import { StampedeSimulator } from './core/cache.js';
import { CacheProxy } from './proxy/cacheProxy.js';
import { MiddlewareGenerator } from './generators/middlewareGen.js';
import { StudioServer } from './studio/server.js';
import { FrameworkType } from './types.js';

const VERSION = '1.0.0';

function printBanner() {
  console.log(`
\x1b[36m   ______               __          ______           _  __     __  \x1b[0m
\x1b[36m  / ____/____ _ _____ / /_   ___  / ___/____ ___   (_)/ /_   / /_ \x1b[0m
\x1b[36m / /    / __ \`// ___// __ \\ / _ \\ \\__ \\/ __ \`__ \\ / // __/  / __ \\\x1b[0m
\x1b[36m/ /___ / /_/ // /__ / / / //  __/__/ // / / / / // // /_ _ / / / /\x1b[0m
\x1b[36m\\____/ \\__,_/ \\___//_/ /_/ \\___//____//_/ /_/ /_//_/ \\__/(_)/_/ /_/ \x1b[0m
\x1b[90m  v${VERSION} | Edge HTTP Cache Linter & Stampede Resilience Studio\x1b[0m
\x1b[90m  Architect: Jatin Sharma (https://jatinsh.netlify.app/)\x1b[0m
`);
}

function printHelp() {
  printBanner();
  console.log(`\x1b[1mUSAGE:\x1b[0m
  cachesmith <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  \x1b[32maudit <url>\x1b[0m              Inspect live HTTP headers & test against 16 RFC 9111 rules
  \x1b[32mstampede\x1b[0m                 Simulate 100 workers hitting expired cache (Naive vs XFetch)
  \x1b[32mnormalize <url>\x1b[0m          Strip tracking query params, sort keys, and compute SHA-256
  \x1b[32mproxy\x1b[0m                    Start zero-config HTTP caching reverse proxy (port 8086)
  \x1b[32mgenerate <framework>\x1b[0m     Generate hardened cache middleware (nextjs, express, fastify, etc.)
  \x1b[32mstudio\x1b[0m                   Launch the Bento Grid Web Studio on http://localhost:6969
  \x1b[32mversion\x1b[0m                  Print version number
  \x1b[32mhelp\x1b[0m                     Display this help message

\x1b[1mOPTIONS:\x1b[0m
  --port <num>             Port for proxy or studio (default: 8086 / 6969)
  --workers <num>          Number of concurrent workers for stampede test (default: 100)
  --ttl <sec>              TTL in seconds for code generation (default: 60)
  --swr <sec>              Stale-while-revalidate in seconds (default: 86400)
`);
}

async function handleAudit(args: string[]) {
  const urlArg = args.find((a) => a.startsWith('http://') || a.startsWith('https://'));
  if (!urlArg) {
    console.error('\x1b[31mError: Please provide a valid HTTP/HTTPS URL to audit.\x1b[0m');
    console.log('Example: cachesmith audit https://api.github.com');
    process.exit(1);
  }

  console.log(`\x1b[90mFetching headers from:\x1b[0m \x1b[36m${urlArg}\x1b[0m ...\n`);

  const client = urlArg.startsWith('https://') ? https : http;
  client.get(urlArg, (res) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) {
      if (v) headers[k] = Array.isArray(v) ? v.join(', ') : v;
    }

    const audit = CacheLinter.auditHeaders(headers, res.statusCode || 200, urlArg);

    console.log(`\x1b[1mSTATUS:\x1b[0m HTTP ${audit.statusCode}`);
    console.log(`\x1b[1mGRADE:\x1b[0m  \x1b[32m${audit.grade}\x1b[0m (Score: ${audit.score}/100)`);
    console.log(`\x1b[1mCDN OPTIMAL:\x1b[0m ${audit.isCdnOptimal ? '✔ Yes' : '✖ No'}\n`);

    console.log('\x1b[1m--- RFC 9111 HEURISTICS AUDIT ---\x1b[0m');
    if (audit.issues.length === 0) {
      console.log('\x1b[32m✔ Excellent! No caching heuristics violations found.\x1b[0m\n');
    } else {
      audit.issues.forEach((iss) => {
        const color = iss.severity === 'CRITICAL' ? '\x1b[31m' : iss.severity === 'HIGH' ? '\x1b[33m' : '\x1b[36m';
        console.log(`${color}[${iss.code}] ${iss.severity}:\x1b[0m ${iss.message}`);
        console.log(`  \x1b[90m↳ Recommendation: ${iss.recommendation}\x1b[0m\n`);
      });
    }

    console.log('\x1b[1m--- EXTRACTED DIRECTIVES ---\x1b[0m');
    console.log(`  Browser Max-Age: ${audit.summary.browserTtlSec ?? 'None'}s`);
    console.log(`  CDN s-maxage:    ${audit.summary.cdnTtlSec ?? 'None'}s`);
    console.log(`  SWR Window:      ${audit.summary.swrWindowSec ?? 'None'}s`);
    console.log(`  Vary Encoding:   ${audit.summary.hasVaryEncoding ? 'Yes' : 'No'}`);
    console.log(`  Validators:      ${audit.summary.hasETagOrLastModified ? 'ETag/Last-Modified Present' : 'Missing'}`);
  }).on('error', (err) => {
    console.error(`\x1b[31mFailed to connect to ${urlArg}: ${err.message}\x1b[0m`);
    process.exit(1);
  });
}

async function handleStampede(args: string[]) {
  const workersIdx = args.indexOf('--workers');
  const workers = workersIdx !== -1 && args[workersIdx + 1] ? parseInt(args[workersIdx + 1], 10) : 100;

  console.log(`\n\x1b[1mSimulating Cache Stampede with ${workers} concurrent requests...\x1b[0m\n`);

  console.log('Testing Naive Cache (Expired Key)...');
  const naive = await StampedeSimulator.run('naive', workers);

  console.log('Testing Mutex Singleflight...');
  const mutex = await StampedeSimulator.run('mutex-singleflight', workers);

  console.log('Testing XFetch Probabilistic Early Recomputation...');
  const xfetch = await StampedeSimulator.run('xfetch-probabilistic', workers);

  console.log('\n\x1b[1m=== STAMPEDE SIMULATION BENCHMARK RESULTS ===\x1b[0m\n');
  console.log(`\x1b[31m1. Naive Caching:\x1b[0m`);
  console.log(`   - Origin DB Hits:      ${naive.totalDbQueries} / ${workers} (${naive.stampedeSpikePercent}%)`);
  console.log(`   - Max Concurrent DB:   ${naive.maxConcurrentDbQueries}`);
  console.log(`   - P95 Latency:         ${naive.p95LatencyMs.toFixed(1)}ms`);

  console.log(`\n\x1b[33m2. Mutex Singleflight:\x1b[0m`);
  console.log(`   - Origin DB Hits:      ${mutex.totalDbQueries} / ${workers} (${mutex.stampedeSpikePercent}%)`);
  console.log(`   - Max Concurrent DB:   ${mutex.maxConcurrentDbQueries}`);
  console.log(`   - P95 Latency:         ${mutex.p95LatencyMs.toFixed(1)}ms`);

  console.log(`\n\x1b[32m3. XFetch Probabilistic:\x1b[0m`);
  console.log(`   - Origin DB Hits:      ${xfetch.totalDbQueries} / ${workers} (${xfetch.stampedeSpikePercent}%)`);
  console.log(`   - Max Concurrent DB:   ${xfetch.maxConcurrentDbQueries}`);
  console.log(`   - P95 Latency:         ${xfetch.p95LatencyMs.toFixed(1)}ms`);
  console.log(`   - DB Load Reduction:   \x1b[1m${(100 - (xfetch.totalDbQueries / naive.totalDbQueries * 100)).toFixed(1)}%\x1b[0m\n`);
}

function handleNormalize(args: string[]) {
  const urlArg = args.find((a) => !a.startsWith('--') && (a.includes('/') || a.includes('?')));
  if (!urlArg) {
    console.error('\x1b[31mError: Please provide a URL or query path to normalize.\x1b[0m');
    console.log('Example: cachesmith normalize "/api/items?utm_source=twitter&sort=desc&category=tech"');
    process.exit(1);
  }

  const result = CacheKeyNormalizer.normalize(urlArg);
  console.log('\n\x1b[1m=== CACHE KEY NORMALIZATION ===\x1b[0m\n');
  console.log(`\x1b[90mOriginal URL:\x1b[0m   ${result.originalUrl}`);
  console.log(`\x1b[32mNormalized URL:\x1b[0m ${result.normalizedUrl}`);
  console.log(`\x1b[36mSHA-256 Key:\x1b[0m    ${result.cacheKeySha256}`);
  console.log(`\x1b[33mStripped Params:\x1b[0m ${result.strippedTrackingParams.join(', ') || 'None'}`);
  console.log(`\x1b[1mCardinality Risk:\x1b[0m ${result.cardinalityRisk} (${result.explanation})\n`);
}

async function handleProxy(args: string[]) {
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : 8086;
  const proxy = new CacheProxy({ port });
  await proxy.start();
  printBanner();
  console.log(`\x1b[32m✔ CacheProxy listening on http://localhost:${port}\x1b[0m`);
  console.log(`  - Strategy: \x1b[36mxfetch-probabilistic\x1b[0m`);
  console.log(`  - Stats URL: http://localhost:${port}/__cachesmith/stats`);
  console.log('Press Ctrl+C to terminate.\n');
}

function handleGenerate(args: string[]) {
  const fw = (args[1] || 'nextjs').toLowerCase() as FrameworkType;
  const validFw: FrameworkType[] = ['nextjs', 'express', 'fastify', 'cloudflare', 'hono', 'fastapi'];
  if (!validFw.includes(fw)) {
    console.error(`\x1b[31mError: Unknown framework "${fw}". Valid: ${validFw.join(', ')}\x1b[0m`);
    process.exit(1);
  }

  const mw = MiddlewareGenerator.generate(fw, { ttlSeconds: 60, swrSeconds: 86400 });
  console.log(`\n\x1b[1m${mw.title}\x1b[0m (${mw.filename})\n`);
  console.log(`\x1b[90m# ${mw.instructions}\x1b[0m\n`);
  console.log(mw.code);
}

async function handleStudio(args: string[]) {
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : 6969;
  const studio = new StudioServer(port);
  await studio.start();
  printBanner();
  console.log(`\x1b[32m✔ CacheSmith Bento Grid Studio active!\x1b[0m`);
  console.log(`\x1b[1mOpen in browser:\x1b[0m \x1b[36mhttp://localhost:${port}\x1b[0m\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'audit':
      await handleAudit(args);
      break;
    case 'stampede':
      await handleStampede(args);
      break;
    case 'normalize':
      handleNormalize(args);
      break;
    case 'proxy':
      await handleProxy(args);
      break;
    case 'generate':
      handleGenerate(args);
      break;
    case 'studio':
      await handleStudio(args);
      break;
    case 'version':
    case '-v':
    case '--version':
      console.log(`v${VERSION}`);
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  console.error('\x1b[31mFatal error:\x1b[0m', err);
  process.exit(1);
});
