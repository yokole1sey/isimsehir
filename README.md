# İsim Şehir 🎲

Oda numarasıyla girilen, gerçek zamanlı **çok oyunculu İsim-Şehir** oyunu.
Saf **PHP** ile yazıldı, küçük durum verileri için **JSON** kullanır — veritabanı yok.

> Bir oda numarası seç (örn. `1516`), arkadaşların da aynı numarayı girsin. Odalar gizlidir; ilk giren **admin** olur, oyunu yönetir.

---

## ✨ Özellikler

- 🔒 **Gizli odalar** — Sadece oda numarasını bilen girebilir.
- 👑 **Admin yönetimi** — İlk giren admin; çıkarsa/koparsa yetki otomatik sıradakine devredilir. Oyun sırasında admin transferi yapılmaz.
- 🎰 **Slot ile harf çekimi** — 22 harflik havuzdan rastgele; admin onaylar veya atlar. Çıkan harf aynı oyunda tekrar gelmez.
- 🔤 **Türkçe harf eşleştirme** — `I/İ`, `O/Ö`, `S/Ş`, `U/Ü`, `C/Ç` aynı kabul edilir; `Ğ` ve `J` havuzda yoktur.
- ✍️ **6 kategori** — İsim · Şehir · Bitki · Hayvan · Eşya · Artist (ileri/geri navigasyon, otomatik kayıt).
- 🧮 **Puanlama** — Tek doğru cevap **20**, benzersiz cevap **10**, aynı cevap **5**, boş/hatalı **0**. Tek harfli cevaplar geçersiz sayılır.
- ⏱️ **"Bitirdim" + 15 sn** — İlk bitiren turu kapatır, diğerlerine 15 sn süre tanır.
- 🚫 **Hile önleme** — Tur sırasında ekrandan ayrılan (sekme/uygulama değiştiren) oyuncu **10 puan ceza** alır.
- 🛠️ **Admin araçları** — Hatalı/tek harf cevapları iptal etme, turu/oyunu bitirme, lobiye dönme.
- 🚩 **Cevap bildirme** — Oyuncular hatalı cevapları bildirebilir; bildirilen cevaplar admin ekranında renk değiştirir.
- 💬 **Gerçek zamanlı sohbet** — Oyun sırasında ve turlar arasında FAB butonu ile açılır. Emoji desteği, kişi renkleri, mesaj geçmişi (sayfa yenilemede korunur). Masaüstünde sağ kenarda sabit panel, mobilde tam ekran.
- 💬 **Lobi baloncukları** — Lobide kısa mesaj + hızlı emoji; ekran ortasında süzülerek yükselir.
- 🏆 **Final skor tablosu** — Madalyalı, kazanan vurgulu.
- 📱 **Mobil uyumlu** — Klavye açıkken panel küçülür, skor tablosu mobilde de görünür.
- 🔄 **Puan koruması** — Oyuncu oyundan ayrılıp geri dönerse puanı sıfırlanmaz.
- 🎨 **Gaming teması** — Glassmorphism, neon glow, animasyonlu grid arka plan, Russo One + Chakra Petch fontlar.

---

## 🚀 Çalıştırma

### Yerel (test)
PHP yüklüyse, proje kökünde:

```bash
php -S localhost:8000
```

Tarayıcıda `http://localhost:8000` aç. Farklı sekme/cihazlarda aynı oda numarasıyla katıl.

### Sunucu (hosting)
Tüm dosyaları PHP destekleyen bir hosting'e yükle. Tek gereksinim:

- **`data/` klasörü yazılabilir olmalı** (PHP'nin oda JSON'larını yazabilmesi için).
- Apache dışı sunucuda (nginx vb.) `data/` klasörüne dışarıdan erişimi sunucu konfigünden kapatın (Apache için `data/.htaccess` hazır).

> Gereksinim: **PHP 8.0+** (harici eklenti gerekmez).

---

## 📁 Yapı

```
.
├── index.php        # Giriş ekranı (oda no + takma ad)
├── game.php         # Oyun ekranı
├── api.php          # Tüm işlemler (JSON API)
├── lib.php          # Yardımcılar: JSON I/O, Türkçe harf, puanlama
├── assets/
│   ├── app.js       # İstemci: polling, slot, sohbet, akış
│   └── style.css    # Arayüz
└── data/rooms/      # Oda JSON'ları (çalışma anında oluşur)
```

## ⚙️ Nasıl çalışır?

- **Gerçek zamanlılık:** WebSocket yok; istemci ~1.5 sn'de bir `state` uç noktasını yoklar (AJAX polling).
- **Depolama:** Her oda `data/rooms/{oda}.json` dosyasında, `flock` ile kilitli yazılır.
- **Kimlik:** Katılımda rastgele token üretilir, tarayıcıda `localStorage`'da saklanır.
- **Oturum sürekliliği:** Oyuncu 5 dakika içinde geri dönerse token yenilenir; puan korunur.

---

## 🎮 Oynanış

1. Oda numarası (sadece rakam) ve takma ad ile gir.
2. Admin **Oyunu Başlat** → slot döner, harf onaylanır.
3. Herkes 6 kategoriyi doldurur.
4. İlk bitiren **Bitirdim** der (15 sn geri sayım) ya da admin turu bitirir.
5. Puanlar açıklanır; oyuncular hatalı cevapları bildirebilir, admin iptal edebilir.
6. Admin yeni tura geçer veya oyunu bitirir.
7. Final skor tablosu! 🏆

---

Made with ❤️ + PHP.
