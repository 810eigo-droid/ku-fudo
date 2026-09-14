(() => {
  const bar = document.getElementById('progress');
  let scheduled = false;
  function update() {
    const range = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = `${range > 0 ? Math.min(100, Math.max(0, scrollY / range * 100)) : 0}%`;
    scheduled = false;
  }
  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
  }
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule);
  addEventListener('load', schedule);
  update();
})();
