<?php
// İsim Şehir - ortak yardımcı fonksiyonlar
declare(strict_types=1);

mb_internal_encoding('UTF-8');

// Admin bu kadar saniye sessiz kalırsa yetki devredilir; oyuncu bu kadar
// sessiz kalırsa listeden düşürülür.
const ADMIN_TIMEOUT = 60;
const PLAYER_TIMEOUT = 300; // 5 dakika

const CATEGORIES = ['isim', 'sehir', 'bitki', 'hayvan', 'esya', 'artist'];
const CATEGORY_LABELS = [
    'isim'   => 'İsim',
    'sehir'  => 'Şehir',
    'bitki'  => 'Bitki',
    'hayvan' => 'Hayvan',
    'esya'   => 'Eşya',
    'artist' => 'Artist',
];

// Çekilebilir harfler (22). Ğ, J ve Ç havuzda yok; eş çiftlerde tek harf tutulur:
// I (İ ile), O (Ö ile), S (Ş ile), U (Ü ile), C (Ç ile) -> ikisi de geçerli sayılır.
const LETTERS = ['A','B','C','D','E','F','G','H','I','K','L','M','N','O','P','R','S','T','U','V','Y','Z'];

// Eşleştirmede aynı sayılan harfler (büyük harf): noktalı/şapkalı varyantları
// sade karşılığına indirger. Böylece "S" çekilince "Ş..." de, "C" çekilince "Ç..." de geçerli olur.
function fold_letter(string $ch): string
{
    $map = ['İ' => 'I', 'Ş' => 'S', 'Ü' => 'U', 'Ö' => 'O', 'Ç' => 'C'];
    return $map[$ch] ?? $ch;
}

// Cevap kıyas anahtarı: tüm karakterleri fold'lar (İ=I, Ç=C, Ş=S, Ü=U, Ö=O).
// Böylece "Isparta" ile "İsparta" ya da "Corum" ile "Çorum" AYNI cevap sayılır.
function answer_key(string $norm): string
{
    $out = '';
    $len = mb_strlen($norm, 'UTF-8');
    for ($i = 0; $i < $len; $i++) {
        $out .= fold_letter(mb_substr($norm, $i, 1, 'UTF-8'));
    }
    return $out;
}

function data_dir(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'rooms';
}

function ensure_data_dir(): void
{
    $dir = data_dir();
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
}

// Oda numarasını güvenli dosya adına çevir (sadece harf/rakam)
function room_file(string $room): string
{
    $safe = preg_replace('/[^A-Za-z0-9_-]/', '', $room);
    return data_dir() . DIRECTORY_SEPARATOR . $safe . '.json';
}

function valid_room(string $room): bool
{
    return (bool) preg_match('/^[A-Za-z0-9_-]{1,32}$/', $room);
}

// Türkçe duyarlı büyük harf
function tr_upper(string $s): string
{
    $map = ['i' => 'İ', 'ı' => 'I', 'ş' => 'Ş', 'ğ' => 'Ğ', 'ç' => 'Ç', 'ö' => 'Ö', 'ü' => 'Ü'];
    $s = strtr($s, $map);
    return mb_strtoupper($s, 'UTF-8');
}

// Cevap karşılaştırması için normalize (büyük harf + trim + iç boşluk sadeleştir)
function normalize_answer(string $s): string
{
    $s = trim($s);
    $s = preg_replace('/\s+/u', ' ', $s);
    return tr_upper($s);
}

function gen_token(): string
{
    return bin2hex(random_bytes(16));
}

// Odayı kilitli okuyup, callback ile değiştirip kaydeden yardımcı.
// $fn(array &$data) içinde oda değiştirilir; callback'in döndürdüğü değer caller'a iletilir.
// Dosya yoksa: $createIfMissing true ise yeni oda kurulur, değilse null döner ve callback çağrılmaz.
// Callback false döndürürse değişiklik kaydedilmez (örn. doğrulama hatası).
function with_room(string $room, bool $createIfMissing, callable $fn)
{
    ensure_data_dir();
    $file = room_file($room);
    $exists = is_file($file);
    if (!$exists && !$createIfMissing) {
        return null;
    }
    $fh = fopen($file, 'c+');
    if ($fh === false) {
        throw new RuntimeException('Oda dosyası açılamadı');
    }
    try {
        flock($fh, LOCK_EX);
        $raw = stream_get_contents($fh);
        $data = ($raw !== false && $raw !== '') ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            if (!$createIfMissing) {
                return null;
            }
            $data = new_room_struct($room);
            // players'ı diziye çevir (struct'ta stdClass)
            $data['players'] = [];
        }
        $result = $fn($data);
        if ($result !== false) {
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            fflush($fh);
        }
        return $result;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

// Sadece okuma (kilit paylaşımlı)
function read_room(string $room): ?array
{
    $file = room_file($room);
    if (!is_file($file)) {
        return null;
    }
    $fh = fopen($file, 'r');
    if ($fh === false) {
        return null;
    }
    try {
        flock($fh, LOCK_SH);
        $raw = stream_get_contents($fh);
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
    if ($raw === false || $raw === '') {
        return null;
    }
    return json_decode($raw, true);
}

function new_room_struct(string $room): array
{
    return [
        'room'          => $room,
        'createdAt'     => time(),
        'status'        => 'lobby',
        'adminToken'    => null,
        'usedLetters'   => [],
        'currentLetter' => null,
        'categories'    => CATEGORIES,
        'players'       => [],
        'currentRound'  => null,
        'rounds'        => [],
        'messages'      => [],
        'msgSeq'        => 0,
    ];
}

// Puan hesaplama. $players: token=>player, $answers: token=>[cat=>val], $letter.
// Döndürür: token => ['answers'=>..., 'points'=>int, 'breakdown'=>[cat=>int]]
// $invalid: token => [cat => true] -> admin tarafından iptal edilen cevaplar
// boş sayılır (puan 0 + "aynı cevap" sayımına dahil edilmez).
function compute_scores(array $players, array $answers, string $letter, array $invalid = [], array $extraCats = []): array
{
    $letterFold = fold_letter(tr_upper($letter));
    $allCats = array_merge(CATEGORIES, array_column($extraCats, 'key'));
    $results = [];
    foreach (array_keys($players) as $token) {
        $results[$token] = [
            'answers'   => $answers[$token] ?? [],
            'points'    => 0,
            'breakdown' => [],
        ];
    }

    foreach ($allCats as $cat) {
        // Bu kategori için geçerli (harfle başlayan, boş olmayan) normalize cevaplar
        $valid = [];   // token => normalize
        $counts = [];  // normalize => adet
        foreach (array_keys($players) as $token) {
            $val = $answers[$token][$cat] ?? '';
            $norm = normalize_answer((string) $val);
            $isInvalid = !empty($invalid[$token][$cat]);
            $startsOk = !$isInvalid && mb_strlen($norm, 'UTF-8') >= 2 && fold_letter(mb_substr($norm, 0, 1, 'UTF-8')) === $letterFold;
            if ($startsOk) {
                $key = answer_key($norm);
                $valid[$token] = $key;
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }
        }
        $totalValid = count($valid); // bu kategoride geçerli cevap veren kişi sayısı
        foreach (array_keys($players) as $token) {
            $pts = 0;
            if (isset($valid[$token])) {
                if ($totalValid === 1) {
                    $pts = 20; // tek doğru cevap veren
                } elseif ($counts[$valid[$token]] > 1) {
                    $pts = 5;  // aynı cevap başkasında da var
                } else {
                    $pts = 10; // benzersiz cevap
                }
            }
            $results[$token]['breakdown'][$cat] = $pts;
            $results[$token]['points'] += $pts;
        }
    }

    return $results;
}

// ---- Aktivite Loglama ----
function log_dir(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'logs';
}

function get_client_ip(): string
{
    foreach (['HTTP_CF_CONNECTING_IP','HTTP_X_FORWARDED_FOR','HTTP_X_REAL_IP','REMOTE_ADDR'] as $k) {
        if (!empty($_SERVER[$k])) {
            return explode(',', $_SERVER[$k])[0];
        }
    }
    return '0.0.0.0';
}

function parse_ua(string $ua): array
{
    $mobile = (bool) preg_match('/Mobile|Android|iPhone|iPad|iPod/i', $ua);
    $browser = 'Diğer';
    if (strpos($ua, 'Edg') !== false) $browser = 'Edge';
    elseif (strpos($ua, 'OPR') !== false || strpos($ua, 'Opera') !== false) $browser = 'Opera';
    elseif (strpos($ua, 'Firefox') !== false) $browser = 'Firefox';
    elseif (strpos($ua, 'Chrome') !== false) $browser = 'Chrome';
    elseif (strpos($ua, 'Safari') !== false) $browser = 'Safari';
    $os = 'Diğer';
    if (strpos($ua, 'Android') !== false) $os = 'Android';
    elseif (strpos($ua, 'iPhone') !== false || strpos($ua, 'iPad') !== false) $os = 'iOS';
    elseif (strpos($ua, 'Windows') !== false) $os = 'Windows';
    elseif (strpos($ua, 'Macintosh') !== false) $os = 'macOS';
    elseif (strpos($ua, 'Linux') !== false) $os = 'Linux';
    return ['browser' => $browser, 'os' => $os, 'mobile' => $mobile];
}

function write_log(string $action, array $extra = []): void
{
    $dir = log_dir();
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $uaParsed = parse_ua($ua);
    $entry = array_merge([
        'ts'      => time(),
        'action'  => $action,
        'ip'      => get_client_ip(),
        'browser' => $uaParsed['browser'],
        'os'      => $uaParsed['os'],
        'mobile'  => $uaParsed['mobile'],
        'ua'      => substr($ua, 0, 200),
    ], $extra);
    $file = $dir . DIRECTORY_SEPARATOR . date('Y-m-d') . '.jsonl';
    $fh = fopen($file, 'a');
    if ($fh) {
        flock($fh, LOCK_EX);
        fwrite($fh, json_encode($entry, JSON_UNESCAPED_UNICODE) . "\n");
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
