(() => {
  'use strict';

  const blocks = window.DIAGRAM_DATA || [];
  const bibliography = window.BIBLIOGRAPHY || {};
  const W = 1474;
  const H = 1184;
  const byId = Object.fromEntries(blocks.map(block => [block.id, block]));

  const app = document.getElementById('app');
  const viewport = document.getElementById('viewport');
  const canvas = document.getElementById('canvas');
  const hotspots = document.getElementById('hotspots');
  const details = document.getElementById('details');
  const detailsBody = document.getElementById('details-body');
  const hint = document.getElementById('first-hint');
  const toast = document.getElementById('toast');
  let activeId = null;
  let toastTimer = null;
  let fit = 1;
  let zoom = 1;
  let scale = 1;
  let x = 0;
  let y = 0;

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function appendLinkedText(element, text) {
    const pattern = /https?:\/\/[^\s]+/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) element.append(document.createTextNode(text.slice(last, match.index)));
      let url = match[0];
      let trailing = '';
      while (/[.,;]$/.test(url)) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }
      const link = make('a', '', url);
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'Открыть источник в новой вкладке';
      element.append(link);
      if (trailing) element.append(document.createTextNode(trailing));
      last = match.index + match[0].length;
    }
    if (last < text.length) element.append(document.createTextNode(text.slice(last)));
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2300);
  }

  function createHotspots() {
    const fragment = document.createDocumentFragment();
    blocks.forEach(block => {
      const button = make('button', 'hotspot');
      button.type = 'button';
      button.dataset.id = block.id;
      button.style.left = `${block.box[0] / W * 100}%`;
      button.style.top = `${block.box[1] / H * 100}%`;
      button.style.width = `${block.box[2] / W * 100}%`;
      button.style.height = `${block.box[3] / H * 100}%`;
      button.setAttribute('aria-label', `${block.title}. Открыть пояснение и источники`);
      button.setAttribute('aria-controls', 'details');
      button.addEventListener('click', event => {
        event.stopPropagation();
        openBlock(block.id);
      });
      button.addEventListener('pointerdown', event => event.stopPropagation());
      fragment.append(button);
    });
    hotspots.append(fragment);
  }

  function openBlock(id, updateHash = true) {
    const block = byId[id];
    if (!block) return;
    activeId = id;
    hotspots.querySelectorAll('.hotspot').forEach(button => {
      const selected = button.dataset.id === id;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    const index = blocks.indexOf(block);
    document.getElementById('detail-kind').textContent = block.kind;
    document.getElementById('detail-counter').textContent = `Элемент ${index + 1} из ${blocks.length}`;
    document.getElementById('detail-title').textContent = block.title;
    document.getElementById('detail-section').textContent = `Место в ВКР: ${block.section}`;

    const description = document.getElementById('detail-description');
    description.replaceChildren();
    block.desc.forEach(text => description.append(make('p', '', text)));

    const referenceList = document.getElementById('detail-references');
    referenceList.replaceChildren();
    block.refs.forEach(number => {
      if (!bibliography[number]) return;
      const item = make('article', 'reference-item');
      item.append(make('span', 'reference-number', `[${number}]`));
      const text = make('div', 'reference-text');
      appendLinkedText(text, bibliography[number]);
      item.append(text);
      referenceList.append(item);
    });
    const count = referenceList.children.length;
    document.getElementById('reference-count').textContent = `${count} ${count === 1 ? 'источник' : count < 5 ? 'источника' : 'источников'}`;
    document.getElementById('prev-block').disabled = index === 0;
    document.getElementById('next-block').disabled = index === blocks.length - 1;
    details.hidden = false;
    detailsBody.scrollTop = 0;
    hint.hidden = true;
    if (updateHash) history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
  }

  function closeDetails() {
    details.hidden = true;
    activeId = null;
    hotspots.querySelectorAll('.hotspot').forEach(button => {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }

  function moveBlock(direction) {
    if (!activeId) return;
    const nextIndex = blocks.findIndex(block => block.id === activeId) + direction;
    if (nextIndex >= 0 && nextIndex < blocks.length) openBlock(blocks[nextIndex].id);
  }

  function constrainView() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const width = W * scale;
    const height = H * scale;
    const margin = 70;
    if (width <= vw - 20) x = (vw - width) / 2;
    else x = Math.min(margin, Math.max(vw - width - margin, x));
    if (height <= vh - 20) y = (vh - height) / 2;
    else y = Math.min(margin, Math.max(vh - height - margin, y));
  }

  function applyTransform(constrain = true) {
    if (constrain) constrainView();
    canvas.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
    document.getElementById('zoom-reset').textContent = `${Math.round(zoom * 100)}%`;
    document.getElementById('zoom-out').disabled = zoom <= 0.751;
    document.getElementById('zoom-in').disabled = zoom >= 4.999;
  }

  function resetView() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh) return;
    fit = Math.min((vw - 28) / W, (vh - 28) / H);
    zoom = 1;
    scale = fit;
    x = (vw - W * scale) / 2;
    y = (vh - H * scale) / 2;
    applyTransform(false);
  }

  function zoomAt(nextZoom, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
    const clamped = Math.max(0.75, Math.min(5, nextZoom));
    if (Math.abs(clamped - zoom) < 0.0001) return;
    const worldX = (cx - x) / scale;
    const worldY = (cy - y) / scale;
    zoom = clamped;
    scale = fit * zoom;
    x = cx - worldX * scale;
    y = cy - worldY * scale;
    applyTransform();
  }

  function normalized(value) {
    return String(value).toLowerCase().replace(/ё/g, 'е').trim();
  }

  const groups = [
    ['Структура модели', ['model','target','normative','content','process','institutional','evaluation','result']],
    ['Потоки и участники', ['social','needs','state','private']],
    ['Содержание и нормативная база', ['legal','cognitive','technological','methodical','ethical','motivational','levels']],
    ['Цикл формирования', ['diagnosis','assignment','training','credit','support']],
    ['Верификация и финансирование', ['application','verification','registry','funding']],
    ['Мониторинг и оценка', ['instruments','indicators','reporting']],
    ['Внешние среды', ['publicenv','techenv','marketenv','communityenv']]
  ];

  function renderBlockList(query = '') {
    const list = document.getElementById('block-list');
    const needle = normalized(query);
    list.replaceChildren();
    let visible = 0;
    groups.forEach(([groupName, ids]) => {
      const matched = ids.map(id => byId[id]).filter(block => block && (!needle || normalized(`${block.title} ${block.kind} ${block.section}`).includes(needle)));
      if (!matched.length) return;
      const heading = make('h3', 'block-group-title', groupName);
      list.append(heading);
      matched.forEach(block => {
        visible += 1;
        const button = make('button', 'block-item');
        button.type = 'button';
        const content = make('span');
        content.append(make('span', 'block-item-title', block.title));
        content.append(make('span', 'block-item-meta', `${block.kind} · источников: ${block.refs.length}`));
        button.append(content, make('span', 'block-item-arrow', '→'));
        button.addEventListener('click', () => {
          document.getElementById('blocks-dialog').close();
          openBlock(block.id);
        });
        list.append(button);
      });
    });
    if (!visible) list.append(make('p', 'empty-state', 'Блок не найден. Измените поисковый запрос.'));
  }

  function renderSources(query = '') {
    const list = document.getElementById('source-list');
    const needle = normalized(query);
    const entries = Object.entries(bibliography).filter(([number, text]) => !needle || normalized(`${number} ${text}`).includes(needle));
    list.replaceChildren();
    const fragment = document.createDocumentFragment();
    entries.forEach(([number, text]) => {
      const entry = make('article', 'source-entry');
      entry.append(make('span', 'source-entry-number', `[${number}]`));
      const body = make('div', 'source-entry-text');
      appendLinkedText(body, text);
      entry.append(body);
      fragment.append(entry);
    });
    list.append(fragment);
    document.getElementById('source-results').textContent = entries.length ? `Показано: ${entries.length} из ${Object.keys(bibliography).length}` : '';
    if (!entries.length) list.append(make('p', 'empty-state', 'Источник не найден. Проверьте запрос или номер.'));
  }

  async function copyBlockLink() {
    if (!activeId) return;
    const url = `${location.origin}${location.pathname}${location.search}#${activeId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Ссылка на блок скопирована');
    } catch (_) {
      const field = document.createElement('textarea');
      field.value = url;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      showToast(copied ? 'Ссылка на блок скопирована' : 'Не удалось скопировать ссылку');
    }
  }

  createHotspots();
  renderBlockList();
  document.getElementById('sources-total').textContent = `(${Object.keys(bibliography).length})`;

  document.getElementById('close-details').addEventListener('click', closeDetails);
  document.getElementById('prev-block').addEventListener('click', () => moveBlock(-1));
  document.getElementById('next-block').addEventListener('click', () => moveBlock(1));
  document.getElementById('copy-link').addEventListener('click', copyBlockLink);
  document.getElementById('hide-hint').addEventListener('click', () => { hint.hidden = true; });
  document.getElementById('zoom-in').addEventListener('click', () => zoomAt(zoom * 1.3));
  document.getElementById('zoom-out').addEventListener('click', () => zoomAt(zoom / 1.3));
  document.getElementById('zoom-reset').addEventListener('click', resetView);
  document.getElementById('toggle-zones').addEventListener('click', event => {
    const pressed = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed', String(pressed));
    event.currentTarget.textContent = pressed ? 'Скрыть зоны' : 'Показать зоны';
    canvas.classList.toggle('show-zones', pressed);
  });

  document.getElementById('fullscreen').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await app.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      showToast('Полноэкранный режим недоступен в этом браузере');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const button = document.getElementById('fullscreen');
    const full = Boolean(document.fullscreenElement);
    button.title = full ? 'Выйти из полноэкранного режима' : 'Открыть на весь экран';
    button.setAttribute('aria-label', button.title);
    setTimeout(resetView, 60);
  });

  const blocksDialog = document.getElementById('blocks-dialog');
  const sourcesDialog = document.getElementById('sources-dialog');
  document.getElementById('open-blocks').addEventListener('click', () => {
    document.getElementById('block-search').value = '';
    renderBlockList();
    blocksDialog.showModal();
    setTimeout(() => document.getElementById('block-search').focus(), 30);
  });
  document.getElementById('open-sources').addEventListener('click', () => {
    renderSources(document.getElementById('source-search').value);
    sourcesDialog.showModal();
    setTimeout(() => document.getElementById('source-search').focus(), 30);
  });
  document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  [blocksDialog, sourcesDialog].forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  }));
  document.getElementById('block-search').addEventListener('input', event => renderBlockList(event.target.value));
  document.getElementById('source-search').addEventListener('input', event => renderSources(event.target.value));

  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0012);
    zoomAt(zoom * factor, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  let drag = null;
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.hotspot')) return;
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    x = drag.x + event.clientX - drag.startX;
    y = drag.y + event.clientY - drag.startY;
    applyTransform();
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    viewport.classList.remove('dragging');
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('dblclick', event => {
    if (event.target.closest('.hotspot')) return;
    const rect = viewport.getBoundingClientRect();
    zoomAt(zoom * 1.5, event.clientX - rect.left, event.clientY - rect.top);
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resetView, 80);
  });
  document.addEventListener('keydown', event => {
    if (event.target.matches('input,textarea') || blocksDialog.open || sourcesDialog.open) return;
    if (event.key === 'Escape' && !details.hidden) closeDetails();
    if (event.key === 'ArrowRight' && activeId) moveBlock(1);
    if (event.key === 'ArrowLeft' && activeId) moveBlock(-1);
    if (event.key === '+' || event.key === '=') zoomAt(zoom * 1.3);
    if (event.key === '-') zoomAt(zoom / 1.3);
    if (event.key === '0') resetView();
  });

  resetView();
  const requested = location.hash.slice(1);
  if (byId[requested]) openBlock(requested, false);
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (byId[id]) openBlock(id, false);
    else if (!id && activeId) closeDetails();
  });
})();
