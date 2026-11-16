// The DOM HUD: crosshair, hit marker, health and armour, ammo, money, round
// score, timer, capture bar, kill feed, minimap and the buy menu. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
import { BUY_ITEMS } from './weapon.js';

const COPY = {
  start: {
    title: 'DUSTLINE',
    copy: 'A 5v5 tactical FPS. First team to 5 rounds wins — eliminate the enemy team or hold the centre zone. Buy between rounds. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'DUSTLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  buy: {
    title: 'Buy phase',
    copy: 'Spend your money before the round starts. Click a card or press its number key.',
    action: 'Start round',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Continue',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorFill = $('armor-fill');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const scoreV = $('score-vanguard');
  const scoreE = $('score-ember');
  const roundValue = $('round-value');
  const timerValue = $('timer-value');
  const captureWrap = $('capture');
  const captureFill = $('capture-fill');
  const captureLabel = $('capture-label');
  const killfeed = $('killfeed');
  const hitmarker = $('hitmarker');
  const minimap = $('minimap');
  const buyGrid = $('buy-grid');
  const buyMoney = $('buy-money');
  const crosshair = $('crosshair');
  let hitTimer = 0;
  let last = {};

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = String(value);
  }

  // Build the buy menu cards once; main.js fills prices and affordability.
  const buyButtons = [];
  for (const item of BUY_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-card';
    button.dataset.item = item.id;
    button.innerHTML = `<span class="buy-label"></span><span class="buy-price"></span>`;
    button.querySelector('.buy-label').textContent = item.label;
    button.querySelector('.buy-price').textContent = `$${item.price}`;
    buyGrid.appendChild(button);
    buyButtons.push({ item, button });
  }

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, mag, 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'res');
      setText(weaponName, name, 'wname');
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(health, armor) {
      healthFill.style.width = `${Math.max(0, health)}%`;
      armorFill.style.width = `${Math.max(0, armor)}%`;
      setText(healthValue, Math.ceil(health), 'hp');
      setText(armorValue, Math.ceil(armor), 'ar');
      healthFill.classList.toggle('low', health <= 30);
    },
    setMoney(value) {
      setText(moneyValue, `$${value}`, 'money');
      setText(buyMoney, `$${value}`, 'buymoney');
    },
    setScore(vanguard, ember, round) {
      setText(scoreV, vanguard, 'sv');
      setText(scoreE, ember, 'se');
      setText(roundValue, `Round ${round}`, 'round');
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerValue, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 'timer');
    },
    setCapture(team, progress) {
      if (!team) {
        captureWrap.classList.add('hidden');
        return;
      }
      captureWrap.classList.remove('hidden');
      captureFill.style.width = `${Math.round(progress * 100)}%`;
      captureFill.className = team === 'vanguard' ? 'vanguard' : 'ember';
      setText(captureLabel, team === 'vanguard' ? 'VANGUARD capturing' : 'EMBER capturing', 'cap');
    },
    setSpread(px) {
      crosshair.style.setProperty('--spread', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    feed(killer, victim, headshot) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const k = document.createElement('b');
      k.textContent = killer;
      k.className = killer === 'YOU' ? 'you' : '';
      const v = document.createElement('span');
      v.textContent = victim;
      v.className = victim === 'YOU' ? 'you' : '';
      row.append(k, document.createTextNode(headshot ? ' ⌖ ' : ' ✕ '), v);
      killfeed.prepend(row);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    drawMinimap(half, capture, player, bots) {
      const ctx = minimap.getContext('2d');
      const w = minimap.width;
      const h = minimap.height;
      const scale = w / (half * 2 + 4);
      const toX = (x) => w / 2 + x * scale;
      const toY = (z) => h / 2 + z * scale;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(20,24,30,0.85)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#2e3742';
      ctx.strokeRect(toX(-half), toY(-half), half * 2 * scale, half * 2 * scale);
      // Capture zone.
      ctx.beginPath();
      ctx.arc(toX(capture.x), toY(capture.z), capture.radius * scale, 0, Math.PI * 2);
      ctx.strokeStyle = '#f0a830';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const dot = (x, z, color, r = 3) => {
        ctx.beginPath();
        ctx.arc(toX(x), toY(z), r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      };
      for (const bot of bots) {
        if (!bot.alive) continue;
        dot(bot.position.x, bot.position.z, bot.team === 'vanguard' ? '#3fa7ff' : '#ff5a3c', 2.5);
      }
      if (player.alive) {
        dot(player.position.x, player.position.z, '#ece8de', 3.5);
        // Facing tick.
        const fx = toX(player.position.x) - Math.sin(player.yaw) * 7;
        const fy = toY(player.position.z) - Math.cos(player.yaw) * 7;
        ctx.beginPath();
        ctx.moveTo(toX(player.position.x), toY(player.position.z));
        ctx.lineTo(fx, fy);
        ctx.strokeStyle = '#ece8de';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    },
    showOverlay(mode, detail = '') {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = detail || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      $('buy-panel').hidden = mode !== 'buy';
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
      $('buy-panel').hidden = true;
    },
    refreshBuy(money, ownedWeapon) {
      for (const { item, button } of buyButtons) {
        const affordable = money >= item.price;
        const owned = item.kind === 'weapon' && item.id === ownedWeapon;
        button.disabled = !affordable || owned;
        button.classList.toggle('owned', owned);
      }
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      for (const { item, button } of buyButtons) {
        button.addEventListener('click', () => handler(item.id));
      }
    },
  };
}
