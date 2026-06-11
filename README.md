# İsim Şehir 🎲

Oda numarasıyla girilen, gerçek zamanlı **çok oyunculu İsim-Şehir** oyunu.
Saf **PHP** ile yazıldı, küçük durum verileri için **JSON** kullanır — veritabanı yok.

> Bir oda numarası seç (örn. `1516`), arkadaşların da aynı numarayı girsin. Odalar gizlidir; ilk giren **admin** olur, oyunu yönetir.

---

## ✨ Özellikler

- 🔒 **Gizli odalar** — Sadece oda numarasını bilen girebilir.
- 👑 **Admin yönetimi** — İlk giren admin; çıkarsa/koparsa yetki otomatik sıradakine devredilir (heartbeat).
- 🎰 **Slot ile harf çekimi** — 22 harflik havuzdan rastgele; admin onaylar veya atlar. Çıkan harf aynı oyunda tekrar gelmez.
- 🔤 **Türkçe harf eşleştirme** — `I/İ`, `O/Ö`, `S/Ş`, `U/Ü`, `C/Ç` aynı kabul edilir; `Ğ` ve `J` havuzda yoktur.
- ✍️ **6 kategori** — İsim · Şehir · Bitki · Hayvan · Eşya · Artist (ileri/geri navigasyon, otomatik kayıt).
- 🧮 **Puanlama** — Benzersiz cevap **10**, aynı cevap **5**, boş/harf uymayan **0**. ("Isparta" = "isparta" gibi yazımlar aynı sayılır.)
- ⏱️ **"Bitirdim" + 10 sn** — İlk bitiren turu kapatır, diğerlerine 10 sn süre tanır.
- 🚫 **Hile önleme** — Tur sırasında ekrandan ayrılan (sekme/uygulama değiştiren) oyuncu **10 puan ceza** alır.
- 🛠️ **Admin araçları** — Hatalı/tek harf cevapları iptal etme, turu/oyunu bitirme, lobiye dönme.
- 💬 **Baloncuk sohbeti** — Lobide kısa mesaj + hızlı emoji; mesajlar aşağıdan yukarı süzülerek kaybolur.
- 🏆 **Final skor tablosu** — Madalyalı, kazanan vurgulu.
- 📱 **Mobil uyumlu** — Telefon ve masaüstü için tasarlandı.

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

---

## 🎮 Oynanış

1. Oda numarası ve takma ad ile gir.
2. Admin **Oyunu Başlat** → slot döner, harf onaylanır.
3. Herkes 6 kategoriyi doldurur.
4. İlk bitiren **Bitirdim** der (10 sn geri sayım) ya da admin turu bitirir.
5. Puanlar açıklanır; admin yeni tura geçer veya oyunu bitirir.
6. Final skor tablosu! 🏆

---

Made with ❤️ + PHP.
