(function () {
  'use strict';
  let sequence = 0;
  function identify(node, prefix) {
    if (!node.id) node.id = `${prefix}-${++sequence}`;
    return node.id;
  }
  function enhance() {
    document.querySelectorAll('.field').forEach(field => {
      const label = field.querySelector('label');
      const control = field.querySelector('input,select,textarea');
      if (!control) return;
      if (label) label.htmlFor = identify(control, 'field');
      const help = field.querySelector('.help');
      if (help) control.setAttribute('aria-describedby', identify(help, 'help'));
    });
    document.querySelectorAll('input.search').forEach(input => {
      if (!input.labels?.length) input.setAttribute('aria-label', 'Search squad by player name');
    });
    document.querySelectorAll('[data-action="photo"]').forEach(button => {
      button.setAttribute('aria-label', `View photo of ${window.HPL?.player(button.dataset.id)?.name || 'player'}`);
    });
    document.querySelectorAll('.tbl').forEach(table => {
      const region = table.closest('.table-scroll');
      const heading = table.closest('.panel,.modal')?.querySelector('h2,h3') || document.querySelector('#public-content h2');
      const name = heading?.textContent || 'League statistics';
      table.querySelectorAll('thead th').forEach(th => th.scope = 'col');
      if (!table.caption) {
        const caption = table.createCaption();
        caption.textContent = name;
      }
      if (region) {
        region.tabIndex = 0;
        region.setAttribute('role', 'region');
        region.setAttribute('aria-label', `${name}. Scroll horizontally for more columns.`);
      }
    });
    document.querySelectorAll('[data-nav]').forEach(button => {
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-stats],[data-mode],[data-filter],[data-admin-tab]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.classList.contains('selected') || button.classList.contains('on')));
    });
    document.querySelectorAll('.perf-card').forEach((card, index) => {
      card.setAttribute('role', 'group');
      card.setAttribute('aria-label', `Player match performance ${index + 1}`);
      card.querySelector('[data-remove-performance]')?.setAttribute('aria-label', `Remove player performance ${index + 1}`);
    });
    // The backup file picker must remain keyboard reachable through a real label.
    const backup = document.querySelector('#backup-import');
    if (backup) {
      backup.hidden = false;
      backup.style.display = '';
      backup.classList.add('visually-hidden');
      const label = backup.closest('label');
      if (label) label.htmlFor = backup.id;
    }
  }
  const app = window.HPL;
  if (app) {
    const previousRender = app.render;
    app.render = function () { previousRender.call(app); enhance(); };
    let opener;
    app.openModal = function (body) {
      opener = document.activeElement;
      document.querySelector('#modal-root').innerHTML = `<dialog class="modal" aria-label="League details"><div class="row-space" style="margin-bottom:12px"><span class="eyebrow">HELSHOOGTE PREMIER LEAGUE</span><button class="modal-close" data-action="close-modal" aria-label="Close dialog">×</button></div>${body}</dialog>`;
      const dialog = document.querySelector('dialog.modal');
      const title = dialog.querySelector('h2,h3');
      if (title) { dialog.setAttribute('aria-labelledby', identify(title, 'dialog-title')); title.tabIndex = -1; }
      dialog.addEventListener('cancel', event => { event.preventDefault(); app.closeModal(); });
      dialog.addEventListener('click', event => {
        const box = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) app.closeModal();
      });
      enhance();
      dialog.showModal();
      (title || dialog.querySelector('button')).focus();
    };
    app.closeModal = function () {
      const dialog = document.querySelector('dialog.modal');
      if (!dialog) return;
      dialog.close();
      document.querySelector('#modal-root').replaceChildren();
      if (opener?.isConnected) opener.focus();
    };
    document.addEventListener('click', event => {
      if (event.target.closest('[data-admin-tab]')) {
        const heading = document.querySelector('#admin-work h3');
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      }
      if (event.target.closest('[data-nav],[data-go],[data-action="team"],[data-action="back-teams"]')) {
        const heading = document.querySelector('#public-content h2');
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      }
    });
  }
  const toast = document.querySelector('#toast');
  if (toast) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); }
  enhance();
  new MutationObserver(enhance).observe(document.body, { childList:true, subtree:true });
})();
