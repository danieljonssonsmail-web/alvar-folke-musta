(() => {
  'use strict';

  const app = window.AlvarApp;
  let editingId = null;

  function formatDate(value) {
    if (!value) return 'Odaterat';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' }).format(date);
  }

  function renderEntries() {
    const entries = [...app.getState().journal].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    const list = document.getElementById('journal-list');
    if (!entries.length) {
      list.innerHTML = '<div class="empty-state"><h3>Journalen är tom</h3><p>Första uppdraget börjar när den halvängdsnasare som samlat gruppen söker folk.</p></div>';
      return;
    }
    list.innerHTML = entries.map((entry) => {
      const tags = String(entry.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      return `
        <article class="card journal-entry" data-entry-id="${entry.id}">
          <p class="eyebrow">${app.escapeHtml(entry.location || 'På vägarna')}</p>
          <h2>${app.escapeHtml(entry.title || 'Namnlös anteckning')}</h2>
          <div class="journal-meta">
            <span>${app.escapeHtml(formatDate(entry.date))}</span>
            ${tags.map((tag) => `<span class="tag">${app.escapeHtml(tag)}</span>`).join('')}
          </div>
          <div class="journal-body">${app.escapeHtml(entry.body)}</div>
          <div class="entry-actions no-print">
            <button type="button" class="btn btn-small btn-secondary" data-edit-entry>Redigera</button>
            <button type="button" class="btn btn-small btn-danger" data-delete-entry>Ta bort</button>
          </div>
        </article>
      `;
    }).join('');

    list.querySelectorAll('[data-edit-entry]').forEach((button) => button.addEventListener('click', () => {
      const id = button.closest('[data-entry-id]').dataset.entryId;
      startEditing(id);
    }));
    list.querySelectorAll('[data-delete-entry]').forEach((button) => button.addEventListener('click', () => {
      const id = button.closest('[data-entry-id]').dataset.entryId;
      const journal = app.getState().journal;
      const index = journal.findIndex((entry) => entry.id === id);
      if (index >= 0 && confirm(`Ta bort journalanteckningen ”${journal[index].title}”?`)) {
        journal.splice(index, 1);
        app.saveState('Anteckningen borttagen');
        renderEntries();
      }
    }));
  }

  function resetForm() {
    editingId = null;
    const form = document.getElementById('journal-form');
    form.reset();
    form.elements.date.value = new Date().toISOString().slice(0, 10);
    document.getElementById('journal-submit').textContent = 'Spara anteckning';
    document.getElementById('journal-cancel').hidden = true;
  }

  function startEditing(id) {
    const entry = app.getState().journal.find((item) => item.id === id);
    if (!entry) return;
    editingId = id;
    const form = document.getElementById('journal-form');
    form.elements.title.value = entry.title || '';
    form.elements.date.value = entry.date || '';
    form.elements.location.value = entry.location || '';
    form.elements.tags.value = entry.tags || '';
    form.elements.body.value = entry.body || '';
    document.getElementById('journal-submit').textContent = 'Uppdatera anteckning';
    document.getElementById('journal-cancel').hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.title.focus();
  }

  function bindForm() {
    const form = document.getElementById('journal-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const entryData = {
        title: String(data.get('title') || '').trim(),
        date: String(data.get('date') || ''),
        location: String(data.get('location') || '').trim(),
        tags: String(data.get('tags') || '').trim(),
        body: String(data.get('body') || '').trim(),
        updatedAt: Date.now()
      };
      if (!entryData.title || !entryData.body) return;
      const journal = app.getState().journal;
      if (editingId) {
        const entry = journal.find((item) => item.id === editingId);
        Object.assign(entry, entryData);
        app.saveState('Anteckningen uppdaterad');
      } else {
        journal.push({ id: app.makeId('journal'), createdAt: Date.now(), ...entryData });
        app.saveState('Anteckningen sparad');
      }
      resetForm();
      renderEntries();
    });
    document.getElementById('journal-cancel').addEventListener('click', resetForm);
  }

  document.addEventListener('DOMContentLoaded', () => {
    resetForm();
    bindForm();
    renderEntries();
    window.addEventListener('alvar-state-changed', renderEntries);
  });
})();
