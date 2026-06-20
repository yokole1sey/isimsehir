<?php
require __DIR__ . '/lib.php';
$room = trim((string)($_GET['room'] ?? ''));
if (!valid_room($room)) {
    header('Location: index.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Oda <?= htmlspecialchars($room) ?> — İsim Şehir</title>
<link rel="stylesheet" href="assets/style.css?v=55">
</head>
<body>
<header class="topbar">
    <div class="room-badge">Oda <span><?= htmlspecialchars($room) ?></span></div>
    <div id="meInfo" class="me-info"></div>
    <button class="fs-btn" id="fsBtn" title="Tam ekran" aria-label="Tam ekran">⛶</button>
    <a href="index.php" class="leave" id="leaveBtn">Çıkış</a>
</header>

<main id="app" class="app">
    <div class="loading">Yükleniyor…</div>
</main>

<!-- Alt aksiyon barı: hoparlör · mikrofon · sohbet · reaksiyon -->
<div class="action-bar" id="actionBar">
  <button class="ab-btn spk-fab" id="spkFabBtn" title="Gelen Sesleri Kapat" aria-label="Gelen sesleri kapat"><span class="ab-icon">🔊</span></button>
  <button class="ab-btn mic-fab" id="micFabBtn" title="Sesli Sohbet" aria-label="Sesli sohbet aç"><span class="ab-icon">🎤</span></button>
  <button class="ab-btn chat-fab" id="chatFab" title="Sohbet" aria-label="Sohbet aç"><span class="ab-icon">💬</span><span class="chat-badge" id="chatBadge" hidden>0</span></button>
  <button class="ab-btn rx-fab" id="rxFabBtn" title="Reaksiyon" aria-label="Reaksiyon gönder" style="display:none"><span class="ab-icon">😊</span></button>
</div>
<!-- Reaksiyon emoji picker — action bar üstünde sabit -->
<div class="rx-picker" id="rxPicker">
  <button class="rx-emoji-btn" data-emoji="👏">👏</button>
  <button class="rx-emoji-btn" data-emoji="🔥">🔥</button>
  <button class="rx-emoji-btn" data-emoji="😂">😂</button>
  <button class="rx-emoji-btn" data-emoji="😮">😮</button>
  <button class="rx-emoji-btn" data-emoji="❤️">❤️</button>
  <button class="rx-emoji-btn" data-emoji="💯">💯</button>
  <button class="rx-emoji-btn" data-emoji="😡">😡</button>
  <button class="rx-emoji-btn" data-emoji="😢">😢</button>
</div>
<div id="chatPanel" class="chat-panel" hidden>
  <div class="cp-inner">
    <div class="cp-header"><span>Sohbet</span><button class="cp-clear" id="chatClear">Temizle</button><button class="cp-close" id="chatClose">✕</button></div>
    <div class="cp-msgs" id="cpMsgs"></div>
    <div class="cp-emoji" id="cpEmoji"></div>
    <div class="cp-row"><input class="cp-input" id="cpInput" type="text" maxlength="80" placeholder="Mesaj yaz…"><button class="primary cp-send" id="cpSend"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 2L11 13" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
  </div>
</div>

<!-- Slot makinesi şablonu -->
<aside id="slotMachine" class="slot-overlay" hidden>
    <div class="slot-box">
        <div class="reel-window"><div class="reel" id="reel"></div></div>
    </div>
</aside>

<script>
window.IS_ROOM = <?= json_encode($room) ?>;
window.IS_LETTERS = <?= json_encode(LETTERS, JSON_UNESCAPED_UNICODE) ?>;
</script>
<script src="assets/app.js?v=78"></script>
</body>
</html>
