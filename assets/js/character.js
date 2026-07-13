(() => {
  'use strict';

  const app = window.AlvarApp;
  let diceController = null;
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
      <div class="skill-row" data-skill-row data-name="${app.escapeHtml(skill.name.toLowerCase())}">
        <label class="skill-xp-check" title="Erfarenhet: färdigheten får försöka höjas efter spelmötet">
          <input type="checkbox" ${skill.experience ? 'checked' : ''} data-skill-experience="${section}" data-skill-index="${index}" aria-label="Erfarenhet för ${app.escapeHtml(skill.name)}">
          <span aria-hidden="true">✓</span>
        </label>
        <span class="skill-name">${app.escapeHtml(skill.name)} ${skill.attr ? `<small>(${app.escapeHtml(skill.attr)})</small>` : ''}</span>
        <input class="skill-value" type="number" min="0" max="30" value="${skill.value}" data-skill-section="${section}" data-skill-index="${index}" aria-label="Värde för ${app.escapeHtml(skill.name)}">
        <button class="btn btn-small btn-ghost skill-roll-button" type="button" data-roll-skill="${section}" data-skill-index="${index}">Slå</button>
      </div>
    `).join('');
  }

  function updateExperienceSummary() {
    const state = app.getState();
    const all = [...state.character.skills, ...state.character.weaponSkills, ...state.character.secondarySkills];
    const marked = all.filter((skill) => skill.experience).length;
    const summary = document.getElementById('experience-summary');
    if (summary) summary.textContent = marked ? `${marked} markerade för höjning` : 'Ingen färdighet markerad ännu';
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

    document.querySelectorAll('[data-skill-experience]').forEach((input) => {
      input.addEventListener('change', () => {
        const list = state.character[input.dataset.skillExperience];
        list[Number(input.dataset.skillIndex)].experience = input.checked;
        app.saveState(input.checked ? 'Erfarenhet markerad' : 'Erfarenhetsmarkering borttagen');
        updateExperienceSummary();
      });
    });

    document.querySelectorAll('[data-roll-skill]').forEach((button) => {
      button.addEventListener('click', () => {
        const list = state.character[button.dataset.rollSkill];
        const skill = list[Number(button.dataset.skillIndex)];
        diceController?.rollSkill(skill.name, skill.value, 'skill');
      });
    });
    updateExperienceSummary();
  }

  function armorOptions(kind, selected) {
    return Object.keys(app.armorCatalog[kind]).map((name) => `
      <option value="${app.escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${app.escapeHtml(name)}</option>
    `).join('');
  }

  function protectionRows(armor) {
    const types = [
      ['normal', 'Normal fysisk skada'],
      ['kross', 'Krosskada'],
      ['hugg', 'Huggskada']
    ];
    return types.map(([key, label]) => {
      const details = app.armorDetails(armor, key);
      const bonus = details.typeBonus ? ` <small>(+${details.typeBonus} från rustningstyp)</small>` : '';
      return `<div><span>${label}</span><strong>${details.effectiveProtection}</strong>${bonus}</div>`;
    }).join('');
  }

  function renderArmor() {
    const state = app.getState();
    state.character.armor = app.normalizeArmor(state.character.armor);
    const armor = state.character.armor;
    const details = app.armorDetails(armor);
    const bodyCustom = armor.body === 'Egen rustning';
    const helmetCustom = armor.helmet === 'Egen hjälm';
    const effects = details.effects.length
      ? `<ul class="armor-effects">${details.effects.map((effect) => `<li>${app.escapeHtml(effect)}</li>`).join('')}</ul>`
      : '<p class="muted">Inga särskilda nackdelar.</p>';

    const container = document.getElementById('armor-fields');
    container.innerHTML = `
      <div class="armor-selector-grid">
        <label class="field"><span>Rustning</span><select data-armor-select="body">${armorOptions('body', armor.body)}</select></label>
        <label class="field"><span>Hjälm</span><select data-armor-select="helmet">${armorOptions('helmet', armor.helmet)}</select></label>
      </div>

      ${bodyCustom ? `
        <div class="armor-custom-grid">
          <label class="field"><span>Eget namn på rustningen</span><input type="text" value="${app.escapeHtml(armor.customBodyName)}" data-armor-field="customBodyName"></label>
          <label class="field"><span>Skyddsvärde</span><input type="number" min="0" max="99" value="${armor.customBodyProtection}" data-armor-field="customBodyProtection"></label>
          <label class="field full"><span>Effekt eller nackdel</span><input type="text" value="${app.escapeHtml(armor.customBodyEffect)}" data-armor-field="customBodyEffect"></label>
        </div>
      ` : ''}

      ${helmetCustom ? `
        <div class="armor-custom-grid">
          <label class="field"><span>Eget namn på hjälmen</span><input type="text" value="${app.escapeHtml(armor.customHelmetName)}" data-armor-field="customHelmetName"></label>
          <label class="field"><span>Extra skydd</span><input type="number" min="0" max="99" value="${armor.customHelmetProtection}" data-armor-field="customHelmetProtection"></label>
          <label class="field full"><span>Effekt eller nackdel</span><input type="text" value="${app.escapeHtml(armor.customHelmetEffect)}" data-armor-field="customHelmetEffect"></label>
        </div>
      ` : ''}

      <div class="armor-summary">
        <div class="armor-score" aria-label="Sammanlagt skyddsvärde">
          <span>Skydd</span>
          <strong>${details.baseProtection}</strong>
          <small>${app.escapeHtml(details.bodyName)}${armor.helmet !== 'Ingen' ? ` + ${app.escapeHtml(details.helmetName)}` : ''}</small>
        </div>
        <div>
          <h3>Effekt</h3>
          ${effects}
        </div>
      </div>

      <div class="damage-protection-grid">
        ${protectionRows(armor)}
      </div>

      <label class="field"><span>Egna rustningsanteckningar</span><textarea rows="3" data-armor-field="notes" placeholder="Skador på rustningen, särskilda egenskaper eller sådant spelledaren bestämt...">${app.escapeHtml(armor.notes)}</textarea></label>

      <details class="armor-rules">
        <summary>Rustningsregler vid bordet</summary>
        <div class="armor-rule-grid">
          <p><strong>Minska skadan:</strong> Dra av det sammanlagda skyddsvärdet från skadan från en fysisk attack.</p>
          <p><strong>En rustning:</strong> Du kan bära en kroppsrustning åt gången och kombinera den med en hjälm.</p>
          <p><strong>Byta utrustning:</strong> Att ta av eller på rustning eller hjälm räknas som en handling i strid.</p>
          <p><strong>Bärförmåga:</strong> Rustning och hjälm som bärs på kroppen räknas inte mot bärförmågan.</p>
          <p><strong>Helt stoppad närstridsskada:</strong> Om rustningen stoppar all skada från en närstridsattack tar vapnet i stället skadan och kan påverkas av sitt brytvärde.</p>
          <p><strong>Frivilliga skadetyper:</strong> Läder och nitläder ger 2 extra skydd mot krosskada. Ringbrynja ger 2 extra skydd mot huggskada.</p>
        </div>
      </details>
    `;

    container.querySelectorAll('[data-armor-select]').forEach((select) => select.addEventListener('change', () => {
      armor[select.dataset.armorSelect] = select.value;
      app.saveState('Rustningen ändrad');
      renderArmor();
    }));
    container.querySelectorAll('[data-armor-field]').forEach((input) => input.addEventListener('change', () => {
      const key = input.dataset.armorField;
      armor[key] = input.type === 'number' ? app.clamp(input.value, 0, 99) : input.value.trim();
      app.saveState('Rustningen uppdaterad');
      if (key !== 'notes') renderArmor();
    }));
  }

  function findSkillValue(name) {
    const state = app.getState();
    const normalized = String(name || '').trim().toLowerCase();
    const all = [...state.character.weaponSkills, ...state.character.skills, ...state.character.secondarySkills];
    const exact = all.find((skill) => skill.name.toLowerCase() === normalized);
    if (exact) return exact.value;
    const partial = all.find((skill) => normalized && (skill.name.toLowerCase().includes(normalized) || normalized.includes(skill.name.toLowerCase())));
    return partial ? partial.value : null;
  }

  function renderWeapons() {
    const state = app.getState();
    const tbody = document.getElementById('weapon-table');
    tbody.innerHTML = state.character.weapons.map((weapon, index) => `
      <tr>
        <td><input type="text" value="${app.escapeHtml(weapon.name)}" data-weapon="${index}" data-field="name"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.skill || '')}" data-weapon="${index}" data-field="skill" placeholder="Färdighet"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.grip)}" data-weapon="${index}" data-field="grip"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.range)}" data-weapon="${index}" data-field="range"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.damage)}" data-weapon="${index}" data-field="damage"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.durability)}" data-weapon="${index}" data-field="durability"></td>
        <td><input type="text" value="${app.escapeHtml(weapon.properties)}" data-weapon="${index}" data-field="properties"></td>
        <td><button class="btn btn-small btn-ghost" type="button" data-roll-weapon-attack="${index}">Attack</button></td>
        <td><button class="btn btn-small btn-secondary" type="button" data-roll-weapon-damage="${index}">Skada</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-weapon]').forEach((input) => input.addEventListener('change', () => {
      state.character.weapons[Number(input.dataset.weapon)][input.dataset.field] = input.value.trim();
      app.saveState();
    }));
    tbody.querySelectorAll('[data-roll-weapon-attack]').forEach((button) => button.addEventListener('click', () => {
      const weapon = state.character.weapons[Number(button.dataset.rollWeaponAttack)];
      const target = findSkillValue(weapon.skill || weapon.name);
      diceController?.rollSkill(`${weapon.name} – attack`, target, 'weapon-attack');
    }));
    tbody.querySelectorAll('[data-roll-weapon-damage]').forEach((button) => button.addEventListener('click', () => {
      const weapon = state.character.weapons[Number(button.dataset.rollWeaponDamage)];
      diceController?.rollFormula(`${weapon.name} – skada`, weapon.damage || 'T6', 'weapon-damage');
    }));

    renderArmor();
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
    diceController = window.DodDice?.mount('dice-panel', {
      characterKey: 'alvar-folke-musta',
      characterName: () => app.getState().character.knownAs || app.getState().character.name,
      player: () => app.getState().character.player
    }) || null;
    renderAll();
    bindSearch();
    window.addEventListener('alvar-state-changed', renderAll);
  });
})();
