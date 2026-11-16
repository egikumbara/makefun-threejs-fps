// The DOM HUD: health, armour, ammo, money, timer, score, kill feed, banners and
// the overlays (title, buy menu, round end, match end). It never touches the sim;
// main.js pushes numbers in and reads the button callbacks out. Cached elements and
// last-value guards keep DOM writes out of the hot path.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const overlayAction = el('play');
  const overlayExtra = el('overlay-extra');
  const healthFill = el('health-fill');
  const healthValue = el('health-value');
  const armorRow = el('armor-row');
  const armorValue = el('armor-value');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const grenadeCount = el('grenade-count');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const scoreEmber = el('score-ember');
  const scoreAshen = el('score-ashen');
  const roundValue = el('round-value');
  const killfeed = el('killfeed');
  const banner = el('banner');
  const bannerText = el('banner-text');
  const bannerSub = el('banner-sub');
  const hitmarker = el('hitmarker');
  const damageFlash = el('damage-flash');
  const crosshair = el('crosshair');
  const plantBar = el('plant-bar');
  const plantFill = el('plant-fill');
  const plantLabel = el('plant-label');
  const bombStatus = el('bomb-status');
  const objective = el('objective');
  const buyPanel = el('buy-panel');
  const buyMoney = el('buy-money');

  let lastHealth = -1;
  let lastArmor = -1;
  let lastMag = -1;
  let lastReserve = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastWeapon = '';
  let lastGrenades = -1;
  let hitTimer = 0;
  let bannerTimer = 0;

  function setText(node, value, last) {
    if (value === last) return last;
    node.textContent = value;
    return value;
  }

  return {
    setHealth(health, armor) {
      if (health !== lastHealth) {
        lastHealth = health;
        healthValue.textContent = String(Math.max(0, Math.ceil(health)));
        healthFill.style.width = `${Math.max(0, Math.min(100, health))}%`;
        healthFill.classList.toggle('low', health <= 30);
      }
      if (armor !== lastArmor) {
        lastArmor = armor;
        armorRow.style.display = armor > 0 ? '' : 'none';
        armorValue.textContent = String(Math.ceil(armor));
      }
    },
    setAmmo(mag, reserve) {
      if (mag !== lastMag) {
        lastMag = mag;
        ammoMag.textContent = String(mag);
        ammoMag.parentElement.classList.toggle('empty', mag === 0);
      }
      if (reserve !== lastReserve) {
        lastReserve = reserve;
        ammoReserve.textContent = `/ ${reserve}`;
      }
    },
    setWeapon(name, grenades) {
      if (name !== lastWeapon) {
        lastWeapon = name;
        weaponName.textContent = name;
      }
      if (grenades !== lastGrenades) {
        lastGrenades = grenades;
        grenadeCount.textContent = grenades > 0 ? `◉ ${grenades}` : '○ 0';
      }
    },
    setMoney(money) {
      if (money !== lastMoney) {
        lastMoney = money;
        moneyValue.textContent = `$${money}`;
        buyMoney.textContent = `$${money}`;
      }
    },
    setTimer(seconds, planted) {
      const text = `${Math.max(0, Math.ceil(seconds))}s`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', seconds <= 10 || planted);
    },
    setScore(ember, ashen, round) {
      const text = `${ember}|${ashen}|${round}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreEmber.textContent = String(ember);
      scoreAshen.textContent = String(ashen);
      roundValue.textContent = `ROUND ${round}`;
    },
    setObjective(text) {
      objective.textContent = text;
    },
    setBombStatus(text) {
      bombStatus.textContent = text;
      bombStatus.style.display = text ? '' : 'none';
    },
    setPlant(progress, label) {
      if (progress <= 0) {
        plantBar.style.display = 'none';
        return;
      }
      plantBar.style.display = '';
      plantFill.style.width = `${Math.min(100, progress * 100)}%`;
      plantLabel.textContent = label;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damage() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 180);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    killfeed(text, good) {
      const line = document.createElement('div');
      line.className = `feed-line${good ? ' good' : ' bad'}`;
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(text, sub, holdMs = 2600) {
      bannerText.textContent = text;
      bannerSub.textContent = sub;
      banner.classList.remove('hidden');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.add('hidden'), holdMs);
    },
    hideBanner() {
      banner.classList.add('hidden');
    },
    showOverlay(mode, data = {}) {
      overlay.hidden = false;
      overlayExtra.innerHTML = '';
      if (mode === 'start') {
        overlayTitle.textContent = 'EMBERLINE';
        overlayCopy.textContent = 'A dusk rail yard. Five rounds decide it: plant the spark charge at Foundry or Depot, or drop all four ASHEN defenders. First to 5 takes the yard.';
        overlayAction.textContent = 'Click to deploy';
      } else if (mode === 'paused') {
        overlayTitle.textContent = 'EMBERLINE';
        overlayCopy.textContent = 'Paused. The yard waits.';
        overlayAction.textContent = 'Click to resume';
      } else if (mode === 'buy') {
        overlayTitle.textContent = `Buy phase — Round ${data.round}`;
        overlayCopy.textContent = 'Spend your money before the round starts. Press B or Deploy when ready.';
        overlayAction.textContent = 'Deploy';
        buyPanel.style.display = '';
      } else if (mode === 'round') {
        overlayTitle.textContent = data.won ? 'Round taken' : 'Round lost';
        overlayCopy.textContent = data.reason;
        overlayAction.textContent = data.matchOver ? 'See results' : 'Next round';
        if (data.lines) {
          for (const line of data.lines) {
            const p = document.createElement('p');
            p.className = 'result-line';
            p.textContent = line;
            overlayExtra.appendChild(p);
          }
        }
      } else if (mode === 'match') {
        overlayTitle.textContent = data.won ? 'THE YARD IS YOURS' : 'ASHEN HOLDS THE YARD';
        overlayCopy.textContent = `Final score — EMBER ${data.ember} : ${data.ashen} ASHEN. ${data.won ? 'Five rounds, taken with fire.' : 'The defenders kept their ground.'}`;
        overlayAction.textContent = 'Play again';
      }
      if (mode !== 'buy') buyPanel.style.display = 'none';
      overlayAction.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      overlayAction.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyPanel.addEventListener('click', (event) => {
        const button = event.target.closest('[data-buy]');
        if (button) handler(button.dataset.buy);
      });
    },
    setBuyPrices(prices) {
      for (const button of buyPanel.querySelectorAll('[data-buy]')) {
        const price = button.querySelector('.buy-price');
        if (price) price.textContent = prices[button.dataset.buy] ?? '';
      }
    },
    markBought(id, bought) {
      const button = buyPanel.querySelector(`[data-buy="${id}"]`);
      if (button) button.classList.toggle('owned', bought);
    },
  };
}
