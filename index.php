<?php require __DIR__ . '/lib.php'; ?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>İsim Şehir — Oyun Lobisi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&family=Russo+One&display=swap" rel="stylesheet">
<style>
:root {
  --primary: #7C3AED;
  --primary-light: #A78BFA;
  --cta: #F43F5E;
  --cta-hover: #E11D48;
  --bg: #0F0F23;
  --bg2: #16162a;
  --card: rgba(255,255,255,.04);
  --border: rgba(124,58,237,.35);
  --text: #E2E8F0;
  --muted: #94A3B8;
  --glow: 0 0 20px rgba(124,58,237,.5);
  --glow-cta: 0 0 24px rgba(244,63,94,.5);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Chakra Petch', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
  position: relative;
}

/* Animated background grid */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(124,58,237,.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(124,58,237,.06) 1px, transparent 1px);
  background-size: 48px 48px;
  animation: gridScroll 20s linear infinite;
  z-index: 0;
}

/* Radial glow blobs */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 600px 400px at 20% 50%, rgba(124,58,237,.15) 0%, transparent 70%),
    radial-gradient(ellipse 500px 350px at 80% 20%, rgba(244,63,94,.10) 0%, transparent 70%),
    radial-gradient(ellipse 400px 300px at 60% 80%, rgba(167,139,250,.08) 0%, transparent 70%);
  z-index: 0;
  pointer-events: none;
}

@keyframes gridScroll {
  0%   { transform: translateY(0); }
  100% { transform: translateY(48px); }
}

.lobby-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
}

/* Glowing orb decoration */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
}
.orb-1 { width: 200px; height: 200px; background: rgba(124,58,237,.3); top: -80px; right: -60px; }
.orb-2 { width: 150px; height: 150px; background: rgba(244,63,94,.2); bottom: -60px; left: -40px; }

/* Card */
.lobby-card {
  background: var(--card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 40px 36px 36px;
  box-shadow: 0 32px 80px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06);
  position: relative;
  overflow: hidden;
}

/* CRT scanlines overlay */
.lobby-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,0,0,.03) 2px,
    rgba(0,0,0,.03) 4px
  );
  pointer-events: none;
  z-index: 0;
  border-radius: 24px;
}

/* Top accent line */
.lobby-card::after {
  content: '';
  position: absolute;
  top: 0; left: 20%; right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--primary-light), transparent);
}

.card-content { position: relative; z-index: 1; }

/* Logo / Title */
.game-logo {
  text-align: center;
  margin-bottom: 32px;
}

.logo-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(124,58,237,.15);
  border: 1px solid rgba(124,58,237,.3);
  border-radius: 8px;
  padding: 4px 12px;
  font-size: .7rem;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--primary-light);
  text-transform: uppercase;
  margin-bottom: 14px;
}

.logo-badge svg { width: 10px; height: 10px; fill: var(--primary-light); }

.game-title {
  font-family: 'Russo One', sans-serif;
  font-size: 2.8rem;
  line-height: 1;
  background: linear-gradient(135deg, #fff 0%, var(--primary-light) 50%, var(--cta) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: none;
  letter-spacing: -1px;
  filter: drop-shadow(0 0 20px rgba(124,58,237,.4));
}

.game-sub {
  margin-top: 8px;
  color: var(--muted);
  font-size: .82rem;
  line-height: 1.5;
  font-weight: 300;
}

/* Divider */
.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}
.divider::before, .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
.divider span {
  font-size: .7rem;
  color: var(--muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

/* Form */
.field { margin-bottom: 16px; }

.field-label {
  display: block;
  font-size: .72rem;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--primary-light);
  margin-bottom: 8px;
}

.field-wrap {
  position: relative;
}

.field-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: var(--muted);
  pointer-events: none;
  transition: color .2s;
}

.field input {
  width: 100%;
  padding: 14px 16px 14px 44px;
  font-family: 'Chakra Petch', sans-serif;
  font-size: 1rem;
  font-weight: 500;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(124,58,237,.25);
  border-radius: 12px;
  color: var(--text);
  transition: border-color .2s, box-shadow .2s, background .2s;
  outline: none;
}

.field input::placeholder { color: rgba(148,163,184,.4); font-weight: 300; }
.field input:focus {
  border-color: var(--primary);
  background: rgba(124,58,237,.08);
  box-shadow: 0 0 0 3px rgba(124,58,237,.15), var(--glow);
}
.field input:focus + .field-icon,
.field-wrap:focus-within .field-icon { color: var(--primary-light); }

/* Submit button */
.join-btn {
  width: 100%;
  margin-top: 8px;
  padding: 16px;
  font-family: 'Russo One', sans-serif;
  font-size: 1rem;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #fff;
  background: linear-gradient(135deg, var(--primary) 0%, var(--cta) 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform .15s, box-shadow .2s, filter .2s;
  box-shadow: var(--glow-cta);
}

.join-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,.15) 0%, transparent 60%);
  opacity: 0;
  transition: opacity .2s;
}

.join-btn:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 0 32px rgba(244,63,94,.6); }
.join-btn:hover::before { opacity: 1; }
.join-btn:active { transform: translateY(0) scale(.98); }
.join-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }

/* Loading pulse in button */
.join-btn.loading {
  background: linear-gradient(135deg, #5b21b6, #9f1239);
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.7} }

/* Error */
.err-msg {
  min-height: 1.4em;
  margin-top: 10px;
  font-size: .82rem;
  color: #FCA5A5;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.err-msg:empty { display: none; }
.err-msg svg { flex-shrink: 0; }

/* Hint */
.hint-row {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,.06);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: .78rem;
  color: var(--muted);
  font-weight: 300;
}
.hint-row svg { flex-shrink: 0; color: var(--primary-light); }
.hint-row strong { color: var(--primary-light); font-weight: 600; }

/* Floating particles */
.particles {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.particle {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--primary-light);
  animation: floatParticle linear infinite;
  opacity: 0;
}
@keyframes floatParticle {
  0%   { transform: translateY(100vh) scale(0); opacity: 0; }
  10%  { opacity: .6; }
  90%  { opacity: .3; }
  100% { transform: translateY(-10vh) scale(1.5); opacity: 0; }
}

@media (max-width: 480px) {
  .lobby-card { padding: 30px 22px 28px; }
  .game-title { font-size: 2.2rem; }
}

@media (prefers-reduced-motion: reduce) {
  body::before, .particle { animation: none; }
  .join-btn { transition: none; }
}
</style>
</head>
<body>

<!-- Floating particles -->
<div class="particles" aria-hidden="true" id="particles"></div>

<div class="lobby-wrap">
  <div class="orb orb-1" aria-hidden="true"></div>
  <div class="orb orb-2" aria-hidden="true"></div>

  <div class="lobby-card">
    <div class="card-content">

      <div class="game-logo">
        <div class="logo-badge">
          <svg viewBox="0 0 10 10" aria-hidden="true"><polygon points="5,1 9,9 1,9"/></svg>
          Gizli Oda Oyunu
        </div>
        <h1 class="game-title">İsim&nbsp;Şehir</h1>
        <p class="game-sub">Bir oda numarası seç, arkadaşların da aynı numarayı girsin.<br>Odalar gizlidir.</p>
      </div>

      <div class="divider"><span>Lobiye Katıl</span></div>

      <form id="joinForm" autocomplete="off" novalidate>

        <div class="field">
          <label class="field-label" for="room">Oda Numarası</label>
          <div class="field-wrap">
            <input type="text" id="room" name="room" inputmode="numeric"
              placeholder="örn. 1516" maxlength="8" pattern="[0-9]+" required
              title="Sadece rakam giriniz" aria-label="Oda numarası">
            <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="name">Takma Adın</label>
          <div class="field-wrap">
            <input type="text" id="name" name="name"
              placeholder="örn. Ali" maxlength="24" required
              aria-label="Takma ad">
            <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </div>
        </div>

        <button type="submit" id="joinBtn" class="join-btn">Odaya Gir</button>

        <p class="err-msg" id="err" role="alert" aria-live="polite"></p>

        <div class="hint-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
          </svg>
          İlk giren kişi <strong>admin</strong> olur ve oyunu yönetir.
        </div>

      </form>
    </div>
  </div>
</div>

<script>
// Floating particles
(function() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const wrap = document.getElementById('particles');
  const colors = ['#A78BFA','#F43F5E','#7C3AED','#C4B5FD'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (8 + Math.random() * 12) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
    wrap.appendChild(p);
  }
})();

// Room: only digits
const roomInput = document.getElementById('room');
roomInput.addEventListener('input', () => {
  roomInput.value = roomInput.value.replace(/[^0-9]/g, '');
});

// Son kullanılan adı forma doldur
const nameInput = document.getElementById('name');
const lastSavedName = localStorage.getItem('is_last_name');
if (nameInput && lastSavedName && !nameInput.value) {
  nameInput.value = lastSavedName;
}

// Form submit
// Cihaz kimliği: ilk ziyarette üretilir, localStorage'da kalır
let deviceId = localStorage.getItem('is_device_id');
if (!deviceId) {
  deviceId = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem('is_device_id', deviceId);
}

const form = document.getElementById('joinForm');
const err  = document.getElementById('err');
const btn  = document.getElementById('joinBtn');

function setError(msg) {
  if (msg) {
    err.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' + msg;
  } else {
    err.textContent = '';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  const room = roomInput.value.trim();
  const name = document.getElementById('name').value.trim();
  if (!room) { setError('Oda numarası boş olamaz.'); return; }
  if (!name) { setError('Takma ad boş olamaz.'); return; }
  if (!/^\d+$/.test(room)) { setError('Oda numarası sadece rakam olmalıdır.'); return; }

  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = 'Bağlanıyor…';

  try {
    const res = await fetch('api.php?action=join', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({room, name, deviceId})
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Bir hata oluştu.');
    localStorage.setItem('is_token_' + room, data.token);
    localStorage.setItem('is_name_'  + room, name);
    localStorage.setItem('is_last_name', name);
    location.href = 'game.php?room=' + encodeURIComponent(room);
  } catch (ex) {
    setError(ex.message);
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = 'Odaya Gir';
  }
});
</script>
</body>
</html>
