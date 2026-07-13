(() => {
  'use strict';

  const STORAGE_KEY = 'alvarMustaCampaignV1';

  const defaultState = {
    version: 1,
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
        helmet: 'Läder',
        armor: 'Läder',
        notes: 'Nackdel på Smyga, Undvika samt Hoppa & klättra. Hjälmen ger nackdel på Upptäcka fara och avståndsattacker.'
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
    journal: []
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

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(defaultState);
      return mergeDeep(clone(defaultState), JSON.parse(raw));
    } catch (error) {
      console.warn('Kunde inte läsa sparad data:', error);
      return clone(defaultState);
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
    state = mergeDeep(clone(defaultState), nextState || {});
    saveState(message);
    window.dispatchEvent(new CustomEvent('alvar-state-changed'));
  }

  function resetState() {
    state = clone(defaultState);
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
    defaultState: clone(defaultState)
  };

  document.addEventListener('DOMContentLoaded', initCommonUi);
})();
