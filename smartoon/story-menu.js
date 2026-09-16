(() => {
  const menu = document.querySelector('.story-menu');
  if (!menu) return;
  const trigger = menu.querySelector('summary');
  trigger.setAttribute('aria-label', 'サイトと漫画のメニュー');
  const panel = menu.querySelector('nav');
  if (panel) {
    panel.setAttribute('aria-label', 'サイトと漫画のメニュー');
    const fragment = document.createDocumentFragment();
    const heading = document.createElement('p');
    heading.className = 'story-menu-title';
    heading.textContent = '会員サイトへ';
    fragment.append(heading);
    for (const [path, label] of [
      ['ku-fudo-demo/', 'トップページ'],
      ['ku-fudo-chat/mypage.php', 'マイページ'],
      ['ku-fudo-demo/membership.html', '学びと実践・入会案内'],
      ['ku-fudo-demo/prayer-practice.html#choose-title', 'ここから選ぶ、3つの実践。']
    ]) {
      const a = document.createElement('a');
      a.className = 'story-menu-all';
      a.href = new URL(path, 'https://taf-design.com/').href;
      a.textContent = label;
      fragment.append(a);
    }
    panel.prepend(fragment);
    panel.addEventListener('click', event => {
      if (event.target.closest('a')) menu.open = false;
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      trigger.focus();
    }
  });
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
})();
