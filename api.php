<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');

// Girdi: hem form-data hem JSON gövdesini destekle
$action = $_REQUEST['action'] ?? '';
$body = [];
$rawBody = file_get_contents('php://input');
if ($rawBody) {
    $decoded = json_decode($rawBody, true);
    if (is_array($decoded)) {
        $body = $decoded;
    }
}
function inp(string $key, $default = null)
{
    global $body;
    if (isset($_REQUEST[$key])) {
        return $_REQUEST[$key];
    }
    return $body[$key] ?? $default;
}

$room  = trim((string) inp('room', ''));
$token = (string) inp('token', '');

try {
    switch ($action) {
        case 'join':       handle_join($room); break;
        case 'state':      handle_state($room, $token); break;
        case 'start_slot': handle_admin_simple($room, $token, 'start_slot'); break;
        case 'spin':       handle_admin_simple($room, $token, 'spin'); break;
        case 'approve_letter': handle_admin_simple($room, $token, 'approve'); break;
        case 'skip_letter':    handle_admin_simple($room, $token, 'skip'); break;
        case 'save_answer':    handle_save_answer($room, $token); break;
        case 'end_round':      handle_admin_simple($room, $token, 'end_round'); break;
        case 'new_round':      handle_admin_simple($room, $token, 'new_round'); break;
        case 'new_game':       handle_admin_simple($room, $token, 'new_game'); break;
        case 'end_game':       handle_admin_simple($room, $token, 'end_game'); break;
        case 'to_lobby':       handle_admin_simple($room, $token, 'to_lobby'); break;
        case 'leave':          handle_leave($room, $token); break;
        case 'kick':           handle_kick($room, $token); break;
        case 'toggle_lock':    handle_toggle_lock($room, $token); break;
        case 'send_message':   handle_send_message($room, $token); break;
        case 'invalidate_answer': handle_invalidate($room, $token); break;
        case 'report_answer':     handle_report($room, $token); break;
        case 'start_finish':   handle_start_finish($room, $token); break;
        case 'penalty':        handle_penalty($room, $token); break;
        case 'webrtc_signal':  handle_webrtc_signal($room, $token); break;
        case 'voice_state':    handle_voice_state($room, $token); break;
        case 'set_typing':     handle_set_typing($room, $token); break;
        case 'send_reaction':  handle_send_reaction($room, $token); break;
        case 'set_extra_cats': handle_set_extra_cats($room, $token); break;
        default:
            json_out(['ok' => false, 'error' => 'Bilinmeyen işlem'], 400);
    }
} catch (Throwable $e) {
    json_out(['ok' => false, 'error' => 'Sunucu hatası: ' . $e->getMessage()], 500);
}

// ---- İşleyiciler ----

function handle_join(string $room): void
{
    $name = trim((string) inp('name', ''));
    if (!valid_room($room)) {
        json_out(['ok' => false, 'error' => 'Geçersiz oda numarası (1-32 harf/rakam).'], 400);
    }
    if ($name === '' || mb_strlen($name) > 24) {
        json_out(['ok' => false, 'error' => 'Geçerli bir takma ad girin (1-24 karakter).'], 400);
    }

    $deviceId = trim((string) inp('deviceId', ''));
    $myToken = gen_token();
    $result = with_room($room, true, function (array &$data) use ($name, $myToken, $deviceId) {
        $now = time();
        // Yasaklı isim kontrolü
        $banned = $data['banned'] ?? [];
        if (in_array($name, $banned, true)) {
            return ['banned' => true];
        }
        // Yasaklı cihaz ID kontrolü
        if ($deviceId !== '' && in_array($deviceId, $data['bannedDevices'] ?? [], true)) {
            return ['banned' => true];
        }
        // Kilitli oda kontrolü (odada oyuncu varsa kilitli olabilir)
        if (!empty($data['locked']) && !empty($data['players'])) {
            return ['locked' => true];
        }
        // Timeout olan oyuncuları join sırasında da temizle
        foreach ($data['players'] as $tok => $p) {
            $ls = $p['lastSeen'] ?? ($p['joinedAt'] ?? $now);
            if ($now - $ls > PLAYER_TIMEOUT) {
                unset($data['players'][$tok]);
            }
        }
        // Aynı isimle eski kayıt varsa temizle (yeniden giriş senaryosu)
        foreach ($data['players'] as $tok => $p) {
            if (($p['name'] ?? '') === $name) {
                unset($data['players'][$tok]);
            }
        }
        // Odada hiç oyuncu kalmamışsa odayı tamamen sıfırla
        if (empty($data['players'])) {
            $data['status']        = 'lobby';
            $data['adminToken']    = null;
            $data['currentLetter'] = null;
            $data['currentRound']  = null;
            $data['usedLetters']   = [];
            $data['rounds']        = [];
            $data['messages']      = [];
            $data['savedScores']   = [];
        }
        // Oyun başlamışsa kontrol et
        if (($data['status'] ?? 'lobby') !== 'lobby') {
            // Aktif (son 30 sn içinde görülmüş) oyuncu var mı?
            $hasActive = false;
            foreach ($data['players'] as $p) {
                if ($now - ($p['lastSeen'] ?? 0) <= 30) {
                    $hasActive = true;
                    break;
                }
            }
            if ($hasActive) {
                return ['blocked' => true];
            }
            // Aktif oyuncu yoksa odayı sıfırla
            $data['status']        = 'lobby';
            $data['adminToken']    = null;
            $data['currentLetter'] = null;
            $data['currentRound']  = null;
            $data['usedLetters']   = [];
            $data['rounds']        = [];
            $data['messages']      = [];
            $data['savedScores']   = [];
            $data['players']       = [];
        }
        // Oda kapasitesi kontrolü (max 10 oyuncu)
        if (count($data['players']) >= 10) {
            return ['full' => true];
        }
        $isAdmin = false;
        if (empty($data['adminToken'])) {
            $data['adminToken'] = $myToken;
            $isAdmin = true;
        }
        // Daha önce ayrılmış oyuncunun puanını geri yükle
        $savedScore = 0;
        $savedPenalty = 0;
        if (!empty($data['savedScores'][$name])) {
            $savedScore   = $data['savedScores'][$name]['score'] ?? 0;
            $savedPenalty = $data['savedScores'][$name]['penaltyTotal'] ?? 0;
            unset($data['savedScores'][$name]);
        }
        $data['players'][$myToken] = [
            'name'         => $name,
            'score'        => $savedScore,
            'penaltyTotal' => $savedPenalty,
            'joinedAt'     => time(),
            'lastSeen'     => time(),
            'pid'          => bin2hex(random_bytes(4)),
            'deviceId'     => $deviceId,
        ];
        return ['isAdmin' => $isAdmin];
    });

    if (!empty($result['blocked'])) {
        json_out(['ok' => false, 'error' => 'Bu odada oyun çoktan başlamış, şu an girilemez. Oyun bitince tekrar deneyin.'], 409);
    }
    if (!empty($result['full'])) {
        json_out(['ok' => false, 'error' => 'Bu oda dolu (maksimum 10 oyuncu). Başka bir oda deneyin.'], 409);
    }
    if (!empty($result['banned'])) {
        json_out(['ok' => false, 'error' => 'Bu odaya girişiniz admin tarafından engellendi.'], 403);
    }
    if (!empty($result['locked'])) {
        json_out(['ok' => false, 'error' => 'Bu oda kilitli, şu an yeni oyuncu kabul etmiyor.'], 403);
    }

    write_log('join', ['room' => $room, 'name' => $name, 'is_admin' => $result['isAdmin']]);
    json_out([
        'ok'      => true,
        'token'   => $myToken,
        'room'    => $room,
        'isAdmin' => $result['isAdmin'],
    ]);
}

function handle_state(string $room, string $token): void
{
    $res = with_room($room, false, function (array &$data) use ($token) {
        // Atılmış oyuncu kontrolü (players'dan silinmiş olabilir, kickedTokens'a bak)
        if (!empty($data['kickedTokens'][$token])) {
            unset($data['kickedTokens'][$token]);
            return ['kicked' => true];
        }
        if (isset($data['players'][$token]) && !empty($data['players'][$token]['kicked'])) {
            unset($data['players'][$token]);
            return ['kicked' => true];
        }
        // yoklama: bu oyuncunun "son görülme"si
        $awayPenalty = false;
        if (isset($data['players'][$token])) {
            $now = time();
            $lastSeen = $data['players'][$token]['lastSeen'] ?? $now;
            // Tur sırasında 6+ sn poll gelmediyse ceza (Safari sekme değiştirme tespiti)
            if (($data['status'] ?? '') === 'round' && ($now - $lastSeen) >= 10) {
                $data['players'][$token]['score']        = max(0, ($data['players'][$token]['score'] ?? 0) - 10);
                $data['players'][$token]['penaltyTotal'] = ($data['players'][$token]['penaltyTotal'] ?? 0) + 10;
                $awayPenalty = true;
            }
            $data['players'][$token]['lastSeen'] = $now;
        }
        // geri sayım dolduysa turu bitir
        if (($data['status'] ?? '') === 'round'
            && !empty($data['currentRound']['finishAt'])
            && time() >= $data['currentRound']['finishAt']) {
            finalize_round($data, false);
        }
        // admin/oyuncu yoklaması + gerekirse host devri
        reconcile_room($data);
        return ['state' => build_state($data, $token), 'awayPenalty' => $awayPenalty];
    });
    if ($res === null) {
        json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    }
    if (!empty($res['kicked'])) {
        json_out(['ok' => true, 'kicked' => true]);
        return;
    }
    json_out(['ok' => true, 'state' => $res['state'], 'awayPenalty' => $res['awayPenalty'] ?? false]);
}

// Sessiz oyuncuları düşür; admin yoksa/sessizse yetkiyi devret
function reconcile_room(array &$data): void
{
    $now = time();
    // uzun süredir görünmeyen oyuncuları çıkar, puanlarını sakla
    foreach ($data['players'] as $tok => $p) {

        $ls = $p['lastSeen'] ?? ($p['joinedAt'] ?? $now);
        if ($now - $ls > PLAYER_TIMEOUT) {
            // İsme göre puanı sakla (geri dönünce restore edilsin)
            $name = $p['name'] ?? '';
            if ($name !== '') {
                if (!isset($data['savedScores'])) $data['savedScores'] = [];
                $data['savedScores'][$name] = [
                    'score'        => $p['score'] ?? 0,
                    'penaltyTotal' => $p['penaltyTotal'] ?? 0,
                    'savedAt'      => $now,
                ];
            }
            unset($data['players'][$tok]);
        }
    }
    // admin geçerli mi? (var, listede ve son ADMIN_TIMEOUT içinde görülmüş)
    $adminTok = $data['adminToken'] ?? null;
    $adminOk = $adminTok
        && isset($data['players'][$adminTok])
        && ($now - ($data['players'][$adminTok]['lastSeen'] ?? 0) <= ADMIN_TIMEOUT);
    // Oyun aktif yazma aşamasında admin transferi yapma:
    // admin yalnızca turlar arası buton basıyor, o anki oyun etkilenmemeli.
    $isPlayingPhase = ($data['status'] ?? '') === 'playing';
    if (!$adminOk && !$isPlayingPhase && !empty($data['players'])) {
        $data['adminToken'] = pick_new_admin($data['players'], $now);
    }
}

// Yeni admin seç: önce "taze" olanlardan en eski katılan, yoksa genel en eski
function pick_new_admin(array $players, int $now): ?string
{
    $best = null; $bestJoin = PHP_INT_MAX;
    foreach ($players as $tok => $p) {
        if ($now - ($p['lastSeen'] ?? 0) <= ADMIN_TIMEOUT) {
            $j = $p['joinedAt'] ?? 0;
            if ($j < $bestJoin) { $bestJoin = $j; $best = $tok; }
        }
    }
    if ($best !== null) return $best;
    foreach ($players as $tok => $p) {
        $j = $p['joinedAt'] ?? 0;
        if ($j < $bestJoin) { $bestJoin = $j; $best = $tok; }
    }
    return $best;
}

// Tur puanlamasını yapan ortak fonksiyon. $gameover true ise oyun biter.
function finalize_round(array &$data, bool $gameover): bool
{
    if (($data['status'] ?? '') !== 'round' || empty($data['currentRound'])) {
        return false;
    }
    $letter    = $data['currentRound']['letter'];
    $answers   = $data['currentRound']['answers'] ?? [];
    $extraCats = $data['extraCats'] ?? [];
    $scores    = compute_scores($data['players'], $answers, $letter, [], $extraCats);
    foreach ($scores as $tok => $r) {
        if (isset($data['players'][$tok])) {
            $data['players'][$tok]['score'] += $r['points'];
        }
    }
    $data['rounds'][] = [
        'letter'    => $letter,
        'results'   => $scores,
        'penalties' => $data['currentRound']['penalties'] ?? [],
    ];
    $data['status'] = $gameover ? 'gameover' : 'results';
    $data['currentLetter'] = null;
    $data['currentRound'] = null;
    return true;
}

// Geri sayım dolduysa oyunu bitir
function maybe_finalize(string $room): void
{
    with_room($room, false, function (array &$data) {
        if (($data['status'] ?? '') !== 'round' || empty($data['currentRound']['finishAt'])) {
            return false;
        }
        if (time() < $data['currentRound']['finishAt']) {
            return false;
        }
        // sadece TURU bitir (oyun devam eder, sonuç ekranına geç)
        return finalize_round($data, false) ? ['ok' => true] : false;
    });
}

// Oyuncu tur sırasında ekrandan ayrılırsa 10 puan ceza
function handle_penalty(string $room, string $token): void
{
    with_room($room, false, function (array &$data) use ($token) {
        if (!isset($data['players'][$token])) return false;
        if (($data['status'] ?? '') !== 'round') return false; // sadece tur sırasında
        $data['players'][$token]['score'] -= 10;
        $data['players'][$token]['penaltyTotal'] = ($data['players'][$token]['penaltyTotal'] ?? 0) + 10;
        if (!isset($data['currentRound']['penalties'])) $data['currentRound']['penalties'] = [];
        $data['currentRound']['penalties'][$token] = ($data['currentRound']['penalties'][$token] ?? 0) + 10;
        return ['ok' => true];
    });
    json_out(['ok' => true]);
}

// Oyuncu tüm 6 kategoriyi doldurunca "Bitir" -> 10 sn geri sayım başlatır
function handle_start_finish(string $room, string $token): void
{
    $res = with_room($room, false, function (array &$data) use ($token) {
        if (!isset($data['players'][$token])) return false;
        if (($data['status'] ?? '') !== 'round' || empty($data['currentRound'])) return false;
        if (!empty($data['currentRound']['finishAt'])) return ['ok' => true]; // zaten başladı
        $ans = $data['currentRound']['answers'][$token] ?? [];
        $allCatKeys = array_merge(CATEGORIES, array_column($data['extraCats'] ?? [], 'key'));
        foreach ($allCatKeys as $c) {
            if (trim((string) ($ans[$c] ?? '')) === '') {
                return ['ok' => false, 'msg' => 'Önce tüm kategorileri doldur.'];
            }
        }
        $data['currentRound']['finishAt'] = time() + 15;
        $data['currentRound']['finishBy'] = $data['players'][$token]['name'];
        return ['ok' => true];
    });
    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    if ($res === false) json_out(['ok' => false, 'error' => 'Geçersiz işlem'], 400);
    json_out($res);
}

function handle_save_answer(string $room, string $token): void
{
    $category = (string) inp('category', '');
    $value    = (string) inp('value', '');
    // Standart kategori VEYA özel kategori (custom_... formatında) olmalı
    $isValid = in_array($category, CATEGORIES, true) || preg_match('/^custom_[a-zA-Z0-9_]+$/', $category);
    if (!$isValid) {
        json_out(['ok' => false, 'error' => 'Geçersiz kategori'], 400);
    }
    if (mb_strlen($value) > 60) {
        $value = mb_substr($value, 0, 60);
    }

    $res = with_room($room, false, function (array &$data) use ($token, $category, $value) {
        if (!isset($data['players'][$token])) {
            return false;
        }
        if ($data['status'] !== 'round' || empty($data['currentRound'])) {
            return false;
        }
        if (!isset($data['currentRound']['answers'][$token])) {
            $data['currentRound']['answers'][$token] = [];
        }
        $data['currentRound']['answers'][$token][$category] = $value;
        return ['saved' => true];
    });

    if ($res === null || $res === false) {
        json_out(['ok' => false, 'error' => 'Cevap kaydedilemedi'], 400);
    }
    json_out(['ok' => true]);
}

// Kısa baloncuk mesajı gönder.
function handle_send_message(string $room, string $token): void
{
    $text = trim((string) inp('text', ''));
    if ($text === '') {
        json_out(['ok' => false, 'error' => 'Boş mesaj'], 400);
    }
    if (mb_strlen($text) > 80) {
        $text = mb_substr($text, 0, 80);
    }

    $res = with_room($room, false, function (array &$data) use ($token, $text) {
        if (!isset($data['players'][$token])) {
            return false;
        }
        if (!isset($data['messages'])) $data['messages'] = [];
        if (!isset($data['msgSeq'])) $data['msgSeq'] = 0;
        $data['msgSeq']++;
        $data['messages'][] = [
            'id'   => $data['msgSeq'],
            'name' => $data['players'][$token]['name'],
            'text' => $text,
            'ts'   => time(),
        ];
        // sadece son 20 saniyeyi ve en çok 30 mesajı tut
        $cut = time() - 20;
        $data['messages'] = array_values(array_filter($data['messages'], fn($m) => $m['ts'] >= $cut));
        if (count($data['messages']) > 30) {
            $data['messages'] = array_slice($data['messages'], -30);
        }
        return ['ok' => true];
    });

    if ($res === null || $res === false) {
        json_out(['ok' => false, 'error' => 'Mesaj gönderilemedi'], 400);
    }
    json_out(['ok' => true]);
}

// Oyuncu başkasının cevabını bildirir (toggle: tekrar basınca geri alır).
function handle_report(string $room, string $token): void
{
    $pid      = (string) inp('pid', '');
    $category = (string) inp('category', '');
    $isValid  = in_array($category, CATEGORIES, true) || preg_match('/^custom_[a-zA-Z0-9_]+$/', $category);
    if (!$isValid) {
        json_out(['ok' => false, 'error' => 'Geçersiz kategori'], 400);
    }

    $res = with_room($room, false, function (array &$data) use ($token, $pid, $category) {
        if (!isset($data['players'][$token])) return false;
        if (($data['status'] ?? '') !== 'results' || empty($data['rounds'])) return false;

        $li = count($data['rounds']) - 1;
        $round = &$data['rounds'][$li];

        // pid -> token bul
        $target = null;
        foreach ($data['players'] as $tok => $p) {
            if (($p['pid'] ?? '') === $pid) { $target = $tok; break; }
        }
        if ($target === null || $target === $token) return false; // kendini bildiremez

        if (!isset($round['reports'])) $round['reports'] = [];
        if (!isset($round['reports'][$target])) $round['reports'][$target] = [];
        if (!isset($round['reports'][$target][$category])) $round['reports'][$target][$category] = [];

        $reporters = &$round['reports'][$target][$category];
        $idx = array_search($token, $reporters, true);
        if ($idx !== false) {
            array_splice($reporters, $idx, 1); // geri al
        } else {
            $reporters[] = $token; // bildir
        }
        return ['ok' => true];
    });

    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    if ($res === false) json_out(['ok' => false, 'error' => 'Geçersiz işlem'], 400);
    json_out($res);
}

// Admin sonuç ekranında bir cevabı iptal eder/geri alır (toggle) ve puanları yeniden hesaplar.
function handle_invalidate(string $room, string $token): void
{
    $pid = (string) inp('pid', '');
    $category = (string) inp('category', '');
    $isValid = in_array($category, CATEGORIES, true) || preg_match('/^custom_[a-zA-Z0-9_]+$/', $category);
    if (!$isValid) {
        json_out(['ok' => false, 'error' => 'Geçersiz kategori'], 400);
    }

    $res = with_room($room, false, function (array &$data) use ($token, $pid, $category) {
        if (($data['adminToken'] ?? null) !== $token) return false;
        if (empty($data['rounds'])) return false;

        $li = count($data['rounds']) - 1;
        $round = &$data['rounds'][$li];
        $letter = $round['letter'];

        // pid -> token
        $target = null;
        foreach ($data['players'] as $tok => $p) {
            if (($p['pid'] ?? '') === $pid) { $target = $tok; break; }
        }
        if ($target === null) return false;

        if (!isset($round['invalid'])) $round['invalid'] = [];
        $cur = !empty($round['invalid'][$target][$category]);
        if ($cur) {
            unset($round['invalid'][$target][$category]);
            if (empty($round['invalid'][$target])) unset($round['invalid'][$target]);
        } else {
            $round['invalid'][$target][$category] = true;
        }

        // cevapları sonuçlardan topla
        $answers = [];
        foreach ($round['results'] as $tk => $r) {
            $answers[$tk] = $r['answers'] ?? [];
        }
        // eski tur puanlarını kümülatiften düş
        foreach ($round['results'] as $tk => $r) {
            if (isset($data['players'][$tk])) $data['players'][$tk]['score'] -= ($r['points'] ?? 0);
        }
        // yeniden hesapla ve geri ekle
        $newRes = compute_scores($data['players'], $answers, $letter, $round['invalid'], $data['extraCats'] ?? []);
        foreach ($newRes as $tk => $r) {
            if (isset($data['players'][$tk])) $data['players'][$tk]['score'] += $r['points'];
        }
        $round['results'] = $newRes;
        return ['ok' => true];
    });

    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    if ($res === false) json_out(['ok' => false, 'error' => 'Yetkisiz veya geçersiz işlem'], 403);
    json_out($res);
}

// Oyuncu/admin çıkışı.
// Çıkan oyuncu listeden silinir. Eğer çıkan admin ise yetki kalan en eski
// oyuncuya devredilir; kimse kalmazsa oda silinir.
function handle_leave(string $room, string $token): void
{
    if (!valid_room($room)) {
        json_out(['ok' => true]);
    }
    $file = room_file($room);
    if (!is_file($file)) {
        json_out(['ok' => true, 'reset' => true]);
    }
    $fh = fopen($file, 'c+');
    if ($fh === false) {
        json_out(['ok' => true]);
    }
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) {
        flock($fh, LOCK_UN);
        fclose($fh);
        json_out(['ok' => true]);
    }

    $wasAdmin = (($data['adminToken'] ?? null) === $token);
    // Puanı savedScores'a kaydet (oyuncu geri dönerse restore edilsin)
    if (isset($data['players'][$token])) {
        $p = $data['players'][$token];
        if (($p['score'] ?? 0) > 0 || ($p['penaltyTotal'] ?? 0) > 0) {
            if (!isset($data['savedScores'])) $data['savedScores'] = [];
            $data['savedScores'][$p['name']] = [
                'score'        => $p['score'] ?? 0,
                'penaltyTotal' => $p['penaltyTotal'] ?? 0,
            ];
        }
    }
    unset($data['players'][$token]);

    if ($wasAdmin) {
        if (empty($data['players'])) {
            // kimse kalmadı -> odayı sil
            flock($fh, LOCK_UN);
            fclose($fh);
            @unlink($file);
            json_out(['ok' => true, 'reset' => true]);
        }
        // yetkiyi kalan en eski oyuncuya devret
        $data['adminToken'] = pick_new_admin($data['players'], time());
    }

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    json_out(['ok' => true]);
}

// Admin'in tek-buton aksiyonları
function handle_admin_simple(string $room, string $token, string $op): void
{
    $res = with_room($room, false, function (array &$data) use ($token, $op) {
        if (($data['adminToken'] ?? null) !== $token) {
            return false; // sadece admin
        }
        switch ($op) {
            case 'start_slot':
                $data['status'] = 'slot';
                $data['currentLetter'] = null;
                return ['ok' => true];

            case 'spin':
                if ($data['status'] !== 'slot') return false;
                $remaining = array_values(array_diff(LETTERS, $data['usedLetters']));
                if (count($remaining) === 0) {
                    return ['ok' => false, 'msg' => 'Tüm harfler kullanıldı'];
                }
                $data['currentLetter'] = $remaining[random_int(0, count($remaining) - 1)];
                return ['ok' => true, 'letter' => $data['currentLetter']];

            case 'approve':
                if ($data['status'] !== 'slot' || empty($data['currentLetter'])) return false;
                $letter = $data['currentLetter'];
                if (!in_array($letter, $data['usedLetters'], true)) {
                    $data['usedLetters'][] = $letter;
                }
                $data['status'] = 'round';
                $data['currentRound'] = ['letter' => $letter, 'answers' => []];
                return ['ok' => true];

            case 'skip':
                if ($data['status'] !== 'slot') return false;
                $remaining = array_values(array_diff(LETTERS, $data['usedLetters']));
                if (count($remaining) === 0) {
                    return ['ok' => false, 'msg' => 'Tüm harfler kullanıldı'];
                }
                $data['currentLetter'] = $remaining[random_int(0, count($remaining) - 1)];
                return ['ok' => true, 'letter' => $data['currentLetter']];

            case 'end_round':
                return finalize_round($data, false) ? ['ok' => true] : false;

            case 'new_round':
                $remaining = array_values(array_diff(LETTERS, $data['usedLetters']));
                if (count($remaining) === 0) {
                    return ['ok' => false, 'msg' => 'Tüm harfler bitti, oyun tamamlandı.'];
                }
                $data['status'] = 'slot';
                $data['currentLetter'] = null;
                $data['currentRound'] = null;
                return ['ok' => true];

            case 'to_lobby':
                // mevcut slot/turu iptal et, lobiye dön (çıkan oyuncular tekrar girebilir)
                $data['status'] = 'lobby';
                $data['currentLetter'] = null;
                $data['currentRound'] = null;
                return ['ok' => true];

            case 'end_game':
                // oyunu tamamen bitir -> final skor tablosu
                if (($data['status'] ?? '') === 'round') {
                    finalize_round($data, true); // açık turu puanla + gameover
                } else {
                    $data['status'] = 'gameover';
                    $data['currentLetter'] = null;
                    $data['currentRound'] = null;
                }
                return ['ok' => true];

            case 'new_game':
                // oyunu sıfırla, oyuncuları koru, skorları sıfırla
                foreach ($data['players'] as $tok => $p) {
                    $data['players'][$tok]['score'] = 0;
                    $data['players'][$tok]['penaltyTotal'] = 0;
                }
                $data['status'] = 'lobby';
                $data['usedLetters'] = [];
                $data['currentLetter'] = null;
                $data['currentRound'] = null;
                $data['rounds'] = [];
                $data['messages'] = [];
                $data['savedScores'] = [];
                return ['ok' => true];
        }
        return false;
    });

    if ($res === null) {
        json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    }
    if ($res === false) {
        json_out(['ok' => false, 'error' => 'Yetkisiz veya geçersiz işlem'], 403);
    }
    // Önemli admin aksiyonlarını logla
    if (!empty($res['ok'])) {
        $logActions = ['start_slot' => 'game_start', 'approve' => 'round_start', 'new_game' => 'new_game', 'end_game' => 'game_end'];
        if (isset($logActions[$op])) {
            write_log($logActions[$op], ['room' => $room]);
        }
    }
    json_out($res);
}

// ---- Durum oluşturucu (istemciye gönderilecek) ----
function build_state(array $data, string $token): array
{
    $isAdmin = (($data['adminToken'] ?? null) === $token);
    $remaining = count(array_values(array_diff(LETTERS, $data['usedLetters'])));

    // Oyuncu listesi (token gizlenir, isim + skor + ben mi)
    $players = [];
    foreach ($data['players'] as $tok => $p) {
        $players[] = [
            'name'    => $p['name'],
            'score'   => $p['score'],
            'isMe'    => ($tok === $token),
            'isAdmin' => ($tok === ($data['adminToken'] ?? null)),
            'tok'     => $isAdmin ? $tok : null, // admin kick için token
        ];
    }

    $state = [
        'room'          => $data['room'],
        'status'        => $data['status'],
        'isAdmin'       => $isAdmin,
        'isMember'      => isset($data['players'][$token]),
        'locked'        => !empty($data['locked']),
        'currentLetter' => $data['currentLetter'] ?? null,
        'usedLetters'   => $data['usedLetters'],
        'remaining'     => $remaining,
        'categories'    => array_merge(
            array_map(fn($c) => ['key' => $c, 'label' => CATEGORY_LABELS[$c]], CATEGORIES),
            $data['extraCats'] ?? []
        ),
        'playerCount'   => count($data['players']),
        'players'       => $players,
        'roundsPlayed'  => count($data['rounds'] ?? []),
        'reactions'     => array_values(array_filter($data['reactions'] ?? [], fn($r) => (time() - $r['ts']) <= 10)),
    ];

    // Tur sırasında: yalnızca KENDİ cevapların; başkalarının doldurma adedi
    if ($data['status'] === 'round' && !empty($data['currentRound'])) {
        $finishAt = $data['currentRound']['finishAt'] ?? null;
        $state['round'] = [
            'letter'    => $data['currentRound']['letter'],
            'myAnswers' => $data['currentRound']['answers'][$token] ?? [],
            'progress'  => [],
            'finishIn'  => $finishAt ? max(0, $finishAt - time()) : null,
            'finishBy'  => $data['currentRound']['finishBy'] ?? null,
        ];
        // ad => dolu kategori adedi
        $prog = [];
        foreach ($data['players'] as $tok => $p) {
            $ans = $data['currentRound']['answers'][$tok] ?? [];
            $allCatKeys = array_merge(CATEGORIES, array_column($data['extraCats'] ?? [], 'key'));
            $filled = 0;
            foreach ($allCatKeys as $c) {
                if (trim((string)($ans[$c] ?? '')) !== '') $filled++;
            }
            $prog[] = ['name' => $p['name'], 'filled' => $filled, 'total' => count($allCatKeys)];
        }
        $state['round']['progress'] = $prog;

        // Yazma göstergesi: başkalarının son 4sn içinde yazdığı kategori
        $now = time();
        $typing = [];
        foreach ($data['typing'] ?? [] as $tok => $t) {
            if ($tok === $token) continue;
            if (($now - ($t['ts'] ?? 0)) > 4) continue;
            $cat = $t['cat'] ?? '';
            if ($cat && isset($data['players'][$tok])) {
                if (!isset($typing[$cat])) $typing[$cat] = [];
                $typing[$cat][] = $data['players'][$tok]['name'];
            }
        }
        $state['round']['typing'] = $typing;
    }

    // Sonuç ekranı: son turun tüm cevapları + puanları (isim bazlı)
    if ($data['status'] === 'results' && !empty($data['rounds'])) {
        $last = $data['rounds'][count($data['rounds']) - 1];
        $inv = $last['invalid'] ?? [];
        $pens = $last['penalties'] ?? [];
        $reports = $last['reports'] ?? [];
        $rows = [];
        foreach ($last['results'] as $tok => $r) {
            $allCats = array_merge(CATEGORIES, array_column($data['extraCats'] ?? [], 'key'));
            $invRow = [];
            $repRow = [];
            foreach ($allCats as $c) {
                $invRow[$c] = !empty($inv[$tok][$c]);
                $repRow[$c] = count($reports[$tok][$c] ?? []);
            }
            $myReports = [];
            foreach ($allCats as $c) {
                $myReports[$c] = in_array($token, $reports[$tok][$c] ?? [], true);
            }
            $rows[] = [
                'name'      => $data['players'][$tok]['name'] ?? '—',
                'pid'       => $data['players'][$tok]['pid'] ?? '',
                'answers'   => $r['answers'],
                'breakdown' => $r['breakdown'],
                'invalid'   => $invRow,
                'reports'   => $repRow,
                'myReports' => $myReports,
                'points'    => $r['points'],
                'penalty'   => $pens[$tok] ?? 0,
            ];
        }
        // sıralama yok — admin iptal ettiğinde kartlar yerinde kalsın
        $state['results'] = [
            'letter' => $last['letter'],
            'rows'   => $rows,
        ];
    }

    // Genel skor tablosu (kümülatif), her durumda
    $board = [];
    foreach ($data['players'] as $tok => $p) {
        $board[] = ['name' => $p['name'], 'score' => $p['score'], 'penalty' => $p['penaltyTotal'] ?? 0];
    }
    usort($board, fn($a, $b) => $b['score'] <=> $a['score']);
    $state['scoreboard'] = $board;

    // Son baloncuk mesajları (son 20 sn)
    $cut = time() - 20;
    $msgs = array_values(array_filter($data['messages'] ?? [], fn($m) => ($m['ts'] ?? 0) >= $cut));
    $state['messages'] = $msgs;

    // Voice: bu oyuncuya ait sinyaller + herkesin mikrofon durumu
    $now2 = time();
    $cutVoice = $now2 - 30; // 30 sn'den eski sinyalleri gönderme
    $mySignals = [];
    foreach ($data['webrtcSignals'] ?? [] as $key => $sig) {
        // key: FROM__TO formatında; TO kısmı bu oyuncu mu?
        $parts = explode('__', $key, 2);
        if (count($parts) === 2 && $parts[1] === $token && ($sig['ts'] ?? 0) >= $cutVoice) {
            $mySignals[] = array_merge(['from' => $parts[0], 'key' => $key], $sig);
        }
    }
    $myIce = [];
    foreach ($data['iceQueue'] ?? [] as $key => $candidates) {
        $parts = explode('__', $key, 2);
        if (count($parts) === 2 && $parts[1] === $token) {
            foreach ($candidates as $c) {
                if (($c['ts'] ?? 0) >= $cutVoice) {
                    $myIce[] = array_merge(['from' => $parts[0], 'key' => $key], $c);
                }
            }
        }
    }
    // Diğer token'ların listesi (offer göndermek için)
    $otherTokens = array_keys(array_filter($data['players'], fn($p, $t) => $t !== $token, ARRAY_FILTER_USE_BOTH));
    $state['voice'] = [
        'signals'      => $mySignals,
        'ice'          => $myIce,
        'voiceState'   => $data['voiceState'] ?? [],
        'otherTokens'  => $otherTokens,
    ];

    return $state;
}

// Admin: oyuncuyu at ve yasakla
function handle_kick(string $room, string $token): void
{
    $targetTok = (string) inp('target', '');
    $res = with_room($room, false, function (array &$data) use ($token, $targetTok) {
        if (($data['adminToken'] ?? null) !== $token) return false;
        if (!isset($data['players'][$targetTok])) return false;
        if ($targetTok === $token) return false; // kendini atamazsın
        $name = $data['players'][$targetTok]['name'];
        // İsmi yasakla
        if (!isset($data['banned'])) $data['banned'] = [];
        if (!in_array($name, $data['banned'], true)) {
            $data['banned'][] = $name;
        }
        // Cihaz ID'sini yasakla
        $devId = $data['players'][$targetTok]['deviceId'] ?? '';
        if ($devId !== '') {
            if (!isset($data['bannedDevices'])) $data['bannedDevices'] = [];
            if (!in_array($devId, $data['bannedDevices'], true)) {
                $data['bannedDevices'][] = $devId;
            }
        }
        // Token'ı ayrı kickedTokens listesine ekle (players'dan silinse bile bildirim gidebilsin)
        if (!isset($data['kickedTokens'])) $data['kickedTokens'] = [];
        $data['kickedTokens'][$targetTok] = true;
        // players'dan hemen sil
        unset($data['players'][$targetTok]);
        return ['ok' => true, 'kicked' => $name];
    });
    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    if ($res === false) json_out(['ok' => false, 'error' => 'Yetkisiz işlem'], 403);
    json_out($res);
}

// Admin: odayı kilitle / kilidini aç
function handle_toggle_lock(string $room, string $token): void
{
    $res = with_room($room, false, function (array &$data) use ($token) {
        if (($data['adminToken'] ?? null) !== $token) return false;
        $data['locked'] = empty($data['locked']) ? true : false;
        return ['ok' => true, 'locked' => $data['locked']];
    });
    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    if ($res === false) json_out(['ok' => false, 'error' => 'Yetkisiz işlem'], 403);
    json_out($res);
}

// WebRTC sinyal deposu (offer / answer / ice)
function handle_webrtc_signal(string $room, string $token): void
{
    $to        = (string) inp('to', '');
    $type      = (string) inp('type', ''); // offer | answer | ice
    $sdp       = inp('sdp', null);
    $candidate = inp('candidate', null);

    $res = with_room($room, false, function (array &$data) use ($token, $to, $type, $sdp, $candidate) {
        if (!isset($data['players'][$token])) return false;
        if ($to !== '' && !isset($data['players'][$to])) return false;
        $now = time(); $cutoff = $now - 30;
        $key = $token . '__' . $to;

        if ($type === 'ice') {
            if (!isset($data['iceQueue'])) $data['iceQueue'] = [];
            if (!isset($data['iceQueue'][$key])) $data['iceQueue'][$key] = [];
            $data['iceQueue'][$key] = array_values(array_filter(
                $data['iceQueue'][$key], fn($c) => ($c['ts'] ?? 0) >= $cutoff
            ));
            $data['iceQueue'][$key][] = ['candidate' => $candidate, 'ts' => $now];
        } else {
            if (!isset($data['webrtcSignals'])) $data['webrtcSignals'] = [];
            $data['webrtcSignals'][$key] = ['type' => $type, 'sdp' => $sdp, 'ts' => $now];
        }
        // 30 sn eski sinyalleri temizle
        foreach (array_keys($data['webrtcSignals'] ?? []) as $k) {
            if (($data['webrtcSignals'][$k]['ts'] ?? 0) < $cutoff) unset($data['webrtcSignals'][$k]);
        }
        return ['ok' => true];
    });
    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    if ($res === false) json_out(['ok' => false, 'error' => 'Yetkisiz'], 403);
    json_out($res);
}

// Mikrofon durumu güncelle (active | muted | off)
function handle_voice_state(string $room, string $token): void
{
    $vstate = (string) inp('state', 'off');
    $res = with_room($room, false, function (array &$data) use ($token, $vstate) {
        if (!isset($data['players'][$token])) return false;
        if (!isset($data['voiceState'])) $data['voiceState'] = [];
        if ($vstate === 'off') {
            unset($data['voiceState'][$token]);
        } else {
            $data['voiceState'][$token] = $vstate;
        }
        return ['ok' => true];
    });
    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    if ($res === false) json_out(['ok' => false, 'error' => 'Yetkisiz'], 403);
    json_out($res ?? ['ok' => false]);
}

// Yazma göstergesi — kategori bazlı timestamp kaydeder
function handle_set_typing(string $room, string $token): void
{
    $cat = (string) inp('category', '');
    $res = with_room($room, false, function (array &$data) use ($token, $cat) {
        if (!isset($data['players'][$token])) return false;
        if (($data['status'] ?? '') !== 'round') return ['ok' => true];
        if (!isset($data['typing'])) $data['typing'] = [];
        if ($cat === '') {
            unset($data['typing'][$token]);
        } else {
            $data['typing'][$token] = ['cat' => $cat, 'ts' => time()];
        }
        return ['ok' => true];
    });
    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    json_out($res ?? ['ok' => false]);
}

// Emoji reaksiyon gönder
function handle_send_reaction(string $room, string $token): void
{
    $allowed = ['👏','🔥','😂','😮','❤️','💯','😡','😢'];
    $emoji = (string) inp('emoji', '');
    if (!in_array($emoji, $allowed, true)) json_out(['ok' => false, 'error' => 'Geçersiz emoji'], 400);
    $res = with_room($room, false, function (array &$data) use ($token, $emoji) {
        if (!isset($data['players'][$token])) return false;
        if (!isset($data['reactions'])) $data['reactions'] = [];
        $name = $data['players'][$token]['name'] ?? '';
        $id = uniqid('rx_', true);
        $data['reactions'][] = ['emoji' => $emoji, 'name' => $name, 'ts' => time(), 'id' => $id];
        // 10sn'den eski reaksiyonları temizle
        $now = time();
        $data['reactions'] = array_values(array_filter($data['reactions'], fn($r) => ($now - $r['ts']) <= 10));
        return ['ok' => true, 'id' => $id];
    });
    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    if ($res === false) json_out(['ok' => false, 'error' => 'Yetkisiz'], 403);
    json_out($res ?? ['ok' => false]);
}


// Özel kategori ekle/kaldır (sadece lobi, sadece admin, max 3)
function handle_set_extra_cats(string $room, string $token): void
{
    $cats = inp('cats', []);
    if (!is_array($cats)) json_out(['ok' => false, 'error' => 'Geçersiz veri'], 400);
    $res = with_room($room, false, function (array &$data) use ($token, $cats) {
        if (($data['adminToken'] ?? null) !== $token) return false;
        if (($data['status'] ?? '') !== 'lobby') return ['ok' => false, 'msg' => 'Sadece lobide değiştirilebilir'];
        $clean = [];
        foreach (array_slice($cats, 0, 3) as $c) {
            $label = mb_substr(trim((string)($c['label'] ?? '')), 0, 20, 'UTF-8');
            if ($label === '') continue;
            $key = 'custom_' . substr(md5($label), 0, 8);
            $clean[] = ['key' => $key, 'label' => $label];
        }
        $data['extraCats'] = $clean;
        return ['ok' => true];
    });
    if ($res === null) json_out(['ok' => false, 'error' => 'Oda bulunamadı'], 404);
    if ($res === false) json_out(['ok' => false, 'error' => 'Yetkisiz'], 403);
    json_out($res ?? ['ok' => false]);
}
