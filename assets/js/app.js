(() => {
  'use strict';

  const STORAGE_KEY = 'alvarMustaCampaignV1';

  const ARMOR_CATALOG = {
    body: {
      'Ingen': { protection: 0, effect: 'Ingen rustning och inga färdighetsnackdelar.', typeBonus: {} },
      'Läder': { protection: 1, effect: 'Inga färdighetsnackdelar.', typeBonus: { kross: 2 } },
      'Nitläder': { protection: 2, effect: 'Nackdel på slag mot SMYGA.', typeBonus: { kross: 2 } },
      'Ringbrynja': { protection: 4, effect: 'Nackdel på slag mot UNDVIKA och SMYGA.', typeBonus: { hugg: 2 } },
      'Plåtrustning': { protection: 6, effect: 'Nackdel på slag mot HOPPA & KLÄTTRA, UNDVIKA och SMYGA.', typeBonus: {} },
      'Egen rustning': { protection: 0, effect: 'Använd det egna skyddsvärdet och den egna effekten.', typeBonus: {} }
    },
    helmet: {
      'Ingen': { protection: 0, effect: 'Ingen hjälm och inga färdighetsnackdelar.' },
      'Öppen hjälm': { protection: 1, effect: 'Nackdel på slag mot UPPTÄCKA FARA.' },
      'Tunnhjälm': { protection: 2, effect: 'Nackdel på slag mot UPPTÄCKA FARA och avståndsattacker.' },
      'Egen hjälm': { protection: 0, effect: 'Använd det egna skyddsvärdet och den egna effekten.' }
    }
  };

  const defaultState = {
    version: 3,
    character: {
      name: 'Alvar Folke Musta',
      knownAs: 'Folke',
      player: 'DJ',
      kin: 'Kattfolk',
      age: 'Ung',
      profession: 'Rififi',
      archetype: 'Våghalsen',
      weakness: 'Kleptoman',
      attributes: {
        styrka: 14,
        fysik: 16,
        smidighet: 18,
        intelligens: 16,
        psyke: 16,
        karisma: 15
      },
      derived: {
        movement: 14,
        strengthDamage: 'T4',
        agilityDamage: 'T6',
        hpCurrent: 16,
        hpMax: 16,
        wpCurrent: 16,
        wpMax: 16
      },
      conditions: {
        utmattad: false,
        krasslig: false,
        omtocknad: false,
        arg: false,
        radd: false,
        uppgiven: false
      },
      abilities: [
        { name: 'Mästerakrobat', notes: '' },
        { name: 'Tjuvhugg', notes: '' },
        { name: 'Hal som en ål', notes: '' },
        { name: 'Magisk talang: Mentalism', notes: '' }
      ],
      tricks: [
        { name: 'Känna magi', notes: '' },
        { name: 'Hämta', notes: '' },
        { name: 'Bromsa fall', notes: '' }
      ],
      skills: [
        { name: 'Bestiologi', attr: 'INT', value: 7 },
        { name: 'Bluffa', attr: 'KAR', value: 6 },
        { name: 'Fingerfärdighet', attr: 'SMI', value: 14 },
        { name: 'Finna dolda ting', attr: 'INT', value: 14 },
        { name: 'Främmande språk', attr: 'INT', value: 7 },
        { name: 'Hantverk', attr: 'STY', value: 6 },
        { name: 'Hoppa & klättra', attr: 'SMI', value: 14 },
        { name: 'Jakt & fiske', attr: 'SMI', value: 7 },
        { name: 'Köpslå', attr: 'KAR', value: 6 },
        { name: 'Läkekonst', attr: 'INT', value: 6 },
        { name: 'Myter & legender', attr: 'INT', value: 6 },
        { name: 'Rida', attr: 'SMI', value: 7 },
        { name: 'Simma', attr: 'SMI', value: 7 },
        { name: 'Sjökunnighet', attr: 'INT', value: 7 },
        { name: 'Smyga', attr: 'SMI', value: 14 },
        { name: 'Undvika', attr: 'SMI', value: 16 },
        { name: 'Uppträda', attr: 'KAR', value: 7 },
        { name: 'Upptäcka fara', attr: 'INT', value: 14 },
        { name: 'Vildmarksvana', attr: 'INT', value: 7 },
        { name: 'Övertala', attr: 'KAR', value: 6 }
      ],
      weaponSkills: [
        { name: 'Armborst', attr: 'SMI', value: 7 },
        { name: 'Hammare', attr: 'STY', value: 6 },
        { name: 'Kniv', attr: 'SMI', value: 18 },
        { name: 'Pilbåge', attr: 'SMI', value: 16 },
        { name: 'Slagsmål', attr: 'STY', value: 6 },
        { name: 'Slunga', attr: 'SMI', value: 7 },
        { name: 'Spjut', attr: 'STY', value: 7 },
        { name: 'Stav', attr: 'SMI', value: 7 },
        { name: 'Svärd', attr: 'STY', value: 7 },
        { name: 'Yxa', attr: 'STY', value: 7 }
      ],
      secondarySkills: [
        { name: 'Undre världen', attr: '', value: 7 },
        { name: 'Mentalism', attr: '', value: 7 }
      ],
      weapons: [
        { name: 'Dolk', grip: '1h', range: 'N', damage: 'T8', durability: '9', properties: 'Smidig, stickande, huggande, kan kastas' },
        { name: 'Långbåge', grip: '2h', range: '100', damage: 'T12', durability: '6', properties: 'Stickande, kräver koger' }
      ],
      armor: {
        body: 'Läder',
        helmet: 'Ingen',
        customBodyName: '',
        customBodyProtection: 0,
        customBodyEffect: '',
        customHelmetName: '',
        customHelmetProtection: 0,
        customHelmetEffect: '',
        notes: ''
      },
      memory: ''
    },
    inventory: {
      capacity: 10,
      backpackBonus: 2,
      coins: { gold: 0, silver: 0, copper: 0 },
      items: [
        { id: 'item-1', name: 'Vändbara kläder, mantel och stövlar', quantity: 1, category: 'Kläder', slots: 1, worn: true, notes: '' },
        { id: 'item-2', name: 'Silkesrep 30 m och änterhake', quantity: 1, category: 'Verktyg', slots: 1, worn: false, notes: '' },
        { id: 'item-3', name: 'Avancerade dyrkar', quantity: 1, category: 'Verktyg', slots: 1, worn: false, notes: '' },
        { id: 'item-4', name: 'Koger', quantity: 1, category: 'Ammunition', slots: 1, worn: false, notes: '' },
        { id: 'item-5', name: 'Fackla', quantity: 1, category: 'Ljuskälla', slots: 1, worn: false, notes: '' },
        { id: 'item-6', name: 'Kofot', quantity: 1, category: 'Verktyg', slots: 1, worn: false, notes: '' },
        { id: 'item-7', name: 'En enkel silvermedaljong', quantity: 1, category: 'Småsak', slots: 0, worn: false, notes: '' },
        { id: 'item-8', name: 'Örtbrygd', quantity: 1, category: 'Småsak', slots: 0, worn: false, notes: '' },
        { id: 'item-9', name: 'Hänglås', quantity: 1, category: 'Småsak', slots: 0, worn: false, notes: '' }
      ]
    },
    journal: [],
    party: { characters: [] }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeDeep(target, source) {
    if (!source || typeof source !== 'object') return target;
    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      if (Array.isArray(sourceValue)) {
        target[key] = sourceValue;
      } else if (sourceValue && typeof sourceValue === 'object') {
        target[key] = mergeDeep(target[key] && typeof target[key] === 'object' ? target[key] : {}, sourceValue);
      } else {
        target[key] = sourceValue;
      }
    });
    return target;
  }

  function validArmorChoice(kind, value) {
    return Object.prototype.hasOwnProperty.call(ARMOR_CATALOG[kind], value);
  }

  function normalizeArmor(rawArmor) {
    const source = rawArmor && typeof rawArmor === 'object' ? rawArmor : {};
    let body = String(source.body || source.armor || 'Ingen');
    let helmet = String(source.helmet || 'Ingen');

    const normalized = {
      body: validArmorChoice('body', body) ? body : 'Egen rustning',
      helmet: validArmorChoice('helmet', helmet) ? helmet : 'Egen hjälm',
      customBodyName: String(source.customBodyName || ''),
      customBodyProtection: clamp(source.customBodyProtection, 0, 99),
      customBodyEffect: String(source.customBodyEffect || ''),
      customHelmetName: String(source.customHelmetName || ''),
      customHelmetProtection: clamp(source.customHelmetProtection, 0, 99),
      customHelmetEffect: String(source.customHelmetEffect || ''),
      notes: String(source.notes || '')
    };

    if (!validArmorChoice('body', body)) normalized.customBodyName = normalized.customBodyName || body;
    if (!validArmorChoice('helmet', helmet)) normalized.customHelmetName = normalized.customHelmetName || helmet;

    // Tidiga versioner hade av misstag "Läder" i hjälmfältet.
    if (helmet === 'Läder' && source.armor === 'Läder' && !source.customHelmetName) {
      normalized.helmet = 'Ingen';
      normalized.customHelmetName = '';
    }
    return normalized;
  }

  function armorDetails(rawArmor, damageType = 'normal') {
    const armor = normalizeArmor(rawArmor);
    const bodyBase = ARMOR_CATALOG.body[armor.body] || ARMOR_CATALOG.body['Egen rustning'];
    const helmetBase = ARMOR_CATALOG.helmet[armor.helmet] || ARMOR_CATALOG.helmet['Egen hjälm'];
    const bodyProtection = armor.body === 'Egen rustning' ? armor.customBodyProtection : bodyBase.protection;
    const helmetProtection = armor.helmet === 'Egen hjälm' ? armor.customHelmetProtection : helmetBase.protection;
    const typeBonus = Number(bodyBase.typeBonus?.[damageType] || 0);
    const bodyName = armor.body === 'Egen rustning' ? (armor.customBodyName || 'Egen rustning') : armor.body;
    const helmetName = armor.helmet === 'Egen hjälm' ? (armor.customHelmetName || 'Egen hjälm') : armor.helmet;
    const effects = [];
    const bodyEffect = armor.body === 'Egen rustning' ? armor.customBodyEffect : bodyBase.effect;
    const helmetEffect = armor.helmet === 'Egen hjälm' ? armor.customHelmetEffect : helmetBase.effect;
    if (armor.body !== 'Ingen' && bodyEffect) effects.push(`${bodyName}: ${bodyEffect}`);
    if (armor.helmet !== 'Ingen' && helmetEffect) effects.push(`${helmetName}: ${helmetEffect}`);
    if (armor.notes) effects.push(armor.notes);
    return {
      armor,
      bodyName,
      helmetName,
      bodyProtection,
      helmetProtection,
      baseProtection: bodyProtection + helmetProtection,
      typeBonus,
      effectiveProtection: bodyProtection + helmetProtection + typeBonus,
      effects
    };
  }

  function normalizeState(nextState) {
    if (!nextState || typeof nextState !== 'object') return nextState;
    if (!nextState.character || typeof nextState.character !== 'object') nextState.character = {};
    nextState.character.armor = normalizeArmor(nextState.character.armor);
    if (!nextState.party || typeof nextState.party !== 'object') nextState.party = { characters: [] };
    if (!Array.isArray(nextState.party.characters)) nextState.party.characters = [];
    nextState.party.characters.forEach((character) => {
      if (!character || typeof character !== 'object') return;
      const sourceArmor = character.armor || character.sourceCharacter?.armor;
      character.armor = normalizeArmor(sourceArmor);
    });
    nextState.version = Math.max(Number(nextState.version) || 0, 3);
    return nextState;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeState(clone(defaultState));
      const parsed = normalizeState(JSON.parse(raw));
      return normalizeState(mergeDeep(clone(defaultState), parsed));
    } catch (error) {
      console.warn('Kunde inte läsa sparad data:', error);
      return normalizeState(clone(defaultState));
    }
  }

  let state = loadState();
  let saveTimer = null;

  function saveState(message = 'Sparat') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Kunde inte skriva till lokal lagring:', error);
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => showToast(message), 80);
  }

  function getState() { return state; }

  function replaceState(nextState, message = 'Data importerad') {
    const normalizedImport = normalizeState(clone(nextState || {}));
    state = normalizeState(mergeDeep(clone(defaultState), normalizedImport));
    saveState(message);
    window.dispatchEvent(new CustomEvent('alvar-state-changed'));
  }

  function resetState() {
    state = normalizeState(clone(defaultState));
    saveState('Allt återställt');
    window.dispatchEvent(new CustomEvent('alvar-state-changed'));
  }

  function showToast(text) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function makeId(prefix = 'id') {
    if (window.crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alvar-folke-musta-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Säkerhetskopia hämtad');
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        replaceState(parsed);
      } catch (error) {
        showToast('Filen gick inte att läsa');
      }
    };
    reader.readAsText(file);
  }

  function initCommonUi() {
    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.site-nav');
    navToggle?.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });

    document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', downloadJson));
    document.querySelectorAll('[data-import]').forEach((input) => input.addEventListener('change', (event) => importJson(event.target.files?.[0])));
    document.querySelectorAll('[data-reset]').forEach((button) => button.addEventListener('click', () => {
      if (confirm('Återställa hela karaktären, inventoryt och journalen till ursprungsläget?')) resetState();
    }));
  }

  window.AlvarApp = {
    getState,
    saveState,
    replaceState,
    resetState,
    showToast,
    makeId,
    clamp,
    escapeHtml,
    armorCatalog: clone(ARMOR_CATALOG),
    normalizeArmor,
    armorDetails,
    defaultState: clone(defaultState)
  };

  document.addEventListener('DOMContentLoaded', initCommonUi);
})();
