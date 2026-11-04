/* Gallery: fade-in on reveal + a simple lightbox */
(() => {
  'use strict';

  // Reveal paintings as they come into view
  const items = document.querySelectorAll('.gallery-grid li');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(li => io.observe(li));
  } else {
    items.forEach(li => li.classList.add('is-visible'));
  }

  // Lightbox
  const dialog = document.querySelector('.lightbox');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const img = dialog.querySelector('img');
  const cap = dialog.querySelector('figcaption');
  const works = [...document.querySelectorAll('.artwork')];
  let index = 0;
  let opener = null;

  function show(i) {
    index = (i + works.length) % works.length;
    const btn = works[index];
    img.src = btn.dataset.full;
    img.alt = btn.querySelector('img').alt;
    cap.textContent = btn.dataset.caption || '';
  }

  works.forEach((btn, i) => btn.addEventListener('click', () => {
    opener = btn;
    show(i);
    dialog.showModal();
  }));

  dialog.querySelector('.lb-prev').addEventListener('click', () => show(index - 1));
  dialog.querySelector('.lb-next').addEventListener('click', () => show(index + 1));
  dialog.querySelector('.lb-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog || e.target.tagName === 'FIGURE') dialog.close(); });
  dialog.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
  dialog.addEventListener('close', () => { if (opener) opener.focus(); });
})();
