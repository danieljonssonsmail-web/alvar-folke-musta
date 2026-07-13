(() => {
  'use strict';

  const app = window.AlvarApp;
  const attrMeta = [
    ['styrka', 'Styrka', 'STY'],
    ['fysik', 'Fysik', 'FYS'],
    ['smidighet', 'Smidighet', 'SMI'],
    ['intelligens', 'Intelligens', 'INT'],
    ['psyke', 'Psyke', 'PSY'],
    ['karisma', 'Karisma', 'KAR']
  ];

  const conditionMeta = [
    ['utmattad', 'Utmattad'],
    ['krasslig', 'Krasslig'],
    ['omtocknad', 'Omtöcknad'],
    ['arg', 'Arg'],
    ['radd', 'Rädd'],
    ['uppgiven', 'Uppgiven']
  ];

  function pips(current, max) {
    const count = Math.min(30, Math.max(1, Number(max) || 1));
    return Array.from({ length: count }, (_, index) => `<span class="pip ${index < current ? 'filled' : ''}" aria-hidden="true"></span>`).join('');
  }

  function renderAttributes() {
    const state = app.getState();
    const container = document.getElementById('attributes');
    container.innerHTML = attrMeta.map(([key, label, abbr]) => `
      <div class="stat-card">
        <label for="attr-${key}">${label}</label>
        <input id="attr-${key}" type="number" min="1" max="30" value="${state.character.attributes[key]}" data-attribute="${key}">
        <span class="abbr">${abbr}</span>
      </div>
    `).join('');

    container.querySelectorAll('[data-attribute]').forEach((input) => {
      input.addEventListener('change', () => {
        state.character.attributes[input.dataset.attribute] = app.clamp(input.value, 1, 30);
        input.value = state.character.attributes[input.dataset.attribute];
        app.saveState();
      });
    });
  }

  function renderTrackers() {
    const state = app.getState();
    const { derived } = state.character;
    const container = document.getElementById('trackers');
    const trackers = [
      ['hp', 'Kroppspoäng', 'hpCurrent', 'hpMax'],
      ['wp', 'Viljepoäng', 'wpCurrent', 'wpMax']
    ];
    container.innerHTML = trackers.map(([key, label, currentKey, maxKey]) => `
      <div class="tracker">
        <div class="tracker-head">
          <div>
            <h3>${label}</h3>
            <p class="small muted">Nuvarande / max</p>
          </div>
          <div class="counter">
            <button class="btn btn-small btn-ghost" type="button" data-counter="${currentKey}" data-delta="-1" aria-label="Minska ${label}">−</button>
            <input type="number" min="0" max="99" value="${derived[currentKey]}" data-derived="${currentKey}" aria-label="Nuvarande ${label}">
            <span>/</span>
            <input type="number" min="1" max="99" value="${derived[maxKey]}" data-derived="${maxKey}" aria-label="Max ${label}">
            <button class="btn btn-small btn-ghost" type="button" data-counter="${currentKey}" data-delta="1" aria-label="Öka ${label}">+</button>
          </div>
        </div>
        <div class="pips">${pips(derived[currentKey], derived[maxKey])}</div>
      </div>
    `).join('');

    container.querySelectorAll('[data-counter]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.counter;
        const maxKey = key === 'hpCurrent' ? 'hpMax' : 'wpMax';
        derived[key] = app.clamp(derived[key] + Number(button.dataset.delta), 0, derived[maxKey]);
        app.saveState();
        renderTrackers();
      });
    });
    container.querySelectorAll('[data-derived]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.derived;
        const min = key.endsWith('Max') ? 1 : 0;
        derived[key] = app.clamp(input.value, min, 99);
        if (key === 'hpMax') derived.hpCurrent = Math.min(derived.hpCurrent, derived.hpMax);
        if (key === 'wpMax') derived.wpCurrent = Math.min(derived.wpCurrent, derived.wpMax);
        app.saveState();
        renderTrackers();
      });
    });
  }

  function renderConditions() {
    const state = app.getState();
    const container = document.getElementById('conditions');
    container.innerHTML = conditionMeta.map(([key, label]) => `
      <label class="condition">
        <input type="checkbox" data-condition="${key}" ${state.character.conditions[key] ? 'checked' : ''}>
        <span>${label}</span>
      </label>
    `).join('');
    container.querySelectorAll('[data-condition]').forEach((input) => {
      input.addEventListener('change', () => {
        state.character.conditions[input.dataset.condition] = input.checked;
        app.saveState();
      });
    });
  }

  function renderBasics() {
    const state = app.getState();
    const basics = [
      ['player', 'Spelare'],
      ['kin', 'Släkte'],
      ['age', 'Ålder'],
      ['profession', 'Yrke'],
      ['archetype', 'Arketyp'],
      ['weakness', 'Svaghet']
    ];
    const container = document.getElementById('basics');
    container.innerHTML = basics.map(([key, label]) => `
      <label class="field">
        <span>${label}</span>
        <input type="text" value="${app.escapeHtml(state.character[key])}" data-basic="${key}">
      </label>
    `).join('');
    container.querySelectorAll('[data-basic]').forEach((input) => {
      input.addEventListener('change', () => {
        state.character[input.dataset.basic] = input.value.trim();
        app.saveState();
      });
    });
  }

  function renderDerived() {
    const state = app.getState();
    const { derived } = state.character;
    const container = document.getElementById('derived');
    container.innerHTML = `
      <label class="field"><span>Förflyttning</span><input type="number" min="0" max="99" value="${derived.movement}" data-derived-static="movement"></label>
      <label class="field"><span>Skadebonus STY</span><input type="text" value="${app.escapeHtml(derived.strengthDamage)}" data-derived-static="strengthDamage"></label>
      <label class="field"><span>Skadebonus SMI</span><input type="text" value="${app.escapeHtml(derived.agilityDamage)}" data-derived-static="agilityDamage"></label>
      <label class="field"><span>Minnessak</span><input type="text" value="${app.escapeHtml(state.character.memory)}" data-memory></label>
    `;
    container.querySelectorAll('[data-derived-static]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.derivedStatic;
        derived[key] = key === 'movement' ? app.clamp(input.value, 0, 99) : input.value.trim();
        app.saveState();
      });
    });
    container.querySelector('[data-memory]').addEventListener('change', (event) => {
      state.character.memory = event.target.value.trim();
      app.saveState();
    });
  }

  function renderAbilityList(targetId, listKey) {
    const state = app.getState();
    const list = state.character[listKey];
    const target = document.getElementById(targetId);
    target.innerHTML = list.map((item, index) => `
      <div class="card card-flat">
        <label class="field">
          <span>Namn</span>
          <input type="text" value="${app.escapeHtml(item.name)}" data-ability-name="${index}">
        </label>
        <label class="field" style="margin-top:.6rem">
          <span>Egna anteckningar</span>
          <textarea rows="2" data-ability-notes="${index}" placeholder="Skriv regeltext eller hur du brukar använda förmågan...">${app.escapeHtml(item.notes)}</textarea>
        </label>
      </div>
    `).join('');
    target.querySelectorAll('[data-ability-name]').forEach((input) => input.addEventListener('change', () => {
      list[Number(input.dataset.abilityName)].name = input.value.trim();
      app.saveState();
    }));
    target.querySelectorAll('[data-ability-notes]').forEach((textarea) => textarea.addEventListener('change', () => {
      list[Number(textarea.dataset.abilityNotes)].notes = textarea.value;
      app.saveState();
    }));
  }

  function skillRows(list, section) {
    return list.map((skill, index) => `
      <label class="skill-row" data-skill-row data-name="${app.escapeHtml(skill.name.toLowerCase())}">
        <span class="skill-name">${app.escapeHtml(skill.name)} ${skill.attr ? `<small>(${app.escapeHtml(skill.attr)})</small>` : ''}</span>
        <input type="number" min="0" max="30" value="${skill.value}" data-skill-section="${section}" data-skill-index="${index}" aria-label="${app.escapeHtml(skill.name)}">
      </label>
    `).join('');
  }

  function renderSkills() {
    const state = app.getState();
    document.getElementById('general-skills').innerHTML = skillRows(state.character.skills, 'skills');
    document.getElementById('weapon-skills').innerHTML = skillRows(state.character.weaponSkills, 'weaponSkills');
    document.getElementById('secondary-skills').innerHTML = skillRows(state.character.secondarySkills, 'secondarySkills');
    document.querySelectorAll('[data-skill-section]').forEach((input) => {
      input.addEventListener('change', () => {
        const list = state.character[input.dataset.skillSection];
        list[Number(input.dataset.skillIndex)].value = app.clamp(input.value, 0, 30);
        input.value = list[Number(input.dataset.skillIndex)].value;
        app.saveState();
      });
    });
  }

  function renderWeapons() {
    const state = app.getState();
    const tbody = document.getElementById('weapon-table');
    tbody.innerHTML = state.character.weapons.map((weapon, index) => `
      <tr>
        <td><input type="text" value="${app.escapeHtml(weapon.name)}" data-weapon="${index}" data-field="name"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.grip)}" data-weapon="${index}" data-field="grip"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.range)}" data-weapon="${index}" data-field="range"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.damage)}" data-weapon="${index}" data-field="damage"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.durability)}" data-weapon="${index}" data-field="durability"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.properties)}" data-weapon="${index}" data-field="properties"></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-weapon]').forEach((input) => input.addEventListener('change', () => {
      state.character.weapons[Number(input.dataset.weapon)][input.dataset.field] = input.value.trim();
      app.saveState();
    }));

    const armor = state.character.armor;
    document.getElementById('armor-fields').innerHTML = `
      <label class="field"><span>Hjälm</span><input type="text" value="${app.escapeHtml(armor.helmet)}" data-armor="helmet"></label>
      <label class="field"><span>Rustning</span><input type="text" value="${app.escapeHtml(armor.armor)}" data-armor="armor"></label>
      <label class="field full"><span>Anteckningar och nackdelar</span><textarea data-armor="notes">${app.escapeHtml(armor.notes)}</textarea></label>
    `;
    document.querySelectorAll('[data-armor]').forEach((input) => input.addEventListener('change', () => {
      armor[input.dataset.armor] = input.value;
      app.saveState();
    }));
  }

  function bindSearch() {
    const search = document.getElementById('skill-search');
    search.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      document.querySelectorAll('[data-skill-row]').forEach((row) => {
        row.hidden = query && !row.dataset.name.includes(query);
      });
    });
  }

  function renderAll() {
    renderBasics();
    renderAttributes();
    renderTrackers();
    renderConditions();
    renderDerived();
    renderAbilityList('abilities', 'abilities');
    renderAbilityList('tricks', 'tricks');
    renderSkills();
    renderWeapons();
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderAll();
    bindSearch();
    window.addEventListener('alvar-state-changed', renderAll);
  });
})();
