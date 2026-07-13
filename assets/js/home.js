(() => {
  'use strict';
  const app = window.AlvarApp;

  function render() {
    const state = app.getState();
    const used = state.inventory.items.reduce((sum, item) => sum + (Number(item.slots) || 0) * Math.max(1, Number(item.quantity) || 1), 0);
    const total = Number(state.inventory.capacity) + Number(state.inventory.backpackBonus);
    document.getElementById('home-hp').textContent = `${state.character.derived.hpCurrent} / ${state.character.derived.hpMax}`;
    document.getElementById('home-wp').textContent = `${state.character.derived.wpCurrent} / ${state.character.derived.wpMax}`;
    document.getElementById('home-inventory').textContent = `${used} / ${total}`;
    document.getElementById('home-journal').textContent = String(state.journal.length);
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    window.addEventListener('alvar-state-changed', render);
  });
})();
