document.addEventListener('DOMContentLoaded', () => {
  const head = document.head || document.getElementsByTagName('head')[0];

  function addCss(path) {
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.getAttribute('href') === path)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = path;
    head.appendChild(link);
  }

  function addScript(path) {
    if ([...document.querySelectorAll('script')].some(s => s.getAttribute('src') === path)) return;
    const script = document.createElement('script');
    script.src = path;
    script.defer = true;
    document.body.appendChild(script);
  }

  addCss('mobile-polish.css');
  addCss('email-template-page.css');

  if (document.body.classList.contains('admin-body')) {
    addScript('admin-email-link.js');
    addScript('email-button-inject.js');
    addScript('admin-filters.js');
  }
});