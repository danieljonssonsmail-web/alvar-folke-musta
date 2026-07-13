(() => {
  'use strict';

  const app = window.AlvarApp;
  const DB_NAME = 'alvarMustaCampaignFilesV1';
  const STORE_NAME = 'files';
  let activeId = null;
  let currentObjectUrls = [];
  let diceController = null;

  function partyState() {
    const state = app.getState();
    if (!state.party || !Array.isArray(state.party.characters)) state.party = { characters: [] };
    return state.party;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB saknas'));
        return;
      }
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
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        id,
        name: file.name || `${prefix}-fil`,
        type: file.type || 'application/octet-stream',
        size: file.size || 0,
        blob: file,
        updatedAt: Date.now()
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Filen kunde inte sparas'));
    });
    db.close();
    return { id, name: file.name || `${prefix}-fil`, type: file.type || 'application/octet-stream', size: file.size || 0 };
  }

  async function putBlobRecord(record, prefix) {
    if (!record?.dataUrl) return null;
    const response = await fetch(record.dataUrl);
    const blob = await response.blob();
    const file = new File([blob], record.name || `${prefix}-fil`, { type: record.type || blob.type || 'application/octet-stream' });
    return putFile(file, prefix);
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
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Filen kunde inte tas bort'));
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

  function characterLabel(character) {
    if (character.knownAs && character.knownAs !== character.name) return character.knownAs;
    return character.name || 'Namnlös';
  }

  function valueSource(character) {
    const source = character.sourceCharacter && typeof character.sourceCharacter === 'object'
      ? character.sourceCharacter
      : character;
    app.normalizeCharacterValues(source);
    return source;
  }

  function skillGroups(source) {
    return [
      ['skills', 'Grundfärdigheter'],
      ['weaponSkills', 'Vapenfärdigheter'],
      ['secondarySkills', 'Sekundära färdigheter']
    ];
  }

  function findSkillValue(source, name) {
    const normalized = String(name || '').trim().toLowerCase();
    const all = [...source.weaponSkills, ...source.skills, ...source.secondarySkills];
    const exact = all.find((skill) => skill.name.toLowerCase() === normalized);
    if (exact) return exact.value;
    const partial = all.find((skill) => normalized && (skill.name.toLowerCase().includes(normalized) || normalized.includes(skill.name.toLowerCase())));
    return partial ? partial.value : null;
  }

  function armorOptions(kind, selected) {
    return Object.keys(app.armorCatalog[kind]).map((name) => `
      <option value="${app.escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${app.escapeHtml(name)}</option>
    `).join('');
  }

  function ensureArmor(character) {
    character.armor = app.normalizeArmor(character.armor || character.sourceCharacter?.armor);
    return character.armor;
  }

  function toggleEditorCustomArmor() {
    const form = document.getElementById('party-form');
    document.getElementById('party-custom-body').hidden = form.elements.armorBody.value !== 'Egen rustning';
    document.getElementById('party-custom-helmet').hidden = form.elements.armorHelmet.value !== 'Egen hjälm';
  }

  function setArmorEditor(armorValue) {
    const form = document.getElementById('party-form');
    const armor = app.normalizeArmor(armorValue);
    form.elements.armorBody.innerHTML = armorOptions('body', armor.body);
    form.elements.armorHelmet.innerHTML = armorOptions('helmet', armor.helmet);
    form.elements.armorBody.value = armor.body;
    form.elements.armorHelmet.value = armor.helmet;
    ['customBodyName', 'customBodyEffect', 'customHelmetName', 'customHelmetEffect', 'notes'].forEach((field) => {
      const formName = field === 'notes' ? 'armorNotes' : field;
      form.elements[formName].value = armor[field] || '';
    });
    form.elements.customBodyProtection.value = armor.customBodyProtection;
    form.elements.customHelmetProtection.value = armor.customHelmetProtection;
    toggleEditorCustomArmor();
  }

  function armorEffectsMarkup(details) {
    if (!details.effects.length) return '<p class="muted">Inga särskilda nackdelar.</p>';
    return `<ul class="armor-effects">${details.effects.map((effect) => `<li>${app.escapeHtml(effect)}</li>`).join('')}</ul>`;
  }

  function armorCardMarkup(character) {
    const armor = ensureArmor(character);
    const normal = app.armorDetails(armor, 'normal');
    const crush = app.armorDetails(armor, 'kross');
    const slash = app.armorDetails(armor, 'hugg');
    return `
      <article class="card armor-card">
        <p class="eyebrow">Rustning</p>
        <div class="armor-summary compact-summary">
          <div class="armor-score">
            <span>Skydd</span>
            <strong>${normal.baseProtection}</strong>
            <small>normalt</small>
          </div>
          <div>
            <h2>${app.escapeHtml(normal.bodyName)}${armor.helmet !== 'Ingen' ? ` + ${app.escapeHtml(normal.helmetName)}` : ''}</h2>
            ${armorEffectsMarkup(normal)}
          </div>
        </div>
        <div class="quick-armor-fields no-print">
          <label class="field"><span>Byt rustning</span><select data-party-armor-change="body">${armorOptions('body', armor.body)}</select></label>
          <label class="field"><span>Byt hjälm</span><select data-party-armor-change="helmet">${armorOptions('helmet', armor.helmet)}</select></label>
        </div>
        <div class="damage-protection-grid compact-protection">
          <div><span>Normal</span><strong>${normal.effectiveProtection}</strong></div>
          <div><span>Kross</span><strong>${crush.effectiveProtection}</strong></div>
          <div><span>Hugg</span><strong>${slash.effectiveProtection}</strong></div>
        </div>
        <div class="tools no-print" style="margin-top:.8rem">
          <button class="btn btn-small btn-ghost" type="button" data-edit-armor>Egna värden och anteckningar</button>
        </div>
        <details class="armor-rules">
          <summary>Regler</summary>
          <div class="armor-rule-grid">
            <p>Dra av skyddet från skadan från en fysisk attack.</p>
            <p>En rustning kan kombineras med en hjälm.</p>
            <p>Att ta av eller på rustning eller hjälm är en handling i strid.</p>
            <p>Läder och nitläder får +2 mot kross; ringbrynja får +2 mot hugg när den frivilliga skadetypsregeln används.</p>
          </div>
        </details>
      </article>
    `;
  }

  function renderTabs() {
    const characters = partyState().characters;
    const alvar = app.getState().character || {};
    const tabs = document.getElementById('party-tabs');
    const alvarLabel = characterLabel(alvar);
    tabs.innerHTML = `
      <a class="party-tab party-tab-link" href="character.html" role="tab" aria-selected="false">${app.escapeHtml(alvarLabel)}</a>
    ` + characters.map((character) => `
      <button class="party-tab ${character.id === activeId ? 'active' : ''}" type="button" role="tab" aria-selected="${character.id === activeId}" data-party-tab="${character.id}">
        ${app.escapeHtml(characterLabel(character))}
      </button>
    `).join('');
    tabs.querySelectorAll('[data-party-tab]').forEach((button) => button.addEventListener('click', () => selectCharacter(button.dataset.partyTab)));
  }

  function renderEmptyState() {
    const hasCharacters = partyState().characters.length > 0;
    document.getElementById('party-empty').hidden = hasCharacters || !document.getElementById('party-editor').hidden;
  }

  function hidePanels() {
    document.getElementById('party-editor').hidden = true;
    document.getElementById('party-character').hidden = true;
    document.getElementById('party-empty').hidden = true;
  }

  function openEditor(character = null) {
    hidePanels();
    if (!character) history.replaceState(null, '', '#new');
    clearObjectUrls();
    const form = document.getElementById('party-form');
    form.reset();
    form.elements.id.value = character?.id || '';
    ['name', 'knownAs', 'player', 'kin', 'profession', 'age', 'archetype', 'weakness', 'background', 'notes'].forEach((field) => {
      form.elements[field].value = character?.[field] || '';
    });
    setArmorEditor(character?.armor || character?.sourceCharacter?.armor);
    form.dataset.existingSheetId = character?.sheet?.id || '';
    form.dataset.existingPortraitId = character?.portrait?.id || '';
    document.getElementById('party-sheet-name').textContent = character?.sheet?.name || 'Ingen fil vald';
    document.getElementById('party-portrait-name').textContent = character?.portrait?.name || 'Ingen fil vald';
    document.getElementById('party-editor-eyebrow').textContent = character ? 'Redigera medspelare' : 'Ny medspelare';
    document.getElementById('party-editor-title').textContent = character ? `Redigera ${characterLabel(character)}` : 'Skapa en karaktärsflik';
    document.getElementById('party-save').textContent = character ? 'Spara ändringar' : 'Skapa karaktärsflik';
    document.getElementById('party-editor').hidden = false;
    renderTabs();
    form.elements.name.focus();
  }

  function partySkillRows(list, section) {
    if (!list.length) return '<p class="dice-empty">Inga färdigheter inlagda.</p>';
    return list.map((skill, index) => `
      <div class="skill-row party-skill-row" data-party-skill-row>
        <label class="skill-xp-check" title="Erfarenhet: färdigheten får försöka höjas efter spelmötet">
          <input type="checkbox" ${skill.experience ? 'checked' : ''} data-party-skill-experience="${section}" data-party-skill-index="${index}" aria-label="Erfarenhet för ${app.escapeHtml(skill.name)}">
          <span aria-hidden="true">✓</span>
        </label>
        <span class="skill-name">${app.escapeHtml(skill.name)} ${skill.attr ? `<small>(${app.escapeHtml(skill.attr)})</small>` : ''}</span>
        <input class="skill-value" type="number" min="0" max="30" value="${skill.value}" data-party-skill-value="${section}" data-party-skill-index="${index}" aria-label="Värde för ${app.escapeHtml(skill.name)}">
        <button class="btn btn-small btn-ghost skill-roll-button" type="button" data-party-roll-skill="${section}" data-party-skill-index="${index}">Slå</button>
      </div>
    `).join('');
  }

  function renderImportedValues(character) {
    const source = valueSource(character);
    const attributes = source.attributes && typeof source.attributes === 'object'
      ? Object.entries(source.attributes).map(([key, value]) => `<div class="mini-stat"><span>${app.escapeHtml(key)}</span><strong>${app.escapeHtml(value)}</strong></div>`).join('')
      : '';
    const marked = [...source.skills, ...source.weaponSkills, ...source.secondarySkills].filter((skill) => skill.experience).length;
    const skillSections = skillGroups(source).map(([section, label]) => `
      <section>
        <h3>${label}</h3>
        <div class="skill-list party-digital-skill-list">${partySkillRows(source[section], section)}</div>
      </section>
    `).join('');
    const weapons = source.weapons.length ? `
      <div class="table-wrap party-weapon-table-wrap">
        <table class="party-weapon-table">
          <thead><tr><th>Vapen</th><th>Färdighet</th><th>Skada</th><th>Attack</th><th>Skada</th></tr></thead>
          <tbody>${source.weapons.map((weapon, index) => `
            <tr>
              <td><input type="text" value="${app.escapeHtml(weapon.name)}" data-party-weapon-field="name" data-party-weapon-index="${index}"></td>
              <td><input type="text" value="${app.escapeHtml(weapon.skill || '')}" data-party-weapon-field="skill" data-party-weapon-index="${index}"></td>
              <td><input type="text" value="${app.escapeHtml(weapon.damage || '')}" data-party-weapon-field="damage" data-party-weapon-index="${index}"></td>
              <td><button class="btn btn-small btn-ghost" type="button" data-party-roll-attack="${index}">Slå</button></td>
              <td><button class="btn btn-small btn-secondary" type="button" data-party-roll-damage="${index}">Slå</button></td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    ` : '<p class="dice-empty">Inga digitala vapen inlagda.</p>';

    return `
      <article class="card party-values-card">
        <div class="skill-toolbar">
          <div>
            <p class="eyebrow">Spelvärden</p>
            <h2>Färdigheter, erfarenhet och vapen</h2>
            <p class="experience-summary">${marked ? `${marked} markerade för höjning` : 'Ingen färdighet markerad ännu'}</p>
          </div>
          <div class="tools no-print">
            <button class="btn btn-small btn-ghost" type="button" data-add-party-skill>+ Färdighet</button>
            <button class="btn btn-small btn-ghost" type="button" data-add-party-weapon>+ Vapen</button>
          </div>
        </div>
        ${attributes ? `<div class="mini-stat-grid">${attributes}</div>` : ''}
        <div class="party-skill-section-grid">${skillSections}</div>
        <div class="subsection-head compact"><p class="eyebrow">Strid</p><h3>Vapen</h3></div>
        ${weapons}
      </article>
    `;
  }

  async function renderCharacter(character) {
    clearObjectUrls();
    diceController?.destroy();
    diceController = null;
    const container = document.getElementById('party-character-content');
    const [portraitRecord, sheetRecord] = await Promise.all([
      getFile(character.portrait?.id).catch(() => null),
      getFile(character.sheet?.id).catch(() => null)
    ]);
    const portraitUrl = portraitRecord?.blob ? objectUrl(portraitRecord.blob) : '';
    const sheetUrl = sheetRecord?.blob ? objectUrl(sheetRecord.blob) : '';
    const sheetIsPdf = String(sheetRecord?.type || character.sheet?.type || '').includes('pdf');
    const importedValues = renderImportedValues(character);
    const facts = [
      ['Spelare', character.player],
      ['Släkte', character.kin],
      ['Yrke', character.profession],
      ['Ålder', character.age],
      ['Arketyp', character.archetype],
      ['Svaghet', character.weakness]
    ].filter(([, value]) => value);

    container.innerHTML = `
      <article class="party-profile card">
        <div class="party-portrait ${portraitUrl ? 'has-image' : ''}">
          ${portraitUrl ? `<img src="${portraitUrl}" alt="Porträtt av ${app.escapeHtml(character.name)}">` : `<span>${app.escapeHtml((character.knownAs || character.name || '?').slice(0, 2).toUpperCase())}</span>`}
        </div>
        <div>
          <p class="eyebrow">Medspelarkaraktär</p>
          <h1>${app.escapeHtml(character.name || 'Namnlös')}</h1>
          ${character.knownAs ? `<p class="lead">Känd som ${app.escapeHtml(character.knownAs)}</p>` : ''}
          ${facts.length ? `<dl class="party-facts">${facts.map(([label, value]) => `<div><dt>${app.escapeHtml(label)}</dt><dd>${app.escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
          <div class="tools no-print" style="margin-top:1.2rem">
            <button class="btn btn-secondary" type="button" data-edit-character>Redigera</button>
            <button class="btn btn-ghost" type="button" data-export-character>Exportera karaktärspaket</button>
            <button class="btn btn-danger" type="button" data-delete-character>Ta bort</button>
          </div>
        </div>
      </article>

      <div class="party-content-grid">
        <div class="party-main-column">
          <div id="party-dice-panel"></div>
          ${importedValues}
          <article class="card prose-card">
            <p class="eyebrow">Bakgrund</p>
            <h2>Berättelsen hittills</h2>
            ${character.background ? `<div class="party-background">${app.escapeHtml(character.background)}</div>` : '<div class="empty-state">Ingen bakgrund har lagts till ännu.</div>'}
          </article>
          ${character.notes ? `<article class="card"><p class="eyebrow">Anteckningar</p><div class="party-background">${app.escapeHtml(character.notes)}</div></article>` : ''}
        </div>
        <aside class="party-side-column">
          ${armorCardMarkup(character)}
          <article class="card character-sheet-card">
            <p class="eyebrow">Karaktärsblad</p>
            <h2>${app.escapeHtml(character.sheet?.name || 'Inget blad uppladdat')}</h2>
            ${sheetUrl && sheetIsPdf ? `
              <object class="party-sheet-pdf" data="${sheetUrl}" type="application/pdf">
                <p>PDF-filen kan inte visas här. <a href="${sheetUrl}" target="_blank" rel="noopener">Öppna karaktärsbladet</a>.</p>
              </object>
              <a class="btn btn-secondary" href="${sheetUrl}" target="_blank" rel="noopener">Öppna PDF i ny flik</a>
            ` : ''}
            ${sheetUrl && !sheetIsPdf ? `<a href="${sheetUrl}" target="_blank" rel="noopener"><img class="party-sheet-image" src="${sheetUrl}" alt="Karaktärsblad för ${app.escapeHtml(character.name)}"></a>` : ''}
            ${!sheetUrl ? '<div class="empty-state">Ladda upp en PDF eller bild när du redigerar karaktären.</div>' : ''}
          </article>
        </aside>
      </div>
    `;

    const source = valueSource(character);
    diceController = window.DodDice?.mount('party-dice-panel', {
      characterKey: () => character.id,
      characterName: () => characterLabel(character),
      player: () => character.player
    }) || null;

    container.querySelectorAll('[data-party-skill-value]').forEach((input) => input.addEventListener('change', () => {
      const list = source[input.dataset.partySkillValue];
      const skill = list[Number(input.dataset.partySkillIndex)];
      skill.value = app.clamp(input.value, 0, 30);
      input.value = skill.value;
      character.updatedAt = Date.now();
      app.saveState('Färdigheten uppdaterad');
    }));
    container.querySelectorAll('[data-party-skill-experience]').forEach((input) => input.addEventListener('change', async () => {
      const list = source[input.dataset.partySkillExperience];
      list[Number(input.dataset.partySkillIndex)].experience = input.checked;
      character.updatedAt = Date.now();
      app.saveState(input.checked ? 'Erfarenhet markerad' : 'Erfarenhetsmarkering borttagen');
      await renderCharacter(character);
    }));
    container.querySelectorAll('[data-party-roll-skill]').forEach((button) => button.addEventListener('click', () => {
      const skill = source[button.dataset.partyRollSkill][Number(button.dataset.partySkillIndex)];
      diceController?.rollSkill(skill.name, skill.value, 'skill');
    }));
    container.querySelectorAll('[data-party-weapon-field]').forEach((input) => input.addEventListener('change', () => {
      const weapon = source.weapons[Number(input.dataset.partyWeaponIndex)];
      weapon[input.dataset.partyWeaponField] = input.value.trim();
      character.updatedAt = Date.now();
      app.saveState('Vapnet uppdaterat');
    }));
    container.querySelectorAll('[data-party-roll-attack]').forEach((button) => button.addEventListener('click', () => {
      const weapon = source.weapons[Number(button.dataset.partyRollAttack)];
      diceController?.rollSkill(`${weapon.name} – attack`, findSkillValue(source, weapon.skill || weapon.name), 'weapon-attack');
    }));
    container.querySelectorAll('[data-party-roll-damage]').forEach((button) => button.addEventListener('click', () => {
      const weapon = source.weapons[Number(button.dataset.partyRollDamage)];
      diceController?.rollFormula(`${weapon.name} – skada`, weapon.damage || 'T6', 'weapon-damage');
    }));
    container.querySelector('[data-add-party-skill]')?.addEventListener('click', async () => {
      const name = prompt('Vad heter färdigheten?');
      if (!name?.trim()) return;
      const value = app.clamp(prompt(`Vilket värde har ${name.trim()}?`, '5'), 0, 30);
      const weaponSkill = confirm('Är detta en vapenfärdighet?');
      source[weaponSkill ? 'weaponSkills' : 'skills'].push({ name: name.trim(), attr: '', value, experience: false });
      character.updatedAt = Date.now();
      app.saveState('Färdighet tillagd');
      await renderCharacter(character);
    });
    container.querySelector('[data-add-party-weapon]')?.addEventListener('click', async () => {
      const name = prompt('Vad heter vapnet?');
      if (!name?.trim()) return;
      const skill = prompt('Vilken färdighet används för attacken?', '') || '';
      const damage = prompt('Vilken skada gör vapnet? Exempel: T8 eller 2T6+1', 'T6') || 'T6';
      source.weapons.push({ name: name.trim(), skill: skill.trim(), grip: '', range: '', damage: damage.trim(), durability: '', properties: '' });
      character.updatedAt = Date.now();
      app.saveState('Vapen tillagt');
      await renderCharacter(character);
    });

    container.querySelector('[data-edit-character]')?.addEventListener('click', () => openEditor(character));
    container.querySelector('[data-export-character]')?.addEventListener('click', () => exportCharacter(character));
    container.querySelector('[data-delete-character]')?.addEventListener('click', () => removeCharacter(character));
    container.querySelector('[data-edit-armor]')?.addEventListener('click', () => openEditor(character));
    container.querySelectorAll('[data-party-armor-change]').forEach((select) => select.addEventListener('change', async () => {
      const armor = ensureArmor(character);
      armor[select.dataset.partyArmorChange] = select.value;
      character.updatedAt = Date.now();
      app.saveState('Rustningen ändrad');
      await renderCharacter(character);
    }));
  }

  async function selectCharacter(id) {
    const character = partyState().characters.find((entry) => entry.id === id);
    if (!character) return;
    activeId = id;
    history.replaceState(null, '', `#${encodeURIComponent(id)}`);
    hidePanels();
    document.getElementById('party-character').hidden = false;
    renderTabs();
    await renderCharacter(character);
  }

  async function saveFromForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const id = String(data.get('id') || '');
    const existing = partyState().characters.find((entry) => entry.id === id);
    const sheetFile = form.elements.sheetFile.files?.[0] || null;
    const portraitFile = form.elements.portraitFile.files?.[0] || null;

    try {
      const [newSheet, newPortrait] = await Promise.all([
        sheetFile ? putFile(sheetFile, 'sheet') : Promise.resolve(null),
        portraitFile ? putFile(portraitFile, 'portrait') : Promise.resolve(null)
      ]);
      if (newSheet && existing?.sheet?.id) await deleteFile(existing.sheet.id);
      if (newPortrait && existing?.portrait?.id) await deleteFile(existing.portrait.id);

      const character = {
        ...(existing || {}),
        id: existing?.id || app.makeId('character'),
        name: String(data.get('name') || '').trim(),
        knownAs: String(data.get('knownAs') || '').trim(),
        player: String(data.get('player') || '').trim(),
        kin: String(data.get('kin') || '').trim(),
        profession: String(data.get('profession') || '').trim(),
        age: String(data.get('age') || '').trim(),
        archetype: String(data.get('archetype') || '').trim(),
        weakness: String(data.get('weakness') || '').trim(),
        armor: app.normalizeArmor({
          body: String(data.get('armorBody') || 'Ingen'),
          helmet: String(data.get('armorHelmet') || 'Ingen'),
          customBodyName: String(data.get('customBodyName') || '').trim(),
          customBodyProtection: app.clamp(data.get('customBodyProtection'), 0, 99),
          customBodyEffect: String(data.get('customBodyEffect') || '').trim(),
          customHelmetName: String(data.get('customHelmetName') || '').trim(),
          customHelmetProtection: app.clamp(data.get('customHelmetProtection'), 0, 99),
          customHelmetEffect: String(data.get('customHelmetEffect') || '').trim(),
          notes: String(data.get('armorNotes') || '').trim()
        }),
        background: String(data.get('background') || '').trim(),
        notes: String(data.get('notes') || '').trim(),
        sheet: newSheet || existing?.sheet || null,
        portrait: newPortrait || existing?.portrait || null,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      if (!character.name) return;
      if (existing) Object.assign(existing, character);
      else partyState().characters.push(character);
      app.saveState(existing ? 'Karaktären uppdaterad' : 'Karaktärsfliken skapad');
      activeId = character.id;
      await selectCharacter(character.id);
    } catch (error) {
      console.warn(error);
      app.showToast('Filen kunde inte sparas');
    }
  }

  async function removeCharacter(character) {
    if (!confirm(`Ta bort karaktärsfliken för ${characterLabel(character)}?`)) return;
    await Promise.all([deleteFile(character.sheet?.id), deleteFile(character.portrait?.id)]);
    const characters = partyState().characters;
    const index = characters.findIndex((entry) => entry.id === character.id);
    if (index >= 0) characters.splice(index, 1);
    app.saveState('Karaktären borttagen');
    activeId = characters[0]?.id || null;
    renderTabs();
    if (activeId) await selectCharacter(activeId);
    else {
      hidePanels();
      document.getElementById('party-empty').hidden = false;
    }
  }

  async function attachmentForExport(meta) {
    if (!meta?.id) return null;
    const record = await getFile(meta.id).catch(() => null);
    if (!record?.blob) return null;
    return {
      name: record.name,
      type: record.type,
      size: record.size,
      dataUrl: await blobToDataUrl(record.blob)
    };
  }

  async function exportCharacter(character) {
    try {
      app.showToast('Förbereder karaktärspaket…');
      const payload = {
        type: 'dod-character-package',
        version: 1,
        exportedAt: new Date().toISOString(),
        character: {
          ...character,
          id: undefined,
          sheet: undefined,
          portrait: undefined,
          createdAt: undefined,
          updatedAt: undefined
        },
        attachments: {
          sheet: await attachmentForExport(character.sheet),
          portrait: await attachmentForExport(character.portrait)
        }
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = (character.name || 'karaktar').toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-').replace(/^-|-$/g, '');
      link.href = url;
      link.download = `${safeName || 'karaktar'}-karaktarspaket.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      app.showToast('Karaktärspaket exporterat');
    } catch (error) {
      console.warn(error);
      app.showToast('Paketet kunde inte exporteras');
    }
  }

  function normalizeImportedCharacter(parsed) {
    if (parsed?.type === 'dod-character-package' && parsed.character) {
      return { character: parsed.character, attachments: parsed.attachments || {} };
    }
    if (parsed?.character && typeof parsed.character === 'object') {
      const source = parsed.character;
      return {
        character: {
          name: source.name || 'Importerad karaktär',
          knownAs: source.knownAs || '',
          player: source.player || '',
          kin: source.kin || '',
          profession: source.profession || '',
          age: source.age || '',
          archetype: source.archetype || '',
          weakness: source.weakness || '',
          armor: app.normalizeArmor(source.armor),
          background: source.background || parsed.background || '',
          notes: source.notes || '',
          sourceCharacter: source,
          sourceInventory: parsed.inventory || null,
          sourceJournal: parsed.journal || null
        },
        attachments: parsed.attachments || {}
      };
    }
    if (parsed && typeof parsed === 'object' && (parsed.name || parsed.background)) {
      return { character: parsed, attachments: parsed.attachments || {} };
    }
    throw new Error('Okänt format');
  }

  async function importPackage(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const normalized = normalizeImportedCharacter(parsed);
      const [sheet, portrait] = await Promise.all([
        putBlobRecord(normalized.attachments.sheet, 'sheet'),
        putBlobRecord(normalized.attachments.portrait, 'portrait')
      ]);
      const source = normalized.character;
      const character = {
        id: app.makeId('character'),
        name: String(source.name || 'Importerad karaktär'),
        knownAs: String(source.knownAs || ''),
        player: String(source.player || ''),
        kin: String(source.kin || ''),
        profession: String(source.profession || ''),
        age: String(source.age || ''),
        archetype: String(source.archetype || ''),
        weakness: String(source.weakness || ''),
        armor: app.normalizeArmor(source.armor || source.sourceCharacter?.armor),
        background: String(source.background || ''),
        notes: String(source.notes || ''),
        sourceCharacter: source.sourceCharacter || null,
        sourceInventory: source.sourceInventory || null,
        sourceJournal: source.sourceJournal || null,
        sheet,
        portrait,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      partyState().characters.push(character);
      app.saveState('Karaktärspaket importerat');
      activeId = character.id;
      await selectCharacter(character.id);
    } catch (error) {
      console.warn(error);
      app.showToast('Kunde inte importera karaktärspaketet');
    }
  }

  function bindUi() {
    document.getElementById('party-add-button').addEventListener('click', () => openEditor());
    document.querySelectorAll('[data-open-editor]').forEach((button) => button.addEventListener('click', () => openEditor()));
    document.getElementById('party-cancel').addEventListener('click', async () => {
      const fallback = activeId || partyState().characters[0]?.id;
      if (fallback) await selectCharacter(fallback);
      else {
        hidePanels();
        document.getElementById('party-empty').hidden = false;
      }
    });
    document.getElementById('party-form').addEventListener('submit', saveFromForm);
    document.querySelectorAll('[data-party-armor-editor]').forEach((select) => select.addEventListener('change', toggleEditorCustomArmor));
    setArmorEditor(null);
    document.getElementById('party-sheet-file').addEventListener('change', (event) => {
      document.getElementById('party-sheet-name').textContent = event.target.files?.[0]?.name || 'Ingen fil vald';
    });
    document.getElementById('party-portrait-file').addEventListener('change', (event) => {
      document.getElementById('party-portrait-name').textContent = event.target.files?.[0]?.name || 'Ingen fil vald';
    });
    document.getElementById('party-package-import').addEventListener('change', async (event) => {
      await importPackage(event.target.files?.[0]);
      event.target.value = '';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindUi();
    const characters = partyState().characters;
    const hashValue = decodeURIComponent(location.hash.slice(1));
    renderTabs();
    if (hashValue === 'new') {
      openEditor();
    } else if (hashValue && characters.some((character) => character.id === hashValue)) {
      activeId = hashValue;
      await selectCharacter(activeId);
    } else if (characters.length) {
      activeId = characters[0].id;
      await selectCharacter(activeId);
    } else {
      hidePanels();
      document.getElementById('party-empty').hidden = false;
    }
  });

  window.addEventListener('beforeunload', () => {
    clearObjectUrls();
    diceController?.destroy();
  });
})();
