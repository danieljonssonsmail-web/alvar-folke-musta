(() => {
  'use strict';

  const app = window.AlvarApp;
  const BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
  const MAX_PRIVATE = 40;
  const MAX_PUBLIC = 60;

  let mqttClient = null;
  let broadcastChannel = null;
  let activeRoom = '';
  let connectionState = 'idle';
  const listeners = new Set();

  function diceState() {
    const state = app.getState();
    if (!state.dice || typeof state.dice !== 'object') {
      state.dice = { mode: 'private', roomCode: 'MUSTA-GRUPP-7Q4K9X2M', privateLogs: {}, publicLogs: [] };
    }
    if (!state.dice.privateLogs || typeof state.dice.privateLogs !== 'object') state.dice.privateLogs = {};
    if (!Array.isArray(state.dice.publicLogs)) state.dice.publicLogs = [];
    return state.dice;
  }

  function safeRoom(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/å/g, 'a')
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'musta-grupp';
  }

  function topics(roomCode) {
    const room = safeRoom(roomCode);
    return {
      roll: `dod-alvar-musta/${room}/rolls`,
      history: `dod-alvar-musta/${room}/history`
    };
  }

  function emit() {
    listeners.forEach((listener) => {
      try { listener(); } catch (error) { console.warn(error); }
    });
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const normalized = {
      id: String(entry.id || app.makeId('roll')),
      timestamp: Number(entry.timestamp) || Date.now(),
      characterKey: String(entry.characterKey || 'unknown'),
      characterName: String(entry.characterName || 'Okänd'),
      player: String(entry.player || ''),
      label: String(entry.label || 'Tärningsslag'),
      kind: String(entry.kind || 'custom'),
      formula: String(entry.formula || ''),
      dice: Array.isArray(entry.dice) ? entry.dice.slice(0, 50).map((die) => ({
        sides: Math.max(2, Math.min(1000, Number(die?.sides) || 6)),
        result: Number(die?.result) || 0,
        sign: Number(die?.sign) < 0 ? -1 : 1
      })) : [],
      modifier: Number(entry.modifier) || 0,
      total: Number(entry.total) || 0,
      target: entry.target === null || entry.target === undefined || entry.target === '' ? null : Number(entry.target),
      outcome: String(entry.outcome || ''),
      pending: Boolean(entry.pending)
    };
    return normalized;
  }

  function mergePublic(entries, save = true) {
    const state = diceState();
    const byId = new Map(state.publicLogs.map((entry) => [entry.id, normalizeEntry(entry)]).filter(([, entry]) => entry));
    entries.forEach((raw) => {
      const entry = normalizeEntry(raw);
      if (!entry) return;
      const previous = byId.get(entry.id);
      byId.set(entry.id, previous ? { ...previous, ...entry, pending: previous.pending && entry.pending } : entry);
    });
    state.publicLogs = [...byId.values()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_PUBLIC);
    if (save) app.saveState('Offentligt slag mottaget');
    emit();
  }

  function receivePayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'roll' && payload.entry) mergePublic([payload.entry]);
    if (payload.type === 'history' && Array.isArray(payload.entries)) mergePublic(payload.entries);
  }

  function closeConnections() {
    if (mqttClient) {
      try { mqttClient.end(true); } catch (error) { console.warn(error); }
      mqttClient = null;
    }
    if (broadcastChannel) {
      try { broadcastChannel.close(); } catch (error) { console.warn(error); }
      broadcastChannel = null;
    }
  }

  function connect(roomCode = diceState().roomCode) {
    const room = safeRoom(roomCode);
    if (activeRoom === room && (mqttClient || broadcastChannel)) return;
    closeConnections();
    activeRoom = room;
    connectionState = 'connecting';
    emit();

    if ('BroadcastChannel' in window) {
      try {
        broadcastChannel = new BroadcastChannel(`dod-dice-${room}`);
        broadcastChannel.addEventListener('message', (event) => receivePayload(event.data));
      } catch (error) {
        console.warn('BroadcastChannel kunde inte startas:', error);
      }
    }

    if (!window.mqtt?.connect) {
      connectionState = broadcastChannel ? 'local-only' : 'offline';
      emit();
      return;
    }

    const channelTopics = topics(room);
    try {
      mqttClient = window.mqtt.connect(BROKER_URL, {
        clientId: `dod_${Math.random().toString(16).slice(2, 10)}_${Date.now().toString(16).slice(-6)}`,
        clean: true,
        keepalive: 30,
        connectTimeout: 10000,
        reconnectPeriod: 3000,
        protocolVersion: 4
      });

      mqttClient.on('connect', () => {
        connectionState = 'connected';
        mqttClient.subscribe([channelTopics.roll, channelTopics.history], { qos: 0 }, (error) => {
          if (error) console.warn('Kunde inte prenumerera på offentliga slag:', error);
        });
        flushPending();
        emit();
      });
      mqttClient.on('reconnect', () => { connectionState = 'reconnecting'; emit(); });
      mqttClient.on('offline', () => { connectionState = broadcastChannel ? 'local-only' : 'offline'; emit(); });
      mqttClient.on('close', () => {
        if (connectionState !== 'reconnecting') connectionState = broadcastChannel ? 'local-only' : 'offline';
        emit();
      });
      mqttClient.on('error', (error) => {
        console.warn('Offentlig tärningssynk:', error?.message || error);
        connectionState = broadcastChannel ? 'local-only' : 'offline';
        emit();
      });
      mqttClient.on('message', (_topic, message) => {
        try { receivePayload(JSON.parse(message.toString())); } catch (error) { /* ignore malformed public messages */ }
      });
    } catch (error) {
      console.warn('Kunde inte ansluta offentlig tärningssynk:', error);
      mqttClient = null;
      connectionState = broadcastChannel ? 'local-only' : 'offline';
      emit();
    }
  }

  function publishPayload(payload, retained = false) {
    if (broadcastChannel) {
      try { broadcastChannel.postMessage(payload); } catch (error) { console.warn(error); }
    }
    if (!mqttClient?.connected) return false;
    const channelTopics = topics(activeRoom || diceState().roomCode);
    const topic = payload.type === 'history' ? channelTopics.history : channelTopics.roll;
    try {
      mqttClient.publish(topic, JSON.stringify(payload), { qos: 0, retain: retained });
      return true;
    } catch (error) {
      console.warn('Kunde inte publicera tärningsslag:', error);
      return false;
    }
  }

  function publishHistory() {
    const entries = diceState().publicLogs
      .filter((entry) => !entry.pending)
      .slice(-30)
      .map((entry) => ({ ...entry, pending: false }));
    if (entries.length) publishPayload({ type: 'history', entries }, true);
  }

  function flushPending() {
    const state = diceState();
    let changed = false;
    state.publicLogs.forEach((entry) => {
      if (!entry.pending) return;
      if (publishPayload({ type: 'roll', entry: { ...entry, pending: false } })) {
        entry.pending = false;
        changed = true;
      }
    });
    if (changed) {
      app.saveState('Offentliga slag synkade');
      publishHistory();
      emit();
    }
  }

  function randomInt(sides) {
    const maximum = Math.max(2, Math.min(1000, Number(sides) || 6));
    if (window.crypto?.getRandomValues) {
      const maxUint = 0x100000000;
      const limit = maxUint - (maxUint % maximum);
      const array = new Uint32Array(1);
      do { window.crypto.getRandomValues(array); } while (array[0] >= limit);
      return (array[0] % maximum) + 1;
    }
    return Math.floor(Math.random() * maximum) + 1;
  }

  function rollPool(count, sides, modifier = 0) {
    const safeCount = Math.max(1, Math.min(20, Number(count) || 1));
    const safeSides = Math.max(2, Math.min(1000, Number(sides) || 6));
    const safeModifier = Math.max(-999, Math.min(999, Number(modifier) || 0));
    const dice = Array.from({ length: safeCount }, () => ({ sides: safeSides, result: randomInt(safeSides), sign: 1 }));
    return {
      formula: `${safeCount > 1 ? safeCount : ''}T${safeSides}${safeModifier > 0 ? `+${safeModifier}` : safeModifier < 0 ? safeModifier : ''}`,
      dice,
      modifier: safeModifier,
      total: dice.reduce((sum, die) => sum + die.result, safeModifier)
    };
  }

  function parseAndRollFormula(value) {
    const original = String(value || '').trim();
    const formula = original
      .toUpperCase()
      .replace(/D/g, 'T')
      .replace(/\s+/g, '');
    if (!formula) return rollPool(1, 6, 0);
    const tokens = formula.match(/[+-]?[^+-]+/g) || [];
    const dice = [];
    let modifier = 0;
    let valid = false;
    for (const token of tokens) {
      const sign = token.startsWith('-') ? -1 : 1;
      const body = token.replace(/^[+-]/, '');
      const dieMatch = body.match(/^(\d*)T(\d+)$/);
      if (dieMatch) {
        const count = Math.max(1, Math.min(20, Number(dieMatch[1] || 1)));
        const sides = Math.max(2, Math.min(1000, Number(dieMatch[2] || 6)));
        for (let index = 0; index < count; index += 1) dice.push({ sides, result: randomInt(sides), sign });
        valid = true;
        continue;
      }
      if (/^\d+$/.test(body)) {
        modifier += sign * Number(body);
        valid = true;
      }
    }
    if (!valid || !dice.length) return rollPool(1, 6, 0);
    return {
      formula,
      dice,
      modifier,
      total: dice.reduce((sum, die) => sum + (die.result * die.sign), modifier)
    };
  }

  function skillOutcome(result, target) {
    if (result === 1) return 'Drakslag';
    if (result === 20) return 'Demonslag';
    if (target === null || Number.isNaN(Number(target))) return '';
    return result <= Number(target) ? 'Lyckat' : 'Misslyckat';
  }

  function entryContext(context) {
    const read = (value, fallback = '') => typeof value === 'function' ? value() : (value ?? fallback);
    return {
      characterKey: String(read(context.characterKey, 'unknown')),
      characterName: String(read(context.characterName, 'Okänd')),
      player: String(read(context.player, ''))
    };
  }

  function saveRoll(context, roll) {
    const state = diceState();
    const details = entryContext(context);
    const entry = normalizeEntry({
      id: app.makeId('roll'),
      timestamp: Date.now(),
      ...details,
      ...roll
    });

    if (state.mode === 'public') {
      entry.pending = !mqttClient?.connected;
      state.publicLogs.push(entry);
      state.publicLogs = state.publicLogs.slice(-MAX_PUBLIC);
      app.saveState(entry.pending ? 'Slaget sparades – väntar på synk' : 'Offentligt slag skickat');
      const sent = publishPayload({ type: 'roll', entry: { ...entry, pending: false } });
      if (sent) {
        entry.pending = false;
        app.saveState('Offentligt slag skickat');
        publishHistory();
      }
    } else {
      if (!Array.isArray(state.privateLogs[details.characterKey])) state.privateLogs[details.characterKey] = [];
      state.privateLogs[details.characterKey].push(entry);
      state.privateLogs[details.characterKey] = state.privateLogs[details.characterKey].slice(-MAX_PRIVATE);
      app.saveState('Privat slag sparat');
    }
    emit();
    return entry;
  }

  function formatTime(timestamp) {
    try { return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp)); }
    catch (error) { return ''; }
  }

  function resultDetails(entry) {
    const dice = entry.dice.map((die) => `${die.sign < 0 ? '−' : ''}${die.result}`).join(', ');
    const modifier = entry.modifier > 0 ? ` + ${entry.modifier}` : entry.modifier < 0 ? ` − ${Math.abs(entry.modifier)}` : '';
    const target = entry.target !== null ? ` mot ${entry.target}` : '';
    return `${dice}${modifier}${target}`;
  }

  function logMarkup(entries, emptyText, isPublic = false) {
    if (!entries.length) return `<p class="dice-empty">${app.escapeHtml(emptyText)}</p>`;
    return [...entries].reverse().map((entry) => `
      <article class="dice-log-entry ${entry.outcome === 'Drakslag' ? 'dragon' : entry.outcome === 'Demonslag' ? 'demon' : ''}">
        <div class="dice-log-top">
          <strong>${app.escapeHtml(entry.label)}</strong>
          <time datetime="${new Date(entry.timestamp).toISOString()}">${formatTime(entry.timestamp)}</time>
        </div>
        <div class="dice-result-line">
          <span class="dice-total">${app.escapeHtml(entry.total)}</span>
          <span>${app.escapeHtml(entry.formula || 'Slag')}</span>
          ${entry.outcome ? `<b>${app.escapeHtml(entry.outcome)}</b>` : ''}
          ${entry.pending ? '<em>väntar på synk</em>' : ''}
        </div>
        <p>${app.escapeHtml(resultDetails(entry))}</p>
        ${isPublic ? `<small>${app.escapeHtml(entry.characterName)}${entry.player ? ` · ${app.escapeHtml(entry.player)}` : ''}</small>` : ''}
      </article>
    `).join('');
  }

  function statusText() {
    const labels = {
      connected: ['Ansluten', 'online'],
      connecting: ['Ansluter…', 'waiting'],
      reconnecting: ['Återansluter…', 'waiting'],
      'local-only': ['Endast denna enhet', 'warning'],
      offline: ['Offline', 'warning'],
      idle: ['Inte startad', 'waiting']
    };
    return labels[connectionState] || labels.offline;
  }

  function mount(target, context) {
    const container = typeof target === 'string' ? document.getElementById(target) : target;
    if (!container) return null;
    const state = diceState();
    const character = entryContext(context);
    const dockMode = context?.layout === 'dock';
    let lastEntry = null;

    const readContextValue = (value, fallback) => {
      try {
        const result = typeof value === 'function' ? value() : value;
        return result == null ? fallback : result;
      } catch (error) {
        console.warn(error);
        return fallback;
      }
    };
    const combatData = () => {
      const raw = readContextValue(context?.combat, {}) || {};
      return {
        hpCurrent: Number(raw.hpCurrent) || 0,
        hpMax: Number(raw.hpMax) || 0,
        wpCurrent: Number(raw.wpCurrent) || 0,
        wpMax: Number(raw.wpMax) || 0,
        armor: Number(raw.armor) || 0,
        armorCrush: Number(raw.armorCrush) || 0,
        armorSlash: Number(raw.armorSlash) || 0,
        conditions: Array.isArray(raw.conditions) ? raw.conditions.map(String) : []
      };
    };
    const skillData = () => {
      const list = readContextValue(context?.skills, []);
      return (Array.isArray(list) ? list : []).map((skill) => ({
        name: String(skill?.name || 'Färdighet'),
        value: skill?.value === null || skill?.value === undefined ? null : Number(skill.value),
        group: String(skill?.group || '')
      }));
    };
    const weaponData = () => {
      const list = readContextValue(context?.weapons, []);
      return (Array.isArray(list) ? list : []).map((weapon) => ({
        name: String(weapon?.name || 'Vapen'),
        skill: String(weapon?.skill || ''),
        target: weapon?.target === null || weapon?.target === undefined ? null : Number(weapon.target),
        damage: String(weapon?.damage || 'T6'),
        properties: String(weapon?.properties || '')
      }));
    };

    if (dockMode) {
      document.body.classList.add('dice-dock-active');
      container.classList.add('dice-dock-host');
      container.innerHTML = `
        <article class="dice-dock-card" aria-label="Spelrad för ${app.escapeHtml(character.characterName)}">
          <div class="dice-dock-main">
            <div class="dice-dock-character">
              <span>Spelrad</span>
              <strong>${app.escapeHtml(character.characterName)}</strong>
            </div>

            <div class="combat-resource-strip" aria-label="Kroppspoäng och viljepoäng">
              <div class="combat-resource" data-combat-resource="hp">
                <span>KP</span>
                <button type="button" data-resource-change="hp" data-resource-action="-1" aria-label="Minska kroppspoäng med ett">−</button>
                <button class="combat-resource-value" type="button" data-resource-edit="hp" aria-label="Skriv in kroppspoäng"><strong data-resource-value="hp">0/0</strong></button>
                <button type="button" data-resource-change="hp" data-resource-action="1" aria-label="Öka kroppspoäng med ett">+</button>
                <button class="combat-resource-reset" type="button" data-resource-reset="hp" aria-label="Återställ kroppspoäng">Full</button>
              </div>
              <div class="combat-resource" data-combat-resource="wp">
                <span>VP</span>
                <button type="button" data-resource-change="wp" data-resource-action="-1" aria-label="Minska viljepoäng med ett">−</button>
                <button class="combat-resource-value" type="button" data-resource-edit="wp" aria-label="Skriv in viljepoäng"><strong data-resource-value="wp">0/0</strong></button>
                <button type="button" data-resource-change="wp" data-resource-action="1" aria-label="Öka viljepoäng med ett">+</button>
                <button class="combat-resource-reset" type="button" data-resource-reset="wp" aria-label="Återställ viljepoäng">Full</button>
              </div>
            </div>

            <div class="combat-armor-chip" title="Normalt skydd från rustning">
              <span>Skydd</span><strong data-combat-armor>0</strong>
            </div>

            <div class="dice-mode dice-mode-compact" role="group" aria-label="Vem ser slaget">
              <button type="button" data-dice-mode="private">Privat</button>
              <button type="button" data-dice-mode="public">Offentligt</button>
            </div>

            <div class="combat-weapon-quick" aria-label="Snabbt vapenslag">
              <select data-quick-weapon aria-label="Välj vapen"></select>
              <button class="btn btn-small btn-ghost" type="button" data-roll-weapon-attack>Attack</button>
              <button class="btn btn-small btn-secondary" type="button" data-roll-weapon-damage>Skada</button>
            </div>

            <div class="dice-quick dice-quick-dock" aria-label="Snabba tärningar">
              ${[4, 6, 8, 10, 12, 20].map((sides) => `<button class="die-button" type="button" data-quick-die="${sides}">T${sides}</button>`).join('')}
            </div>

            <div class="dice-dock-latest" data-dice-latest aria-live="polite"></div>
            <button class="btn btn-small btn-ghost dice-dock-expand" type="button" data-dice-expand aria-expanded="false">Strid & slag</button>
          </div>

          <div class="dice-dock-drawer" data-dice-drawer hidden>
            <div class="dice-tool-grid">
              <section class="dice-tool-panel">
                <p class="eyebrow">Färdighetsslag</p>
                <h3>Slå utan att leta i bladet</h3>
                <div class="dice-select-action">
                  <select data-quick-skill aria-label="Välj färdighet"></select>
                  <button class="btn btn-secondary" type="button" data-roll-selected-skill>Slå T20</button>
                </div>
                <div class="combat-status-summary">
                  <span><b>Rustning:</b> <span data-combat-protection></span></span>
                  <span><b>Tillstånd:</b> <span data-combat-conditions></span></span>
                </div>
              </section>

              <section class="dice-tool-panel">
                <p class="eyebrow">Valfri tärning</p>
                <h3>Antal, sidor och modifikation</h3>
                <div class="dice-quick dice-quick-drawer">
                  ${[4, 6, 8, 10, 12, 20, 100].map((sides) => `<button class="die-button" type="button" data-quick-die="${sides}">T${sides}</button>`).join('')}
                </div>
                <form class="dice-custom-form">
                  <label class="field"><span>Antal</span><input name="count" type="number" min="1" max="20" value="1"></label>
                  <label class="field"><span>Tärning</span><input name="sides" type="number" min="2" max="1000" value="6"></label>
                  <label class="field"><span>Modifikation</span><input name="modifier" type="number" min="-999" max="999" value="0"></label>
                  <label class="field dice-label-field"><span>Vad gäller slaget?</span><input name="label" type="text" placeholder="Exempel: Slumpmöte eller giftets varaktighet"></label>
                  <button class="btn btn-secondary" type="submit">Slå</button>
                </form>
              </section>
            </div>

            <div class="dice-public-settings">
              <label class="field dice-room-field"><span>Gruppkod för offentliga slag</span><input data-dice-room type="text" value="${app.escapeHtml(state.roomCode)}" maxlength="80"></label>
              <button class="btn btn-small btn-ghost" type="button" data-copy-room>Kopiera kod</button>
              <span class="dice-status" data-dice-status></span>
            </div>
            <div class="dice-log-grid dice-log-grid-dock">
              <section class="dice-log-panel">
                <div class="dice-log-heading"><div><p class="eyebrow">Bara här</p><h3>Privata slag</h3></div><button class="btn btn-small btn-ghost" type="button" data-clear-private>Rensa</button></div>
                <div data-private-log></div>
              </section>
              <section class="dice-log-panel public-log-panel">
                <div class="dice-log-heading"><div><p class="eyebrow">Gruppen</p><h3>Offentliga slag</h3></div></div>
                <div data-public-log></div>
              </section>
            </div>
          </div>
        </article>`;
    } else {
      container.innerHTML = `
        <article class="card dice-card">
          <div class="dice-header">
            <div>
              <p class="eyebrow">Tärningsbord</p>
              <h2>Slå som ${app.escapeHtml(character.characterName)}</h2>
              <p class="muted">Välj privat för ett slag som bara sparas på den här enheten, eller offentligt för gruppens gemensamma logg.</p>
            </div>
            <div class="dice-mode" role="group" aria-label="Vem ser slaget">
              <button type="button" data-dice-mode="private">Privat</button>
              <button type="button" data-dice-mode="public">Offentligt</button>
            </div>
          </div>

          <div class="dice-quick" aria-label="Snabba tärningar">
            ${[4, 6, 8, 10, 12, 20, 100].map((sides) => `<button class="die-button" type="button" data-quick-die="${sides}">T${sides}</button>`).join('')}
          </div>

          <form class="dice-custom-form">
            <label class="field"><span>Antal</span><input name="count" type="number" min="1" max="20" value="1"></label>
            <label class="field"><span>Tärning</span><input name="sides" type="number" min="2" max="1000" value="6"></label>
            <label class="field"><span>Modifikation</span><input name="modifier" type="number" min="-999" max="999" value="0"></label>
            <label class="field dice-label-field"><span>Vad gäller slaget?</span><input name="label" type="text" placeholder="Exempel: Slumpmöte eller giftets varaktighet"></label>
            <button class="btn btn-secondary" type="submit">Slå valfri tärning</button>
          </form>

          <div class="dice-public-settings">
            <label class="field dice-room-field"><span>Gruppkod för offentliga slag</span><input data-dice-room type="text" value="${app.escapeHtml(state.roomCode)}" maxlength="80"></label>
            <button class="btn btn-small btn-ghost" type="button" data-copy-room>Kopiera kod</button>
            <span class="dice-status" data-dice-status></span>
          </div>

          <div class="dice-log-grid">
            <section class="dice-log-panel">
              <div class="dice-log-heading">
                <div><p class="eyebrow">Bara här</p><h3>Privata slag</h3></div>
                <button class="btn btn-small btn-ghost" type="button" data-clear-private>Rensa</button>
              </div>
              <div data-private-log></div>
            </section>
            <section class="dice-log-panel public-log-panel">
              <div class="dice-log-heading"><div><p class="eyebrow">Gruppen</p><h3>Offentliga slag</h3></div></div>
              <div data-public-log></div>
            </section>
          </div>
        </article>`;
    }

    function currentLatest(current) {
      const key = entryContext(context).characterKey;
      if (lastEntry) return lastEntry;
      if (current.mode === 'public') return current.publicLogs.at(-1) || null;
      const privateEntries = Array.isArray(current.privateLogs[key]) ? current.privateLogs[key] : [];
      return privateEntries.at(-1) || null;
    }

    function latestMarkup(entry) {
      if (!entry) return '<span>Redo att slå</span><strong>–</strong>';
      const visibility = diceState().mode === 'public' ? 'Offentligt' : 'Privat';
      return `<span>${app.escapeHtml(visibility)} · ${app.escapeHtml(entry.label)}</span><strong>${app.escapeHtml(entry.total)}${entry.outcome ? ` · ${app.escapeHtml(entry.outcome)}` : ''}</strong>`;
    }

    function syncQuickSelects() {
      const skillSelect = container.querySelector('[data-quick-skill]');
      if (skillSelect) {
        const selected = skillSelect.value;
        const skills = skillData();
        skillSelect.innerHTML = skills.length
          ? skills.map((skill, index) => `<option value="${index}">${app.escapeHtml(skill.group ? `${skill.group}: ${skill.name} (${skill.value ?? '–'})` : `${skill.name} (${skill.value ?? '–'})`)}</option>`).join('')
          : '<option value="">Inga färdigheter inlagda</option>';
        if (selected && [...skillSelect.options].some((option) => option.value === selected)) skillSelect.value = selected;
      }

      const weaponSelect = container.querySelector('[data-quick-weapon]');
      if (weaponSelect) {
        const selected = weaponSelect.value;
        const weapons = weaponData();
        weaponSelect.innerHTML = weapons.length
          ? weapons.map((weapon, index) => `<option value="${index}">${app.escapeHtml(`${weapon.name} · ${weapon.target ?? '–'} · ${weapon.damage}`)}</option>`).join('')
          : '<option value="">Inga vapen</option>';
        if (selected && [...weaponSelect.options].some((option) => option.value === selected)) weaponSelect.value = selected;
      }
    }

    function render() {
      const current = diceState();
      syncQuickSelects();
      const combat = combatData();
      const hpValue = container.querySelector('[data-resource-value="hp"]');
      const wpValue = container.querySelector('[data-resource-value="wp"]');
      if (hpValue) hpValue.textContent = `${combat.hpCurrent}/${combat.hpMax}`;
      if (wpValue) wpValue.textContent = `${combat.wpCurrent}/${combat.wpMax}`;
      const armorValue = container.querySelector('[data-combat-armor]');
      if (armorValue) armorValue.textContent = combat.armor;
      const protection = container.querySelector('[data-combat-protection]');
      if (protection) protection.textContent = `normal ${combat.armor}, kross ${combat.armorCrush}, hugg ${combat.armorSlash}`;
      const conditions = container.querySelector('[data-combat-conditions]');
      if (conditions) conditions.textContent = combat.conditions.length ? combat.conditions.join(', ') : 'inga aktiva';
      container.querySelectorAll('[data-dice-mode]').forEach((button) => {
        const active = button.dataset.diceMode === current.mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const roomInput = container.querySelector('[data-dice-room]');
      if (roomInput && document.activeElement !== roomInput) roomInput.value = current.roomCode;
      const status = container.querySelector('[data-dice-status]');
      if (status) {
        const [text, className] = statusText();
        status.className = `dice-status ${className}`;
        status.textContent = `Offentlig synk: ${text}`;
      }
      const key = entryContext(context).characterKey;
      const privateEntries = Array.isArray(current.privateLogs[key]) ? current.privateLogs[key] : [];
      const privateLog = container.querySelector('[data-private-log]');
      const publicLog = container.querySelector('[data-public-log]');
      if (privateLog) privateLog.innerHTML = logMarkup(privateEntries, 'Inga privata slag för den här karaktären ännu.');
      if (publicLog) publicLog.innerHTML = logMarkup(current.publicLogs, 'Inga offentliga slag har setts i gruppen ännu.', true);
      const latest = container.querySelector('[data-dice-latest]');
      if (latest) latest.innerHTML = latestMarkup(currentLatest(current));
    }

    function announce(entry) {
      lastEntry = entry;
      render();
      if (!entry) return entry;
      const outcome = entry.outcome ? ` – ${entry.outcome}` : '';
      app.showToast(`${entry.label}: ${entry.total}${outcome}`);
      const latest = container.querySelector('[data-dice-latest]');
      if (latest) {
        latest.classList.remove('dice-result-flash');
        void latest.offsetWidth;
        latest.classList.add('dice-result-flash');
      }
      return entry;
    }

    function controllerRollSkill(label, target, kind = 'skill') {
      const pool = rollPool(1, 20, 0);
      const result = pool.dice[0].result;
      return announce(saveRoll(context, {
        label,
        kind,
        formula: 'T20',
        dice: pool.dice,
        modifier: 0,
        total: result,
        target: target === null || target === undefined || target === '' ? null : Number(target),
        outcome: skillOutcome(result, target)
      }));
    }

    function controllerRollFormula(label, formula, kind = 'damage') {
      const rolled = parseAndRollFormula(formula);
      return announce(saveRoll(context, { label, kind, ...rolled, target: null, outcome: '' }));
    }

    function controllerRollCustom(label, count = 1, sides = 6, modifier = 0) {
      const rolled = rollPool(count, sides, modifier);
      return announce(saveRoll(context, { label: label || `Slumpmässigt ${rolled.formula}-slag`, kind: 'custom', ...rolled, target: null, outcome: '' }));
    }

    container.querySelectorAll('[data-dice-mode]').forEach((button) => button.addEventListener('click', () => {
      diceState().mode = button.dataset.diceMode;
      lastEntry = null;
      app.saveState(button.dataset.diceMode === 'public' ? 'Offentliga slag valda' : 'Privata slag valda');
      render();
    }));

    container.querySelectorAll('[data-resource-change]').forEach((button) => button.addEventListener('click', () => {
      const resource = button.dataset.resourceChange;
      const action = Number(button.dataset.resourceAction) || 0;
      if (typeof context?.changeResource === 'function') context.changeResource(resource, action);
      render();
    }));

    container.querySelectorAll('[data-resource-reset]').forEach((button) => button.addEventListener('click', () => {
      if (typeof context?.changeResource === 'function') context.changeResource(button.dataset.resourceReset, 'reset');
      render();
    }));

    container.querySelectorAll('[data-resource-edit]').forEach((button) => button.addEventListener('click', () => {
      const resource = button.dataset.resourceEdit;
      const combat = combatData();
      const current = resource === 'hp' ? combat.hpCurrent : combat.wpCurrent;
      const label = resource === 'hp' ? 'KP' : 'VP';
      const entered = prompt(`Nytt värde för ${label}:`, String(current));
      if (entered === null || entered.trim() === '') return;
      const value = Number(entered);
      if (!Number.isFinite(value)) return;
      if (typeof context?.changeResource === 'function') context.changeResource(resource, { set: value });
      render();
    }));

    container.querySelector('[data-roll-selected-skill]')?.addEventListener('click', () => {
      const select = container.querySelector('[data-quick-skill]');
      const skills = skillData();
      const skill = skills[Number(select?.value)];
      if (!skill) return app.showToast('Ingen färdighet vald');
      controllerRollSkill(skill.name, skill.value, 'skill');
    });

    container.querySelector('[data-roll-weapon-attack]')?.addEventListener('click', () => {
      const select = container.querySelector('[data-quick-weapon]');
      const weapons = weaponData();
      const weapon = weapons[Number(select?.value)];
      if (!weapon) return app.showToast('Inget vapen valt');
      controllerRollSkill(`${weapon.name} – attack`, weapon.target, 'weapon-attack');
    });

    container.querySelector('[data-roll-weapon-damage]')?.addEventListener('click', () => {
      const select = container.querySelector('[data-quick-weapon]');
      const weapons = weaponData();
      const weapon = weapons[Number(select?.value)];
      if (!weapon) return app.showToast('Inget vapen valt');
      controllerRollFormula(`${weapon.name} – skada`, weapon.damage || 'T6', 'weapon-damage');
    });

    container.querySelectorAll('[data-quick-die]').forEach((button) => button.addEventListener('click', () => {
      const sides = Number(button.dataset.quickDie);
      controllerRollCustom(`Slumpmässigt T${sides}-slag`, 1, sides, 0);
    }));

    container.querySelector('.dice-custom-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const rolled = rollPool(form.elements.count.value, form.elements.sides.value, form.elements.modifier.value);
      const label = form.elements.label.value.trim() || `Slumpmässigt ${rolled.formula}-slag`;
      announce(saveRoll(context, { label, kind: 'custom', ...rolled, target: null, outcome: '' }));
    });

    container.querySelector('[data-dice-room]')?.addEventListener('change', (event) => {
      const value = event.target.value.trim() || 'MUSTA-GRUPP-7Q4K9X2M';
      diceState().roomCode = value;
      app.saveState('Gruppkoden sparad');
      connect(value);
      render();
    });

    container.querySelector('[data-copy-room]')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(diceState().roomCode);
        app.showToast('Gruppkoden kopierad');
      } catch (error) {
        app.showToast(`Gruppkod: ${diceState().roomCode}`);
      }
    });

    container.querySelector('[data-clear-private]')?.addEventListener('click', () => {
      const key = entryContext(context).characterKey;
      if (!confirm('Rensa den privata tärningsloggen för den här karaktären?')) return;
      diceState().privateLogs[key] = [];
      lastEntry = null;
      app.saveState('Privata slag rensade');
      render();
    });

    container.querySelector('[data-dice-expand]')?.addEventListener('click', (event) => {
      const drawer = container.querySelector('[data-dice-drawer]');
      const shouldOpen = drawer?.hidden ?? true;
      if (drawer) drawer.hidden = !shouldOpen;
      event.currentTarget.setAttribute('aria-expanded', String(shouldOpen));
      event.currentTarget.textContent = shouldOpen ? 'Stäng' : 'Strid & slag';
    });

    const listener = () => render();
    listeners.add(listener);
    connect(state.roomCode);
    render();

    return {
      rollSkill: controllerRollSkill,
      rollFormula: controllerRollFormula,
      rollCustom: controllerRollCustom,
      refresh: render,
      destroy() {
        listeners.delete(listener);
        if (dockMode) document.body.classList.remove('dice-dock-active');
      }
    };
  }

  window.DodDice = {
    mount,
    parseAndRollFormula,
    rollPool,
    getConnectionState: () => connectionState
  };

  window.addEventListener('beforeunload', closeConnections);
})();
