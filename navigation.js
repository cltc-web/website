// A native details menu works without JavaScript; close it after choosing a link.
document.querySelectorAll('.mobile-menu a').forEach(link => {
  link.addEventListener('click', () => {
    link.closest('details').open = false;
  });
});
