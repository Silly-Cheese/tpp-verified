document.addEventListener('DOMContentLoaded', () => {
  function addEmailButton() {
    const header = document.querySelector('.dashboard-header');
    if (!header || document.getElementById('emailTemplatesAdminBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'emailTemplatesAdminBtn';
    btn.className = 'secondary-btn';
    btn.type = 'button';
    btn.textContent = 'Email Templates';
    btn.addEventListener('click', () => {
      window.open('email-templates.html', '_blank');
    });

    header.appendChild(btn);
  }

  addEmailButton();
  new MutationObserver(addEmailButton).observe(document.body, { childList: true, subtree: true });
});
