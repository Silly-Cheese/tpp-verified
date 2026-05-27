document.addEventListener('DOMContentLoaded', () => {
  const records = document.getElementById('records');
  if (!records) return;

  function addButtons() {
    document.querySelectorAll('.record').forEach(card => {
      if (card.querySelector('[data-email-template-added="true"]')) return;
      const idNode = card.querySelector('.record-id');
      const actions = card.querySelector('.record-actions');
      if (!idNode || !actions) return;
      const id = idNode.textContent.trim();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'status-btn';
      btn.dataset.emailTemplateAdded = 'true';
      btn.textContent = 'Email Templates';
      btn.addEventListener('click', () => {
        window.open('email-templates.html?id=' + encodeURIComponent(id), '_blank');
      });
      actions.insertBefore(btn, actions.querySelector('.danger-btn'));
    });
  }

  addButtons();
  new MutationObserver(addButtons).observe(records, { childList: true, subtree: true });
});
