// İsim Şehir - istemci
(function () {
  const ROOM = window.IS_ROOM;
  const LETTERS = window.IS_LETTERS;
  const token = localStorage.getItem('is_token_' + ROOM);
  const myName = localStorage.getItem('is_name_' + ROOM) || '';
  const appEl = document.getElementById('app');
  const meInfoEl = document.getElementById('meInfo');

  // Tam ekran butonu
  const fsBtn = document.getElementById('fsBtn');
  if (fsBtn) {
    const updateFsIcon = () => {
      fsBtn.textContent = document.fullscreenElement ? '✕' : '⛶';
    };
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
    document.addEventListener('fullscreenchange', updateFsIcon);
    // Fullscreen desteklenmiyorsa butonu gizle
    if (!document.documentElement.requestFullscreen) fsBtn.hidden = true;
  }

  if (!token) {
    location.href = 'index.php';
    return;
  }
  meInfoEl.textContent = myName;

  // ---- Hile önleme: tur sırasında ekranı terk edersen 10 puan ceza ----
  function sendPenalty() {
    try {
      const body = JSON.stringify({ room: ROOM, token });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('api.php?action=penalty', new Blob([body], { type: 'application/json' }));
      } else {
        api('penalty');
      }
    } catch (_) {}
  }
  function onHide() {
    if (lastState && lastState.status === 'round' && lastState.isMember) {
      const now = Date.now();
      if (now - lastHideAt > 1500) {
        lastHideAt = now;
        penaltyPending = true;
        sendPenalty();
      }
    }
  }
  function onShow() {
    if (penaltyPending) {
      penaltyPending = false;
      toast('Ekrandan ayrıldın — 10 puan ceza! ⚠️');
    }
    poll();
  }

  // Sadece visibilitychange — en güvenilir, en az yanlış tetikleme
  // pagehide/blur kaldırıldı: yenileme, swipe ve bildirimde yanlış ceza veriyordu
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onHide(); else onShow();
  });

  // Eş harfler: çekilen harfle birlikte gösterilen varyant (ikisi de geçerli)
  const PAIRS = { 'I': 'İ', 'O': 'Ö', 'S': 'Ş', 'U': 'Ü', 'C': 'Ç' };
  function letterLabel(L) { return PAIRS[L] ? (L + ' / ' + PAIRS[L]) : L; }

  // Yerel görünüm durumu
  let viewSig = '';           // ana panelin yeniden çizilmesi için imza
  let lastLetterShown = null; // slot animasyonu kontrolü
  let roundIdx = 0;           // tur sırasında aktif kategori indexi
  let localAnswers = {};      // {cat: value} kullanıcının yazdıkları
  let saveTimers = {};        // debounce
  let busy = false;
  let lastMsgId = null;       // gösterilen son baloncuk mesaj id'si
  let lastState = null;       // son state (finish alanı için)
  let finishLocal = null;     // yerel geri sayım (sn)
  let finishBy = '';          // bitiren oyuncu adı
  let finishTimer = null;     // yerel 1sn sayaç
  let penaltyPending = false; // ekran terkinde ceza gönderildi, dönünce uyar
  let lastHideAt = 0;         // tekrarlı tetiklemeyi engelle
  let wasAdmin = null;        // admin devri bildirimi için
  let chatOpen = false;
  let unreadCount = 0;
  let rxPickerOpen = false;
  const rxPickerEl = document.getElementById('rxPicker');
  const rxFabBtn   = document.getElementById('rxFabBtn');
  const CHAT_KEY = 'is_chat_' + ROOM;
  let chatHistory = JSON.parse(sessionStorage.getItem(CHAT_KEY) || '[]');

  // Baloncuk overlay (tüm ekranı kaplar, tıklamayı geçirir)
  const bubbleLayer = document.createElement('div');
  bubbleLayer.className = 'bubble-layer';
  document.body.appendChild(bubbleLayer);

  // ---- Sayfa içi global bildirimler ----
  const toastWrap = document.createElement('div');
  toastWrap.className = 'toast-wrap';
  document.body.appendChild(toastWrap);

  function toast(msg) {
    const t = el('<div class="toast">' + esc(msg) + '</div>');
    toastWrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  // Onay gerektiren modal (ör. oda kapandı)
  function modalAlert(msg, onOk) {
    const ov = el('<div class="modal-overlay"></div>');
    const card = el('<div class="modal-card"><p>' + esc(msg) + '</p></div>');
    const btn = el('<button class="primary">Tamam</button>');
    card.appendChild(btn);
    ov.appendChild(card);
    let done = false;
    const close = () => { if (done) return; done = true; ov.remove(); if (onOk) onOk(); };
    btn.onclick = close;
    document.body.appendChild(ov);
    return close;
  }

  // Evet / İptal soran modal
  function modalConfirm(msg, onYes) {
    const ov = el('<div class="modal-overlay"></div>');
    const card = el('<div class="modal-card"><p>' + esc(msg) + '</p></div>');
    const row = el('<div class="modal-actions"></div>');
    const yes = el('<button class="primary">Evet</button>');
    const no = el('<button class="ghost">İptal</button>');
    row.appendChild(yes);
    row.appendChild(no);
    card.appendChild(row);
    ov.appendChild(card);
    let done = false;
    const close = (fn) => { if (done) return; done = true; ov.remove(); if (fn) fn(); };
    yes.onclick = () => close(onYes);
    no.onclick = () => close(null);
    document.body.appendChild(ov);
  }

  // ---- API yardımcıları ----
  async function api(action, payload = {}) {
    const res = await fetch('api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ room: ROOM, token }, payload)),
    });
    return res.json();
  }

  async function adminAction(action, payload = {}) {
    if (busy) return;
    busy = true;
    try {
      const r = await api(action, payload);
      if (!r.ok && r.msg) toast(r.msg);
      else if (!r.ok && r.error) toast(r.error);
    } catch (e) {
      console.error(e);
    } finally {
      busy = false;
      poll();
    }
  }

  // ---- Poll döngüsü ----
  let closing = false;
  async function poll() {
    if (closing) return;
    try {
      const res = await fetch('api.php?action=state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: ROOM, token }),
      });
      if (res.status === 404) {
        // Oda kapandı/sıfırlandı (admin çıktı) -> giriş ekranına dön
        roomClosed();
        return;
      }
      const r = await res.json();
      if (r.kicked) {
        closing = true;
        localStorage.removeItem('is_token_' + ROOM);
        localStorage.removeItem('is_name_' + ROOM);
        const go = () => { location.href = 'index.php?kicked=1'; };
        modalAlert('Admin sizi odadan çıkardı.', go);
        setTimeout(go, 3000);
        return;
      }
      if (!r.ok) {
        appEl.innerHTML = '<div class="card error">' + (r.error || 'Hata') + '</div>';
        return;
      }
      if (r.awayPenalty) toast('Ekrandan ayrıldın — 10 puan ceza! ⚠️');
      render(r.state);
      if (r.state && r.state.voice) voiceMgr.handleSignals(r.state.voice);
    } catch (e) {
      // sessizce geç, bir sonraki tur dener
    }
  }

  let redirected = false;
  function roomClosed() {
    if (closing) return;
    closing = true;
    localStorage.removeItem('is_token_' + ROOM);
    const go = () => { if (redirected) return; redirected = true; location.href = 'index.php'; };
    modalAlert('Oda kapandı — admin çıktı veya oyun sıfırlandı.', go);
    setTimeout(go, 4000); // güvenlik: kimse tıklamazsa otomatik yönlendir
  }

  // ---- Çıkış ----
  async function doLeave() {
    closing = true;
    voiceMgr.destroy();
    try { await api('leave'); } catch (_) {}
    localStorage.removeItem('is_token_' + ROOM);
    location.href = 'index.php';
  }

  function confirmLeave() {
    modalConfirm('Oyundan çıkmak istediğine emin misin? Puanların korunur, geri dönebilirsin.', doLeave);
  }

  const leaveBtn = document.getElementById('leaveBtn');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      confirmLeave();
    });
  }

  // Tarayıcı kapat / sekme kapat / adres barından git → native uyarı
  window.addEventListener('beforeunload', (e) => {
    if (!closing) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Geri tuşu: sohbet açıksa kapat, değilse çıkış onayı sor
  history.pushState({ game: true }, '');
  window.addEventListener('popstate', () => {
    history.pushState({ game: true }, '');
    if (chatOpen) {
      closeChat();
      return;
    }
    confirmLeave();
  });

  // ---- Render ----
  function render(s) {
    lastState = s;
    // admin yetkisi bu cihaza geçtiyse bildir
    if (wasAdmin !== null && s.isAdmin && !wasAdmin) {
      toast('Yönetici (admin) sen oldun 👑');
    }
    wasAdmin = s.isAdmin;
    // Lobide FAB gizle, diğer ekranlarda göster
    if (s.status === 'lobby') {
      chatFab.style.display = 'none';
      if (chatOpen) closeChat();
    } else {
      chatFab.style.display = '';
    }
    // Reaksiyon butonu: lobi dışında her ekranda görünür (chat butonu gibi)
    if (rxFabBtn) rxFabBtn.style.display = (s.status === 'lobby') ? 'none' : '';
    // Lobiye dönülünce picker'ı kapat
    if (s.status === 'lobby' && rxPickerOpen) {
      rxPickerOpen = false;
      if (rxPickerEl) rxPickerEl.classList.remove('rx-open');
      if (rxFabBtn) rxFabBtn.classList.remove('rx-active');
    }
    // Ana panel imzası: status + harf + oyuncu sayısı + admin mi
    const letter = (s.round && s.round.letter) || s.currentLetter || '';
    let extra = '';
    if (s.status === 'results' && s.results) {
      // puanlar/iptaller değişince sonuç ekranını yeniden çiz
      extra = s.results.rows.map(r => r.points + ':' +
        s.categories.map(c => (r.invalid && r.invalid[c.key]) ? '1' : '0').join('') + ':' +
        s.categories.map(c => (r.reports && r.reports[c.key]) || 0).join('')).join(',');
    }
    const sig = [s.status, letter, s.playerCount, s.isAdmin, s.locked ? '1' : '0', extra].join('|');

    if (sig !== viewSig) {
      viewSig = sig;
      buildMain(s);
    }
    if (s.status !== 'round') { finishLocal = null; clearFinishTimer(); showBigCountdown(0, ''); }
    updateDynamic(s);
    processMessages(s);
    processReactions(s);
  }

  // Yeni mesajları baloncuk + panel geçmişine ekle
  function processMessages(s) {
    const msgs = s.messages || [];
    if (lastMsgId === null) {
      lastMsgId = msgs.reduce((m, x) => Math.max(m, x.id), 0);
      // ilk yükleme: geçmişe ekle ama baloncuk çıkarma
      msgs.forEach(m => {
        if (!chatHistory.find(x => x.id === m.id)) chatHistory.push(m);
      });
      if (chatHistory.length > 60) chatHistory = chatHistory.slice(-60);
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(chatHistory));
      if (chatOpen) renderChatHistory();
      return;
    }
    msgs.forEach(m => {
      if (m.id > lastMsgId) {
        if (lastState && lastState.status === 'lobby') spawnBubble(m.name, m.text);
        lastMsgId = m.id;
        chatHistory.push(m);
        if (chatHistory.length > 60) chatHistory = chatHistory.slice(-60);
        sessionStorage.setItem(CHAT_KEY, JSON.stringify(chatHistory));
        if (chatOpen) {
          renderChatHistory();
        } else {
          unreadCount++;
          updateBadge();
        }
      }
    });
  }

  // ---- Emoji Reaksiyonlar ----
  const seenReactions = new Set();

  if (rxFabBtn) {
    rxFabBtn.addEventListener('click', () => {
      rxPickerOpen = !rxPickerOpen;
      rxPickerEl.classList.toggle('rx-open', rxPickerOpen);
      rxFabBtn.classList.toggle('rx-active', rxPickerOpen);
    });
  }

  if (rxPickerEl) {
    rxPickerEl.querySelectorAll('.rx-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sendReaction(btn.dataset.emoji);
        rxPickerOpen = false;
        rxPickerEl.classList.remove('rx-open');
        rxFabBtn && rxFabBtn.classList.remove('rx-active');
      });
    });
  }

  function toggleRxPicker() {
    rxPickerOpen = false;
    if (rxPickerEl) rxPickerEl.classList.remove('rx-open');
    if (rxFabBtn) rxFabBtn.classList.remove('rx-active');
  }

  function sendReaction(emoji) {
    api('send_reaction', { emoji }).then(r => {
      if (r && r.id) seenReactions.add(r.id); // kendi emoji'sinin poll'da tekrar çıkmasını engelle
    }).catch(() => {});
    spawnFloatingEmoji(emoji, true, null);
  }

  function processReactions(s) {
    if (!s.reactions || s.reactions.length === 0) return;
    s.reactions.forEach(r => {
      if (seenReactions.has(r.id)) return;
      seenReactions.add(r.id);
      spawnFloatingEmoji(r.emoji, false, r.name);
    });
    if (seenReactions.size > 200) {
      const arr = [...seenReactions];
      arr.slice(0, arr.length - 100).forEach(id => seenReactions.delete(id));
    }
  }

  function spawnFloatingEmoji(emoji, isMine, name) {
    const div = document.createElement('div');
    div.className = 'floating-emoji' + (isMine ? ' mine' : '');
    const x = 15 + Math.random() * 70;
    div.style.left = x + '%';
    const inner = document.createElement('span');
    inner.className = 'fe-emoji';
    inner.textContent = emoji;
    div.appendChild(inner);
    if (name) {
      const label = document.createElement('span');
      label.className = 'fe-name';
      label.textContent = name;
      div.appendChild(label);
    }
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2800);
  }

  // ---- FAB Sohbet Paneli ----
  const chatFab   = document.getElementById('chatFab');
  const chatPanel = document.getElementById('chatPanel');
  const chatBadge = document.getElementById('chatBadge');
  const chatClose = document.getElementById('chatClose');
  const cpMsgs    = document.getElementById('cpMsgs');
  const cpInput   = document.getElementById('cpInput');
  const cpSend    = document.getElementById('cpSend');
  const cpEmoji   = document.getElementById('cpEmoji');

  const EMOJIS = ['👍','😂','🔥','❤️','😮','👏','🎉','🤔','😎','🙌','😠','🤮'];
  EMOJIS.forEach(em => {
    const b = el('<button class="emoji-btn" type="button">' + em + '</button>');
    b.onclick = async () => {
      cpEmoji.classList.remove('cp-emoji-open');
      try { await api('send_message', { text: em }); poll(); } catch (_) {}
    };
    cpEmoji.appendChild(b);
  });

  function updateBadge() {
    if (unreadCount > 0) {
      chatBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      chatBadge.hidden = false;
    } else {
      chatBadge.hidden = true;
    }
  }

  function renderChatHistory() {
    if (!cpMsgs) return;
    cpMsgs.innerHTML = '';
    [...chatHistory].reverse().forEach(m => {
      const emojiOnly = isEmojiOnly(m.text);
      const isMe = m.name === myName;
      const h = nameHue(m.name);
      const color = 'hsl(' + h + ',70%,62%)';
      const classes = ['cp-msg'];
      if (emojiOnly) classes.push('cp-emoji-only');
      if (isMe) classes.push('cp-me');
      const div = el('<div class="' + classes.join(' ') + '"></div>');
      const bubble = el('<div class="cp-bubble' + (emojiOnly ? ' cp-bubble-emoji' : '') + '"></div>');
      // İsim her mesajda göster (emoji dahil), kendi mesajında gösterme
      if (!isMe) {
        const nameEl = el('<span class="cp-name"></span>');
        nameEl.textContent = m.name;
        nameEl.style.color = color;
        bubble.appendChild(nameEl);
      }
      if (!emojiOnly) {
        if (isMe) {
          bubble.style.background = 'linear-gradient(135deg, hsl(' + h + ',65%,38%), hsl(' + ((h+40)%360) + ',65%,43%))';
          bubble.style.color = '#fff';
        } else {
          bubble.style.background = 'hsla(' + h + ',55%,50%,.15)';
          bubble.style.border = '1px solid hsla(' + h + ',55%,50%,.3)';
        }
      }
      const txt = el('<span class="cp-text"></span>');
      txt.textContent = m.text;
      bubble.appendChild(txt);
      div.appendChild(bubble);
      cpMsgs.appendChild(div);
    });
  }

  // Emoji satırı toggle
  const cpEmojiToggle = el('<button class="cp-emoji-toggle" type="button" title="Emoji">😊</button>');
  const cpRow = document.getElementById('cpInput').closest('.cp-row');
  cpRow.insertBefore(cpEmojiToggle, cpRow.firstChild);

  // Arkaplan overlay tıklamasıyla kapat
  chatPanel.addEventListener('click', (e) => {
    if (e.target === chatPanel) closeChat();
  });
  cpEmojiToggle.addEventListener('click', () => {
    cpEmoji.classList.toggle('cp-emoji-open');
  });

  function openChat() {
    chatOpen = true;
    unreadCount = 0;
    updateBadge();
    chatPanel.classList.add('cp-open');
    renderChatHistory();
    setTimeout(() => cpInput.focus(), 80);
  }

  function closeChat() {
    chatOpen = false;
    chatPanel.classList.remove('cp-open');
    cpEmoji.classList.remove('cp-emoji-open');
  }

  document.getElementById('chatClear').addEventListener('click', () => {
    chatHistory = [];
    sessionStorage.removeItem(CHAT_KEY);
    cpMsgs.innerHTML = '';
  });

  chatFab.addEventListener('click', () => chatOpen ? closeChat() : openChat());
  chatClose.addEventListener('click', closeChat);

  const cpDoSend = async () => {
    const text = cpInput.value.trim();
    if (!text) return;
    cpInput.value = '';
    try { await api('send_message', { text }); poll(); } catch (_) {}
  };
  cpSend.addEventListener('click', cpDoSend);
  cpInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') cpDoSend(); });

  // Baloncukları sıraya al: aynı anda gelenler üst üste binmesin diye
  // farklı şeritlerden, ~320ms arayla gönderilir.
  const bubbleLanes = [40, 46, 50, 54, 60]; // sadece orta bölge, kenarlardan uzak
  let bubbleLaneIdx = Math.floor(Math.random() * bubbleLanes.length);
  let bubbleQueue = [];
  let bubbleTimer = null;

  function spawnBubble(name, text) {
    bubbleQueue.push({ name, text });
    if (!bubbleTimer) pumpBubbles();
  }

  function pumpBubbles() {
    const item = bubbleQueue.shift();
    if (!item) { bubbleTimer = null; return; }
    createBubble(item.name, item.text);
    bubbleTimer = setTimeout(pumpBubbles, 320);
  }

  // Ada göre tutarlı renk (her kullanıcı farklı)
  function nameHue(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  }

  function createBubble(name, text) {
    const emojiOnly = isEmojiOnly(text);
    // Uzun metinleri kırp — baloncukta max 35 karakter
    const displayText = (!emojiOnly && text.length > 90) ? text.slice(0, 88) + '…' : text;
    const inner = emojiOnly ? esc(displayText) : ('<span class="bn">' + esc(name) + '</span>' + esc(displayText));
    const b = el('<div class="bubble' + (emojiOnly ? ' emoji' : '') + '">' + inner + '</div>');
    const lane = bubbleLanes[bubbleLaneIdx % bubbleLanes.length];
    bubbleLaneIdx++;
    b.style.left = lane + '%';
    b.style.setProperty('--sway', (Math.random() * 16 - 8) + 'px');
    if (!emojiOnly) {
      const h = nameHue(name);
      b.style.background = 'linear-gradient(135deg, hsl(' + h + ',70%,52%), hsl(' + ((h + 40) % 360) + ',72%,58%))';
    }
    bubbleLayer.appendChild(b);
    b.addEventListener('animationend', () => b.remove());
    setTimeout(() => b.remove(), 8000); // güvenlik temizliği
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function buildMain(s) {
    appEl.innerHTML = '';
    const grid = el('<div class="game-grid"></div>');
    const panel = el('<section class="panel" id="panel"></section>');
    const side = el('<aside class="sidebar" id="sidebar"></aside>');
    grid.appendChild(panel);
    grid.appendChild(side);
    appEl.appendChild(grid);

    if (s.status === 'lobby') buildLobby(panel, s);
    else if (s.status === 'slot') buildSlot(panel, s);
    else if (s.status === 'round') buildRound(panel, s);
    else if (s.status === 'results') buildResults(panel, s);
    else if (s.status === 'gameover') buildGameOver(panel, s);
  }

  // ---- Özel Kategori UI (admin lobi) ----
  function buildExtraCatsUI(s) {
    const extra = s.categories.filter(c => c.key.startsWith('custom_'));
    const wrap = el('<div class="extra-cats-box"></div>');
    wrap.appendChild(el('<h3 class="extra-cats-title">➕ Özel Kategoriler <small>(maks 3)</small></h3>'));

    // Mevcut özel kategoriler
    const list = el('<div class="extra-cats-list"></div>');
    extra.forEach(c => {
      const tag = el('<span class="extra-cat-tag">' + esc(c.label) +
        '<button class="extra-cat-rm" data-key="' + esc(c.key) + '">✕</button></span>');
      tag.querySelector('.extra-cat-rm').onclick = () => {
        const updated = extra.filter(x => x.key !== c.key);
        api('set_extra_cats', { cats: updated }).then(() => { viewSig = ''; poll(); }).catch(() => {});
      };
      list.appendChild(tag);
    });
    wrap.appendChild(list);

    // Ekle formu
    if (extra.length < 3) {
      const row = el('<div class="extra-cats-row"></div>');
      const inp2 = el('<input class="extra-cat-input" type="text" maxlength="20" placeholder="Kategori adı (ör: Film)">');
      const addBtn = el('<button class="ghost extra-cat-add">Ekle</button>');
      addBtn.onclick = () => {
        const label = inp2.value.trim();
        if (!label) return;
        if (extra.some(c => c.label.toLowerCase() === label.toLowerCase())) {
          toast('Bu kategori zaten var'); return;
        }
        inp2.value = '';
        const updated = [...extra, { key: 'custom_' + Date.now(), label }];
        api('set_extra_cats', { cats: updated }).then(() => { viewSig = ''; poll(); }).catch(() => {});
      };
      inp2.onkeydown = e => { if (e.key === 'Enter') addBtn.click(); };
      row.appendChild(inp2);
      row.appendChild(addBtn);
      wrap.appendChild(row);
    }

    // Standart kategoriler göster
    const stdLabels = s.categories.filter(c => !c.key.startsWith('custom_')).map(c => c.label).join(', ');
    wrap.appendChild(el('<p class="extra-cats-std muted">Standart: ' + esc(stdLabels) + '</p>'));
    return wrap;
  }

  // ---- Lobby ----
  function buildLobby(panel, s) {
    panel.appendChild(el('<h2>Lobi</h2>'));
    panel.appendChild(el('<p class="muted">Oyuncular bekleniyor. Hazır olunca admin oyunu başlatabilir.</p>'));
    if (s.isAdmin) {
      const btn = el('<button class="primary big">Oyunu Başlat</button>');
      btn.onclick = () => adminAction('start_slot');
      panel.appendChild(btn);
      // Oda kilidi butonu
      const lockBtn = el('<button class="ghost big lock-btn">' + (s.locked ? '🔓 Odayı Aç' : '🔒 Odayı Kilitle') + '</button>');
      lockBtn.onclick = () => adminAction('toggle_lock');
      panel.appendChild(lockBtn);
      // Özel kategori
      panel.appendChild(buildExtraCatsUI(s));
    } else {
      panel.appendChild(el('<p class="muted">Adminin oyunu başlatması bekleniyor…</p>'));
    }
    if (s.locked) {
      panel.appendChild(el('<p class="lock-notice">🔒 Oda kilitli — yeni oyuncu giremiyor.</p>'));
    }

    // Baloncuk sohbeti
    const chat = el('<div class="chat-box"></div>');
    const input = el('<input class="chat-input" type="text" maxlength="80" placeholder="Kısa bir mesaj yaz…">');
    const send = el('<button class="primary chat-send">Gönder</button>');
    const doSend = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try { await api('send_message', { text }); } catch (_) {}
    };
    send.onclick = doSend;
    input.onkeydown = (e) => { if (e.key === 'Enter') doSend(); };
    chat.appendChild(input);
    chat.appendChild(send);
    panel.appendChild(chat);

    // Hızlı emoji gönder
    const emojis = ['👍', '😂', '🔥', '❤️', '😮', '👏', '🎉', '🤔', '😎', '🙌', '😠', '🤮'];
    const erow = el('<div class="emoji-row"></div>');
    emojis.forEach(em => {
      const b = el('<button class="emoji-btn" type="button">' + em + '</button>');
      b.onclick = async () => { try { await api('send_message', { text: em }); } catch (_) {} };
      erow.appendChild(b);
    });
    panel.appendChild(erow);
  }

  // Mesaj sadece emoji mi? (harf/rakam yoksa)
  function isEmojiOnly(text) {
    return text.length > 0 && !/[\p{L}\p{N}]/u.test(text);
  }

  // ---- Slot ----
  function buildSlot(panel, s) {
    panel.appendChild(el('<h2>Harf Çekimi</h2>'));
    const disp = el('<div class="slot-display"><span id="slotLetter">?</span></div>');
    panel.appendChild(disp);
    panel.appendChild(el('<p class="slot-note" id="slotNote"></p>'));
    panel.appendChild(el('<p class="muted">Kalan harf: <strong id="remCount">' + s.remaining + '</strong></p>'));

    const ctrl = el('<div class="slot-ctrl" id="slotCtrl"></div>');
    panel.appendChild(ctrl);
    if (s.isAdmin) {
      const back = el('<button class="ghost end-round-btn">↩ İptal / Lobiye Dön</button>');
      back.onclick = () => modalConfirm('Slot iptal edilip lobiye dönülsün mü? Çıkan oyuncular tekrar katılabilir.', () => adminAction('to_lobby'));
      panel.appendChild(back);
    }
    lastLetterShown = null; // yeni slot ekranı: animasyon resetle
    slotCtrlSig = '';       // kontrol butonlarını yeniden çizmeye zorla
  }

  // Slot harfini animasyonla göster
  function spinTo(targetLetter) {
    const elLetter = document.getElementById('slotLetter');
    const slotBox  = document.querySelector('.slot-display');
    if (!elLetter || !slotBox) return;

    // Hız profili: başta hızlı, sona doğru kademeli yavaşlama
    const frames = [];
    const fastCount = 14;  // hızlı kısım
    const slowCount = 10;  // yavaşlayan kısım
    for (let i = 0; i < fastCount; i++) frames.push(55);
    for (let i = 0; i < slowCount; i++) frames.push(70 + i * 28); // giderek yavaşlar

    elLetter.classList.remove('landed', 'slot-reveal');
    elLetter.classList.add('spinning');
    slotBox.classList.remove('slot-glow');

    let idx = 0;
    function tick() {
      if (idx >= frames.length) {
        // --- Reveal ---
        elLetter.style.transform = 'translate(-50%, -50%)';
        elLetter.classList.remove('spinning');
        elLetter.textContent = targetLetter;
        elLetter.classList.add('slot-reveal');
        slotBox.classList.add('slot-glow');
        // Parçacık patlaması
        spawnParticles(slotBox);
        // Note'u reveal sonrası göster
        setTimeout(() => {
          const note = document.getElementById('slotNote');
          if (note && PAIRS[targetLetter]) {
            note.textContent = '"' + targetLetter + '" çekildi — "' + PAIRS[targetLetter] + '" ile de yazabilirsin';
          }
        }, 700);
        setTimeout(() => {
          elLetter.classList.remove('slot-reveal');
          slotBox.classList.remove('slot-glow');
        }, 1400);
        return;
      }
      elLetter.textContent = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      // Son 4 frame'de titreme efekti
      if (idx >= frames.length - 4) {
        const shake = (frames.length - idx) * 1.5;
        elLetter.style.transform = `translate(-50%, calc(-50% + ${(Math.random() - .5) * shake}px))`;
      } else {
        elLetter.style.transform = 'translate(-50%, -50%)';
      }
      setTimeout(tick, frames[idx++]);
    }
    tick();
  }

  function spawnParticles(container) {
    const colors = ['#ffd700','#a855f7','#22d3ee','#f472b6','#34d399'];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('span');
      p.className = 'slot-particle';
      const angle = (Math.PI * 2 / 18) * i + (Math.random() - .5) * .4;
      const dist  = 70 + Math.random() * 60;
      p.style.cssText = `
        left:50%;top:50%;
        --dx:${Math.cos(angle) * dist}px;
        --dy:${Math.sin(angle) * dist}px;
        background:${colors[i % colors.length]};
        width:${6 + Math.random() * 5}px;
        height:${6 + Math.random() * 5}px;
        border-radius:50%;
        animation-delay:${Math.random() * 80}ms;
      `;
      container.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
  }

  // ---- Tur (round) ----
  function buildRound(panel, s) {
    const letter = s.round.letter;
    roundIdx = 0;
    localAnswers = Object.assign({}, s.round.myAnswers || {});

    panel.appendChild(el('<div class="round-letter">Harf: <span>' + letterLabel(letter) + '</span></div>'));

    const card = el('<div class="qa-card" id="qaCard"></div>');
    panel.appendChild(card);

    const nav = el('<div class="qa-nav"></div>');
    const back = el('<button class="ghost" id="backBtn">‹ Geri</button>');
    const fwd = el('<button class="ghost" id="fwdBtn">İleri ›</button>');
    nav.appendChild(back);
    const dots = el('<div class="dots" id="dots"></div>');
    nav.appendChild(dots);
    nav.appendChild(fwd);
    panel.appendChild(nav);

    back.onclick = () => { if (roundIdx > 0) { roundIdx--; renderQA(s); } };
    fwd.onclick = () => { if (roundIdx < s.categories.length - 1) { roundIdx++; renderQA(s); } };

    // Oyuncunun "Bitir" / geri sayım alanı
    panel.appendChild(el('<div id="finishArea" class="finish-area"></div>'));

    if (s.isAdmin) {
      const end = el('<button class="ghost end-round-btn" id="endBtn">Turu Bitir & Puanla (yeni tura geç)</button>');
      end.onclick = () => modalConfirm('Bu tur bitsin ve puanlar açıklansın mı? (Oyun devam eder)', () => adminAction('end_round'));
      panel.appendChild(end);
      const back = el('<button class="ghost end-round-btn">↩ Lobiye Dön (turu iptal et)</button>');
      back.onclick = () => modalConfirm('Tur iptal edilip lobiye dönülsün mü? Bu turun cevapları silinir, çıkan oyuncular tekrar katılabilir.', () => adminAction('to_lobby'));
      panel.appendChild(back);
    }

    renderQA(s);
    renderFinishArea();
  }

  // Oyuncunun bitir butonu / herkese görünen geri sayım
  function renderFinishArea() {
    const area = document.getElementById('finishArea');
    const s = lastState;
    if (!area || !s || s.status !== 'round' || !s.round) return;

    if (finishLocal != null) {
      area.innerHTML = '<div class=”finish-countdown”>⏱ Tur bitiyor: <b>' + finishLocal + '</b> sn' +
        (finishBy ? '<span>”' + esc(finishBy) + '” ilk bitirdi</span>' : '') + '</div>';
      // 10sn altında büyük overlay geri sayım
      showBigCountdown(finishLocal, finishBy);
      return;
    }

    const allFilled = s.categories.every(c => (localAnswers[c.key] || '').trim() !== '');
    area.innerHTML = '';
    if (s.isMember && allFilled) {
      const b = el('<button class="primary big">✓ Bitirdim! (turu kapat)</button>');
      b.onclick = onFinishClick;
      area.appendChild(b);
    } else if (s.isMember) {
      area.appendChild(el('<p class="muted center finish-hint">6 kategoriyi de doldurunca “Bitirdim” butonu çıkar.</p>'));
    }
  }

  function onFinishClick() {
    modalConfirm('Turu bitiriyorsun! 15 saniye geri sayım başlayacak, süre dolunca bu tur herkes için kapanır ve puanlanır. Emin misin?', async () => {
      try {
        await flushAnswers();
        const r = await api('start_finish');
        if (!r.ok && r.msg) toast(r.msg);
      } catch (_) {}
      poll();
    });
  }

  // Yereldeki tüm cevapları sunucuya yaz (bitirmeden önce)
  async function flushAnswers() {
    const s = lastState;
    if (!s) return;
    const tasks = s.categories.map(c =>
      api('save_answer', { category: c.key, value: localAnswers[c.key] || '' }).catch(() => {}));
    await Promise.all(tasks);
  }

  let lastCountdownSec = -1;
  function showBigCountdown(sec, by) {
    if (sec > 10 || sec <= 0) {
      const el = document.getElementById('bigCountdown');
      if (el) el.remove();
      lastCountdownSec = -1;
      return;
    }
    if (sec === lastCountdownSec) return;
    lastCountdownSec = sec;
    let el = document.getElementById('bigCountdown');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bigCountdown';
      document.body.appendChild(el);
    }
    el.className = 'big-countdown' + (sec <= 3 ? ' urgent' : '');
    el.innerHTML =
      '<div class="bcd-num">' + sec + '</div>' +
      '<div class="bcd-label">' + (by ? '"' + esc(by) + '" ilk bitirdi' : 'Tur bitiyor') + '</div>';
    void el.offsetWidth;
    el.classList.add('bcd-pop');
    setTimeout(() => { const e = document.getElementById('bigCountdown'); if(e) e.classList.remove('bcd-pop'); }, 400);
  }

  function ensureFinishTimer() {
    if (finishTimer) return;
    finishTimer = setInterval(() => {
      if (finishLocal != null && finishLocal > 0) {
        finishLocal -= 1;
        renderFinishArea();
      }
    }, 1000);
  }
  function clearFinishTimer() {
    if (finishTimer) { clearInterval(finishTimer); finishTimer = null; }
  }

  function renderQA(s) {
    const card = document.getElementById('qaCard');
    if (!card) return;
    const cat = s.categories[roundIdx];
    card.innerHTML = '';
    card.appendChild(el('<div class="qa-label">' + (roundIdx + 1) + ' / ' + s.categories.length + ' — <strong>' + cat.label + '</strong></div>'));
    const input = el('<input class="qa-input" type="text" maxlength="60" placeholder="' + letterLabel(s.round.letter) + ' ile başlayan bir ' + cat.label.toLowerCase() + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">');
    input.value = localAnswers[cat.key] || '';
    // Typing göstergesi placeholder
    const typingEl = el('<div class="typing-indicator" id="typingIndicator"></div>');
    card.appendChild(typingEl);

    input.oninput = () => {
      localAnswers[cat.key] = input.value;
      scheduleSave(cat.key, input.value);
      renderFinishArea();
      scheduleTyping(cat.key);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        if (roundIdx < s.categories.length - 1) { roundIdx++; renderQA(s); }
      }
    };
    input.addEventListener('focus', () => {
      // Klavye açılınca nav butonları görünür kalsın
      setTimeout(() => {
        const nav = document.querySelector('.qa-nav');
        if (nav) nav.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }, 350);
    });
    card.appendChild(input);
    setTimeout(() => input.focus(), 30);

    // noktalar
    const dots = document.getElementById('dots');
    if (dots) {
      dots.innerHTML = '';
      s.categories.forEach((c, i) => {
        const d = el('<span class="dot' + (i === roundIdx ? ' active' : '') + (localAnswers[c.key] ? ' filled' : '') + '"></span>');
        d.title = c.label;
        d.onclick = () => { roundIdx = i; renderQA(s); };
        dots.appendChild(d);
      });
    }
    const back = document.getElementById('backBtn');
    const fwd = document.getElementById('fwdBtn');
    if (back) back.disabled = roundIdx === 0;
    if (fwd) fwd.disabled = roundIdx === s.categories.length - 1;
  }

  function scheduleSave(cat, value) {
    if (saveTimers[cat]) clearTimeout(saveTimers[cat]);
    saveTimers[cat] = setTimeout(() => {
      api('save_answer', { category: cat, value }).catch(() => {});
    }, 400);
  }

  let typingTimer = null;
  let typingActive = false;
  function scheduleTyping(cat) {
    if (!typingActive) {
      api('set_typing', { category: cat }).catch(() => {});
      typingActive = true;
    }
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      api('set_typing', { category: '' }).catch(() => {});
      typingActive = false;
    }, 2500);
  }

  // ---- Sonuçlar ----
  function buildResults(panel, s) {
    const r = s.results;
    panel.appendChild(el('<h2>Sonuçlar — Harf: ' + (r ? letterLabel(r.letter) : '') + '</h2>'));

    if (r) {
      const cards = el('<div class="results-cards"></div>');
      r.rows.forEach(row => {
        const card = el('<div class="rcard"></div>');
        const penHtml = row.penalty ? '<span class="rpenalty" title="Ekran terk cezası">-' + row.penalty + '</span>' : '';
        card.appendChild(el('<div class="rcard-head"><span class="rname">' + esc(row.name) +
          '</span><span class="rtotals"><span class="rtotal">+' + row.points + '</span>' + penHtml + '</span></div>'));
        const grid = el('<div class="rcat-grid"></div>');
        s.categories.forEach(c => {
          const ans = row.answers[c.key] || '';
          const pts = row.breakdown[c.key] || 0;
          const isInv = !!(row.invalid && row.invalid[c.key]);
          const cls = isInv ? 'inv' : (pts === 10 ? 'p10' : (pts === 5 ? 'p5' : 'p0'));
          const cell = el('<div class="rcat ' + cls + '">' +
            '<span class="rc-label">' + c.label + '</span>' +
            '<span class="rc-ans">' + (esc(ans) || '—') + '</span>' +
            '<span class="rc-pts">' + (isInv ? 'iptal' : ('+' + pts)) + '</span></div>');
          // admin dolu cevapları iptal edip geri alabilir
          const repCount = (row.reports && row.reports[c.key]) || 0;
          const iReported = !!(row.myReports && row.myReports[c.key]);
          if (repCount === 1 && !isInv) cell.classList.add('reported-1');
          else if (repCount >= 2 && !isInv) cell.classList.add('reported-2');

          if (s.isAdmin && ans) {
            cell.classList.add('clickable');
            cell.title = isInv ? 'Tekrar geçerli say' : 'Bu cevabı iptal et';
            if (repCount > 0 && !isInv) {
              const flag = el('<span class="rep-badge" title="' + repCount + ' kişi bildirdi">🚩' + repCount + '</span>');
              cell.appendChild(flag);
            }
            cell.onclick = () => adminAction('invalidate_answer', { pid: row.pid, category: c.key });
          } else if (!s.isAdmin && ans && !isInv) {
            const isMe = row.name === myName;
            if (!isMe) {
              const flagBtn = el('<button class="rep-btn' + (iReported ? ' rep-active' : '') + '" title="' + (iReported ? 'Bildirimi geri al' : 'Hatalı olarak bildir') + '">' + (iReported ? '🚩' : '⚑') + '</button>');
              flagBtn.onclick = async (e) => {
                e.stopPropagation();
                const nowReported = flagBtn.classList.contains('rep-active');
                // Optimistic update
                if (nowReported) {
                  flagBtn.classList.remove('rep-active');
                  flagBtn.textContent = '⚑';
                  flagBtn.title = 'Hatalı olarak bildir';
                  const newCount = repCount - 1;
                  cell.classList.remove('reported-1', 'reported-2');
                  if (newCount === 1) cell.classList.add('reported-1');
                  else if (newCount >= 2) cell.classList.add('reported-2');
                } else {
                  flagBtn.classList.add('rep-active');
                  flagBtn.textContent = '🚩';
                  flagBtn.title = 'Bildirimi geri al';
                  const newCount = repCount + 1;
                  cell.classList.remove('reported-1', 'reported-2');
                  if (newCount === 1) cell.classList.add('reported-1');
                  else if (newCount >= 2) cell.classList.add('reported-2');
                }
                await api('report_answer', { pid: row.pid, category: c.key });
                poll();
              };
              cell.appendChild(flagBtn);
            }
          }
          grid.appendChild(cell);
        });
        card.appendChild(grid);
        cards.appendChild(card);
      });
      panel.appendChild(cards);
      panel.appendChild(el('<p class="legend"><span class="p10">10</span> benzersiz · <span class="p5">5</span> aynı cevap · <span class="p0">0</span> boş/harf uymuyor</p>'));
      if (s.isAdmin) {
        panel.appendChild(el('<p class="legend">Hatalı/tek harf cevaba dokunarak <strong>iptal</strong> edebilirsin (tekrar dokun = geri al). Puanlar otomatik güncellenir.</p>'));
      }
    }

    if (s.isAdmin) {
      if (s.remaining > 0) {
        const btn = el('<button class="primary big">Yeni Tur (yeni harf)</button>');
        btn.onclick = () => adminAction('new_round');
        panel.appendChild(btn);
      } else {
        panel.appendChild(el('<p class="muted center">Tüm harfler kullanıldı.</p>'));
      }
      const endGame = el('<button class="ghost end-round-btn">🏆 Oyunu Bitir (final tablo)</button>');
      endGame.onclick = () => modalConfirm('Oyunu tamamen bitirmek istiyor musun? Final skor tablosu gösterilecek.', () => adminAction('end_game'));
      panel.appendChild(endGame);
    } else {
      panel.appendChild(el('<p class="muted center">Adminin yeni turu başlatması bekleniyor…</p>'));
    }
  }

  // ---- Konfeti ----
  let confettiActive = false;
  function launchConfetti() {
    if (confettiActive) return;
    confettiActive = true;
    const COLORS = ['#ff4757','#ffa502','#2ed573','#1e90ff','#a29bfe','#fd79a8','#fdcb6e','#fff'];
    const total = 120;
    for (let i = 0; i < total; i++) {
      setTimeout(() => {
        const p = document.createElement('div');
        p.className = 'confetti-piece';
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const x = Math.random() * 100;
        const rot = Math.random() * 360;
        const dur = 2.2 + Math.random() * 1.8;
        const size = 7 + Math.random() * 8;
        const isRect = Math.random() > 0.5;
        p.style.cssText = [
          'left:' + x + 'vw',
          'width:' + size + 'px',
          'height:' + (isRect ? size * 0.45 : size) + 'px',
          'background:' + color,
          'border-radius:' + (isRect ? '2px' : '50%'),
          'animation-duration:' + dur + 's',
          'animation-delay:' + (Math.random() * 0.6) + 's',
          '--rot:' + rot + 'deg',
          '--dx:' + ((Math.random() - 0.5) * 120) + 'px',
        ].join(';');
        document.body.appendChild(p);
        setTimeout(() => p.remove(), (dur + 1) * 1000);
      }, i * 18);
    }
    setTimeout(() => { confettiActive = false; }, total * 18 + 4000);
  }

  let goBoard = [];
  let goRoundsPlayed = 0;

  // ---- Oyun Bitti (final skor tablosu) ----
  function buildGameOver(panel, s) {
    goBoard = s.scoreboard || [];
    goRoundsPlayed = s.roundsPlayed || 0;
    panel.classList.add('gameover-panel');
    panel.appendChild(el('<div class="go-title">🏆 Oyun Bitti!</div>'));
    launchConfetti();

    const board = (s.scoreboard || []);
    const top = board[0];
    if (top) {
      panel.appendChild(el('<div class="go-winner"><div class="go-crown">👑</div>' +
        '<div class="go-wname">' + esc(top.name) + '</div>' +
        '<div class="go-wscore">' + top.score + ' puan</div></div>'));
    }

    // Podyum + tam liste
    const medals = ['🥇', '🥈', '🥉'];
    const list = el('<ol class="go-board"></ol>');
    board.forEach((p, i) => {
      const medal = medals[i] || ('<span class="go-rank">' + (i + 1) + '</span>');
      const pen = p.penalty ? '<span class="go-pen" title="Ceza">-' + p.penalty + '</span>' : '';
      const li = el('<li' + (i === 0 ? ' class="first"' : '') + '>' +
        '<span class="go-medal">' + medal + '</span>' +
        '<span class="go-name">' + esc(p.name) + '</span>' + pen +
        '<span class="go-score">' + p.score + '</span></li>');
      list.appendChild(li);
    });
    panel.appendChild(list);

    panel.appendChild(el('<p class="muted center">' + (s.roundsPlayed || 0) + ' tur oynandı</p>'));

    // Fotoğraf indir butonu
    const dlBtn = el('<button class="ghost big go-dl-btn">📸 Sonucu İndir</button>');
    dlBtn.onclick = () => downloadGameOver(panel);
    panel.appendChild(dlBtn);

    if (s.isAdmin) {
      const btn = el('<button class="primary big">🔄 Yeni Oyun (aynı oyuncular)</button>');
      btn.onclick = () => modalConfirm('Yeni oyun başlatılsın mı? Puanlar sıfırlanır, oyuncular kalır.', () => adminAction('new_game'));
      panel.appendChild(btn);
    } else {
      panel.appendChild(el('<p class="muted center">Adminin yeni oyun başlatması bekleniyor…</p>'));
    }
  }

  function downloadGameOver(panel) {
    const W = 1080, H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Arka plan gradyanı
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#0d0820');
    bg.addColorStop(0.5, '#1a0f3a');
    bg.addColorStop(1,   '#0d0820');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Üst dekoratif şerit
    const topGrd = ctx.createLinearGradient(0, 0, W, 0);
    topGrd.addColorStop(0, '#7c3aed');
    topGrd.addColorStop(1, '#ec4899');
    ctx.fillStyle = topGrd;
    ctx.fillRect(0, 0, W, 12);

    // Alt dekoratif şerit
    ctx.fillStyle = topGrd;
    ctx.fillRect(0, H - 12, W, 12);

    // Yardımcı: yuvarlatılmış dikdörtgen
    function roundRect(x, y, w, h, r, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
    }

    // Başlık — İsim Şehir
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.fillText('İSİM ŞEHİR', W / 2, 130);

    // Kazanan kartı
    const board = goBoard || [];
    const winner = board[0];
    if (winner) {
      roundRect(80, 180, W - 160, 420, 40, 'rgba(255,204,77,0.10)', 'rgba(255,204,77,0.5)');

      // Taç emoji
      ctx.font = '180px serif';
      ctx.fillText('👑', W / 2, 365);

      // Kazanan isim
      ctx.font = 'bold 100px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(winner.name, W / 2, 490);

      // Puan
      ctx.font = 'bold 68px system-ui, sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(winner.score + ' puan', W / 2, 570);
    }

    // Sıralama listesi — tüm oyuncuları sığdır
    const medals = ['🥇', '🥈', '🥉'];
    const padX = 80;
    const listStart = 660;
    const listEnd = H - 180;
    const count = board.length;
    const gap = 16;
    const rowH = Math.min(130, Math.floor((listEnd - listStart - gap * (count - 1)) / Math.max(count, 1)));
    const fontSize = Math.max(36, Math.min(58, rowH * 0.44));
    const emojiFSize = Math.max(32, Math.min(64, rowH * 0.5));

    board.forEach((p, i) => {
      const y = listStart + i * (rowH + gap);
      const isFirst = i === 0;
      roundRect(padX, y, W - padX * 2, rowH, 24,
        isFirst ? 'rgba(255,204,77,0.12)' : 'rgba(255,255,255,0.06)',
        isFirst ? 'rgba(255,204,77,0.4)' : 'rgba(255,255,255,0.12)');

      const midY = y + rowH / 2 + fontSize * 0.36;

      // Madalya / sıra
      ctx.textAlign = 'left';
      if (medals[i]) {
        ctx.font = emojiFSize + 'px serif';
        ctx.fillText(medals[i], padX + 22, midY);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold ' + fontSize + 'px system-ui, sans-serif';
        ctx.fillText(i + 1, padX + 30, midY);
      }

      // İsim
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + fontSize + 'px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(p.name, padX + emojiFSize + 44, midY);

      // Puan
      ctx.fillStyle = isFirst ? '#ffd700' : 'rgba(255,255,255,0.7)';
      ctx.font = 'bold ' + fontSize + 'px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(p.score, W - padX - 24, midY);
    });

    // Alt branding
    ctx.textAlign = 'center';
    const brandGrd = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
    brandGrd.addColorStop(0, '#7c3aed');
    brandGrd.addColorStop(1, '#ec4899');
    ctx.fillStyle = brandGrd;
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.fillText('birtikyazilim · İsim Şehir Oyunu', W / 2, H - 80);

    // İndir
    try {
      const link = document.createElement('a');
      link.download = 'isim-sehir-sonuc.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch(e) {
      toast('İndirme başarısız oldu.');
    }
  }

  // ---- Her poll'da güncellenen dinamik kısımlar ----
  function updateDynamic(s) {
    // Slot harfi + kontrolleri
    if (s.status === 'slot') {
      const rem = document.getElementById('remCount');
      if (rem) rem.textContent = s.remaining;
      if (s.currentLetter && s.currentLetter !== lastLetterShown) {
        lastLetterShown = s.currentLetter;
        spinTo(s.currentLetter);
      } else if (!s.currentLetter) {
        const l = document.getElementById('slotLetter');
        if (l && !l.classList.contains('spinning')) l.textContent = '?';
      }
      // Note'u sadece animasyon bittikten sonra göster
      const note = document.getElementById('slotNote');
      const spinning = document.getElementById('slotLetter')?.classList.contains('spinning');
      if (note && !spinning) {
        note.textContent = (s.currentLetter && PAIRS[s.currentLetter])
          ? '”' + s.currentLetter + '” çekildi — “' + PAIRS[s.currentLetter] + '” ile de yazabilirsin'
          : '';
      }
      const ctrl = document.getElementById('slotCtrl');
      if (ctrl) {
        if (s.isAdmin) {
          renderSlotAdminCtrl(ctrl, s);
        } else {
          ctrl.innerHTML = '<p class="muted center">Admin harf çekiyor…</p>';
        }
      }
    }

    // Tur ilerleme (başkalarının kaç cevap girdiği)
    if (s.status === 'round' && s.round) {
      renderProgressList(s);
      // geri sayım senkronu
      if (s.round.finishIn != null) {
        finishLocal = s.round.finishIn;
        finishBy = s.round.finishBy || '';
        ensureFinishTimer();
        // admin turu-bitir butonunu geri sayım sırasında gizle
        const eb = document.getElementById('endBtn');
        if (eb) eb.style.display = 'none';
      } else {
        finishLocal = null;
        clearFinishTimer();
      }
      renderFinishArea();

      // Yazma göstergesi
      const typingEl = document.getElementById('typingIndicator');
      if (typingEl && s.round.typing) {
        const cat = s.categories[roundIdx]?.key;
        const names = cat ? (s.round.typing[cat] || []) : [];
        if (names.length > 0) {
          const txt = names.length === 1
            ? names[0] + ' yazıyor'
            : names.slice(0, 2).join(', ') + ' yazıyor';
          if (typingEl.dataset.txt !== txt) {
            typingEl.dataset.txt = txt;
            typingEl.innerHTML = '<span class="ti-dots"><span></span><span></span><span></span></span> ' + esc(txt);
            typingEl.classList.add('ti-show');
          }
        } else {
          typingEl.classList.remove('ti-show');
          typingEl.dataset.txt = '';
        }
      }
    }

    // Skor tablosu (sidebar)
    renderSidebar(s);
  }

  let slotCtrlSig = '';
  function renderSlotAdminCtrl(ctrl, s) {
    const hasLetter = !!s.currentLetter;
    const sig = hasLetter ? 'has' : 'none';
    if (sig === slotCtrlSig) return; // gereksiz yeniden çizme
    slotCtrlSig = sig;
    ctrl.innerHTML = '';
    if (!hasLetter) {
      const spin = el('<button class="primary big">🎰 Slotu Çevir</button>');
      spin.onclick = () => adminAction('spin');
      ctrl.appendChild(spin);
    } else {
      const approve = el('<button class="primary">✓ Onayla & Tura Başla</button>');
      approve.onclick = () => adminAction('approve_letter');
      const skip = el('<button class="ghost">↻ Atla (yeni harf)</button>');
      skip.onclick = () => { slotCtrlSig = ''; adminAction('skip_letter'); };
      ctrl.appendChild(approve);
      ctrl.appendChild(skip);
    }
  }

  function renderProgressList(s) {
    let box = document.getElementById('progressBox');
    if (!box) {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      box = el('<div class="progress-box" id="progressBox"></div>');
      sidebar.insertBefore(box, sidebar.firstChild);
    }
    let html = '<h3>İlerleme</h3>';
    (s.round.progress || []).forEach(p => {
      const pct = Math.round((p.filled / p.total) * 100);
      html += '<div class="prog-row"><span>' + esc(p.name) + '</span>' +
        '<span class="prog-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="prog-num">' + p.filled + '/' + p.total + '</span></div>';
    });
    box.innerHTML = html;
  }

  function renderSidebar(s) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    let board = document.getElementById('boardBox');
    if (!board) {
      board = el('<div class="board-box" id="boardBox"></div>');
      sidebar.appendChild(board);
    }
    const players = s.players || [];

    // FLIP — 1) eski konumları kaydet
    const oldRects = {};
    board.querySelectorAll('li[data-pname]').forEach(li => {
      oldRects[li.dataset.pname] = li.getBoundingClientRect().top;
    });

    // 2) DOM güncelle
    let html = '<h3>Skor Tablosu</h3><ol class="board">';
    players.forEach((p, i) => {
      const pen = p.penalty ? '<span class="bpen">-' + p.penalty + '</span>' : '';
      const kickBtn = s.isAdmin
        ? (p.isMe
            ? '<span class="kick-placeholder"></span>'
            : '<button class="kick-btn" data-tok="' + esc(p.tok || '') + '" data-name="' + esc(p.name) + '" title="Oyuncuyu at">✕</button>')
        : '';
      html += '<li data-pname="' + esc(p.name) + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="bn">' + esc(p.name) + '</span>' +
        pen + '<span class="bs">' + p.score + '</span>' + kickBtn + '</li>';
    });
    html += '</ol>';
    if (s.usedLetters && s.usedLetters.length) {
      html += '<h3>Kullanılan Harfler</h3><div class="used-letters">';
      s.usedLetters.forEach(l => html += '<span>' + l + '</span>');
      html += '</div>';
    }
    board.innerHTML = html;

    // 3) FLIP — yeni konumla karşılaştır, fark varsa animate et
    if (Object.keys(oldRects).length > 0) {
      board.querySelectorAll('li[data-pname]').forEach(li => {
        const name = li.dataset.pname;
        if (oldRects[name] == null) return;
        const dy = oldRects[name] - li.getBoundingClientRect().top;
        if (Math.abs(dy) < 2) return;
        li.style.transition = 'none';
        li.style.transform = 'translateY(' + dy + 'px)';
        requestAnimationFrame(() => {
          li.style.transition = 'transform .55s cubic-bezier(.25,.46,.45,.94)';
          li.style.transform = '';
        });
      });
    }

    // Kick butonları
    board.querySelectorAll('.kick-btn').forEach(btn => {
      btn.onclick = () => {
        const name = btn.dataset.name;
        const tok = btn.dataset.tok;
        modalConfirm('"' + name + '" oyuncusunu odadan atmak ve yasaklamak istiyor musunuz?', () => {
          adminAction('kick', { target: tok });
        });
      };
    });
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- Mobil klavye + fullscreen: visualViewport ile chat paneli konumlandır ----
  // position:fixed fullscreen'de layout viewport'a göre çalışır, klavyeyi görmez.
  // Çözüm: chat panelini visualViewport koordinatlarına kilitlemek.
  const chatPanelEl = document.getElementById('chatPanel');

  if (window.visualViewport && chatPanelEl) {
    function updateViewport() {
      const vv = window.visualViewport;
      const t = Math.round(vv.offsetTop);
      const h = Math.round(vv.height);
      const w = Math.round(vv.width);
      // Chat panelini görünür alana tam oturت
      chatPanelEl.style.top    = t + 'px';
      chatPanelEl.style.left   = '0px';
      chatPanelEl.style.width  = w + 'px';
      chatPanelEl.style.height = h + 'px';
      chatPanelEl.style.bottom = 'unset';
      // action bar klavye açıkken gizle
      const kbOpen = h < screen.height * 0.75;
      document.body.classList.toggle('kb-open', kbOpen);
    }
    window.visualViewport.addEventListener('resize', updateViewport);
    window.visualViewport.addEventListener('scroll', updateViewport);
  }

  // ---- Fullscreen + klavye öneri şeridi fix (global) ----
  // Input'a focus olunca fullscreen'den çık. Blur'da geri gir — ama
  // başka bir input'a geçiliyorsa (focusin hemen arkadan gelir) geri girme.
  let fsBeforeInput = false;
  let fsRestoreTimer = null;
  document.addEventListener('focusin', (e) => {
    if (!e.target.matches('input, textarea')) return;
    // Bekleyen fullscreen geri dönüşünü iptal et (input → input geçişi)
    if (fsRestoreTimer) { clearTimeout(fsRestoreTimer); fsRestoreTimer = null; }
    if (!document.fullscreenElement) {
      // Zaten fullscreen dışındayız — önceki input'tan çıkılırken çıkılmıştı
      fsBeforeInput = true;
    } else {
      fsBeforeInput = true;
      document.exitFullscreen().catch(() => {});
    }
  }, { passive: true });
  document.addEventListener('focusout', (e) => {
    if (!e.target.matches('input, textarea')) return;
    if (fsBeforeInput) {
      // 150ms bekle — başka input'a geçilirse focusin iptal eder
      fsRestoreTimer = setTimeout(() => {
        fsRestoreTimer = null;
        fsBeforeInput = false;
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      }, 150);
    }
  }, { passive: true });

  // ---- VoiceManager: WebRTC sesli sohbet ----
  const voiceMgr = (() => {
    const STUN = { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]};
    let localStream = null;
    let active = false;
    let muted = false;
    const peers = {};       // remoteTok → { pc, audioEl }
    const pendingIce = {};  // remoteTok → [candidate]
    const processedSig = new Set(); // key → işlendi, tekrar işleme
    let speakerMuted = false;

    // HTML'deki action bar butonları
    const micFab = document.getElementById('micFabBtn');
    const spkFab = document.getElementById('spkFabBtn');

    spkFab.addEventListener('click', () => {
      speakerMuted = !speakerMuted;
      Object.values(peers).forEach(({ audioEl }) => { audioEl.muted = speakerMuted; });
      spkFab.classList.toggle('spk-muted', speakerMuted);
      spkFab.querySelector('.ab-icon').textContent = speakerMuted ? '🔇' : '🔊';
    });

    micFab.addEventListener('click', async () => {
      if (!active) await start();
      else toggleMute();
    });

    async function start() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (e) {
        toast('Mikrofon erişimi reddedildi veya desteklenmiyor.');
        return;
      }
      active = true;
      muted = false;
      micFab.classList.add('mic-active');
      micFab.querySelector('.ab-icon').textContent = '🎙️';
      await api('voice_state', { state: 'active' });
      poll(); // hemen sinyal taraması yap
    }

    function toggleMute() {
      if (!localStream) return;
      muted = !muted;
      localStream.getAudioTracks().forEach(t => { t.enabled = !muted; });
      micFab.classList.toggle('mic-muted', muted);
      micFab.querySelector('.ab-icon').textContent = '🎙️';
      api('voice_state', { state: muted ? 'muted' : 'active' });
    }

    function makePeer(remoteTok) {
      if (peers[remoteTok]) return peers[remoteTok].pc;
      const pc = new RTCPeerConnection(STUN);
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      document.body.appendChild(audioEl);
      peers[remoteTok] = { pc, audioEl };

      if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; audioEl.muted = speakerMuted; };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          api('webrtc_signal', { to: remoteTok, type: 'ice', candidate: e.candidate.toJSON() });
        }
      };

      pc.onconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          audioEl.remove();
          delete peers[remoteTok];
        }
      };

      // Bekleyen ICE'ları uygula
      (pendingIce[remoteTok] || []).forEach(c =>
        pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
      );
      delete pendingIce[remoteTok];

      return pc;
    }

    async function makeOffer(remoteTok) {
      if (!active || !localStream || peers[remoteTok]) return;
      const pc = makePeer(remoteTok);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await api('webrtc_signal', { to: remoteTok, type: 'offer', sdp: offer.sdp });
    }

    async function handleSignals(voice) {
      if (!active || !localStream) return;

      // 1) Önce gelen sinyalleri işle (offer/answer)
      for (const sig of (voice.signals || [])) {
        const sigKey = sig.key + ':' + sig.type;
        if (processedSig.has(sigKey)) continue;
        processedSig.add(sigKey);

        const remoteTok = sig.from;
        try {
          if (sig.type === 'offer') {
            // Glare: iki taraf aynı anda offer gönderdiyse, token'ı küçük olan kazanır (answerer olur)
            const existingEntry = peers[remoteTok];
            if (existingEntry && existingEntry.pc.signalingState !== 'stable') {
              if (token < remoteTok) {
                // Biz kaybediyoruz: kendi offer'ımızı iptal et, answer ver
                existingEntry.pc.close();
                existingEntry.audioEl.remove();
                delete peers[remoteTok];
              } else {
                continue; // Karşı taraf kaybedecek, kendi offer'ımıza devam et
              }
            }
            const pc = makePeer(remoteTok);
            if (pc.signalingState !== 'stable') continue;
            if (localStream && pc.getSenders().length === 0) {
              localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            }
            await pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await api('webrtc_signal', { to: remoteTok, type: 'answer', sdp: answer.sdp });
          } else if (sig.type === 'answer') {
            const entry = peers[remoteTok];
            if (entry && entry.pc.signalingState === 'have-local-offer') {
              await entry.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
            }
          }
        } catch (e) { /* sinyal geç gelmiş olabilir */ }
      }

      // 2) ICE candidate'ler
      for (const ice of (voice.ice || [])) {
        const iceKey = ice.key + ':' + (ice.candidate && ice.candidate.candidate);
        if (processedSig.has(iceKey)) continue;
        processedSig.add(iceKey);

        const remoteTok = ice.from;
        const entry = peers[remoteTok];
        if (entry && entry.pc.remoteDescription) {
          entry.pc.addIceCandidate(new RTCIceCandidate(ice.candidate)).catch(() => {});
        } else {
          if (!pendingIce[remoteTok]) pendingIce[remoteTok] = [];
          pendingIce[remoteTok].push(ice.candidate);
        }
      }

      // 3) Sinyaller işlendikten sonra eksik peer'lara offer gönder
      // Glare prevention: sadece token'ı büyük olan taraf offer gönderir
      for (const tok of (voice.otherTokens || [])) {
        if (!peers[tok] && token > tok) await makeOffer(tok);
      }

      // processedSig'i çok büyütme
      if (processedSig.size > 500) processedSig.clear();
    }

    function destroy() {
      Object.values(peers).forEach(({ pc, audioEl }) => { pc.close(); audioEl.remove(); });
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      active = false;
      try { api('voice_state', { state: 'off' }); } catch (_) {}
    }

    return { handleSignals, destroy };
  })();

  // Başlat
  poll();
  setInterval(poll, 1500);
})();
