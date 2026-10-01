'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const os = require('node:os');
const { _electron: electron } = require('playwright');
const { HostServer } = require('../src/main/host-server');
const { inventorySnapshot, serializedItem } = require('../test/support/renderer-fixtures');

async function main() {
  const executablePath = process.env.MINEPROMPT_EXECUTABLE;
  if (executablePath && !fs.existsSync(executablePath)) throw new Error(`Application not found at ${executablePath}.`);
  const dataPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mineprompt-desktop-'));
  const quietConsole = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  const host = await new HostServer({ rootPath: path.resolve('.'), userDataPath: dataPath, originalConsole: quietConsole }).start();
  const hostSessionPid = host.runtime.snapshot().sessions[0].process.pid;
  process.stdout.write('[Desktop] Host ready.\n');
  const application = await electron.launch(executablePath ? {
    executablePath,
    artifactsDir: process.env.MINEPROMPT_SMOKE_ARTIFACTS,
    env: { ...process.env, MINEPROMPT_DATA_DIR: dataPath }
  } : {
    args: [path.resolve('.')],
    artifactsDir: process.env.MINEPROMPT_SMOKE_ARTIFACTS,
    env: { ...process.env, MINEPROMPT_DATA_DIR: dataPath }
  });
  process.stdout.write('[Desktop] Application launched.\n');
  let page;
  const rendererFailures = [];
  try {
    page = await application.firstWindow({ timeout: 15000 });
    process.stdout.write('[Desktop] Window ready.\n');
    page.on('console', (entry) => {
      if (entry.type() === 'error' || (entry.type() === 'warning' && entry.text().startsWith('[React]'))) {
        rendererFailures.push(entry.text());
        process.stderr.write(`[Renderer] ${entry.text()}\n`);
      }
    });
    page.on('pageerror', (error) => {
      rendererFailures.push(error.stack || error.message);
      process.stderr.write(`[Renderer] ${error.stack || error.message}\n`);
    });
    await page.waitForSelector('.app-shell');
    await page.waitForSelector('.workspace');
    await page.waitForSelector('.inventory-workspace');
    await page.waitForSelector('.terminal-dock');
    process.stdout.write('[Desktop] Workspace ready.\n');
    const nativeMenu = await application.evaluate(({ BrowserWindow, Menu }) => ({
      applicationMenu: Menu.getApplicationMenu(),
      visible: BrowserWindow.getAllWindows()[0]?.isMenuBarVisible()
    }));
    assert.equal(nativeMenu.applicationMenu, null);
    assert.equal(nativeMenu.visible, false);
    await page.keyboard.press('Alt');
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMenuBarVisible()), false);
    assert.equal(await page.locator('.brand h1').textContent(), 'MinePrompt');
    const attachedSnapshot = await page.evaluate(() => globalThis.mineprompt.getSnapshot());
    assert.equal(attachedSnapshot.sessions[0].process.pid, hostSessionPid);
    await Promise.all([
      page.waitForEvent('load'),
      application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.reloadIgnoringCache())
    ]);
    await page.waitForSelector('.app-shell');
    const reloadedSnapshot = await page.evaluate(() => globalThis.mineprompt.getSnapshot());
    assert.equal(reloadedSnapshot.sessions[0].process.pid, hostSessionPid);
    process.stdout.write('[Desktop] Renderer reload verified.\n');
    await page.getByRole('button', { name: 'Workflow studio' }).click();
    await page.waitForSelector('.workflow-studio');
    assert.equal(await page.locator('.workflow-node').count() >= 1, true);
    await page.getByRole('button', { name: 'Close' }).click();
    process.stdout.write('[Desktop] Workflow dialog verified.\n');
    await page.getByRole('button', { name: 'Mining policies' }).click();
    await page.waitForSelector('.mining-policy-editor');
    await page.getByLabel('Name').fill('Desktop Safe');
    await page.getByLabel('Durability reserve').fill('28');
    await page.getByRole('button', { name: 'Save and use' }).click();
    await page.waitForFunction(async () => (await globalThis.mineprompt.getSnapshot()).miningPresets.length === 1);
    const miningSnapshot = await page.evaluate(() => globalThis.mineprompt.getSnapshot());
    assert.equal(miningSnapshot.miningPresets[0].policy.minimumDurability, 28);
    assert.equal(miningSnapshot.activeMiningPresetId, miningSnapshot.miningPresets[0].id);
    await page.getByRole('button', { name: 'Close' }).click();
    process.stdout.write('[Desktop] Mining policy dialog verified.\n');
    const tooltipTextures = await page.evaluate(async () => Promise.all(['tooltip_background.png', 'tooltip_frame.png'].map((name) => new Promise((resolve) => {
      const texture = new globalThis.Image();
      texture.onload = () => resolve({ name, width: texture.naturalWidth, height: texture.naturalHeight });
      texture.onerror = () => resolve({ name, width: 0, height: 0 });
      texture.src = `img/faithful/gui/${name}`;
    }))));
    assert.deepEqual(tooltipTextures, [
      { name: 'tooltip_background.png', width: 200, height: 200 },
      { name: 'tooltip_frame.png', width: 200, height: 200 }
    ]);
    const tooltipStyle = await page.evaluate(() => {
      const element = globalThis.document.createElement('div');
      element.className = 'minecraft-tooltip item-tooltip';
      element.textContent = 'Tooltip';
      globalThis.document.body.append(element);
      const style = globalThis.getComputedStyle(element);
      const frame = element.ownerDocument.defaultView.getComputedStyle(element, '::before');
      const result = { position: style.position, background: style.borderImageSource, frame: frame.borderImageSource };
      element.remove();
      return result;
    });
    assert.equal(tooltipStyle.position, 'fixed');
    assert.match(tooltipStyle.background, /tooltip_background[^)]*\.png/u);
    assert.match(tooltipStyle.frame, /tooltip_frame[^)]*\.png/u);
    const playerItem = serializedItem({
      name: 'diamond_pickaxe',
      displayName: 'Diamond Pickaxe',
      customName: '{"text":"Quarry Pick","color":"gold","bold":true}',
      maxDurability: 1561,
      durabilityUsed: 41,
      enchants: [{ name: 'efficiency', lvl: 5 }],
      customLore: ['{"text":"Built for deep work","color":"aqua","italic":false}'],
      stackSize: 1,
      components: [
        { type: 'custom_name', data: '{"text":"Quarry Pick","color":"gold","bold":true}' },
        { type: 'lore', data: ['{"text":"Built for deep work","color":"aqua","italic":false}'] },
        { type: 'custom_data', data: { type: 'compound', value: { owner: { type: 'string', value: 'Miner' } } } }
      ]
    });
    const containerItem = serializedItem({ name: 'tripwire_hook', displayName: 'Tripwire Hook', customName: '{"text":"Vault Key"}', customLore: ['{"text":"Container item"}'] });
    const uiSnapshot = inventorySnapshot(host.runtime.snapshot(), { inventoryItem: playerItem, containerItem });
    uiSnapshot.session.presentation = {
      ...uiSnapshot.session.presentation,
      bossBars: [{ id: 'desktop', title: 'Desktop Boss', progress: 0.5, dividers: 10, color: 'purple', darkenSky: false, dragon: false, fog: false }],
      scoreboard: { name: 'test', title: 'Desktop Scores', items: [{ name: 'TestBot', displayName: 'TestBot', value: 12 }] },
      overlay: { title: 'Desktop Title', subtitle: 'Live state', actionBar: 'Desktop action' }
    };
    host.broadcast({ type: 'event', channel: 'snapshot', payload: uiSnapshot });
    await page.getByText('Desktop Boss').waitFor();
    await page.getByText('Desktop Scores').waitFor();
    await page.getByText('Desktop Title').waitFor();
    const verifyTooltip = async (name, expected, advanced = false) => {
      const slot = page.getByRole('button', { name: new RegExp(name, 'u') });
      if (advanced) await page.keyboard.down('Alt');
      await slot.hover();
      const tooltip = page.getByRole('tooltip');
      try {
        await tooltip.waitFor({ state: 'visible', timeout: 3000 });
      } catch {
        await page.mouse.move(2, 2);
        await slot.hover();
        await tooltip.waitFor({ state: 'visible', timeout: 3000 });
      }
      const details = await tooltip.evaluate((element) => ({ text: element.textContent, left: element.getBoundingClientRect().left, top: element.getBoundingClientRect().top }));
      assert.match(details.text, expected);
      assert.equal(details.left > 0 && details.top > 0, true);
      await page.mouse.move(2, 2);
      if (advanced) await page.keyboard.up('Alt');
      await tooltip.waitFor({ state: 'detached' });
    };
    await verifyTooltip('Quarry Pick', /Quarry Pick.*Efficiency V.*Built for deep work.*Hold Alt/su);
    await verifyTooltip('Quarry Pick', /Quarry Pick.*Custom Data/su, true);
    await verifyTooltip('Vault Key', /Vault Key.*Container item/su);
    await page.getByRole('button', { name: /Quarry Pick/u }).click({ button: 'right' });
    const contextMenu = page.getByRole('menu');
    await contextMenu.waitFor({ state: 'visible' });
    assert.match(await contextMenu.textContent(), /Move one to Chest.*Move half to Chest.*Move stack to Chest/su);
    assert.match(await contextMenu.textContent(), /container transfer inventory 36 half/u);
    await page.keyboard.press('Escape');
    for (let revision = 1; revision <= 64; revision += 1) {
      const update = structuredClone(uiSnapshot);
      update.session.inventoryRevision = revision;
      update.session.inventorySlots[36].count = revision;
      const selected = update.sessions.find((session) => session.id === update.selectedSessionId);
      if (selected) selected.session = update.session;
      host.broadcast({ type: 'event', channel: 'snapshot', payload: update });
    }
    await page.waitForTimeout(250);
    const liveSlot = page.getByRole('button', { name: /Quarry Pick, 64, slot 36/u });
    const containerSlot = page.getByRole('button', { name: /Vault Key/u });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await liveSlot.hover();
      await containerSlot.hover();
    }
    await page.mouse.move(2, 2);
    await page.evaluate(() => globalThis.mineprompt.reportRendererIssue({
      area: 'Desktop smoke',
      message: 'Diagnostic transport probe',
      context: { component: 'InventoryWorkspace' },
      timestamp: Date.now()
    }));
    await page.waitForFunction(async () => {
      const state = await globalThis.mineprompt.getUiState({ maximumIssues: 5 });
      return state.renderer?.rendered?.inventorySlots > 0 && state.rendererIssues?.some((issue) => issue.message === 'Diagnostic transport probe');
    });
    const observedUi = await page.evaluate(() => globalThis.mineprompt.getUiState({ maximumIssues: 5 }));
    assert.equal(observedUi.renderer.connection.windowId, 4);
    assert.equal(observedUi.renderer.rendered.containerWindows, 1);
    assert.equal(observedUi.renderer.rendered.objectObjectVisible, false);
    assert.deepEqual(rendererFailures, []);
    const brokenImages = await page.locator('img').evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute('src')));
    assert.deepEqual(brokenImages, []);
    if (process.env.MINEPROMPT_SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.MINEPROMPT_SMOKE_SCREENSHOT, fullPage: true });
    process.stdout.write('[Desktop] Smoke test passed.\n');
  } catch (error) {
    if (page) {
      const details = await page.evaluate(() => ({
        url: globalThis.location.href,
        title: globalThis.document.title,
        body: globalThis.document.body.innerText.slice(0, 2000)
      })).catch(() => null);
      process.stderr.write(`[Desktop] ${JSON.stringify(details)}\n`);
    }
    throw error;
  } finally {
    process.stdout.write('[Desktop] Closing application.\n');
    await application.close();
    process.stdout.write('[Desktop] Closing host.\n');
    await host.close();
    await fs.promises.rm(dataPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
