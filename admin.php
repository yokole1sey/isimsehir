<?php
declare(strict_types=1);
session_start();

const ADMIN_PASS = '368900+';
const LOGS_DIR   = __DIR__ . '/data/logs';

// Giriş / çıkış
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['logout'])) {
        $_SESSION = [];
        session_destroy();
        header('Location: admin.php');
        exit;
    }
    if (isset($_POST['password'])) {
        if ($_POST['password'] === ADMIN_PASS) {
            $_SESSION['admin'] = true;
        } else {
            $loginError = 'Şifre hatalı.';
        }
    }
}
$authed = !empty($_SESSION['admin']);

// ---- Log okuma ----
function read_logs(int $days = 30): array
{
    $entries = [];
    if (!is_dir(LOGS_DIR)) return $entries;
    for ($i = 0; $i < $days; $i++) {
        $date = date('Y-m-d', strtotime("-$i days"));
        $file = LOGS_DIR . "/$date.jsonl";
        if (!is_file($file)) continue;
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $e = json_decode($line, true);
            if (is_array($e)) { $e['date'] = $date; $entries[] = $e; }
        }
    }
    usort($entries, fn($a, $b) => ($b['ts'] ?? 0) <=> ($a['ts'] ?? 0));
    return $entries;
}

$logs = $authed ? read_logs(60) : [];

// Filtreler
$fAction  = $_GET['action']  ?? '';
$fDate    = $_GET['date']    ?? '';
$fRoom    = $_GET['room']    ?? '';
$fIP      = $_GET['ip']      ?? '';
$fDevice  = $_GET['device']  ?? '';
$fBrowser = $_GET['browser'] ?? '';

if ($authed) {
    $filtered = array_filter($logs, function($e) use ($fAction,$fDate,$fRoom,$fIP,$fDevice,$fBrowser) {
        if ($fAction  && ($e['action']  ?? '') !== $fAction) return false;
        if ($fDate    && ($e['date']    ?? '') !== $fDate)   return false;
        if ($fRoom    && ($e['room']    ?? '') !== $fRoom)   return false;
        if ($fIP      && ($e['ip']      ?? '') !== $fIP)     return false;
        if ($fBrowser && ($e['browser'] ?? '') !== $fBrowser) return false;
        if ($fDevice === 'mobile'  && empty($e['mobile']))   return false;
        if ($fDevice === 'desktop' && !empty($e['mobile']))  return false;
        return true;
    });
    $filtered = array_values($filtered);

    // Sayfalama
    $perPage   = 20;
    $totalRows = count($filtered);
    $totalPages = max(1, (int) ceil($totalRows / $perPage));
    $curPage   = max(1, min($totalPages, (int) ($_GET['p'] ?? 1)));
    $pageRows  = array_slice($filtered, ($curPage - 1) * $perPage, $perPage);

    // İstatistikler (filtre uygulanmadan tüm loglar üzerinden)
    $stats = [
        'total_join'       => count(array_filter($logs, fn($e) => ($e['action']??'') === 'join')),
        'unique_ip'        => count(array_unique(array_column($logs, 'ip'))),
        'game_starts'      => count(array_filter($logs, fn($e) => ($e['action']??'') === 'game_start')),
        'rounds'           => count(array_filter($logs, fn($e) => ($e['action']??'') === 'round_start')),
        'mobile_pct'       => 0,
    ];
    $joins = array_filter($logs, fn($e) => ($e['action']??'') === 'join');
    if (count($joins) > 0) {
        $stats['mobile_pct'] = round(count(array_filter($joins, fn($e) => !empty($e['mobile']))) / count($joins) * 100);
    }
    $uniqueDates = array_unique(array_column($logs, 'date'));
    $uniqueRooms = array_unique(array_filter(array_column($logs, 'room')));

    // ---- Havuz: oyuncu isimleri (loglardan) ----
    $nameCounts = [];
    $roomCounts = [];
    foreach ($logs as $e) {
        if (!empty($e['name'])) {
            $n = trim($e['name']);
            $nameCounts[$n] = ($nameCounts[$n] ?? 0) + 1;
        }
        if (!empty($e['room'])) {
            $r = trim($e['room']);
            $roomCounts[$r] = ($roomCounts[$r] ?? 0) + 1;
        }
    }
    arsort($nameCounts);
    arsort($roomCounts);

    // ---- Havuz: özel kategoriler (oda dosyalarından) ----
    $customCatCounts = [];
    $roomsDir = __DIR__ . '/data/rooms';
    if (is_dir($roomsDir)) {
        foreach (glob($roomsDir . '/*.json') as $f) {
            $rd = @json_decode(file_get_contents($f), true);
            foreach ($rd['extraCats'] ?? [] as $c) {
                $lbl = trim($c['label'] ?? '');
                if ($lbl !== '') $customCatCounts[$lbl] = ($customCatCounts[$lbl] ?? 0) + 1;
            }
            // Geçmiş turlardan da topla (başlıklar round'larda saklanmıyor ama results var)
        }
    }
    arsort($customCatCounts);
}

$actionLabels = [
    'join'        => 'Giriş',
    'game_start'  => 'Oyun Başlatma',
    'round_start' => 'Tur Başlatma',
    'new_game'    => 'Yeni Oyun',
    'game_end'    => 'Oyun Bitiş',
];
$actionColors = [
    'join'        => '#6366f1',
    'game_start'  => '#22c55e',
    'round_start' => '#f59e0b',
    'new_game'    => '#06b6d4',
    'game_end'    => '#ef4444',
];
?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin Panel — İsim Şehir</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0a1a; --card: rgba(255,255,255,.045); --line: rgba(255,255,255,.1);
  --text: #e8e8f0; --muted: #888aaa; --accent: #7c3aed; --green: #22c55e;
  --yellow: #f59e0b; --red: #ef4444; --blue: #6366f1; --cyan: #06b6d4;
}
body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; font-size: 14px; min-height: 100vh; }

/* Grid arka plan */
body::before {
  content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image: linear-gradient(rgba(124,58,237,.04) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(124,58,237,.04) 1px, transparent 1px);
  background-size: 32px 32px;
}

/* Login */
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; position: relative; z-index: 1; }
.login-box {
  background: var(--card); border: 1px solid var(--line); border-radius: 20px;
  padding: 48px 40px; width: 340px; text-align: center;
  backdrop-filter: blur(16px); box-shadow: 0 24px 80px rgba(0,0,0,.5);
}
.login-box h1 { font-size: 1.6rem; margin-bottom: 8px; letter-spacing: -.5px; }
.login-box p { color: var(--muted); margin-bottom: 28px; font-size: .85rem; }
.login-box input[type=password] {
  width: 100%; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--line);
  background: rgba(255,255,255,.06); color: var(--text); font-size: 1rem;
  margin-bottom: 14px; outline: none; transition: border-color .2s;
}
.login-box input:focus { border-color: var(--accent); }
.login-box button {
  width: 100%; padding: 12px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, var(--accent), #6d28d9); color: #fff;
  font-size: 1rem; font-weight: 600; cursor: pointer;
}
.error { color: var(--red); font-size: .82rem; margin-top: 10px; }

/* Layout */
.shell { position: relative; z-index: 1; display: flex; min-height: 100vh; }
.sidebar {
  width: 220px; flex-shrink: 0; background: rgba(0,0,0,.35); border-right: 1px solid var(--line);
  padding: 24px 16px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 0; height: 100vh;
}
.sidebar h2 { font-size: .7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; padding: 12px 8px 6px; }
.sidebar a {
  display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 10px;
  color: var(--muted); text-decoration: none; font-size: .9rem; transition: background .15s, color .15s;
}
.sidebar a:hover, .sidebar a.active { background: rgba(124,58,237,.2); color: var(--text); }
.sidebar .brand { font-size: 1.1rem; font-weight: 700; color: var(--text); padding: 8px 12px 20px; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
.sidebar form { margin-top: auto; }
.sidebar form button { width: 100%; padding: 9px; border-radius: 10px; border: 1px solid var(--line); background: rgba(255,255,255,.05); color: var(--muted); cursor: pointer; font-size: .85rem; }
.sidebar form button:hover { background: rgba(255,255,255,.1); color: var(--text); }

.main { flex: 1; padding: 32px; overflow-x: auto; }
.page-title { font-size: 1.6rem; font-weight: 700; margin-bottom: 6px; }
.page-sub { color: var(--muted); font-size: .85rem; margin-bottom: 28px; }

/* Stat kartları */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; margin-bottom: 32px; }
.stat-card {
  background: var(--card); border: 1px solid var(--line); border-radius: 16px;
  padding: 20px; backdrop-filter: blur(10px);
}
.stat-card .label { font-size: .75rem; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px; }
.stat-card .value { font-size: 2rem; font-weight: 800; line-height: 1; }
.stat-card .sub { font-size: .78rem; color: var(--muted); margin-top: 6px; }
.stat-card.accent .value { color: var(--accent); }
.stat-card.green  .value { color: var(--green); }
.stat-card.yellow .value { color: var(--yellow); }
.stat-card.blue   .value { color: var(--blue); }
.stat-card.cyan   .value { color: var(--cyan); }

/* Filtreler */
.filters {
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  padding: 16px 20px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;
}
.filter-group { display: flex; flex-direction: column; gap: 4px; min-width: 130px; }
.filter-group label { font-size: .72rem; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }
.filter-group select, .filter-group input {
  padding: 7px 10px; border-radius: 8px; border: 1px solid var(--line);
  background: #1e1535; color: var(--text); font-size: .85rem; outline: none;
}
.filter-group select option { background: #1e1535; color: var(--text); }
.filter-group select:focus, .filter-group input:focus { border-color: var(--accent); }
.filter-actions { display: flex; gap: 8px; align-items: flex-end; }
.btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: .85rem; font-weight: 500; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-ghost { background: rgba(255,255,255,.07); color: var(--text); border: 1px solid var(--line); }
.btn:hover { filter: brightness(1.15); }

/* Tablo */
.table-wrap {
  background: var(--card); border: 1px solid var(--line); border-radius: 16px;
  overflow: hidden; backdrop-filter: blur(10px);
}
.table-header { padding: 16px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; }
.table-header h3 { font-size: 1rem; font-weight: 600; }
.table-count { font-size: .8rem; color: var(--muted); }
.pagination { display: flex; align-items: center; gap: 4px; padding: 14px 20px; flex-wrap: wrap; }
.pg-btn { padding: 5px 10px; border-radius: 8px; background: rgba(255,255,255,.06); color: var(--text); text-decoration: none; font-size: .85rem; border: 1px solid var(--line); transition: background .15s; }
.pg-btn:hover { background: rgba(124,58,237,.25); }
.pg-btn.pg-active { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 700; pointer-events: none; }
.pg-gap { color: var(--muted); font-size: .85rem; padding: 0 4px; }
.pg-info { margin-left: auto; font-size: .78rem; color: var(--muted); }
/* Havuz */
.pool-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
@media(max-width:1000px) { .pool-grid { grid-template-columns: 1fr 1fr; } }
@media(max-width:640px)  { .pool-grid { grid-template-columns: 1fr; } }
.pool-card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
.pool-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.pool-title { font-weight: 600; font-size: .95rem; }
.pool-count { font-size: .78rem; color: var(--muted); white-space: nowrap; margin-left: 8px; }
.pool-search-wrap { padding: 10px 12px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.pool-search { width: 100%; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--line); background: rgba(255,255,255,.06); color: var(--text); font-size: .85rem; outline: none; box-sizing: border-box; }
.pool-search:focus { border-color: var(--accent); }
.pool-body { flex: 1; max-height: 420px; overflow-y: auto; padding: 6px 0; }
.pool-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 18px; transition: background .12s; }
.pool-item:hover { background: rgba(255,255,255,.04); }
.pool-label { font-size: .88rem; }
.pool-badge { font-size: .75rem; color: var(--muted); background: rgba(255,255,255,.07); border-radius: 20px; padding: 2px 9px; flex-shrink: 0; margin-left: 8px; }
.pool-empty { padding: 32px 18px; color: var(--muted); font-size: .85rem; text-align: center; }
table { width: 100%; border-collapse: collapse; }
th {
  padding: 11px 14px; text-align: left; font-size: .72rem; color: var(--muted);
  text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
td { padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,.04); font-size: .85rem; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(255,255,255,.025); }

.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 20px; font-size: .72rem; font-weight: 600; white-space: nowrap;
}
.device-badge { font-size: .7rem; padding: 2px 7px; border-radius: 6px; }
.mobile-badge  { background: rgba(34,197,94,.15); color: #4ade80; }
.desktop-badge { background: rgba(99,102,241,.15); color: #818cf8; }

.ip-cell { font-family: monospace; font-size: .8rem; color: var(--muted); }
.name-cell { font-weight: 600; }
.room-cell { font-family: monospace; background: rgba(124,58,237,.15); color: #c4b5fd; padding: 2px 8px; border-radius: 6px; font-size: .8rem; }
.time-cell { color: var(--muted); font-size: .8rem; white-space: nowrap; }

.empty-state { text-align: center; padding: 60px 20px; color: var(--muted); }
.empty-state .icon { font-size: 3rem; margin-bottom: 12px; opacity: .4; }

/* Responsive */
@media (max-width: 700px) {
  .sidebar { display: none; }
  .main { padding: 16px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  th.hide-mobile, td.hide-mobile { display: none; }
}
</style>
</head>
<body>

<?php if (!$authed): ?>
<div class="login-wrap">
  <div class="login-box">
    <h1>🎮 Admin Panel</h1>
    <p>İsim Şehir yönetim paneline giriş yapın</p>
    <form method="post">
      <input type="password" name="password" placeholder="Şifre" autofocus autocomplete="current-password">
      <button type="submit">Giriş Yap</button>
      <?php if (isset($loginError)): ?>
        <p class="error"><?= htmlspecialchars($loginError) ?></p>
      <?php endif; ?>
    </form>
  </div>
</div>
<?php else: ?>

<div class="shell">
  <?php $tab = $_GET['tab'] ?? 'dashboard'; ?>
  <aside class="sidebar">
    <div class="brand">🎮 İsim Şehir</div>
    <h2>Menü</h2>
    <a href="admin.php?tab=dashboard" class="<?= $tab==='dashboard'?'active':'' ?>">📊 Dashboard</a>
    <a href="admin.php?tab=pool" class="<?= $tab==='pool'?'active':'' ?>">🗂️ Havuz</a>
    <a href="index.php" target="_blank">🎲 Oyuna Git</a>
    <form method="post" style="margin-top: auto; padding-top: 20px;">
      <button type="submit" name="logout">Çıkış Yap</button>
    </form>
  </aside>

  <main class="main">
<?php if ($tab === 'pool'): ?>
    <div class="page-title">Havuz</div>
    <div class="page-sub">Loglardan toplanan oyuncu isimleri ve özel kategoriler</div>

    <div class="pool-grid">

      <!-- Oyuncu İsimleri -->
      <div class="pool-card">
        <div class="pool-header">
          <span class="pool-title">&#128100; Oyuncu İsimleri</span>
          <span class="pool-count"><?= count($nameCounts) ?> farklı isim</span>
        </div>
        <div class="pool-search-wrap">
          <input class="pool-search" type="text" placeholder="Ara…" oninput="poolFilter('pool0', this.value)">
        </div>
        <div class="pool-body" id="pool0">
          <?php if (empty($nameCounts)): ?>
            <div class="pool-empty">Henüz kayıt yok</div>
          <?php else: foreach ($nameCounts as $val => $cnt): ?>
            <div class="pool-item" data-val="<?= htmlspecialchars(mb_strtolower((string)$val)) ?>">
              <span class="pool-label"><?= htmlspecialchars((string)$val) ?></span>
              <span class="pool-badge"><?= (int)$cnt ?>x</span>
            </div>
          <?php endforeach; endif; ?>
        </div>
      </div>

      <!-- Özel Kategoriler -->
      <div class="pool-card">
        <div class="pool-header">
          <span class="pool-title">&#128193; Özel Kategoriler</span>
          <span class="pool-count"><?= count($customCatCounts) ?> farklı kategori</span>
        </div>
        <div class="pool-search-wrap">
          <input class="pool-search" type="text" placeholder="Ara…" oninput="poolFilter('pool1', this.value)">
        </div>
        <div class="pool-body" id="pool1">
          <?php if (empty($customCatCounts)): ?>
            <div class="pool-empty">Henüz özel kategori eklenmedi</div>
          <?php else: foreach ($customCatCounts as $val => $cnt): ?>
            <div class="pool-item" data-val="<?= htmlspecialchars(mb_strtolower((string)$val)) ?>">
              <span class="pool-label"><?= htmlspecialchars((string)$val) ?></span>
              <span class="pool-badge"><?= (int)$cnt ?>x</span>
            </div>
          <?php endforeach; endif; ?>
        </div>
      </div>

      <!-- Oda Numaraları -->
      <div class="pool-card">
        <div class="pool-header">
          <span class="pool-title">&#128682; Oda Numaraları</span>
          <span class="pool-count"><?= count($roomCounts) ?> farklı oda</span>
        </div>
        <div class="pool-search-wrap">
          <input class="pool-search" type="text" placeholder="Ara…" oninput="poolFilter('pool2', this.value)">
        </div>
        <div class="pool-body" id="pool2">
          <?php if (empty($roomCounts)): ?>
            <div class="pool-empty">Henüz kayıt yok</div>
          <?php else: foreach ($roomCounts as $val => $cnt): ?>
            <div class="pool-item" data-val="<?= htmlspecialchars(mb_strtolower((string)$val)) ?>">
              <span class="pool-label"><?= htmlspecialchars((string)$val) ?></span>
              <span class="pool-badge"><?= (int)$cnt ?>x</span>
            </div>
          <?php endforeach; endif; ?>
        </div>
      </div>

    </div>
    <script>
    function poolFilter(id, q) {
      const q2 = q.toLowerCase().trim();
      document.querySelectorAll('#' + id + ' .pool-item').forEach(function(el) {
        el.style.display = (!q2 || el.dataset.val.includes(q2)) ? '' : 'none';
      });
    }
    </script>

<?php else: ?>
    <div class="page-title">Dashboard</div>
    <div class="page-sub">Son 60 günlük aktivite — <?= count($logs) ?> toplam kayıt</div>

    <!-- İstatistik Kartları -->
    <div class="stats-grid">
      <div class="stat-card accent">
        <div class="label">Toplam Giriş</div>
        <div class="value"><?= $stats['total_join'] ?></div>
        <div class="sub"><?= count($uniqueDates) ?> farklı günde</div>
      </div>
      <div class="stat-card blue">
        <div class="label">Tekil IP</div>
        <div class="value"><?= $stats['unique_ip'] ?></div>
        <div class="sub">farklı kullanıcı</div>
      </div>
      <div class="stat-card green">
        <div class="label">Oyun Başlatma</div>
        <div class="value"><?= $stats['game_starts'] ?></div>
        <div class="sub"><?= count($uniqueRooms) ?> farklı oda</div>
      </div>
      <div class="stat-card yellow">
        <div class="label">Tur Sayısı</div>
        <div class="value"><?= $stats['rounds'] ?></div>
        <div class="sub">toplam oynanan tur</div>
      </div>
      <div class="stat-card cyan">
        <div class="label">Mobil Oranı</div>
        <div class="value">%<?= $stats['mobile_pct'] ?></div>
        <div class="sub">girişlerin mobil</div>
      </div>
    </div>

    <!-- Filtreler -->
    <form method="get" class="filters">
      <div class="filter-group">
        <label>Aksiyon</label>
        <select name="action">
          <option value="">Tümü</option>
          <?php foreach ($actionLabels as $k => $v): ?>
            <option value="<?= $k ?>" <?= $fAction === $k ? 'selected' : '' ?>><?= $v ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="filter-group">
        <label>Tarih</label>
        <input type="date" name="date" value="<?= htmlspecialchars($fDate) ?>">
      </div>
      <div class="filter-group">
        <label>Oda</label>
        <input type="text" name="room" placeholder="örn: 1234" value="<?= htmlspecialchars($fRoom) ?>" style="width:100px">
      </div>
      <div class="filter-group">
        <label>IP Adresi</label>
        <input type="text" name="ip" placeholder="örn: 1.2.3.4" value="<?= htmlspecialchars($fIP) ?>" style="width:130px">
      </div>
      <div class="filter-group">
        <label>Cihaz</label>
        <select name="device">
          <option value="">Tümü</option>
          <option value="mobile"  <?= $fDevice === 'mobile'  ? 'selected' : '' ?>>Mobil</option>
          <option value="desktop" <?= $fDevice === 'desktop' ? 'selected' : '' ?>>Masaüstü</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Tarayıcı</label>
        <select name="browser">
          <option value="">Tümü</option>
          <?php foreach (['Chrome','Safari','Firefox','Edge','Opera','Diğer'] as $b): ?>
            <option value="<?= $b ?>" <?= $fBrowser === $b ? 'selected' : '' ?>><?= $b ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="filter-actions">
        <button type="submit" class="btn btn-primary">Filtrele</button>
        <a href="admin.php" class="btn btn-ghost">Temizle</a>
      </div>
    </form>

    <!-- Log Tablosu -->
    <div class="table-wrap">
      <div class="table-header">
        <h3>Aktivite Logu</h3>
        <span class="table-count"><?= $totalRows ?> kayıt</span>
      </div>
      <?php if (empty($filtered)): ?>
        <div class="empty-state">
          <div class="icon">📭</div>
          <div>Kayıt bulunamadı</div>
        </div>
      <?php else: ?>
      <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Zaman</th>
            <th>Aksiyon</th>
            <th class="hide-mobile">Oyuncu</th>
            <th class="hide-mobile">Oda</th>
            <th>IP</th>
            <th>Tarayıcı</th>
            <th>İşletim S.</th>
            <th>Cihaz</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($pageRows as $e): ?>
          <tr>
            <td class="time-cell">
              <?= date('d.m.Y', $e['ts']) ?><br>
              <span style="font-size:.72rem"><?= date('H:i:s', $e['ts']) ?></span>
            </td>
            <td>
              <?php
                $action = $e['action'] ?? '';
                $color  = $actionColors[$action] ?? '#888';
                $label  = $actionLabels[$action] ?? $action;
              ?>
              <span class="badge" style="background:<?= $color ?>22;color:<?= $color ?>">
                <?= htmlspecialchars($label) ?>
              </span>
            </td>
            <td class="hide-mobile name-cell"><?= htmlspecialchars($e['name'] ?? '—') ?></td>
            <td class="hide-mobile">
              <?php if (!empty($e['room'])): ?>
                <span class="room-cell"><?= htmlspecialchars($e['room']) ?></span>
              <?php else: echo '—'; endif; ?>
            </td>
            <td class="ip-cell"><?= htmlspecialchars($e['ip'] ?? '—') ?></td>
            <td><?= htmlspecialchars($e['browser'] ?? '—') ?></td>
            <td><?= htmlspecialchars($e['os'] ?? '—') ?></td>
            <td>
              <?php if (!empty($e['mobile'])): ?>
                <span class="badge device-badge mobile-badge">📱 Mobil</span>
              <?php else: ?>
                <span class="badge device-badge desktop-badge">🖥️ Masaüstü</span>
              <?php endif; ?>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
      </div>
      <?php if ($totalPages > 1):
        // Mevcut filtreleri koru, sadece p değiştir
        $qBase = array_filter(['action'=>$fAction,'date'=>$fDate,'room'=>$fRoom,'ip'=>$fIP,'device'=>$fDevice,'browser'=>$fBrowser]);
        $pageUrl = fn($p) => '?' . http_build_query(array_merge(['tab'=>'dashboard'], $qBase, ['p' => $p]));
        $start = max(1, $curPage - 2);
        $end   = min($totalPages, $curPage + 2);
      ?>
      <div class="pagination">
        <?php if ($curPage > 1): ?>
          <a href="<?= $pageUrl(1) ?>" class="pg-btn">«</a>
          <a href="<?= $pageUrl($curPage - 1) ?>" class="pg-btn">‹</a>
        <?php endif; ?>
        <?php if ($start > 1): ?><span class="pg-gap">…</span><?php endif; ?>
        <?php for ($i = $start; $i <= $end; $i++): ?>
          <a href="<?= $pageUrl($i) ?>" class="pg-btn<?= $i === $curPage ? ' pg-active' : '' ?>"><?= $i ?></a>
        <?php endfor; ?>
        <?php if ($end < $totalPages): ?><span class="pg-gap">…</span><?php endif; ?>
        <?php if ($curPage < $totalPages): ?>
          <a href="<?= $pageUrl($curPage + 1) ?>" class="pg-btn">›</a>
          <a href="<?= $pageUrl($totalPages) ?>" class="pg-btn">»</a>
        <?php endif; ?>
        <span class="pg-info"><?= $curPage ?> / <?= $totalPages ?> sayfa · <?= (($curPage-1)*$perPage+1) ?>–<?= min($curPage*$perPage,$totalRows) ?> / <?= $totalRows ?></span>
      </div>
      <?php endif; ?>
      <?php endif; ?>
    </div>
<?php endif; // tab ?>
  </main>
</div>

<?php endif; ?>
</body>
</html>
