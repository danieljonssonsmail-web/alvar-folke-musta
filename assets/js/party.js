(() => {
  'use strict';

  const app = window.AlvarApp;
  const DB_NAME = 'alvarMustaCampaignFilesV1';
  const STORE_NAME = 'files';
  const ALVAR_ID = 'alvar';
  const VIEWS = ['overview', 'sheet', 'background', 'inventory', 'journal'];
  const ATTRIBUTE_LABELS = {
    styrka: 'Styrka', fysik: 'Fysik', smidighet: 'Smidighet',
    intelligens: 'Intelligens', psyke: 'Psyke', karisma: 'Karisma'
  };
  const CONDITION_LABELS = {
    utmattad: 'Utmattad', krasslig: 'Krasslig', omtocknad: 'Omtöcknad',
    arg: 'Arg', radd: 'Rädd', uppgiven: 'Uppgiven'
  };

  let activeId = ALVAR_ID;
  let activeView = 'overview';
  let currentObjectUrls = [];
  let diceController = null;
  let editingJournalId = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function partyState() {
    const state = app.getState();
    if (!state.party || !Array.isArray(state.party.characters)) state.party = { characters: [] };
    state.party.characters.forEach(ensurePartyCharacter);
    return state.party;
  }

  function blankValues() {
    return {
      attributes: { styrka: 0, fysik: 0, smidighet: 0, intelligens: 0, psyke: 0, karisma: 0 },
      derived: { movement: 0, strengthDamage: '', agilityDamage: '', hpCurrent: 0, hpMax: 0, wpCurrent: 0, wpMax: 0 },
      conditions: { utmattad: false, krasslig: false, omtocknad: false, arg: false, radd: false, uppgiven: false },
      abilities: [], tricks: [], skills: [], weaponSkills: [], secondarySkills: [], weapons: []
    };
  }

  function ensureValueDefaults(source) {
    const defaults = blankValues();
    if (!source.attributes || typeof source.attributes !== 'object') source.attributes = {};
    Object.keys(defaults.attributes).forEach((key) => {
      source.attributes[key] = app.clamp(source.attributes[key], 0, 30);
    });
    if (!source.derived || typeof source.derived !== 'object') source.derived = {};
    Object.entries(defaults.derived).forEach(([key, fallback]) => {
      if (source.derived[key] == null) source.derived[key] = fallback;
    });
    if (!source.conditions || typeof source.conditions !== 'object') source.conditions = {};
    Object.keys(defaults.conditions).forEach((key) => {
      source.conditions[key] = Boolean(source.conditions[key]);
    });
    ['abilities', 'tricks'].forEach((key) => {
      if (!Array.isArray(source[key])) source[key] = [];
      source[key] = source[key].map((entry) => ({ name: String(entry?.name || ''), notes: String(entry?.notes || '') }));
    });
    app.normalizeCharacterValues(source);
    return source;
  }

  function ensurePartyCharacter(character) {
    if (!character || typeof character !== 'object') return character;
    character.armor = app.normalizeArmor(character.armor || character.sourceCharacter?.armor);
    character.background = String(character.background || character.sourceCharacter?.background || '');
    character.notes = String(character.notes || character.sourceCharacter?.notes || '');
    character.inventory = app.normalizeInventory(character.inventory || character.sourceInventory);
    character.journal = app.normalizeJournal(character.journal || character.sourceJournal);
    ensureValueDefaults(character.sourceCharacter && typeof character.sourceCharacter === 'object' ? character.sourceCharacter : character);
    return character;
  }

  function getContext(id = activeId) {
    const state = app.getState();
    if (id === ALVAR_ID) {
      ensureValueDefaults(state.character);
      state.inventory = app.normalizeInventory(state.inventory);
      state.journal = app.normalizeJournal(state.journal);
      state.character.armor = app.normalizeArmor(state.character.armor);
      return {
        id: ALVAR_ID,
        isAlvar: true,
        profile: state.character,
        values: state.character,
        inventory: state.inventory,
        journal: state.journal
      };
    }
    const profile = partyState().characters.find((entry) => entry.id === id);
    if (!profile) return null;
    ensurePartyCharacter(profile);
    return {
      id: profile.id,
      isAlvar: false,
      profile,
      values: ensureValueDefaults(profile.sourceCharacter && typeof profile.sourceCharacter === 'object' ? profile.sourceCharacter : profile),
      inventory: profile.inventory,
      journal: profile.journal
    };
  }

  function characterLabel(profile) {
    return profile.knownAs && profile.knownAs !== profile.name ? profile.knownAs : (profile.name || 'Namnlös');
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB saknas'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Databasen kunde inte öppnas'));
    });
  }

  async function putFile(file, prefix) {
    if (!file) return null;
    const id = app.makeId(prefix);
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id, name: file.name || `${prefix}-fil`, type: file.type || 'application/octet-stream', size: file.size || 0, blob: file, updatedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Filen kunde inte sparas'));
    });
    db.close();
    return { id, name: file.name || `${prefix}-fil`, type: file.type || 'application/octet-stream', size: file.size || 0 };
  }

  async function putBlobRecord(record, prefix) {
    if (!record?.dataUrl) return null;
    const response = await fetch(record.dataUrl);
    const blob = await response.blob();
    return putFile(new File([blob], record.name || `${prefix}-fil`, { type: record.type || blob.type || 'application/octet-stream' }), prefix);
  }

  async function getFile(id) {
    if (!id) return null;
    const db = await openDb();
    const result = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Filen kunde inte läsas'));
    });
    db.close();
    return result;
  }

  async function deleteFile(id) {
    if (!id) return;
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Filen kunde inte tas bort'));
      });
      db.close();
    } catch (error) {
      console.warn(error);
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error('Filen kunde inte exporteras'));
      reader.readAsDataURL(blob);
    });
  }

  function clearObjectUrls() {
    currentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    currentObjectUrls = [];
  }

  function objectUrl(blob) {
    const url = URL.createObjectURL(blob);
    currentObjectUrls.push(url);
    return url;
  }

  function parseHash() {
    const raw = decodeURIComponent(location.hash.slice(1));
    if (!raw) return { id: ALVAR_ID, view: 'overview' };
    if (raw === 'new') return { id: 'new', view: 'overview' };
    const [id, view] = raw.split('/');
    return { id: id || ALVAR_ID, view: VIEWS.includes(view) ? view : 'overview' };
  }

  function setHash(id, view = activeView) {
    history.replaceState(null, '', `#${encodeURIComponent(id)}/${view}`);
  }

  function armorOptions(kind, selected) {
    return Object.keys(app.armorCatalog[kind]).map((name) => `<option value="${app.escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${app.escapeHtml(name)}</option>`).join('');
  }

  function armorEffectsMarkup(details) {
    return details.effects.length ? `<ul class="armor-effects">${details.effects.map((effect) => `<li>${app.escapeHtml(effect)}</li>`).join('')}</ul>` : '<p class="muted">Inga särskilda nackdelar.</p>';
  }

  function armorCardMarkup(profile) {
    profile.armor = app.normalizeArmor(profile.armor);
    const normal = app.armorDetails(profile.armor, 'normal');
    const crush = app.armorDetails(profile.armor, 'kross');
    const slash = app.armorDetails(profile.armor, 'hugg');
    return `
      <article class="card armor-card">
        <p class="eyebrow">Rustning</p>
        <div class="armor-summary compact-summary">
          <div class="armor-score"><span>Skydd</span><strong>${normal.baseProtection}</strong><small>normalt</small></div>
          <div><h2>${app.escapeHtml(normal.bodyName)}${profile.armor.helmet !== 'Ingen' ? ` + ${app.escapeHtml(normal.helmetName)}` : ''}</h2>${armorEffectsMarkup(normal)}</div>
        </div>
        <div class="quick-armor-fields no-print">
          <label class="field"><span>Byt rustning</span><select data-armor-change="body">${armorOptions('body', profile.armor.body)}</select></label>
          <label class="field"><span>Byt hjälm</span><select data-armor-change="helmet">${armorOptions('helmet', profile.armor.helmet)}</select></label>
        </div>
        <div class="damage-protection-grid compact-protection">
          <div><span>Normal</span><strong>${normal.effectiveProtection}</strong></div>
          <div><span>Kross</span><strong>${crush.effectiveProtection}</strong></div>
          <div><span>Hugg</span><strong>${slash.effectiveProtection}</strong></div>
        </div>
        <div class="tools no-print" style="margin-top:.8rem"><button class="btn btn-small btn-ghost" type="button" data-edit-profile>Egna värden och anteckningar</button></div>
        <details class="armor-rules"><summary>Rustningsregler</summary><div class="armor-rule-grid">
          <p>Dra av skyddet från skadan från en fysisk attack.</p><p>En rustning kan kombineras med en hjälm.</p>
          <p>Att ta av eller på rustning eller hjälm är en handling i strid.</p><p>Läder och nitläder får +2 mot kross; ringbrynja får +2 mot hugg när den frivilliga skadetypsregeln används.</p>
        </div></details>
      </article>`;
  }

  function renderTabs() {
    const tabs = document.getElementById('party-tabs');
    const alvar = app.getState().character;
    const entries = [{ id: ALVAR_ID, profile: alvar }, ...partyState().characters.map((profile) => ({ id: profile.id, profile }))];
    tabs.innerHTML = entries.map(({ id, profile }) => `
      <button class="party-tab ${id === activeId ? 'active' : ''}" type="button" role="tab" aria-selected="${id === activeId}" data-character-tab="${app.escapeHtml(id)}">${app.escapeHtml(characterLabel(profile))}</button>
    `).join('');
    tabs.querySelectorAll('[data-character-tab]').forEach((button) => button.addEventListener('click', () => selectCharacter(button.dataset.characterTab, 'overview')));
  }

  function renderSectionTabs(ctx) {
    const labels = { overview: 'Översikt', sheet: 'Karaktärsblad', background: 'Bakgrund', inventory: 'Inventory', journal: 'Journal' };
    return `<nav class="character-section-tabs no-print" aria-label="Delar av ${app.escapeHtml(characterLabel(ctx.profile))}">
      ${VIEWS.map((view) => `<button type="button" class="character-section-tab ${view === activeView ? 'active' : ''}" data-character-view="${view}">${labels[view]}</button>`).join('')}
    </nav>`;
  }

  async function visualData(ctx) {
    const profile = ctx.profile;
    const [portraitRecord, sheetRecord] = await Promise.all([
      getFile(profile.portrait?.id).catch(() => null),
      getFile(profile.sheet?.id).catch(() => null)
    ]);
    const portraitUrl = portraitRecord?.blob ? objectUrl(portraitRecord.blob) : (ctx.isAlvar ? 'assets/images/kattfolkstjuvar.webp' : '');
    const sheetUrl = sheetRecord?.blob ? objectUrl(sheetRecord.blob) : (ctx.isAlvar ? 'assets/docs/Alvar-Folke-Musta-karaktarsblad.pdf' : '');
    const sheetName = profile.sheet?.name || (ctx.isAlvar ? 'Alvar Folke Musta – originalblad' : 'Inget blad uppladdat');
    const sheetType = sheetRecord?.type || profile.sheet?.type || (ctx.isAlvar ? 'application/pdf' : '');
    return { portraitUrl, sheetUrl, sheetName, sheetIsPdf: String(sheetType).includes('pdf') };
  }

  function profileFacts(profile) {
    return [['Spelare', profile.player], ['Släkte', profile.kin], ['Yrke', profile.profession], ['Ålder', profile.age], ['Arketyp', profile.archetype], ['Svaghet', profile.weakness]].filter(([, value]) => value);
  }

  function profileHeader(ctx, visuals) {
    const profile = ctx.profile;
    const facts = profileFacts(profile);
    const initials = (profile.knownAs || profile.name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
    return `
      <article class="party-profile card character-profile-compact">
        <div class="party-portrait ${visuals.portraitUrl ? 'has-image' : ''}">${visuals.portraitUrl ? `<img src="${visuals.portraitUrl}" alt="Porträtt av ${app.escapeHtml(profile.name)}">` : `<span>${app.escapeHtml(initials)}</span>`}</div>
        <div>
          <p class="eyebrow">Karaktär i äventyrargruppen</p>
          <h1>${app.escapeHtml(profile.name || 'Namnlös')}</h1>
          ${profile.knownAs && profile.knownAs !== profile.name ? `<p class="lead">Känd som ${app.escapeHtml(profile.knownAs)}</p>` : ''}
          ${facts.length ? `<dl class="party-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${app.escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
          <div class="tools no-print" style="margin-top:1.1rem">
            <button class="btn btn-secondary" type="button" data-edit-profile>Redigera grunduppgifter</button>
            <button class="btn btn-ghost" type="button" data-export-character>Exportera karaktärspaket</button>
            ${ctx.isAlvar ? '' : '<button class="btn btn-danger" type="button" data-delete-character>Ta bort</button>'}
          </div>
        </div>
      </article>`;
  }

  function resourceMarkup(values) {
    const d = values.derived;
    return `<div class="character-resource-grid">
      <div><span>Kroppspoäng</span><strong>${app.escapeHtml(d.hpCurrent ?? 0)} / ${app.escapeHtml(d.hpMax ?? 0)}</strong></div>
      <div><span>Viljepoäng</span><strong>${app.escapeHtml(d.wpCurrent ?? 0)} / ${app.escapeHtml(d.wpMax ?? 0)}</strong></div>
      <div><span>Förflyttning</span><strong>${app.escapeHtml(d.movement ?? 0)}</strong></div>
      <div><span>Skadebonus</span><strong>${app.escapeHtml([d.strengthDamage, d.agilityDamage].filter(Boolean).join(' / ') || '–')}</strong></div>
    </div>`;
  }

  function renderOverview(ctx) {
    const profile = ctx.profile;
    const values = ctx.values;
    const armor = app.armorDetails(profile.armor);
    const xp = [...values.skills, ...values.weaponSkills, ...values.secondarySkills].filter((skill) => skill.experience).length;
    const excerpt = String(profile.background || '').trim();
    return `
      <div class="party-content-grid">
        <div class="party-main-column">
          <div id="party-dice-panel"></div>
          <article class="card">
            <p class="eyebrow">Snabböversikt</p><h2>${app.escapeHtml(characterLabel(profile))} under spel</h2>
            ${resourceMarkup(values)}
            <div class="overview-stat-grid">
              <button type="button" data-jump-view="sheet"><strong>${xp}</strong><span>färdigheter markerade för höjning</span></button>
              <button type="button" data-jump-view="inventory"><strong>${ctx.inventory.items.length}</strong><span>poster i inventoryt</span></button>
              <button type="button" data-jump-view="journal"><strong>${ctx.journal.length}</strong><span>journalanteckningar</span></button>
              <button type="button" data-jump-view="sheet"><strong>${armor.baseProtection}</strong><span>skydd från rustning</span></button>
            </div>
          </article>
          <article class="card prose-card">
            <p class="eyebrow">Bakgrund</p><h2>Berättelsen hittills</h2>
            ${excerpt ? `<div class="party-background background-excerpt">${app.escapeHtml(excerpt)}</div>` : '<div class="empty-state">Ingen bakgrund har skrivits ännu.</div>'}
            <div class="tools no-print" style="margin-top:1rem"><button class="btn btn-ghost" type="button" data-jump-view="background">Öppna och redigera bakgrunden</button></div>
          </article>
        </div>
        <aside class="party-side-column">${armorCardMarkup(profile)}
          ${profile.notes ? `<article class="card"><p class="eyebrow">Anteckningar</p><div class="party-background background-excerpt">${app.escapeHtml(profile.notes)}</div></article>` : ''}
        </aside>
      </div>`;
  }

  function skillRows(list, section) {
    if (!list.length) return '<p class="dice-empty">Inga färdigheter inlagda.</p>';
    return list.map((skill, index) => `
      <div class="skill-row party-skill-row">
        <label class="skill-xp-check" title="Erfarenhet: färdigheten får försöka höjas efter spelmötet"><input type="checkbox" ${skill.experience ? 'checked' : ''} data-skill-xp="${section}" data-index="${index}" aria-label="Erfarenhet för ${app.escapeHtml(skill.name)}"><span aria-hidden="true">✓</span></label>
        <input class="skill-name-input" type="text" value="${app.escapeHtml(skill.name)}" data-skill-field="name" data-section="${section}" data-index="${index}" aria-label="Färdighetens namn">
        <input class="skill-attr-input" type="text" value="${app.escapeHtml(skill.attr)}" data-skill-field="attr" data-section="${section}" data-index="${index}" aria-label="Grundegenskap">
        <input class="skill-value" type="number" min="0" max="30" value="${skill.value}" data-skill-field="value" data-section="${section}" data-index="${index}" aria-label="Värde för ${app.escapeHtml(skill.name)}">
        <button class="btn btn-small btn-ghost" type="button" data-roll-skill="${section}" data-index="${index}">Slå</button>
        <button class="icon-button" type="button" data-delete-skill="${section}" data-index="${index}">Ta bort</button>
      </div>`).join('');
  }

  function listRows(list, key) {
    if (!list.length) return '<p class="dice-empty">Inga poster inlagda.</p>';
    return list.map((entry, index) => `<div class="editable-list-row">
      <input type="text" value="${app.escapeHtml(entry.name)}" data-list-field="name" data-list-key="${key}" data-index="${index}" placeholder="Namn">
      <input type="text" value="${app.escapeHtml(entry.notes)}" data-list-field="notes" data-list-key="${key}" data-index="${index}" placeholder="Anteckning">
      <button class="icon-button" type="button" data-delete-list="${key}" data-index="${index}">Ta bort</button>
    </div>`).join('');
  }

  function renderSheet(ctx, visuals) {
    const values = ctx.values;
    const marked = [...values.skills, ...values.weaponSkills, ...values.secondarySkills].filter((skill) => skill.experience).length;
    return `
      <div class="party-content-grid character-sheet-layout">
        <div class="party-main-column">
          <div id="party-dice-panel"></div>
          <article class="card">
            <div class="skill-toolbar"><div><p class="eyebrow">Karaktärsblad</p><h2>Grundegenskaper och resurser</h2></div></div>
            <div class="attribute-edit-grid">${Object.entries(ATTRIBUTE_LABELS).map(([key, label]) => `<label class="field"><span>${label}</span><input type="number" min="0" max="30" value="${values.attributes[key]}" data-attribute="${key}"></label>`).join('')}</div>
            <div class="derived-edit-grid">
              <label class="field"><span>Förflyttning</span><input type="number" min="0" max="99" value="${app.escapeHtml(values.derived.movement)}" data-derived="movement"></label>
              <label class="field"><span>STY-skadebonus</span><input type="text" value="${app.escapeHtml(values.derived.strengthDamage)}" data-derived="strengthDamage"></label>
              <label class="field"><span>SMI-skadebonus</span><input type="text" value="${app.escapeHtml(values.derived.agilityDamage)}" data-derived="agilityDamage"></label>
              <label class="field"><span>KP nu</span><input type="number" min="0" max="999" value="${app.escapeHtml(values.derived.hpCurrent)}" data-derived="hpCurrent"></label>
              <label class="field"><span>KP max</span><input type="number" min="0" max="999" value="${app.escapeHtml(values.derived.hpMax)}" data-derived="hpMax"></label>
              <label class="field"><span>VP nu</span><input type="number" min="0" max="999" value="${app.escapeHtml(values.derived.wpCurrent)}" data-derived="wpCurrent"></label>
              <label class="field"><span>VP max</span><input type="number" min="0" max="999" value="${app.escapeHtml(values.derived.wpMax)}" data-derived="wpMax"></label>
            </div>
            <div class="condition-grid">${Object.entries(CONDITION_LABELS).map(([key, label]) => `<label class="condition"><input type="checkbox" ${values.conditions[key] ? 'checked' : ''} data-condition="${key}"><span>${label}</span></label>`).join('')}</div>
          </article>

          <article class="card party-values-card">
            <div class="skill-toolbar"><div><p class="eyebrow">Färdigheter</p><h2>Slag och erfarenhet</h2><p class="experience-summary">${marked ? `${marked} markerade för höjning` : 'Ingen färdighet markerad ännu'}</p></div></div>
            <div class="party-skill-section-grid">
              <section><div class="subsection-head compact"><h3>Grundfärdigheter</h3><button class="btn btn-small btn-ghost" type="button" data-add-skill="skills">+ Lägg till</button></div><div class="skill-list">${skillRows(values.skills, 'skills')}</div></section>
              <section><div class="subsection-head compact"><h3>Vapenfärdigheter</h3><button class="btn btn-small btn-ghost" type="button" data-add-skill="weaponSkills">+ Lägg till</button></div><div class="skill-list">${skillRows(values.weaponSkills, 'weaponSkills')}</div></section>
              <section><div class="subsection-head compact"><h3>Sekundära färdigheter</h3><button class="btn btn-small btn-ghost" type="button" data-add-skill="secondarySkills">+ Lägg till</button></div><div class="skill-list">${skillRows(values.secondarySkills, 'secondarySkills')}</div></section>
            </div>
          </article>

          <article class="card">
            <div class="skill-toolbar"><div><p class="eyebrow">Strid</p><h2>Vapen</h2></div><button class="btn btn-small btn-ghost" type="button" data-add-weapon>+ Vapen</button></div>
            <div class="table-wrap"><table class="party-weapon-table"><thead><tr><th>Vapen</th><th>Färdighet</th><th>Skada</th><th>Egenskaper</th><th>Attack</th><th>Skada</th><th></th></tr></thead><tbody>
              ${values.weapons.length ? values.weapons.map((weapon, index) => `<tr>
                <td><input type="text" value="${app.escapeHtml(weapon.name)}" data-weapon-field="name" data-index="${index}"></td>
                <td><input type="text" value="${app.escapeHtml(weapon.skill)}" data-weapon-field="skill" data-index="${index}"></td>
                <td><input type="text" value="${app.escapeHtml(weapon.damage)}" data-weapon-field="damage" data-index="${index}"></td>
                <td><input type="text" value="${app.escapeHtml(weapon.properties)}" data-weapon-field="properties" data-index="${index}"></td>
                <td><button class="btn btn-small btn-ghost" type="button" data-roll-attack="${index}">Slå</button></td>
                <td><button class="btn btn-small btn-secondary" type="button" data-roll-damage="${index}">Slå</button></td>
                <td><button class="icon-button" type="button" data-delete-weapon="${index}">Ta bort</button></td>
              </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">Inga vapen inlagda.</div></td></tr>'}
            </tbody></table></div>
          </article>

          <div class="grid grid-2">
            <article class="card"><div class="skill-toolbar"><div><p class="eyebrow">Förmågor</p><h2>Hjälteförmågor</h2></div><button class="btn btn-small btn-ghost" type="button" data-add-list="abilities">+ Lägg till</button></div><div class="editable-list">${listRows(values.abilities, 'abilities')}</div></article>
            <article class="card"><div class="skill-toolbar"><div><p class="eyebrow">Magi och trick</p><h2>Besvärjelser / trick</h2></div><button class="btn btn-small btn-ghost" type="button" data-add-list="tricks">+ Lägg till</button></div><div class="editable-list">${listRows(values.tricks, 'tricks')}</div></article>
          </div>
        </div>
        <aside class="party-side-column">
          ${armorCardMarkup(ctx.profile)}
          <article class="card character-sheet-card"><p class="eyebrow">Originalblad</p><h2>${app.escapeHtml(visuals.sheetName)}</h2>
            ${visuals.sheetUrl && visuals.sheetIsPdf ? `<object class="party-sheet-pdf" data="${visuals.sheetUrl}" type="application/pdf"><p>PDF-filen kan inte visas här. <a href="${visuals.sheetUrl}" target="_blank" rel="noopener">Öppna karaktärsbladet</a>.</p></object><a class="btn btn-secondary" href="${visuals.sheetUrl}" target="_blank" rel="noopener">Öppna PDF i ny flik</a>` : ''}
            ${visuals.sheetUrl && !visuals.sheetIsPdf ? `<a href="${visuals.sheetUrl}" target="_blank" rel="noopener"><img class="party-sheet-image" src="${visuals.sheetUrl}" alt="Karaktärsblad för ${app.escapeHtml(ctx.profile.name)}"></a>` : ''}
            ${!visuals.sheetUrl ? '<div class="empty-state">Ladda upp en PDF eller bild via Redigera grunduppgifter.</div>' : ''}
          </article>
        </aside>
      </div>`;
  }

  function renderBackground(ctx) {
    return `<article class="card background-editor-card">
      <p class="eyebrow">Personlig berättelse</p><h2>Bakgrund för ${app.escapeHtml(characterLabel(ctx.profile))}</h2>
      <form id="character-background-form" class="form-grid">
        <label class="field full"><span>Bakgrund</span><textarea name="background" rows="22" placeholder="Var växte karaktären upp? Varför gav den sig ut på vägarna?">${app.escapeHtml(ctx.profile.background || '')}</textarea></label>
        <label class="field full"><span>Personer, hemligheter, spelkrokar och övriga anteckningar</span><textarea name="notes" rows="8">${app.escapeHtml(ctx.profile.notes || '')}</textarea></label>
        <div class="full tools"><button class="btn btn-secondary" type="submit">Spara bakgrunden</button><button class="btn btn-ghost" type="button" onclick="window.print()">Skriv ut</button></div>
      </form>
    </article>`;
  }

  function usedSlots(items) {
    return items.reduce((sum, item) => sum + (Number(item.slots) || 0) * Math.max(1, Number(item.quantity) || 1), 0);
  }

  function renderInventory(ctx) {
    const inventory = ctx.inventory;
    const used = usedSlots(inventory.items);
    const total = Number(inventory.capacity) + Number(inventory.backpackBonus);
    const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return `
      <div class="grid grid-3">
        <article class="card"><p class="eyebrow">Bärförmåga</p><div class="capacity-summary"><strong>${used} / ${total}</strong><span>använda bärplatser</span></div><div class="capacity-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div class="capacity-bar" data-over="${used > total}" style="width:${percent}%"></div></div><div class="form-grid" style="margin-top:1rem"><label class="field"><span>Grundkapacitet</span><input type="number" min="0" max="99" value="${inventory.capacity}" data-inventory-setting="capacity"></label><label class="field"><span>Ryggsäckens bonus</span><input type="number" min="0" max="99" value="${inventory.backpackBonus}" data-inventory-setting="backpackBonus"></label></div></article>
        <article class="card"><p class="eyebrow">Mynt</p><h2>Pengar</h2><div class="coin-grid">${[['gold','Guld'],['silver','Silver'],['copper','Koppar']].map(([key,label]) => `<div class="coin"><label>${label}</label><input type="number" min="0" max="99999" value="${inventory.coins[key]}" data-coin="${key}"></div>`).join('')}</div></article>
        <article class="card"><p class="eyebrow">Karaktärspaket</p><h2>Ta med packningen</h2><p class="small muted">Exporten för just denna karaktär innehåller karaktärsblad, bakgrund, inventory och journal.</p><button class="btn btn-secondary" type="button" data-export-character>Exportera karaktären</button></article>
      </div>
      <article class="card" style="margin-top:1.2rem"><p class="eyebrow">Lägg till föremål</p><h2>Något nytt i packningen</h2><form id="add-item-form" class="form-grid">
        <label class="field full"><span>Föremål</span><input name="name" type="text" required placeholder="Exempel: Märklig nyckel av svart järn"></label>
        <label class="field"><span>Antal</span><input name="quantity" type="number" min="1" max="999" value="1"></label><label class="field"><span>Kategori</span><input name="category" type="text"></label>
        <label class="field"><span>Bärplatser per styck</span><input name="slots" type="number" min="0" max="99" step="0.5" value="1"></label><label class="condition" style="align-self:end"><input name="worn" type="checkbox"><span>Buret eller påtaget</span></label>
        <label class="field full"><span>Anteckning</span><input name="notes" type="text"></label><div class="full"><button class="btn btn-secondary" type="submit">Lägg till i inventory</button></div>
      </form></article>
      <article class="card" style="margin-top:1.2rem"><p class="eyebrow">Packning</p><h2>Allt ${app.escapeHtml(characterLabel(ctx.profile))} bär med sig</h2><p class="small muted">Ändra direkt i tabellen. Varje ändring sparas automatiskt.</p><div class="table-wrap"><table><thead><tr><th>Föremål</th><th>Antal</th><th>Kategori</th><th>Platser/st</th><th>Buret</th><th>Anteckning</th><th>Totalt</th><th></th></tr></thead><tbody>
        ${inventory.items.length ? inventory.items.map((item) => `<tr data-item-id="${app.escapeHtml(item.id)}"><td><input type="text" value="${app.escapeHtml(item.name)}" data-item-field="name"></td><td><input type="number" min="1" max="999" value="${item.quantity}" data-item-field="quantity"></td><td><input type="text" value="${app.escapeHtml(item.category)}" data-item-field="category"></td><td><input type="number" min="0" max="99" step="0.5" value="${item.slots}" data-item-field="slots"></td><td style="text-align:center"><input type="checkbox" ${item.worn ? 'checked' : ''} data-item-field="worn"></td><td><input type="text" value="${app.escapeHtml(item.notes)}" data-item-field="notes"></td><td>${(Number(item.slots)||0)*Math.max(1,Number(item.quantity)||1)}</td><td><button class="icon-button" type="button" data-delete-item>Ta bort</button></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty-state">Inventoryt är tomt.</div></td></tr>'}
      </tbody></table></div></article>`;
  }

  function formatDate(value) {
    if (!value) return 'Odaterat';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' }).format(date);
  }

  function renderJournal(ctx) {
    const editing = editingJournalId ? ctx.journal.find((entry) => entry.id === editingJournalId) : null;
    const entries = [...ctx.journal].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return `
      <article class="card journal-compose no-print"><p class="eyebrow">${editing ? 'Redigera anteckning' : 'Ny anteckning'}</p><h2>Vad hände?</h2><form id="journal-form" class="form-grid">
        <label class="field"><span>Rubrik</span><input name="title" type="text" required value="${app.escapeHtml(editing?.title || '')}"></label>
        <label class="field"><span>Datum</span><input name="date" type="date" value="${app.escapeHtml(editing?.date || new Date().toISOString().slice(0,10))}"></label>
        <label class="field"><span>Plats</span><input name="location" type="text" value="${app.escapeHtml(editing?.location || '')}"></label>
        <label class="field"><span>Etiketter</span><input name="tags" type="text" value="${app.escapeHtml(editing?.tags || '')}" placeholder="uppdrag, ledtråd, person"></label>
        <label class="field full"><span>Anteckning</span><textarea name="body" required>${app.escapeHtml(editing?.body || '')}</textarea></label>
        <div class="full tools"><button class="btn btn-secondary" type="submit">${editing ? 'Uppdatera anteckning' : 'Spara anteckning'}</button>${editing ? '<button class="btn btn-ghost" type="button" data-cancel-journal>Avbryt redigering</button>' : ''}<button class="btn btn-ghost" type="button" onclick="window.print()">Skriv ut journalen</button></div>
      </form></article>
      <div class="journal-list" style="margin-top:1.2rem">${entries.length ? entries.map((entry) => {
        const tags = String(entry.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
        return `<article class="card journal-entry" data-entry-id="${app.escapeHtml(entry.id)}"><p class="eyebrow">${app.escapeHtml(entry.location || 'På vägarna')}</p><h2>${app.escapeHtml(entry.title || 'Namnlös anteckning')}</h2><div class="journal-meta"><span>${app.escapeHtml(formatDate(entry.date))}</span>${tags.map((tag) => `<span class="tag">${app.escapeHtml(tag)}</span>`).join('')}</div><div class="journal-body">${app.escapeHtml(entry.body)}</div><div class="entry-actions no-print"><button class="btn btn-small btn-secondary" type="button" data-edit-entry>Redigera</button><button class="btn btn-small btn-danger" type="button" data-delete-entry>Ta bort</button></div></article>`;
      }).join('') : '<div class="empty-state"><h3>Journalen är tom</h3><p>Här kan spelaren samla händelser, ledtrådar och misstankar.</p></div>'}</div>`;
  }

  async function renderCharacter() {
    const ctx = getContext();
    if (!ctx) return selectCharacter(ALVAR_ID, 'overview');
    clearObjectUrls();
    diceController?.destroy();
    diceController = null;
    const visuals = await visualData(ctx);
    const content = document.getElementById('party-character-content');
    let viewMarkup = '';
    if (activeView === 'sheet') viewMarkup = renderSheet(ctx, visuals);
    else if (activeView === 'background') viewMarkup = renderBackground(ctx);
    else if (activeView === 'inventory') viewMarkup = renderInventory(ctx);
    else if (activeView === 'journal') viewMarkup = renderJournal(ctx);
    else viewMarkup = renderOverview(ctx);
    content.innerHTML = profileHeader(ctx, visuals) + renderSectionTabs(ctx) + `<div class="character-section-content">${viewMarkup}</div>`;
    bindCharacterUi(ctx);
    if (['overview', 'sheet'].includes(activeView)) {
      diceController = window.DodDice?.mount('party-dice-panel', { characterKey: () => ctx.id, characterName: () => characterLabel(ctx.profile), player: () => ctx.profile.player }) || null;
      bindRollUi(ctx);
    }
  }

  function findSkillValue(values, name) {
    const normalized = String(name || '').trim().toLowerCase();
    const all = [...values.weaponSkills, ...values.skills, ...values.secondarySkills];
    const exact = all.find((skill) => skill.name.toLowerCase() === normalized);
    if (exact) return exact.value;
    const partial = all.find((skill) => normalized && (skill.name.toLowerCase().includes(normalized) || normalized.includes(skill.name.toLowerCase())));
    return partial ? partial.value : null;
  }

  function saveAndTouch(ctx, message) {
    if (!ctx.isAlvar) ctx.profile.updatedAt = Date.now();
    app.saveState(message);
  }

  function bindCharacterUi(ctx) {
    const container = document.getElementById('party-character-content');
    container.querySelectorAll('[data-character-view]').forEach((button) => button.addEventListener('click', () => selectCharacter(ctx.id, button.dataset.characterView)));
    container.querySelectorAll('[data-jump-view]').forEach((button) => button.addEventListener('click', () => selectCharacter(ctx.id, button.dataset.jumpView)));
    container.querySelectorAll('[data-edit-profile]').forEach((button) => button.addEventListener('click', () => openEditor(ctx)));
    container.querySelectorAll('[data-export-character]').forEach((button) => button.addEventListener('click', () => exportCharacter(ctx)));
    container.querySelector('[data-delete-character]')?.addEventListener('click', () => removeCharacter(ctx.profile));
    container.querySelectorAll('[data-armor-change]').forEach((select) => select.addEventListener('change', async () => {
      ctx.profile.armor[select.dataset.armorChange] = select.value;
      saveAndTouch(ctx, 'Rustningen ändrad');
      await renderCharacter();
    }));

    if (activeView === 'sheet') bindSheetUi(ctx, container);
    if (activeView === 'background') bindBackgroundUi(ctx, container);
    if (activeView === 'inventory') bindInventoryUi(ctx, container);
    if (activeView === 'journal') bindJournalUi(ctx, container);
  }

  function bindRollUi(ctx) {
    const container = document.getElementById('party-character-content');
    container.querySelectorAll('[data-roll-skill]').forEach((button) => button.addEventListener('click', () => {
      const skill = ctx.values[button.dataset.rollSkill][Number(button.dataset.index)];
      diceController?.rollSkill(skill.name, skill.value, 'skill');
    }));
    container.querySelectorAll('[data-roll-attack]').forEach((button) => button.addEventListener('click', () => {
      const weapon = ctx.values.weapons[Number(button.dataset.rollAttack)];
      diceController?.rollSkill(`${weapon.name} – attack`, findSkillValue(ctx.values, weapon.skill || weapon.name), 'weapon-attack');
    }));
    container.querySelectorAll('[data-roll-damage]').forEach((button) => button.addEventListener('click', () => {
      const weapon = ctx.values.weapons[Number(button.dataset.rollDamage)];
      diceController?.rollFormula(`${weapon.name} – skada`, weapon.damage || 'T6', 'weapon-damage');
    }));
  }

  function bindSheetUi(ctx, container) {
    container.querySelectorAll('[data-attribute]').forEach((input) => input.addEventListener('change', () => {
      ctx.values.attributes[input.dataset.attribute] = app.clamp(input.value, 0, 30); input.value = ctx.values.attributes[input.dataset.attribute]; saveAndTouch(ctx, 'Grundegenskapen uppdaterad');
    }));
    container.querySelectorAll('[data-derived]').forEach((input) => input.addEventListener('change', () => {
      const key = input.dataset.derived;
      ctx.values.derived[key] = ['strengthDamage','agilityDamage'].includes(key) ? input.value.trim() : app.clamp(input.value, 0, 999);
      input.value = ctx.values.derived[key]; saveAndTouch(ctx, 'Spelvärdet uppdaterat');
    }));
    container.querySelectorAll('[data-condition]').forEach((input) => input.addEventListener('change', () => { ctx.values.conditions[input.dataset.condition] = input.checked; saveAndTouch(ctx, 'Tillståndet uppdaterat'); }));
    container.querySelectorAll('[data-skill-field]').forEach((input) => input.addEventListener('change', () => {
      const skill = ctx.values[input.dataset.section][Number(input.dataset.index)];
      skill[input.dataset.skillField] = input.dataset.skillField === 'value' ? app.clamp(input.value, 0, 30) : input.value.trim();
      input.value = skill[input.dataset.skillField]; saveAndTouch(ctx, 'Färdigheten uppdaterad');
    }));
    container.querySelectorAll('[data-skill-xp]').forEach((input) => input.addEventListener('change', async () => {
      ctx.values[input.dataset.skillXp][Number(input.dataset.index)].experience = input.checked; saveAndTouch(ctx, input.checked ? 'Erfarenhet markerad' : 'Erfarenhetsmarkering borttagen'); await renderCharacter();
    }));
    container.querySelectorAll('[data-add-skill]').forEach((button) => button.addEventListener('click', async () => {
      const name = prompt('Vad heter färdigheten?'); if (!name?.trim()) return;
      const attr = prompt('Vilken grundegenskap används? Exempel: SMI, INT eller lämna tomt.', '') || '';
      const value = app.clamp(prompt(`Vilket värde har ${name.trim()}?`, '5'), 0, 30);
      ctx.values[button.dataset.addSkill].push({ name: name.trim(), attr: attr.trim(), value, experience: false }); saveAndTouch(ctx, 'Färdighet tillagd'); await renderCharacter();
    }));
    container.querySelectorAll('[data-delete-skill]').forEach((button) => button.addEventListener('click', async () => {
      const list = ctx.values[button.dataset.deleteSkill]; const index = Number(button.dataset.index); if (confirm(`Ta bort ${list[index]?.name || 'färdigheten'}?`)) { list.splice(index, 1); saveAndTouch(ctx, 'Färdighet borttagen'); await renderCharacter(); }
    }));
    container.querySelectorAll('[data-weapon-field]').forEach((input) => input.addEventListener('change', () => { ctx.values.weapons[Number(input.dataset.index)][input.dataset.weaponField] = input.value.trim(); saveAndTouch(ctx, 'Vapnet uppdaterat'); }));
    container.querySelector('[data-add-weapon]')?.addEventListener('click', async () => {
      const name = prompt('Vad heter vapnet?'); if (!name?.trim()) return;
      const skill = prompt('Vilken färdighet används?', '') || ''; const damage = prompt('Vilken skada gör vapnet?', 'T6') || 'T6';
      ctx.values.weapons.push({ name: name.trim(), skill: skill.trim(), grip: '', range: '', damage: damage.trim(), durability: '', properties: '' }); saveAndTouch(ctx, 'Vapen tillagt'); await renderCharacter();
    });
    container.querySelectorAll('[data-delete-weapon]').forEach((button) => button.addEventListener('click', async () => { const index = Number(button.dataset.deleteWeapon); if (confirm(`Ta bort ${ctx.values.weapons[index]?.name || 'vapnet'}?`)) { ctx.values.weapons.splice(index, 1); saveAndTouch(ctx, 'Vapen borttaget'); await renderCharacter(); } }));
    container.querySelectorAll('[data-list-field]').forEach((input) => input.addEventListener('change', () => { ctx.values[input.dataset.listKey][Number(input.dataset.index)][input.dataset.listField] = input.value.trim(); saveAndTouch(ctx, 'Listan uppdaterad'); }));
    container.querySelectorAll('[data-add-list]').forEach((button) => button.addEventListener('click', async () => { const name = prompt('Vad heter posten?'); if (!name?.trim()) return; ctx.values[button.dataset.addList].push({ name: name.trim(), notes: '' }); saveAndTouch(ctx, 'Post tillagd'); await renderCharacter(); }));
    container.querySelectorAll('[data-delete-list]').forEach((button) => button.addEventListener('click', async () => { const list = ctx.values[button.dataset.deleteList]; const index = Number(button.dataset.index); if (confirm(`Ta bort ${list[index]?.name || 'posten'}?`)) { list.splice(index, 1); saveAndTouch(ctx, 'Post borttagen'); await renderCharacter(); } }));
  }

  function bindBackgroundUi(ctx, container) {
    container.querySelector('#character-background-form')?.addEventListener('submit', (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); ctx.profile.background = String(data.get('background') || '').trim(); ctx.profile.notes = String(data.get('notes') || '').trim(); saveAndTouch(ctx, 'Bakgrunden sparad');
    });
  }

  function bindInventoryUi(ctx, container) {
    const inventory = ctx.inventory;
    container.querySelectorAll('[data-inventory-setting]').forEach((input) => input.addEventListener('change', async () => { inventory[input.dataset.inventorySetting] = app.clamp(input.value, 0, 99); saveAndTouch(ctx, 'Bärförmågan uppdaterad'); await renderCharacter(); }));
    container.querySelectorAll('[data-coin]').forEach((input) => input.addEventListener('change', () => { inventory.coins[input.dataset.coin] = app.clamp(input.value, 0, 99999); input.value = inventory.coins[input.dataset.coin]; saveAndTouch(ctx, 'Mynten uppdaterade'); }));
    container.querySelector('#add-item-form')?.addEventListener('submit', async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get('name') || '').trim(); if (!name) return;
      inventory.items.push({ id: app.makeId('item'), name, quantity: app.clamp(data.get('quantity'), 1, 999), category: String(data.get('category') || '').trim(), slots: Math.max(0, Number(data.get('slots')) || 0), worn: data.get('worn') === 'on', notes: String(data.get('notes') || '').trim() });
      saveAndTouch(ctx, 'Föremålet tillagt'); await renderCharacter();
    });
    container.querySelectorAll('[data-item-field]').forEach((input) => input.addEventListener('change', async () => {
      const item = inventory.items.find((entry) => entry.id === input.closest('[data-item-id]').dataset.itemId); const field = input.dataset.itemField;
      if (field === 'worn') item[field] = input.checked; else if (field === 'quantity') item[field] = app.clamp(input.value, 1, 999); else if (field === 'slots') item[field] = Math.max(0, Number(input.value) || 0); else item[field] = input.value.trim();
      saveAndTouch(ctx, 'Inventoryt uppdaterat'); await renderCharacter();
    }));
    container.querySelectorAll('[data-delete-item]').forEach((button) => button.addEventListener('click', async () => { const id = button.closest('[data-item-id]').dataset.itemId; const index = inventory.items.findIndex((entry) => entry.id === id); if (index >= 0 && confirm(`Ta bort ${inventory.items[index].name}?`)) { inventory.items.splice(index, 1); saveAndTouch(ctx, 'Föremålet borttaget'); await renderCharacter(); } }));
  }

  function bindJournalUi(ctx, container) {
    container.querySelector('#journal-form')?.addEventListener('submit', async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const entry = { title: String(data.get('title') || '').trim(), date: String(data.get('date') || ''), location: String(data.get('location') || '').trim(), tags: String(data.get('tags') || '').trim(), body: String(data.get('body') || '').trim(), updatedAt: Date.now() }; if (!entry.title || !entry.body) return;
      if (editingJournalId) Object.assign(ctx.journal.find((item) => item.id === editingJournalId), entry); else ctx.journal.push({ id: app.makeId('journal'), ...entry });
      editingJournalId = null; saveAndTouch(ctx, 'Journalanteckningen sparad'); await renderCharacter();
    });
    container.querySelector('[data-cancel-journal]')?.addEventListener('click', async () => { editingJournalId = null; await renderCharacter(); });
    container.querySelectorAll('[data-edit-entry]').forEach((button) => button.addEventListener('click', async () => { editingJournalId = button.closest('[data-entry-id]').dataset.entryId; await renderCharacter(); document.querySelector('#journal-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    container.querySelectorAll('[data-delete-entry]').forEach((button) => button.addEventListener('click', async () => { const id = button.closest('[data-entry-id]').dataset.entryId; const index = ctx.journal.findIndex((entry) => entry.id === id); if (index >= 0 && confirm(`Ta bort journalanteckningen ”${ctx.journal[index].title}”?`)) { ctx.journal.splice(index, 1); if (editingJournalId === id) editingJournalId = null; saveAndTouch(ctx, 'Anteckningen borttagen'); await renderCharacter(); } }));
  }

  function hidePanels() {
    document.getElementById('party-editor').hidden = true;
    document.getElementById('party-character').hidden = true;
    document.getElementById('party-empty').hidden = true;
  }

  function toggleEditorCustomArmor() {
    const form = document.getElementById('party-form');
    document.getElementById('party-custom-body').hidden = form.elements.armorBody.value !== 'Egen rustning';
    document.getElementById('party-custom-helmet').hidden = form.elements.armorHelmet.value !== 'Egen hjälm';
  }

  function setArmorEditor(armorValue) {
    const form = document.getElementById('party-form'); const armor = app.normalizeArmor(armorValue);
    form.elements.armorBody.innerHTML = armorOptions('body', armor.body); form.elements.armorHelmet.innerHTML = armorOptions('helmet', armor.helmet);
    form.elements.armorBody.value = armor.body; form.elements.armorHelmet.value = armor.helmet;
    ['customBodyName','customBodyEffect','customHelmetName','customHelmetEffect'].forEach((field) => { form.elements[field].value = armor[field] || ''; });
    form.elements.customBodyProtection.value = armor.customBodyProtection; form.elements.customHelmetProtection.value = armor.customHelmetProtection; form.elements.armorNotes.value = armor.notes || ''; toggleEditorCustomArmor();
  }

  function openEditor(ctx = null) {
    hidePanels(); clearObjectUrls(); diceController?.destroy(); diceController = null;
    const profile = ctx?.profile || null; const form = document.getElementById('party-form'); form.reset(); form.elements.id.value = ctx?.id || '';
    ['name','knownAs','player','kin','profession','age','archetype','weakness','background','notes'].forEach((field) => { form.elements[field].value = profile?.[field] || ''; });
    setArmorEditor(profile?.armor); form.dataset.existingSheetId = profile?.sheet?.id || ''; form.dataset.existingPortraitId = profile?.portrait?.id || '';
    document.getElementById('party-sheet-name').textContent = profile?.sheet?.name || (ctx?.isAlvar ? 'Originalbladet används' : 'Ingen fil vald');
    document.getElementById('party-portrait-name').textContent = profile?.portrait?.name || (ctx?.isAlvar ? 'Standardbilden används' : 'Ingen fil vald');
    document.getElementById('party-editor-eyebrow').textContent = profile ? 'Redigera karaktär' : 'Ny karaktär';
    document.getElementById('party-editor-title').textContent = profile ? `Redigera ${characterLabel(profile)}` : 'Skapa en komplett karaktär';
    document.getElementById('party-save').textContent = profile ? 'Spara ändringar' : 'Skapa karaktär';
    document.getElementById('party-editor').hidden = false; renderTabs(); if (!profile) history.replaceState(null, '', '#new'); form.elements.name.focus();
  }

  async function saveFromForm(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const id = String(data.get('id') || '');
    const isAlvar = id === ALVAR_ID; const existing = isAlvar ? app.getState().character : partyState().characters.find((entry) => entry.id === id);
    const sheetFile = form.elements.sheetFile.files?.[0] || null; const portraitFile = form.elements.portraitFile.files?.[0] || null;
    try {
      const [newSheet, newPortrait] = await Promise.all([sheetFile ? putFile(sheetFile, 'sheet') : null, portraitFile ? putFile(portraitFile, 'portrait') : null]);
      if (newSheet && existing?.sheet?.id) await deleteFile(existing.sheet.id); if (newPortrait && existing?.portrait?.id) await deleteFile(existing.portrait.id);
      const common = {
        name: String(data.get('name') || '').trim(), knownAs: String(data.get('knownAs') || '').trim(), player: String(data.get('player') || '').trim(), kin: String(data.get('kin') || '').trim(), profession: String(data.get('profession') || '').trim(), age: String(data.get('age') || '').trim(), archetype: String(data.get('archetype') || '').trim(), weakness: String(data.get('weakness') || '').trim(),
        armor: app.normalizeArmor({ body: String(data.get('armorBody') || 'Ingen'), helmet: String(data.get('armorHelmet') || 'Ingen'), customBodyName: String(data.get('customBodyName') || '').trim(), customBodyProtection: app.clamp(data.get('customBodyProtection'),0,99), customBodyEffect: String(data.get('customBodyEffect') || '').trim(), customHelmetName: String(data.get('customHelmetName') || '').trim(), customHelmetProtection: app.clamp(data.get('customHelmetProtection'),0,99), customHelmetEffect: String(data.get('customHelmetEffect') || '').trim(), notes: String(data.get('armorNotes') || '').trim() }),
        background: String(data.get('background') || '').trim(), notes: String(data.get('notes') || '').trim(), sheet: newSheet || existing?.sheet || null, portrait: newPortrait || existing?.portrait || null
      };
      if (!common.name) return;
      if (isAlvar) Object.assign(existing, common);
      else if (existing) Object.assign(existing, common, { updatedAt: Date.now() });
      else {
        const values = blankValues();
        partyState().characters.push(ensurePartyCharacter({ id: app.makeId('character'), ...common, ...values, inventory: app.normalizeInventory(null), journal: [], createdAt: Date.now(), updatedAt: Date.now() }));
      }
      app.saveState(existing ? 'Karaktären uppdaterad' : 'Karaktären skapad');
      const saved = isAlvar ? ALVAR_ID : (existing?.id || partyState().characters.at(-1).id); await selectCharacter(saved, 'overview');
    } catch (error) { console.warn(error); app.showToast('Filen kunde inte sparas'); }
  }

  async function selectCharacter(id, view = 'overview') {
    if (id !== ALVAR_ID && !partyState().characters.some((entry) => entry.id === id)) id = ALVAR_ID;
    activeId = id; activeView = VIEWS.includes(view) ? view : 'overview'; editingJournalId = null; setHash(activeId, activeView); hidePanels(); document.getElementById('party-character').hidden = false; renderTabs(); await renderCharacter();
  }

  async function removeCharacter(profile) {
    if (!confirm(`Ta bort karaktären ${characterLabel(profile)} med bakgrund, inventory och journal från den här webbläsaren?`)) return;
    await Promise.all([deleteFile(profile.sheet?.id), deleteFile(profile.portrait?.id)]); const list = partyState().characters; const index = list.findIndex((entry) => entry.id === profile.id); if (index >= 0) list.splice(index, 1); app.saveState('Karaktären borttagen'); await selectCharacter(ALVAR_ID, 'overview');
  }

  async function attachmentForExport(meta) {
    if (!meta?.id) return null; const record = await getFile(meta.id).catch(() => null); if (!record?.blob) return null;
    return { name: record.name, type: record.type, size: record.size, dataUrl: await blobToDataUrl(record.blob) };
  }

  async function exportCharacter(ctx) {
    try {
      app.showToast('Förbereder karaktärspaket…'); const profile = ctx.profile; const values = clone(ctx.values);
      const character = { ...values, name: profile.name, knownAs: profile.knownAs, player: profile.player, kin: profile.kin, profession: profile.profession, age: profile.age, archetype: profile.archetype, weakness: profile.weakness, armor: clone(profile.armor), background: profile.background || '', notes: profile.notes || '' };
      const payload = { type: 'dod-character-package', version: 2, exportedAt: new Date().toISOString(), character, inventory: clone(ctx.inventory), journal: clone(ctx.journal), attachments: { sheet: await attachmentForExport(profile.sheet), portrait: await attachmentForExport(profile.portrait) } };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); const safe = (profile.name || 'karaktar').toLowerCase().replace(/[^a-z0-9åäö]+/gi,'-').replace(/^-|-$/g,''); link.href = url; link.download = `${safe || 'karaktar'}-karaktarspaket.json`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); app.showToast('Karaktärspaket exporterat');
    } catch (error) { console.warn(error); app.showToast('Paketet kunde inte exporteras'); }
  }

  function normalizeImportedPackage(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('Okänt format');
    if (parsed.type === 'dod-character-package' && parsed.character) return { character: parsed.character, inventory: parsed.inventory || parsed.character.inventory, journal: parsed.journal || parsed.character.journal, attachments: parsed.attachments || {} };
    if (parsed.character && typeof parsed.character === 'object') return { character: parsed.character.sourceCharacter ? { ...parsed.character.sourceCharacter, ...parsed.character } : parsed.character, inventory: parsed.inventory || parsed.character.inventory || parsed.character.sourceInventory, journal: parsed.journal || parsed.character.journal || parsed.character.sourceJournal, attachments: parsed.attachments || {} };
    if (parsed.name || parsed.background) return { character: parsed.sourceCharacter ? { ...parsed.sourceCharacter, ...parsed } : parsed, inventory: parsed.inventory || parsed.sourceInventory, journal: parsed.journal || parsed.sourceJournal, attachments: parsed.attachments || {} };
    throw new Error('Okänt format');
  }

  async function importPackage(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()); const normalized = normalizeImportedPackage(parsed); const source = normalized.character; const [sheet, portrait] = await Promise.all([putBlobRecord(normalized.attachments.sheet,'sheet'), putBlobRecord(normalized.attachments.portrait,'portrait')]);
      const character = ensurePartyCharacter({ ...clone(source), id: app.makeId('character'), name: String(source.name || 'Importerad karaktär'), knownAs: String(source.knownAs || ''), armor: app.normalizeArmor(source.armor), background: String(source.background || ''), notes: String(source.notes || ''), inventory: app.normalizeInventory(normalized.inventory), journal: app.normalizeJournal(normalized.journal), sheet, portrait, sourceCharacter: null, sourceInventory: null, sourceJournal: null, createdAt: Date.now(), updatedAt: Date.now() });
      partyState().characters.push(character); app.saveState('Karaktärspaket importerat'); await selectCharacter(character.id, 'overview');
    } catch (error) { console.warn(error); app.showToast('Kunde inte importera karaktärspaketet'); }
  }

  function bindUi() {
    document.getElementById('party-add-button').addEventListener('click', () => openEditor());
    document.querySelectorAll('[data-open-editor]').forEach((button) => button.addEventListener('click', () => openEditor()));
    document.getElementById('party-cancel').addEventListener('click', () => selectCharacter(activeId, activeView));
    document.getElementById('party-form').addEventListener('submit', saveFromForm);
    document.querySelectorAll('[data-party-armor-editor]').forEach((select) => select.addEventListener('change', toggleEditorCustomArmor)); setArmorEditor(null);
    document.getElementById('party-sheet-file').addEventListener('change', (event) => { document.getElementById('party-sheet-name').textContent = event.target.files?.[0]?.name || 'Ingen fil vald'; });
    document.getElementById('party-portrait-file').addEventListener('change', (event) => { document.getElementById('party-portrait-name').textContent = event.target.files?.[0]?.name || 'Ingen fil vald'; });
    document.getElementById('party-package-import').addEventListener('change', async (event) => { await importPackage(event.target.files?.[0]); event.target.value = ''; });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindUi(); renderTabs(); const hash = parseHash(); if (hash.id === 'new') openEditor(); else await selectCharacter(hash.id, hash.view);
  });
  window.addEventListener('beforeunload', () => { clearObjectUrls(); diceController?.destroy(); });
})();
