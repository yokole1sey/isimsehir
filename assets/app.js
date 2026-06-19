// İsim Şehir - istemci
(function () {
  const ROOM = window.IS_ROOM;
  const LETTERS = window.IS_LETTERS;
  const token = localStorage.getItem('is_token_' + ROOM);
  const myName = localStorage.getItem('is_name_' + ROOM) || '';
  const appEl = document.getElementById('app');
  const meInfoEl = document.getElementById('meInfo');

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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // sadece tur sırasında ve odaya üyeysen
      if (lastState && lastState.status === 'round' && lastState.isMember) {
        const now = Date.now();
        if (now - lastHideAt > 1500) {
          lastHideAt = now;
          penaltyPending = true;
          sendPenalty();
        }
      }
    } else {
      if (penaltyPending) {
        penaltyPending = false;
        toast('Ekrandan ayrıldın — 10 puan ceza! ⚠️');
      }
      poll(); // her dönüşte lastSeen güncelle
    }
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
      render(r.state);
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
    // Ana panel imzası: status + harf + oyuncu sayısı + admin mi
    const letter = (s.round && s.round.letter) || s.currentLetter || '';
    let extra = '';
    if (s.status === 'results' && s.results) {
      // puanlar/iptaller değişince sonuç ekranını yeniden çiz
      extra = s.results.rows.map(r => r.points + ':' +
        s.categories.map(c => (r.invalid && r.invalid[c.key]) ? '1' : '0').join('') + ':' +
        s.categories.map(c => (r.reports && r.reports[c.key]) || 0).join('')).join(',');
    }
    const sig = [s.status, letter, s.playerCount, s.isAdmin, extra].join('|');

    if (sig !== viewSig) {
      viewSig = sig;
      buildMain(s);
    }
    if (s.status !== 'round') { finishLocal = null; clearFinishTimer(); }
    updateDynamic(s);
    processMessages(s);
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
    if (!elLetter) return;
    let ticks = 0;
    const total = 18;
    elLetter.classList.add('spinning');
    const iv = setInterval(() => {
      ticks++;
      if (ticks >= total) {
        clearInterval(iv);
        elLetter.textContent = targetLetter;
        elLetter.classList.remove('spinning');
        elLetter.classList.add('landed');
        setTimeout(() => elLetter.classList.remove('landed'), 600);
      } else {
        elLetter.textContent = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      }
    }, 70);
  }

  // ---- Tur (round) ----
  function buildRound(panel, s) {
    const letter = s.round.letter;
    roundIdx = 0;
    localAnswers = Object.assign({}, s.round.myAnswers || {});

    panel.appendChild(el('<div class="round-letter">Harf: <span>' + letterLabel(letter) + '</span></div>'));
    panel.appendChild(el('<p class="leave-warn">⚠️ Tur sırasında ekrandan ayrılırsan (sekme/uygulama değiştirme) 10 puan ceza!</p>'));

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
      area.innerHTML = '<div class="finish-countdown">⏱ Tur bitiyor: <b>' + finishLocal + '</b> sn' +
        (finishBy ? '<span>“' + esc(finishBy) + '” ilk bitirdi</span>' : '') + '</div>';
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
    const input = el('<input class="qa-input" type="text" maxlength="60" placeholder="' + letterLabel(s.round.letter) + ' ile başlayan bir ' + cat.label.toLowerCase() + '">');
    input.value = localAnswers[cat.key] || '';
    input.oninput = () => {
      localAnswers[cat.key] = input.value;
      scheduleSave(cat.key, input.value);
      renderFinishArea();
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

  // ---- Oyun Bitti (final skor tablosu) ----
  function buildGameOver(panel, s) {
    panel.classList.add('gameover-panel');
    panel.appendChild(el('<div class="go-title">🏆 Oyun Bitti!</div>'));

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

    if (s.isAdmin) {
      const btn = el('<button class="primary big">🔄 Yeni Oyun (aynı oyuncular)</button>');
      btn.onclick = () => modalConfirm('Yeni oyun başlatılsın mı? Puanlar sıfırlanır, oyuncular kalır.', () => adminAction('new_game'));
      panel.appendChild(btn);
    } else {
      panel.appendChild(el('<p class="muted center">Adminin yeni oyun başlatması bekleniyor…</p>'));
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
      const note = document.getElementById('slotNote');
      if (note) note.textContent = (s.currentLetter && PAIRS[s.currentLetter])
        ? '“' + PAIRS[s.currentLetter] + '” ile de yazabilirsin'
        : '';
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
    let html = '<h3>Skor Tablosu</h3><ol class="board">';
    (s.players || []).forEach((p, i) => {
      const pen = p.penalty ? '<span class="bpen">-' + p.penalty + '</span>' : '';
      const kickBtn = (s.isAdmin && !p.isMe)
        ? '<button class="kick-btn" data-tok="' + esc(p.tok || '') + '" data-name="' + esc(p.name) + '" title="Oyuncuyu at">✕</button>'
        : '';
      html += '<li><span class="rank">' + (i + 1) + '</span><span class="bn">' + esc(p.name) +
        '</span>' + pen + '<span class="bs">' + p.score + '</span>' + kickBtn + '</li>';
    });
    html += '</ol>';
    // kullanılan harfler
    if (s.usedLetters && s.usedLetters.length) {
      html += '<h3>Kullanılan Harfler</h3><div class="used-letters">';
      s.usedLetters.forEach(l => html += '<span>' + l + '</span>');
      html += '</div>';
    }
    board.innerHTML = html;

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

  // ---- Mobil klavye tespiti (visualViewport) ----
  if (window.visualViewport) {
    let baseH = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', () => {
      const vh = window.visualViewport.height;
      const ratio = vh / baseH;
      const kbOpen = ratio < 0.75; // klavye ekranın %25'inden fazlasını kapladı
      if (kbOpen) {
        // Chat panel yüksekliğini görünür alana sığdır
        const panelH = Math.max(vh - 20, 200);
        document.body.style.setProperty('--kb-panel-h', panelH + 'px');
        document.body.classList.add('kb-open');
      } else {
        document.body.classList.remove('kb-open');
      }
    });
    // İlk yükleme tabanını al
    window.visualViewport.addEventListener('scroll', () => {
      if (!document.body.classList.contains('kb-open')) {
        baseH = window.visualViewport.height;
      }
    });
  }

  // Başlat
  poll();
  setInterval(poll, 1500);
})();
