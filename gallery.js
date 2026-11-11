(() => {
  const grid = document.querySelector('#gallery-photos');
  const items = Array.from(document.querySelectorAll('[data-gallery-item]'));
  const dialog = document.querySelector('#gallery-dialog');
  if (!items.length || !dialog || typeof dialog.showModal !== 'function') return;

  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('.gallery-caption');
  const count = dialog.querySelector('.gallery-count');
  let currentIndex = 0;

  function showItem(index) {
    currentIndex = (index + items.length) % items.length;
    const item = items[currentIndex];
    const thumbnail = item.querySelector('img');
    image.src = item.href;
    image.alt = thumbnail.alt;
    caption.textContent = item.dataset.caption || thumbnail.alt;
    count.textContent = `${currentIndex + 1} / ${items.length}`;
  }

  if (grid && grid.hasAttribute('data-gallery-preview')) grid.classList.add('is-collapsed');
  items.forEach((item, index) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      showItem(index);
      dialog.showModal();
    });
  });
  dialog.querySelector('.gallery-lightbox-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.gallery-lightbox-prev').addEventListener('click', () => showItem(currentIndex - 1));
  dialog.querySelector('.gallery-lightbox-next').addEventListener('click', () => showItem(currentIndex + 1));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') showItem(currentIndex - 1);
    if (event.key === 'ArrowRight') showItem(currentIndex + 1);
  });

  let touchStart = null;
  const figure = dialog.querySelector('figure');
  figure.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  figure.addEventListener('touchend', (event) => {
    if (!touchStart || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) showItem(currentIndex + (dx < 0 ? 1 : -1));
  }, { passive: true });
  figure.addEventListener('touchcancel', () => { touchStart = null; });
})();
