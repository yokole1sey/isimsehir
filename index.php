<?php require __DIR__ . '/lib.php'; ?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>İsim Şehir — Gizli Oda</title>
<link rel="stylesheet" href="assets/style.css?v=11">
</head>
<body class="enter-page">
<div class="enter-card">
    <h1>İsim&nbsp;Şehir</h1>
    <p class="subtitle">Bir oda numarası seç, arkadaşların da aynı numarayı girsin. Odalar gizlidir.</p>

    <form id="joinForm" autocomplete="off">
        <label>Oda Numarası
            <input type="text" id="room" name="room" inputmode="numeric" placeholder="örn. 1516" maxlength="32" required>
        </label>
        <label>Takma Adın
            <input type="text" id="name" name="name" placeholder="örn. Ali" maxlength="24" required>
        </label>
        <button type="submit" id="joinBtn">Odaya Gir</button>
        <p class="err" id="err"></p>
        <p class="hint">İlk giren kişi <strong>admin</strong> olur ve oyunu yönetir.</p>
    </form>
</div>

<script>
const form = document.getElementById('joinForm');
const err = document.getElementById('err');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const room = document.getElementById('room').value.trim();
    const name = document.getElementById('name').value.trim();
    if (!room || !name) return;
    const btn = document.getElementById('joinBtn');
    btn.disabled = true; btn.textContent = 'Giriliyor…';
    try {
        const res = await fetch('api.php?action=join', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({room, name})
        });
        const data = await res.json();
        if (!data.ok) { throw new Error(data.error || 'Hata'); }
        // oturum bilgisi sakla
        localStorage.setItem('is_token_' + room, data.token);
        localStorage.setItem('is_name_' + room, name);
        location.href = 'game.php?room=' + encodeURIComponent(room);
    } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = 'Odaya Gir';
    }
});
</script>
</body>
</html>
