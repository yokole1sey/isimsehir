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
<link rel="stylesheet" href="assets/style.css?v=11">
</head>
<body>
<header class="topbar">
    <div class="room-badge">Oda <span><?= htmlspecialchars($room) ?></span></div>
    <div id="meInfo" class="me-info"></div>
    <a href="index.php" class="leave" id="leaveBtn">Çıkış</a>
</header>

<main id="app" class="app">
    <div class="loading">Yükleniyor…</div>
</main>

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
<script src="assets/app.js?v=16"></script>
</body>
</html>
