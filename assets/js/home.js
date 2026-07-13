(() => {
  'use strict';

  const app = window.AlvarApp;
  const DB_NAME = 'alvarMustaCampaignFilesV1';
  const STORE_NAME = 'files';
  let portraitUrls = [];

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

  function clearPortraitUrls() {
    portraitUrls.forEach((url) => URL.revokeObjectURL(url));
    portraitUrls = [];
  }

  function makePortraitUrl(blob) {
    const url = URL.createObjectURL(blob);
    portraitUrls.push(url);
    return url;
  }

  function initials(character) {
    const label = character.knownAs || character.name || '?';
    return label.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';
  }

  function armorText(character) {
    const details = app.armorDetails(character.armor || character.sourceCharacter?.armor);
    const names = [details.bodyName];
    if (details.armor.helmet !== 'Ingen') names.push(details.helmetName);
    return `${names.join(' + ')} · skydd ${details.baseProtection}`;
  }

  function factMarkup(label, value) {
    if (!value) return '';
    return `<div><dt>${app.escapeHtml(label)}</dt><dd>${app.escapeHtml(value)}</dd></div>`;
  }

  function alvarCard(character) {
    const displayName = character.name || 'Alvar Folke Musta';
    const knownAs = character.knownAs && character.knownAs !== displayName ? character.knownAs : '';
    const hp = character.derived || {};
    return `
      <article class="character-card">
        <a class="character-card-main" href="party.html#alvar/overview" aria-label="Öppna ${app.escapeHtml(displayName)}">
          <div class="character-card-portrait has-image">
            <img src="assets/images/kattfolkstjuvar.webp" alt="Illustration för ${app.escapeHtml(displayName)}">
            <span class="character-card-badge">Digitalt blad</span>
          </div>
          <div class="character-card-copy">
            <p class="eyebrow">Karaktär</p>
            <h3>${app.escapeHtml(displayName)}</h3>
            ${knownAs ? `<p class="character-alias">Känd som ${app.escapeHtml(knownAs)}</p>` : ''}
            <dl class="character-card-facts">
              ${factMarkup('Spelare', character.player)}
              ${factMarkup('Släkte', character.kin)}
              ${factMarkup('Yrke', character.profession)}
              ${factMarkup('Rustning', armorText(character))}
            </dl>
            <div class="character-card-resources">
              <span><strong>${app.escapeHtml(hp.hpCurrent ?? '–')}</strong> / ${app.escapeHtml(hp.hpMax ?? '–')} KP</span>
              <span><strong>${app.escapeHtml(hp.wpCurrent ?? '–')}</strong> / ${app.escapeHtml(hp.wpMax ?? '–')} VP</span>
            </div>
            <span class="character-card-open">Öppna karaktären →</span>
          </div>
        </a>
        <nav class="character-card-links" aria-label="Genvägar för ${app.escapeHtml(displayName)}">
          <a href="party.html#alvar/sheet">Blad</a>
          <a href="party.html#alvar/background">Bakgrund</a>
          <a href="party.html#alvar/inventory">Inventory</a>
          <a href="party.html#alvar/journal">Journal</a>
        </nav>
      </article>
    `;
  }

  function partyCard(character, portraitUrl) {
    const displayName = character.name || 'Namnlös karaktär';
    const knownAs = character.knownAs && character.knownAs !== displayName ? character.knownAs : '';
    const source = character.sourceCharacter || {};
    const derived = source.derived || {};
    const hasResources = derived.hpCurrent != null || derived.wpCurrent != null;
    return `
      <article class="character-card">
        <a class="character-card-main" href="party.html#${encodeURIComponent(character.id)}/overview" aria-label="Öppna ${app.escapeHtml(displayName)}">
          <div class="character-card-portrait ${portraitUrl ? 'has-image' : ''}">
            ${portraitUrl
              ? `<img src="${portraitUrl}" alt="Porträtt av ${app.escapeHtml(displayName)}">`
              : `<span class="character-initials">${app.escapeHtml(initials(character))}</span>`}
            ${character.sheet ? '<span class="character-card-badge">Karaktärsblad</span>' : ''}
          </div>
          <div class="character-card-copy">
            <p class="eyebrow">Karaktär</p>
            <h3>${app.escapeHtml(displayName)}</h3>
            ${knownAs ? `<p class="character-alias">Känd som ${app.escapeHtml(knownAs)}</p>` : ''}
            <dl class="character-card-facts">
              ${factMarkup('Spelare', character.player)}
              ${factMarkup('Släkte', character.kin)}
              ${factMarkup('Yrke', character.profession)}
              ${factMarkup('Rustning', armorText(character))}
            </dl>
            ${hasResources ? `
              <div class="character-card-resources">
                ${derived.hpCurrent != null ? `<span><strong>${app.escapeHtml(derived.hpCurrent)}</strong> / ${app.escapeHtml(derived.hpMax ?? '–')} KP</span>` : ''}
                ${derived.wpCurrent != null ? `<span><strong>${app.escapeHtml(derived.wpCurrent)}</strong> / ${app.escapeHtml(derived.wpMax ?? '–')} VP</span>` : ''}
              </div>
            ` : ''}
            <span class="character-card-open">Öppna karaktären →</span>
          </div>
        </a>
        <nav class="character-card-links" aria-label="Genvägar för ${app.escapeHtml(displayName)}">
          <a href="party.html#${encodeURIComponent(character.id)}/sheet">Blad</a>
          <a href="party.html#${encodeURIComponent(character.id)}/background">Bakgrund</a>
          <a href="party.html#${encodeURIComponent(character.id)}/inventory">Inventory</a>
          <a href="party.html#${encodeURIComponent(character.id)}/journal">Journal</a>
        </nav>
      </article>
    `;
  }

  function addCard() {
    return `
      <article class="character-card character-card-add">
        <a href="party.html#new">
          <span class="add-character-symbol">+</span>
          <p class="eyebrow">Ny plats i sällskapet</p>
          <h3>Lägg till en karaktär</h3>
          <p>Skapa en ny flik eller importera ett karaktärspaket från en medspelare.</p>
          <span class="character-card-open">Fortsätt →</span>
        </a>
      </article>
    `;
  }

  async function render() {
    clearPortraitUrls();
    const state = app.getState();
    const partyCharacters = Array.isArray(state.party?.characters) ? state.party.characters : [];
    const count = 1 + partyCharacters.length;
    const countElement = document.getElementById('home-character-count');
    const labelElement = document.getElementById('home-character-count-label');
    if (countElement) countElement.textContent = String(count);
    if (labelElement) labelElement.textContent = count === 1 ? 'karaktär i gruppen' : 'karaktärer i gruppen';

    const portraits = await Promise.all(partyCharacters.map(async (character) => {
      try {
        const record = await getFile(character.portrait?.id);
        return record?.blob ? makePortraitUrl(record.blob) : '';
      } catch (error) {
        console.warn(error);
        return '';
      }
    }));

    const grid = document.getElementById('home-character-grid');
    if (!grid) return;
    grid.innerHTML = [
      alvarCard(state.character),
      ...partyCharacters.map((character, index) => partyCard(character, portraits[index])),
      addCard()
    ].join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    window.addEventListener('alvar-state-changed', render);
  });
  window.addEventListener('beforeunload', clearPortraitUrls);
})();
