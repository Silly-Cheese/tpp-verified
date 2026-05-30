(() => {
  const styles = [
    'prayer-project-theme.css',
    'mobile-polish.css',
    'mobile-overflow-fix.css'
  ];

  styles.forEach((href) => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });
})();
