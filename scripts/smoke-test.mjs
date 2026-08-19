import { spawn } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const port = 4179;
const chromeCandidates = process.platform === 'win32'
  ? [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
  : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chromePath = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
const chromeProfile = join(root, '.chrome-test-smoke');

if (!chromePath) {
  throw new Error('Chrome/Edge를 찾을 수 없습니다. CHROME_PATH 환경 변수를 지정해주세요.');
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const overlapsForTest = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

async function waitFor(url, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch { /* process is still starting */ }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const server = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port)], {
  cwd: root,
  stdio: 'ignore',
});
const browser = spawn(chromePath, [
  '--headless=new',
  '--no-first-run',
  '--disable-extensions',
  '--hide-scrollbars',
  '--use-angle=swiftshader',
  '--window-size=1440,900',
  '--remote-debugging-port=9339',
  `--user-data-dir=${chromeProfile}`,
  'about:blank',
], { stdio: 'ignore' });

let socket;

try {
  await waitFor(`http://127.0.0.1:${port}`);
  await waitFor('http://127.0.0.1:9339/json/version');
  const gameUrl = encodeURIComponent(`http://127.0.0.1:${port}/?difficulty=easy&play=1`);
  const target = await fetch(`http://127.0.0.1:9339/json/new?${gameUrl}`, { method: 'PUT' }).then((response) => response.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
  });

  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  await command('Runtime.enable');
  await command('Page.enable');
  await command('Page.bringToFront');
  let startupState;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    startupState = await evaluate(`({
      href: location.href,
      readyState: document.readyState,
      hasGame: Boolean(window.__eggGame),
      phase: window.__eggGame?.phase || null,
      title: document.title,
    })`);
    if (startupState.hasGame && startupState.phase === 'crack-ready') break;
    await delay(100);
  }
  if (!startupState?.hasGame || startupState.phase !== 'crack-ready') {
    throw new Error(`Game did not enter CRACK_READY state: ${JSON.stringify(startupState)}; ${exceptions.join('; ')}`);
  }

  const swing = await evaluate(`(() => {
    const egg = document.querySelector('#swing-egg').getBoundingClientRect();
    const bowl = document.querySelector('.ceramic-rim').getBoundingClientRect();
    return { x: egg.left + egg.width / 2, startY: egg.top + egg.height / 2, endY: Math.min(egg.top + egg.height / 2 + 50, bowl.top - 30) };
  })()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: swing.x, y: swing.startY, button: 'left', buttons: 1, clickCount: 1 });
  // Exercise the real pointer controller with an intentionally gentle swing.
  // A one-frame fast swipe depends too much on headless-browser scheduling.
  for (let step = 1; step <= 5; step += 1) {
    const t = step / 5;
    await command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: swing.x,
      y: swing.startY + (swing.endY - swing.startY) * t,
      button: 'left',
      buttons: 1,
    });
    await delay(80);
  }
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: swing.x, y: swing.endY, button: 'left', buttons: 0, clickCount: 1 });
  await delay(620);
  const gentleSwing = await evaluate(`({ phase: window.__eggGame.phase, weak: window.__eggGame.weakStrikes, penalty: window.__eggGame.incidentPenalty })`);
  if (gentleSwing.phase !== 'crack-ready' || gentleSwing.weak < 1 || gentleSwing.penalty <= 0) {
    throw new Error(`Gentle pointer swing failed: ${JSON.stringify(gentleSwing)}`);
  }
  await evaluate(`(() => {
    const game = window.__eggGame;
    game.handleCrackStrike({
      impact: (game.crackRules.idealMin + game.crackRules.idealMax) / 2,
      downwardSpeed: 1.1,
      acceleration: 1,
      lateralRatio: 0,
      travel: .3,
    });
  })()`);
  let cooking = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    cooking = await evaluate(`window.__eggGame.phase === 'cooking'`);
    if (cooking) break;
    await delay(100);
  }
  if (!cooking) throw new Error(`Swing crack flow failed: ${JSON.stringify(await evaluate(`({ phase: window.__eggGame.phase, difficulty: window.__eggGame.difficultyKey, crackCount: window.__eggGame.crackCount, misses: window.__eggGame.crackMisses, impact: window.__eggGame.crackImpact })`))}`);
  const rollPad = await evaluate(`(() => {
    const box = document.querySelector('#pan-gesture-pad').getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  })()`);
  const rollY = rollPad.top + rollPad.height * .5;
  const rollCenter = rollPad.left + rollPad.width * .5;
  const rollLeft = rollPad.left + rollPad.width * .1;
  const rollRight = rollPad.left + rollPad.width * .9;
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rollCenter, y: rollY, button: 'left', buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 4; step += 1) {
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rollCenter + (rollLeft - rollCenter) * (step / 4), y: rollY, button: 'left', buttons: 1 });
    await delay(70);
  }
  for (let step = 1; step <= 8; step += 1) {
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rollLeft + (rollRight - rollLeft) * (step / 8), y: rollY, button: 'left', buttons: 1 });
    await delay(70);
  }
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rollRight, y: rollY, button: 'left', buttons: 0, clickCount: 1 });
  const panRoll = await evaluate(`(() => {
    const game = window.__eggGame;
    game.updateCookingSteps();
    return { complete: game.panCoatComplete, quality: game.panQuality, step: game.cookStep, penalty: game.techniquePenalty };
  })()`);
  if (!panRoll.complete || panRoll.quality < .4 || panRoll.step !== 'season' || panRoll.penalty !== 0) {
    throw new Error(`Pan-roll gesture failed: ${JSON.stringify(panRoll)}`);
  }
  await evaluate(`window.__eggGame.whiteCook = 48; window.__eggGame.yolkCook = 24; window.__eggGame.updateCookingSteps()`);
  await delay(100);
  await evaluate(`document.querySelector('#season-button').click()`);
  const weakFlip = await evaluate(`(() => {
    const game = window.__eggGame;
    game.whiteCook = 64;
    game.yolkCook = 38;
    game.updateCookingSteps();
    const beforePenalty = game.techniquePenalty;
    game.handlePanGesture({ phase: 'start', x: 0, y: .3, upwardVelocity: 0, travelX: 0, travelY: 0 });
    game.handlePanGesture({ phase: 'end', x: 0, y: -.2, upwardVelocity: .5, travelX: 0, travelY: -.5 });
    return { step: game.cookStep, resolved: game.flipResolved, misses: game.flipMisses, penaltyAdded: game.techniquePenalty - beforePenalty };
  })()`);
  if (weakFlip.step !== 'flip' || weakFlip.resolved || weakFlip.misses !== 1 || weakFlip.penaltyAdded <= 0) {
    throw new Error(`Weak flip retry failed: ${JSON.stringify(weakFlip)}`);
  }
  const flipPad = await evaluate(`(() => {
    const box = document.querySelector('#pan-gesture-pad').getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  })()`);
  const flipX = flipPad.left + flipPad.width * .5;
  const flipStartY = flipPad.top + flipPad.height * .82;
  const flipEndY = flipPad.top + flipPad.height * .18;
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: flipX, y: flipStartY, button: 'left', buttons: 1, clickCount: 1 });
  for (let step = 1; step <= 5; step += 1) {
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: flipX, y: flipStartY + (flipEndY - flipStartY) * (step / 5), button: 'left', buttons: 1 });
    await delay(55);
  }
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: flipX, y: flipEndY, button: 'left', buttons: 0, clickCount: 1 });
  const flipGesture = await evaluate(`(() => {
    const game = window.__eggGame;
    return { step: game.cookStep, resolved: game.flipResolved, damaged: game.flipDamaged, quality: game.flipQuality };
  })()`);
  if (flipGesture.step !== 'flip' || !flipGesture.resolved || flipGesture.damaged || flipGesture.quality < .75) {
    throw new Error(`Upward flip gesture failed: ${JSON.stringify(flipGesture)}`);
  }
  // Background headless tabs throttle requestAnimationFrame, so advance the
  // same public game-loop path deterministically for the 0.7s landing arc.
  await evaluate(`{ for (let frame = 0; frame < 16; frame += 1) window.__eggGame.advanceCooking(.05); }`);
  const landedFlip = await evaluate(`({ complete: window.__eggGame.flipComplete, step: window.__eggGame.cookStep, baste: window.__eggGame.basteCount, heat: window.__eggGame.heatIndex })`);
  if (!landedFlip.complete || landedFlip.step !== 'plate' || landedFlip.baste !== 1 || landedFlip.heat !== 0) {
    throw new Error(`Flip landing failed: ${JSON.stringify(landedFlip)}`);
  }
  const activeEvent = await evaluate(`window.__eggGame.activeEvent?.id || null`);
  if (activeEvent) await evaluate(`document.querySelector('#kitchen-event-response').click()`);
  await evaluate(`(() => {
    const game = window.__eggGame;
    game.whiteCook = 89;
    game.yolkCook = 64;
    game.edgeBrown = 12;
    game.doneness = game.whiteCook * .55 + game.yolkCook * .45;
    game.seasoningQuality = Math.max(game.seasoningQuality, .8);
    game.heatLoweringQuality = Math.max(game.heatLoweringQuality, .85);
    game.basteQualityTotal = Math.max(game.basteQualityTotal, .8);
    game.eventsHandled = game.cookingRules.eventCount;
  })()`);
  await delay(60);
  await evaluate(`document.querySelector('#serve-button').click()`);
  let result;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    result = await evaluate(`({
      phase: window.__eggGame.phase,
      score: window.__eggGame.sessionScore,
      overlay: document.querySelector('#result-overlay').classList.contains('visible'),
      canvasInert: document.querySelector('#game-canvas').inert,
      focused: document.activeElement?.id,
      focusDebug: (() => {
        const retry = document.querySelector('#retry-button');
        const overlay = document.querySelector('#result-overlay');
        const style = getComputedStyle(retry);
        return {
          documentFocus: document.hasFocus(), retryInert: retry.inert, overlayInert: overlay.inert,
          disabled: retry.disabled, tabIndex: retry.tabIndex, display: style.display, visibility: style.visibility,
          rects: retry.getClientRects().length, appInert: document.querySelector('#app').inert,
        };
      })(),
      ratingRows: [...document.querySelectorAll('.result-ratings strong')].map((row) => ({
        stars: row.querySelectorAll('.result-star').length,
        filled: row.querySelectorAll('.result-star.filled').length,
        number: row.querySelector('small')?.textContent,
      })),
    })`);
    if (result.phase === 'result' && result.overlay && (result.focused === 'retry-button'
      || (!result.focusDebug.retryInert && !result.focusDebug.overlayInert && !result.focusDebug.disabled && result.focusDebug.tabIndex === 0
        && result.focusDebug.visibility === 'visible' && result.focusDebug.rects === 1))) break;
    await delay(100);
  }
  const retryFocusReady = result.focused === 'retry-button'
    || (result.focusDebug.documentFocus && !result.focusDebug.retryInert && !result.focusDebug.overlayInert
      && !result.focusDebug.disabled && result.focusDebug.tabIndex === 0
      && result.focusDebug.visibility === 'visible' && result.focusDebug.rects === 1);
  if (result.phase !== 'result' || result.score < 400 || !result.overlay || !result.canvasInert || !retryFocusReady
    || result.ratingRows.length !== 4 || result.ratingRows.some((row) => row.stars !== 5 || !/^\d\/5$/.test(row.number))) {
    throw new Error(`Perfect-result assertion failed: ${JSON.stringify(result)}`);
  }
  if (exceptions.length) throw new Error(`Browser exceptions: ${exceptions.join('; ')}`);

  const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(root, 'smoke-gameplay.png'), Buffer.from(screenshot.data, 'base64'));

  await evaluate(`document.querySelector('#change-difficulty-button').click()`);
  await delay(650);
  const menuState = await evaluate(`({
    phase: window.__eggGame.phase,
    visible: !document.querySelector('#start-overlay').classList.contains('hidden'),
    difficulties: document.querySelectorAll('.difficulty-options [data-difficulty]').length,
    unlocked: window.__eggGame.achievements.getSnapshot().unlockedCount,
  })`);
  if (menuState.phase !== 'intro' || !menuState.visible || menuState.difficulties !== 4 || menuState.unlocked < 2) {
    throw new Error(`Difficulty menu assertion failed: ${JSON.stringify(menuState)}`);
  }
  const menuScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(root, 'smoke-menu.png'), Buffer.from(menuScreenshot.data, 'base64'));
  await evaluate(`document.querySelector('#achievements-button').click()`);
  await delay(320);
  const achievementState = await evaluate(`({
    visible: document.querySelector('#achievement-overlay').classList.contains('visible'),
    items: document.querySelectorAll('.achievement-item').length,
    unlocked: document.querySelectorAll('.achievement-item.unlocked').length,
    startInert: document.querySelector('#start-overlay').inert,
    overlayInert: document.querySelector('#achievement-overlay').inert,
  })`);
  if (!achievementState.visible || achievementState.items < 45 || achievementState.unlocked < 2
    || !achievementState.startInert || achievementState.overlayInert) {
    throw new Error(`Achievement gallery assertion failed: ${JSON.stringify(achievementState)}`);
  }
  const achievementScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(root, 'smoke-achievements.png'), Buffer.from(achievementScreenshot.data, 'base64'));
  await evaluate(`document.querySelector('[data-collection-tab="skins"]').click()`);
  await delay(220);
  const skinState = await evaluate(`({
    visible: !document.querySelector('#skin-panel').hidden,
    categories: document.querySelectorAll('[data-skin-category]').length,
    items: document.querySelectorAll('.skin-item').length,
    equipped: document.querySelectorAll('.skin-item.equipped').length,
    unlocked: document.querySelectorAll('.skin-item:not(:disabled)').length,
  })`);
  if (!skinState.visible || skinState.categories !== 3 || skinState.items !== 6 || skinState.equipped !== 1 || skinState.unlocked < 1) {
    throw new Error(`Skin collection assertion failed: ${JSON.stringify(skinState)}`);
  }
  const skinScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(root, 'smoke-skins.png'), Buffer.from(skinScreenshot.data, 'base64'));
  await evaluate(`document.querySelector('#achievement-close-button').click()`);
  await delay(180);
  if (await evaluate(`document.querySelector('#start-overlay').inert`)) {
    throw new Error('Home dialog remained inert after closing achievements');
  }

  await command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await delay(260);
  const mobileHome = await evaluate(`(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    return { start: rect('#start-button'), card: rect('.intro-card'), heading: rect('.home-heading'), scrollWidth: document.documentElement.scrollWidth };
  })()`);
  if (mobileHome.start.bottom > 844 || mobileHome.start.top < 0 || mobileHome.card.right > 391 || mobileHome.scrollWidth > 390) {
    throw new Error(`Mobile home layout failed: ${JSON.stringify(mobileHome)}`);
  }
  const mobileHomeScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(root, 'smoke-mobile-home.png'), Buffer.from(mobileHomeScreenshot.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 568,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 320,
    screenHeight: 568,
  });
  await delay(240);
  const smallHome = await evaluate(`(() => {
    const overlay = document.querySelector('#start-overlay');
    const start = document.querySelector('#start-button').getBoundingClientRect();
    const card = document.querySelector('.intro-card').getBoundingClientRect();
    return {
      startTop: start.top,
      startBottom: start.bottom,
      cardLeft: card.left,
      cardRight: card.right,
      scrollWidth: document.documentElement.scrollWidth,
      scrollable: overlay.scrollHeight >= overlay.clientHeight,
    };
  })()`);
  if (smallHome.startTop < 0 || smallHome.startBottom > 568 || smallHome.cardLeft < -1
    || smallHome.cardRight > 321 || smallHome.scrollWidth > 320 || !smallHome.scrollable) {
    throw new Error(`Small mobile home layout failed: ${JSON.stringify(smallHome)}`);
  }
  const smallHomeScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(root, 'smoke-small-home.png'), Buffer.from(smallHomeScreenshot.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await delay(180);
  await evaluate(`localStorage.setItem('eggcellent-theme-v2', 'dark')`);
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/?difficulty=extreme&play=1` });
  let mobileReady = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      mobileReady = await evaluate(`Boolean(window.__eggGame) && window.__eggGame.phase === 'crack-ready'`);
    } catch { /* navigation swaps the execution context */ }
    if (mobileReady) break;
    await delay(100);
  }
  await delay(420);
  const crackScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(root, 'smoke-crack.png'), Buffer.from(crackScreenshot.data, 'base64'));
  const weakStrike = await evaluate(`(() => {
    const game = window.__eggGame;
    game.handleCrackStrike({ impact: .2, lateralRatio: 0, travel: .2 });
    return { phase: game.phase, weak: game.weakStrikes, penalty: game.incidentPenalty };
  })()`);
  if (weakStrike.phase !== 'crack-ready' || weakStrike.weak !== 1 || weakStrike.penalty <= 0) {
    throw new Error(`Weak strike continuation failed: ${JSON.stringify(weakStrike)}`);
  }
  await delay(600);
  await evaluate(`(() => {
    const game = window.__eggGame;
    game.handleCrackStrike({ impact: game.crackRules.breakImpact + .5, lateralRatio: 0, travel: .3 });
  })()`);
  await delay(420);
  const hardStrikeState = await evaluate(`({ phase: window.__eggGame.phase, damaged: window.__eggGame.crackDamaged, penalty: window.__eggGame.incidentPenalty })`);
  if (hardStrikeState.phase !== 'cracking' || !hardStrikeState.damaged || hardStrikeState.penalty <= weakStrike.penalty) {
    throw new Error(`Hard strike damage failed: ${JSON.stringify(hardStrikeState)}`);
  }
  await evaluate(`window.__eggGame.world.updateCracking(1); window.__eggGame.beginCooking()`);
  await delay(500);
  const damagedCooking = await evaluate(`window.__eggGame.phase === 'cooking' && window.__eggGame.crackDamaged`);
  if (!damagedCooking) throw new Error(`Hard strike did not continue to cooking: ${JSON.stringify(await evaluate(`({ phase: window.__eggGame.phase, damaged: window.__eggGame.crackDamaged, penalty: window.__eggGame.incidentPenalty, impact: window.__eggGame.crackImpact, misses: window.__eggGame.crackMisses })`))}`);
  const mobileLayout = await evaluate(`(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const game = window.__eggGame;
    return {
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      score: rect('.score-pill'),
      timer: rect('.timer-pill'),
      mission: rect('#mission-card'),
      cookPanel: rect('#cook-panel'),
      egg: game.world.worldToScreen(game.world.eggGroup.position),
      crack: game.world.worldToScreen(game.world.crackMarker.position),
      difficulty: game.difficultyKey,
      roundTime: game.rules.roundTime,
      theme: document.documentElement.dataset.theme,
      perfectWidth: document.querySelector('.perfect-zone').getBoundingClientRect().width,
      timerText: document.querySelector('#timer-value').textContent,
      cookRole: document.querySelector('#cook-panel').getAttribute('role'),
      donenessRole: document.querySelector('#doneness-track').getAttribute('role'),
      touchTargets: [...document.querySelectorAll('#cook-panel button:not([hidden])')].map((button) => {
        const box = button.getBoundingClientRect();
        return { id: button.id, width: box.width, height: box.height, visible: box.width > 0 && box.height > 0 };
      }),
      gesturePad: (() => {
        const box = document.querySelector('#pan-gesture-pad').getBoundingClientRect();
        return { width: box.width, height: box.height };
      })(),
    };
  })()`);
  const boxesFit = [mobileLayout.score, mobileLayout.timer, mobileLayout.mission, mobileLayout.cookPanel]
    .every((box) => box.left >= -0.5 && box.right <= mobileLayout.innerWidth + 0.5);
  const playTargetsFit = [mobileLayout.egg, mobileLayout.crack]
    .every((point) => point.x >= 8 && point.x <= mobileLayout.innerWidth - 8 && point.y >= 0 && point.y <= 844);
  if (mobileLayout.innerWidth !== 390 || mobileLayout.scrollWidth > 390 || !boxesFit || !playTargetsFit
    || mobileLayout.difficulty !== 'extreme' || mobileLayout.roundTime !== 34 || mobileLayout.theme !== 'dark'
    || !/^00:\d{2}$/.test(mobileLayout.timerText) || mobileLayout.cookRole || mobileLayout.donenessRole !== 'progressbar'
    || mobileLayout.touchTargets.some((target) => target.visible && (target.width < 48 || target.height < 48))
    || mobileLayout.gesturePad.width < 56 || mobileLayout.gesturePad.height < 56
    || mobileLayout.perfectWidth > 34) {
    throw new Error(`Mobile layout assertion failed: ${JSON.stringify(mobileLayout)}`);
  }
  const mobileScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(root, 'smoke-mobile.png'), Buffer.from(mobileScreenshot.data, 'base64'));

  const damagedFlip = await evaluate(`(() => {
    const game = window.__eggGame;
    const beforePenalty = game.techniquePenalty;
    game.panCoatComplete = true;
    game.panQuality = 1;
    game.whiteCook = 48;
    game.yolkCook = 28;
    game.updateCookingSteps();
    game.performCookAction('season');
    game.whiteCook = 64;
    game.yolkCook = 40;
    game.updateCookingSteps();
    game.handlePanGesture({ phase: 'start', x: 0, y: .7, upwardVelocity: 0, travelX: 0, travelY: 0 });
    game.handlePanGesture({ phase: 'move', x: .82, y: -.1, upwardVelocity: 5.4, travelX: .82, travelY: -.8 });
    game.handlePanGesture({ phase: 'end', x: .82, y: -.1, upwardVelocity: 5.4, travelX: .82, travelY: -.8 });
    for (let frame = 0; frame < 16; frame += 1) game.advanceCooking(.05);
    return {
      phase: game.phase, step: game.cookStep, complete: game.flipComplete, damaged: game.flipDamaged,
      visualDamage: game.world.cookingState.flipDamaged, penaltyAdded: game.techniquePenalty - beforePenalty,
    };
  })()`);
  if (damagedFlip.phase !== 'cooking' || damagedFlip.step !== 'plate' || !damagedFlip.complete
    || !damagedFlip.damaged || !damagedFlip.visualDamage || damagedFlip.penaltyAdded <= 0) {
    throw new Error(`Damaged flip continuation failed: ${JSON.stringify(damagedFlip)}`);
  }

  const viewportCases = [
    { name: 'small portrait', width: 320, height: 568, mobile: true },
    { name: 'short portrait', width: 320, height: 480, mobile: true },
    { name: 'short landscape', width: 844, height: 390, mobile: true },
    { name: 'tablet portrait', width: 768, height: 1024, mobile: true },
    { name: 'ultrawide', width: 2560, height: 1080, mobile: false },
  ];
  const viewportResults = [];
  for (const viewport of viewportCases) {
    await command('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await delay(220);
    await evaluate(`window.__eggGame.world.resize()`);
    const layout = await evaluate(`(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const game = window.__eggGame;
      const score = rect('.score-pill');
      const timer = rect('.timer-pill');
      const mission = rect('#mission-card');
      const cookPanel = rect('#cook-panel');
      return {
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        score,
        timer,
        mission,
        cookPanel,
        hudOverlap: overlaps(mission, score) || overlaps(mission, timer),
        egg: game.world.worldToScreen(game.world.eggGroup.position),
        crack: game.world.worldToScreen(game.world.crackMarker.position),
      };
    })()`);
    const boxes = [layout.score, layout.timer, layout.mission, layout.cookPanel];
    const boxFit = boxes.every((box) => box.left >= -1 && box.right <= viewport.width + 1 && box.top >= -1 && box.bottom <= viewport.height + 1);
    const targetsFit = [layout.egg, layout.crack]
      .every((point) => point.x >= 4 && point.x <= viewport.width - 4 && point.y >= 0 && point.y <= viewport.height);
    if (layout.width !== viewport.width || layout.height !== viewport.height || layout.scrollWidth > viewport.width + 1
      || !boxFit || !targetsFit || layout.hudOverlap || overlapsForTest(layout.mission, layout.cookPanel)) {
      throw new Error(`${viewport.name} layout assertion failed: ${JSON.stringify(layout)}`);
    }
    viewportResults.push(`${viewport.width}x${viewport.height}`);
  }
  process.stdout.write(`Smoke test passed: ${JSON.stringify(result)}; responsive layouts passed (${viewportResults.join(', ')})\n`);
} finally {
  socket?.close();
  browser.kill();
  server.kill();
  await delay(350);
  try { rmSync(chromeProfile, { recursive: true, force: true }); } catch { /* Chrome may finish releasing files asynchronously */ }
}
