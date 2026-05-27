document.addEventListener('DOMContentLoaded', () => {
  const recordsPanel = document.querySelector('.records-panel');
  const searchBox = document.getElementById('searchRecords');
  if (!recordsPanel || !searchBox || document.getElementById('statusFilterBar')) return;

  const filterBar = document.createElement('div');
  filterBar.id = 'statusFilterBar';
  filterBar.className = 'record-actions';
  filterBar.innerHTML = `
    <button type="button" data-filter="all" class="status-btn">Show All</button>
    <button type="button" data-filter="active" class="status-btn">Active Only</button>
    <button type="button" data-filter="invalid" class="status-btn">Invalid Only</button>
  `;
  searchBox.insertAdjacentElement('beforebegin', filterBar);

  let currentFilter = 'all';

  function applyFilter() {
    document.querySelectorAll('.record').forEach(card => {
      const text = card.textContent.toLowerCase();
      const isInvalid = text.includes('invalid');
      const show = currentFilter === 'all' || (currentFilter === 'active' && !isInvalid) || (currentFilter === 'invalid' && isInvalid);
      card.style.display = show ? '' : 'none';
    });
  }

  filterBar.addEventListener('click', event => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    currentFilter = button.dataset.filter;
    filterBar.querySelectorAll('button').forEach(btn => btn.classList.remove('edit-btn'));
    button.classList.add('edit-btn');
    applyFilter();
  });

  const observer = new MutationObserver(applyFilter);
  observer.observe(document.getElementById('records'), { childList: true });
});
