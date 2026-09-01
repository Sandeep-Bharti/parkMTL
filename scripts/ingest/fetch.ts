/**
 * Download every upstream dataset into `data/raw/`, transcoded to UTF-8.
 *
 *   node --experimental-strip-types scripts/ingest/fetch.ts [--force]
 *
 * Two upstream quirks are handled here so that nothing downstream has to:
 *
 *  - The Agence de mobilité durable serves Windows-1252, not UTF-8. Read as
 *    UTF-8 the street names mojibake ("Régulier" -> "R�gulier").
 *  - donnees.montreal.ca answers a default client with `RBAC: access denied`;
 *    it requires a browser User-Agent.
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAW_DIR = fileURLToPath(new URL('../../data/raw/', import.meta.url));

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface Source {
  name: string;
  url: string;
  /** Character set to decode from. AMD publishes Windows-1252. */
  encoding: 'utf-8' | 'windows-1252';
  /** Send a browser User-Agent (required by the city portal). */
  browserUa?: boolean;
}

const AMD_BASE = 'https://www.agencemobilitedurable.ca/images/data';
const MTL_BASE =
  'https://donnees.montreal.ca/dataset/8ac6dd33-b0d3-4eab-a334-5a6283eb7940/resource';

export const SOURCES: Source[] = [
  // Agence de mobilité durable — paid parking. CC-BY 4.0.
  ...[
    'DateExportation',
    'Places',
    'Reglementations',
    'EmplacementReglementation',
    'ReglementationPeriode',
    'Periodes',
    'BornesSurRue',
    'BornesHorsRue',
  ].map((name): Source => ({
    name: `${name}.csv`,
    url: `${AMD_BASE}/${name}.csv`,
    encoding: 'windows-1252',
  })),

  // Ville de Montréal — on-street signage. CC-BY 4.0, refreshed daily.
  {
    name: 'signalisation_stationnement.csv',
    url: `${MTL_BASE}/7f1d4ae9-1a12-46d7-953e-6b9c18c78680/download/signalisation_stationnement.csv`,
    encoding: 'utf-8',
    browserUa: true,
  },
  {
    name: 'signalisation-codification-rpa.csv',
    url: `${MTL_BASE}/1baac760-4311-4b4f-8996-db93d348cc24/download/signalisation-codification-rpa.csv`,
    encoding: 'utf-8',
    browserUa: true,
  },
];

async function download(source: Source): Promise<void> {
  const target = `${RAW_DIR}${source.name}`;

  const response = await fetch(source.url, {
    headers: source.browserUa ? { 'User-Agent': BROWSER_UA } : {},
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`${source.name}: HTTP ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const text = new TextDecoder(source.encoding).decode(buffer);

  // The portal answers some unauthenticated clients with a plain-text refusal
  // or an HTML error page under a 200 status, either of which would otherwise
  // be written out as a valid CSV. Size is not a usable signal here:
  // DateExportation.csv is legitimately 19 bytes.
  if (/^\s*(?:RBAC:|<!DOCTYPE|<html)/i.test(text)) {
    throw new Error(`${source.name}: refused (${text.slice(0, 60).trim()})`);
  }
  if (text.trim().split('\n').length < 2) {
    throw new Error(`${source.name}: no data rows`);
  }

  writeFileSync(target, text, 'utf8');
  const kb = (statSync(target).size / 1024).toFixed(0);
  console.log(`  ${source.name.padEnd(40)} ${kb.padStart(7)} KB`);
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  const force = process.argv.includes('--force');

  console.log(`fetching ${SOURCES.length} sources into data/raw/\n`);

  const failures: string[] = [];
  for (const source of SOURCES) {
    if (!force && existsSync(`${RAW_DIR}${source.name}`)) {
      console.log(`  ${source.name.padEnd(40)} (cached, --force to refresh)`);
      continue;
    }
    try {
      await download(source);
    } catch (error) {
      failures.push(`${source.name}: ${(error as Error).message}`);
      console.error(`  ${source.name.padEnd(40)} FAILED`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} source(s) failed:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }

  console.log('\nall sources fetched');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
