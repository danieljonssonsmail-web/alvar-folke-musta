(() => {
  'use strict';

  const app = window.AlvarApp;
  const BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
  const MAX_CARDS = 10;

  let mqttClient = null;
  let broadcastChannel = null;
  let activeRoom = '';
  let connectionState = 'idle';
  let pendingPublish = false;
  let receivedRemote = false;
  let swapSourceId = '';

  function initiativeState() {
    const state = app.getState();
    if (!state.initiative || typeof state.initiative !== 'object') {
      state.initiative = { round: 0, participants: [], entries: [], updatedAt: 0, changeId: '' };
    }
    if (!Array.isArray(state.initiative.participants)) state.initiative.participants = [];
    if (!Array.isArray(state.initiative.entries)) state.initiative.entries = [];
    return state.initiative;
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

  function topic(roomCode) {
    return `dod-alvar-musta/${safeRoom(roomCode)}/initiative-v1`;
  }

  function currentRoomCode() {
    const state = app.getState();
    return String(state.dice?.roomCode || 'MUSTA-GRUPP-7Q4K9X2M');
  }

  function statusInfo() {
    const labels = {
      connected: ['Ansluten – ändringar delas direkt', 'online'],
      connecting: ['Ansluter…', 'waiting'],
      reconnecting: ['Återansluter…', 'waiting'],
      'local-only': ['Endast denna enhet', 'warning'],
      offline: ['Offline – sparas lokalt', 'warning'],
      idle: ['Inte startad', 'waiting']
    };
    return labels[connectionState] || labels.offline;
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

  function normalizeShared(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const participants = Array.isArray(raw.participants) ? raw.participants.slice(0, 40).map((participant) => ({
      id: String(participant?.id || app.makeId('participant')),
      sourceId: String(participant?.sourceId || ''),
      name: String(participant?.name || 'Namnlös'),
      player: String(participant?.player || ''),
      type: participant?.type === 'npc' ? 'npc' : 'character',
      selected: participant?.selected !== false
    })) : [];
    const entries = Array.isArray(raw.entries) ? raw.entries.slice(0, MAX_CARDS).map((entry) => ({
      participantId: String(entry?.participantId || ''),
      name: String(entry?.name || 'Namnlös'),
      player: String(entry?.player || ''),
      type: entry?.type === 'npc' ? 'npc' : 'character',
      card: Math.max(1, Math.min(10, Number(entry?.card) || 1)),
      acted: Boolean(entry?.acted),
      delayed: Boolean(entry?.delayed)
    })) : [];
    return {
      round: Math.max(0, Math.min(9999, Number(raw.round) || 0)),
      participants,
      entries,
      updatedAt: Number(raw.updatedAt) || 0,
      changeId: String(raw.changeId || '')
    };
  }

  function receivePayload(payload) {
    if (!payload || payload.type !== 'initiative' || !payload.state) return;
    const incoming = normalizeShared(payload.state);
    if (!incoming) return;
    const current = initiativeState();
    if (incoming.changeId && incoming.changeId === current.changeId) return;
    if (receivedRemote && incoming.updatedAt < current.updatedAt) return;

    receivedRemote = true;
    swapSourceId = '';
    current.round = incoming.round;
    current.participants = incoming.participants;
    current.entries = incoming.entries;
    current.updatedAt = incoming.updatedAt;
    current.changeId = incoming.changeId;
    app.saveState('Initiativet uppdaterades från gruppen');
    render();
  }

  function publishShared() {
    const payload = { type: 'initiative', state: initiativeState() };
    if (broadcastChannel) {
      try { broadcastChannel.postMessage(payload); } catch (error) { console.warn(error); }
    }
    if (!mqttClient?.connected) {
      pendingPublish = true;
      return false;
    }
    try {
      mqttClient.publish(topic(activeRoom || currentRoomCode()), JSON.stringify(payload), { qos: 0, retain: true });
      pendingPublish = false;
      return true;
    } catch (error) {
      console.warn('Kunde inte dela initiativet:', error);
      pendingPublish = true;
      return false;
    }
  }

  function connect(roomCode = currentRoomCode()) {
    const room = safeRoom(roomCode);
    if (activeRoom === room && (mqttClient || broadcastChannel)) return;
    closeConnections();
    activeRoom = room;
    receivedRemote = false;
    connectionState = 'connecting';
    renderStatus();

    if ('BroadcastChannel' in window) {
      try {
        broadcastChannel = new BroadcastChannel(`dod-initiative-${room}`);
        broadcastChannel.addEventListener('message', (event) => receivePayload(event.data));
      } catch (error) {
        console.warn('Lokal initiativsynk kunde inte startas:', error);
      }
    }

    if (!window.mqtt?.connect) {
      connectionState = broadcastChannel ? 'local-only' : 'offline';
      renderStatus();
      return;
    }

    try {
      mqttClient = window.mqtt.connect(BROKER_URL, {
        clientId: `dod_init_${Math.random().toString(16).slice(2, 10)}_${Date.now().toString(16).slice(-6)}`,
        clean: true,
        keepalive: 30,
        connectTimeout: 10000,
        reconnectPeriod: 3000,
        protocolVersion: 4
      });
      mqttClient.on('connect', () => {
        connectionState = 'connected';
        mqttClient.subscribe(topic(room), { qos: 0 }, (error) => {
          if (error) console.warn('Kunde inte prenumerera på initiativet:', error);
        });
        if (pendingPublish) setTimeout(() => publishShared(), 900);
        renderStatus();
      });
      mqttClient.on('message', (_topic, message) => {
        try { receivePayload(JSON.parse(message.toString())); } catch (error) { /* ignorerar trasiga meddelanden */ }
      });
      mqttClient.on('reconnect', () => { connectionState = 'reconnecting'; renderStatus(); });
      mqttClient.on('offline', () => { connectionState = broadcastChannel ? 'local-only' : 'offline'; renderStatus(); });
      mqttClient.on('close', () => {
        if (connectionState !== 'reconnecting') connectionState = broadcastChannel ? 'local-only' : 'offline';
        renderStatus();
      });
      mqttClient.on('error', (error) => {
        console.warn('Initiativsynk:', error?.message || error);
        connectionState = broadcastChannel ? 'local-only' : 'offline';
        renderStatus();
      });
    } catch (error) {
      console.warn('Kunde inte ansluta initiativsynken:', error);
      mqttClient = null;
      connectionState = broadcastChannel ? 'local-only' : 'offline';
      renderStatus();
    }
  }

  function commit(message) {
    const state = initiativeState();
    state.updatedAt = Date.now();
    state.changeId = app.makeId('initiative-change');
    app.saveState(message);
    render();
    publishShared();
  }

  function groupCharacters() {
    const state = app.getState();
    const alvar = state.character || {};
    const result = [{
      sourceId: 'alvar-folke-musta',
      name: String(alvar.knownAs || alvar.name || 'Alvar Folke Musta'),
      player: String(alvar.player || ''),
      type: 'character'
    }];
    const party = Array.isArray(state.party?.characters) ? state.party.characters : [];
    party.forEach((character) => result.push({
      sourceId: `party-${character.id}`,
      name: String(character.knownAs || character.name || 'Namnlös'),
      player: String(character.player || ''),
      type: 'character'
    }));
    return result;
  }

  function mergeGroupParticipants(save = false) {
    const state = initiativeState();
    const existingBySource = new Map(state.participants.filter((participant) => participant.sourceId).map((participant) => [participant.sourceId, participant]));
    let changed = false;
    groupCharacters().forEach((source) => {
      const existing = existingBySource.get(source.sourceId);
      if (existing) {
        if (existing.name !== source.name || existing.player !== source.player || existing.type !== source.type) {
          existing.name = source.name;
          existing.player = source.player;
          existing.type = source.type;
          changed = true;
        }
      } else {
        state.participants.push({
          id: app.makeId('participant'),
          sourceId: source.sourceId,
          name: source.name,
          player: source.player,
          type: source.type,
          selected: true
        });
        changed = true;
      }
    });
    if (changed && save) commit('Gruppens karaktärer hämtades');
    return changed;
  }

  function randomIndex(maxExclusive) {
    if (window.crypto?.getRandomValues) {
      const maxUint = 0x100000000;
      const limit = maxUint - (maxUint % maxExclusive);
      const array = new Uint32Array(1);
      do { window.crypto.getRandomValues(array); } while (array[0] >= limit);
      return array[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  function shuffledCards() {
    const cards = Array.from({ length: MAX_CARDS }, (_, index) => index + 1);
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const other = randomIndex(index + 1);
      [cards[index], cards[other]] = [cards[other], cards[index]];
    }
    return cards;
  }

  function drawInitiative() {
    const state = initiativeState();
    const selected = state.participants.filter((participant) => participant.selected);
    if (!selected.length) {
      app.showToast('Markera minst en deltagare');
      return;
    }
    if (selected.length > MAX_CARDS) {
      app.showToast('Högst tio initiativkort kan delas ut');
      return;
    }
    const cards = shuffledCards();
    state.round += 1;
    state.entries = selected.map((participant, index) => ({
      participantId: participant.id,
      name: participant.name,
      player: participant.player,
      type: participant.type,
      card: cards[index],
      acted: false,
      delayed: false
    }));
    swapSourceId = '';
    commit(`Initiativ draget för runda ${state.round}`);
  }

  function sortedEntries() {
    return [...initiativeState().entries].sort((a, b) => a.card - b.card || a.name.localeCompare(b.name, 'sv'));
  }

  function currentEntryId() {
    return sortedEntries().find((entry) => !entry.acted)?.participantId || '';
  }

  function renderStatus() {
    const status = document.querySelector('[data-initiative-status]');
    if (!status) return;
    const [text, className] = statusInfo();
    status.className = `dice-status ${className}`;
    status.textContent = `Gemensamt initiativ: ${text}`;
  }

  function renderRoster() {
    const state = initiativeState();
    const roster = document.getElementById('initiative-roster');
    const selectedCount = state.participants.filter((participant) => participant.selected).length;
    document.getElementById('initiative-selected-count').textContent = `${selectedCount} av ${MAX_CARDS} kort`;
    if (!state.participants.length) {
      roster.innerHTML = '<p class="dice-empty">Inga deltagare finns ännu. Hämta gruppens karaktärer eller lägg till en SLP.</p>';
      return;
    }
    roster.innerHTML = state.participants.map((participant) => `
      <div class="initiative-roster-row ${participant.selected ? 'selected' : ''}">
        <label>
          <input type="checkbox" data-participant-selected="${app.escapeHtml(participant.id)}" ${participant.selected ? 'checked' : ''}>
          <span class="initiative-roster-token">${participant.type === 'npc' ? 'SLP' : 'RP'}</span>
          <span><strong>${app.escapeHtml(participant.name)}</strong>${participant.player ? `<small>${app.escapeHtml(participant.player)}</small>` : ''}</span>
        </label>
        ${participant.type === 'npc' ? `<button class="icon-button" type="button" data-remove-participant="${app.escapeHtml(participant.id)}" aria-label="Ta bort ${app.escapeHtml(participant.name)}">×</button>` : ''}
      </div>
    `).join('');

    roster.querySelectorAll('[data-participant-selected]').forEach((input) => input.addEventListener('change', () => {
      const participant = state.participants.find((item) => item.id === input.dataset.participantSelected);
      if (!participant) return;
      participant.selected = input.checked;
      commit(input.checked ? `${participant.name} deltar i nästa initiativdrag` : `${participant.name} står över nästa initiativdrag`);
    }));
    roster.querySelectorAll('[data-remove-participant]').forEach((button) => button.addEventListener('click', () => {
      const participant = state.participants.find((item) => item.id === button.dataset.removeParticipant);
      if (!participant) return;
      state.participants = state.participants.filter((item) => item.id !== participant.id);
      state.entries = state.entries.filter((entry) => entry.participantId !== participant.id);
      if (swapSourceId === participant.id) swapSourceId = '';
      commit(`${participant.name} togs bort från initiativet`);
    }));
  }

  function boardMarkup() {
    const state = initiativeState();
    const entries = sortedEntries();
    if (!entries.length) {
      return `
        <div class="initiative-empty-board">
          <span class="initiative-empty-card">?</span>
          <h2>Inga kort är dragna</h2>
          <p>Markera vilka som deltar och tryck på <strong>Dra initiativ</strong>.</p>
        </div>
      `;
    }
    const currentId = currentEntryId();
    const swapSource = entries.find((entry) => entry.participantId === swapSourceId);
    return entries.map((entry) => {
      const isCurrent = entry.participantId === currentId;
      const isSource = entry.participantId === swapSourceId;
      const canSwapHere = swapSource && !entry.acted && !entry.delayed && entry.card > swapSource.card && entry.participantId !== swapSource.participantId;
      return `
        <article class="initiative-card ${entry.acted ? 'acted' : ''} ${isCurrent ? 'current' : ''} ${isSource ? 'waiting-source' : ''} ${canSwapHere ? 'swap-candidate' : ''}" data-card-id="${app.escapeHtml(entry.participantId)}">
          ${isCurrent && !entry.acted ? '<span class="initiative-current-label">Aktuell tur</span>' : ''}
          <button class="initiative-card-face" type="button" data-flip-card="${app.escapeHtml(entry.participantId)}" aria-label="${entry.acted ? `Vänd upp kortet för ${app.escapeHtml(entry.name)}` : `Markera att ${app.escapeHtml(entry.name)} har agerat`}">
            ${entry.acted ? `
              <span class="initiative-card-back-mark">DoD</span>
              <strong>AGERAT</strong>
              <small>Turen är förbrukad</small>
            ` : `
              <span class="initiative-number">${entry.card}</span>
              <span class="initiative-card-type">${entry.type === 'npc' ? 'SLP / monster' : 'Rollperson'}</span>
              <strong class="initiative-name">${app.escapeHtml(entry.name)}</strong>
              ${entry.player ? `<small>${app.escapeHtml(entry.player)}</small>` : ''}
              ${entry.delayed ? '<span class="initiative-delayed">Har avvaktat</span>' : ''}
            `}
          </button>
          <div class="initiative-card-actions">
            ${entry.acted
              ? `<button class="btn btn-small btn-ghost" type="button" data-flip-card="${app.escapeHtml(entry.participantId)}">Ångra · vänd upp</button>`
              : `<button class="btn btn-small btn-secondary" type="button" data-flip-card="${app.escapeHtml(entry.participantId)}">Har agerat · vänd</button>`}
            ${!entry.acted && !entry.delayed ? `<button class="btn btn-small btn-ghost" type="button" data-wait-card="${app.escapeHtml(entry.participantId)}">${isSource ? 'Avbryt avvaktan' : 'Avvakta / byt'}</button>` : ''}
            ${canSwapHere ? `<button class="btn btn-small btn-primary" type="button" data-swap-target="${app.escapeHtml(entry.participantId)}">Byt med ${app.escapeHtml(entry.name)}</button>` : ''}
          </div>
          ${entry.acted ? '<p class="initiative-reactive-warning">Kan inte parera eller utföra annan reaktiv handling senare i rundan.</p>' : ''}
        </article>
      `;
    }).join('');
  }

  function renderBoard() {
    const state = initiativeState();
    document.getElementById('initiative-round').textContent = state.round ? `Runda ${state.round}` : 'Ingen pågående runda';
    const progress = state.entries.length ? state.entries.filter((entry) => entry.acted).length : 0;
    document.getElementById('initiative-progress').textContent = state.entries.length ? `${progress} av ${state.entries.length} har agerat` : '';
    const board = document.getElementById('initiative-board');
    board.innerHTML = boardMarkup();

    board.querySelectorAll('[data-flip-card]').forEach((button) => button.addEventListener('click', () => {
      const entry = state.entries.find((item) => item.participantId === button.dataset.flipCard);
      if (!entry) return;
      entry.acted = !entry.acted;
      if (entry.acted && swapSourceId === entry.participantId) swapSourceId = '';
      commit(entry.acted ? `${entry.name} har agerat` : `${entry.name} vändes upp igen`);
    }));
    board.querySelectorAll('[data-wait-card]').forEach((button) => button.addEventListener('click', () => {
      swapSourceId = swapSourceId === button.dataset.waitCard ? '' : button.dataset.waitCard;
      render();
      if (swapSourceId) app.showToast('Välj ett senare, ovänt kort att byta med');
    }));
    board.querySelectorAll('[data-swap-target]').forEach((button) => button.addEventListener('click', () => {
      const source = state.entries.find((item) => item.participantId === swapSourceId);
      const target = state.entries.find((item) => item.participantId === button.dataset.swapTarget);
      if (!source || !target || source.acted || target.acted || source.delayed || target.delayed || target.card <= source.card) {
        app.showToast('De korten kan inte bytas enligt avvakta-regeln');
        swapSourceId = '';
        renderBoard();
        return;
      }
      [source.card, target.card] = [target.card, source.card];
      source.delayed = true;
      const sourceName = source.name;
      swapSourceId = '';
      commit(`${sourceName} avvaktade och bytte initiativkort`);
    }));
  }

  function render() {
    const roomInput = document.querySelector('[data-initiative-room]');
    if (roomInput && document.activeElement !== roomInput) roomInput.value = currentRoomCode();
    renderStatus();
    renderRoster();
    renderBoard();
    const hint = document.getElementById('initiative-swap-hint');
    if (hint) {
      const source = initiativeState().entries.find((entry) => entry.participantId === swapSourceId);
      hint.hidden = !source;
      hint.textContent = source ? `${source.name} avvaktar: välj ett ovänt kort med högre nummer.` : '';
    }
  }

  function bindUi() {
    document.getElementById('draw-initiative').addEventListener('click', drawInitiative);
    document.getElementById('turn-up-all').addEventListener('click', () => {
      const state = initiativeState();
      if (!state.entries.length) return;
      state.entries.forEach((entry) => { entry.acted = false; entry.delayed = false; });
      swapSourceId = '';
      commit('Alla initiativkort vändes upp');
    });
    document.getElementById('clear-initiative').addEventListener('click', () => {
      const state = initiativeState();
      if (!state.entries.length || confirm('Avsluta striden och ta bort de dragna initiativkorten?')) {
        state.entries = [];
        state.round = 0;
        swapSourceId = '';
        commit('Striden avslutades');
      }
    });
    document.getElementById('refresh-party').addEventListener('click', () => {
      if (!mergeGroupParticipants(true)) app.showToast('Alla gruppkaraktärer finns redan med');
    });
    document.getElementById('add-npc-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.name;
      const name = input.value.trim();
      if (!name) return;
      initiativeState().participants.push({
        id: app.makeId('participant'),
        sourceId: '',
        name,
        player: '',
        type: 'npc',
        selected: true
      });
      input.value = '';
      commit(`${name} lades till i initiativet`);
    });
    document.querySelector('[data-initiative-room]').addEventListener('change', (event) => {
      const value = event.target.value.trim() || 'MUSTA-GRUPP-7Q4K9X2M';
      const state = app.getState();
      if (!state.dice) state.dice = {};
      state.dice.roomCode = value;
      app.saveState('Gruppkoden sparades');
      connect(value);
      render();
    });
    document.querySelector('[data-copy-initiative-room]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentRoomCode());
        app.showToast('Gruppkoden kopierad');
      } catch (error) {
        app.showToast(`Gruppkod: ${currentRoomCode()}`);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    mergeGroupParticipants(false);
    bindUi();
    render();
    connect(currentRoomCode());
  });

  window.addEventListener('beforeunload', closeConnections);
})();
