(() => {
  'use strict';

  const app = window.AlvarApp;

  function usedSlots(items) {
    return items.reduce((sum, item) => sum + (Number(item.slots) || 0) * Math.max(1, Number(item.quantity) || 1), 0);
  }

  function renderSummary() {
    const { inventory } = app.getState();
    const used = usedSlots(inventory.items);
    const total = Number(inventory.capacity) + Number(inventory.backpackBonus);
    document.getElementById('capacity-summary').innerHTML = `
      <strong>${used} / ${total}</strong>
      <span>använda bärplatser</span>
    `;
    const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const bar = document.getElementById('capacity-bar');
    bar.style.width = `${percent}%`;
    bar.setAttribute('aria-valuenow', String(percent));
    bar.dataset.over = String(used > total);
  }

  function renderSettings() {
    const { inventory } = app.getState();
    document.getElementById('inventory-settings').innerHTML = `
      <label class="field"><span>Grundkapacitet</span><input type="number" min="0" max="99" value="${inventory.capacity}" data-inventory-setting="capacity"></label>
      <label class="field"><span>Ryggsäckens bonus</span><input type="number" min="0" max="99" value="${inventory.backpackBonus}" data-inventory-setting="backpackBonus"></label>
    `;
    document.querySelectorAll('[data-inventory-setting]').forEach((input) => input.addEventListener('change', () => {
      inventory[input.dataset.inventorySetting] = app.clamp(input.value, 0, 99);
      app.saveState();
      renderSummary();
    }));
  }

  function renderCoins() {
    const { coins } = app.getState().inventory;
    document.getElementById('coins').innerHTML = [
      ['gold', 'Guld'], ['silver', 'Silver'], ['copper', 'Koppar']
    ].map(([key, label]) => `
      <div class="coin">
        <label for="coin-${key}">${label}</label>
        <input id="coin-${key}" type="number" min="0" max="99999" value="${coins[key]}" data-coin="${key}">
      </div>
    `).join('');
    document.querySelectorAll('[data-coin]').forEach((input) => input.addEventListener('change', () => {
      coins[input.dataset.coin] = app.clamp(input.value, 0, 99999);
      input.value = coins[input.dataset.coin];
      app.saveState();
    }));
  }

  function renderItems() {
    const { items } = app.getState().inventory;
    const tbody = document.getElementById('inventory-table');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">Inventoryt är tomt. Lägg till det Alvar hittar, lånar eller råkar få med sig.</div></td></tr>';
      renderSummary();
      return;
    }
    tbody.innerHTML = items.map((item) => `
      <tr data-item-id="${item.id}">
        <td><input type="text" value="${app.escapeHtml(item.name)}" data-item-field="name"></td>
        <td><input type="number" min="1" max="999" value="${item.quantity}" data-item-field="quantity"></td>
        <td><input type="text" value="${app.escapeHtml(item.category)}" data-item-field="category"></td>
        <td><input type="number" min="0" max="99" step="0.5" value="${item.slots}" data-item-field="slots"></td>
        <td style="text-align:center"><input type="checkbox" ${item.worn ? 'checked' : ''} data-item-field="worn" aria-label="Buren"></td>
        <td><input type="text" value="${app.escapeHtml(item.notes)}" data-item-field="notes" placeholder="Anteckning"></td>
        <td>${(Number(item.slots) || 0) * Math.max(1, Number(item.quantity) || 1)}</td>
        <td><button type="button" class="icon-button" data-delete-item>Ta bort</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-item-field]').forEach((input) => input.addEventListener('change', () => {
      const row = input.closest('[data-item-id]');
      const item = items.find((entry) => entry.id === row.dataset.itemId);
      const field = input.dataset.itemField;
      if (field === 'worn') item[field] = input.checked;
      else if (field === 'quantity') item[field] = app.clamp(input.value, 1, 999);
      else if (field === 'slots') item[field] = Math.max(0, Number(input.value) || 0);
      else item[field] = input.value.trim();
      app.saveState();
      renderItems();
    }));

    tbody.querySelectorAll('[data-delete-item]').forEach((button) => button.addEventListener('click', () => {
      const row = button.closest('[data-item-id]');
      const index = items.findIndex((entry) => entry.id === row.dataset.itemId);
      if (index >= 0 && confirm(`Ta bort ${items[index].name}?`)) {
        items.splice(index, 1);
        app.saveState('Föremålet borttaget');
        renderItems();
      }
    }));
    renderSummary();
  }

  function bindAddForm() {
    const form = document.getElementById('add-item-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      if (!name) return;
      app.getState().inventory.items.push({
        id: app.makeId('item'),
        name,
        quantity: app.clamp(data.get('quantity'), 1, 999),
        category: String(data.get('category') || '').trim(),
        slots: Math.max(0, Number(data.get('slots')) || 0),
        worn: data.get('worn') === 'on',
        notes: String(data.get('notes') || '').trim()
      });
      form.reset();
      form.elements.quantity.value = 1;
      form.elements.slots.value = 1;
      app.saveState('Föremålet tillagt');
      renderItems();
    });
  }

  function renderAll() {
    renderSettings();
    renderCoins();
    renderItems();
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderAll();
    bindAddForm();
    window.addEventListener('alvar-state-changed', renderAll);
  });
})();
