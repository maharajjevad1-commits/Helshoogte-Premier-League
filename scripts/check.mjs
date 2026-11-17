// Optional maintainer checks: node scripts/check.mjs (Node 18+). No npm packages.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function check(root) {
  const seedContext = { window: {} };
  vm.runInNewContext(await fs.readFile(`${root}/site/seed.js`, 'utf8'), seedContext);
  const nodes = new Map();
  const element = () => ({ content: 'false', innerHTML: '', textContent: '', style: {},
    classList: { toggle() {} }, prepend() {}, setAttribute() {}, inert: false });
  const document = {
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); },
    querySelectorAll() { return []; }, addEventListener() {}, createElement: element
  };
  const window = { HPL_SEED: structuredClone(seedContext.window.HPL_SEED), addEventListener() {} };
  const context = vm.createContext({ window, document, structuredClone, setTimeout, clearTimeout, console });
  vm.runInContext(await fs.readFile(`${root}/site/public.js`, 'utf8'), context);
  const app = window.HPL;
  assert.equal(app.data.teams.length, 12);
  assert.equal(app.data.players.length, 0);
  assert.equal(app.oversBalls('19.4'), 118);
  assert.ok(Number.isNaN(app.oversBalls('3.6')));
  assert.equal(app.inningsNRRBalls({ balls: 70, wickets: 10 }, 20), 120);
  const player = { id: 'player', name: 'Example', teamId: 'a', baseline: {} };
  assert.equal(app.playerStats(player).battingAverage, null);
  app.data.teams = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  app.data.players = [player];
  app.data.fixtures = [{ id: 'm', a: 'a', b: 'b', season: app.data.season, phase: 'league',
    status: 'done', innings: { a: { runs: 100, wickets: 3, balls: 120 }, b: { runs: 101, wickets: 2, balls: 116 } },
    performances: [{ playerId: 'player', batted: true, runs: 50, balls: 35, dismissals: 1, wickets: 2 }] }];
  assert.equal(app.standings()[0].team.id, 'b');
  assert.equal(app.standings()[0].pts, 2);
  assert.equal(app.playerStats(player).runs, 50);
  assert.equal(app.playerStats(player).wickets, 2);
  assert.equal(app.playerStats(player).fifties, 1);
  app.data.fixtures[0].performances[0].runs = 60;
  assert.equal(app.playerStats(player).runs, 60, 'Correcting a score must replace its total');

  const official = structuredClone(app.data);
  let failSave = false;
  const calls = [];
  window.HPL_CONFIG = { url: 'test', key: 'test' };
  window.supabase = { createClient() { return {
    async rpc(name, args) {
      calls.push({ name, args });
      return name === 'get_league' ? { data: { revision: 7, data: structuredClone(official) } } :
        failSave ? { error: { message: 'Network failure' } } : { data: 8 };
    }
  }; } };
  vm.runInContext(await fs.readFile(`${root}/site/cloud.js`, 'utf8'), context);
  await app.ready;
  app.toast = () => {};
  assert.equal(await app.save(), false, 'Visitors cannot save');
  assert.equal(calls.filter(c => c.name === 'save_league').length, 0);
  app.isAdmin = true;
  app.data.leagueName = 'Saved name';
  assert.equal(await app.save(), true);
  assert.equal(calls.at(-1).args.expected_revision, 7);
  failSave = true;
  app.data.leagueName = 'Unconfirmed name';
  assert.equal(await app.save(), false);
  assert.equal(app.data.leagueName, 'Saved name', 'Failed writes must not become official local data');
  assert.equal(app.cloudReady, false, 'An uncertain save requires reloading official records');
  console.log('PASS: cricket totals, corrected scores, NRR, overs, visitor write denial, revision checks, failed-save recovery.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await check(fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, ''));
}
