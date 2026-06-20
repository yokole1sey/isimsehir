# İsim Şehir 🎲

Oda numarasıyla girilen, gerçek zamanlı **çok oyunculu İsim-Şehir** oyunu.
Saf **PHP** ile yazıldı, küçük durum verileri için **JSON** kullanır — veritabanı yok.

> Bir oda numarası seç (örn. `1516`), arkadaşların da aynı numarayı girsin. Odalar gizlidir; ilk giren **admin** olur, oyunu yönetir.

---

## ✨ Özellikler

- 🔒 **Gizli odalar** — Sadece oda numarasını bilen girebilir.
- 👑 **Admin yönetimi** — İlk giren admin; çıkarsa/koparsa yetki otomatik sıradakine devredilir.
- 🎰 **Slot ile harf çekimi** — 22 harflik havuzdan rastgele; admin onaylar veya atlar. Çıkan harf aynı oyunda tekrar gelmez.
- 🔤 **Türkçe harf eşleştirme** — `I/İ`, `O/Ö`, `S/Ş`, `U/Ü`, `C/Ç` aynı kabul edilir; `Ğ` ve `J` havuzda yoktur.
- ✍️ **6 standart kategori + özel kategoriler** — İsim · Şehir · Bitki · Hayvan · Eşya · Artist. Admin lobide en fazla 3 özel kategori ekleyebilir (Film, Ülke, Meslek vb.).
- 🧮 **Puanlama** — Tek doğru cevap **20**, benzersiz cevap **10**, aynı cevap **5**, boş/hatalı **0**. Tek harfli cevaplar geçersiz sayılır.
- ⏱️ **"Bitirdim" + 15 sn** — İlk bitiren turu kapatır, diğerlerine 15 sn süre tanır.
- ⏳ **Geri sayım animasyonu** — Son 10 saniyede büyük animasyonlu sayaç gösterilir.
- ✍️ **Canlı yazma göstergesi** — Birisi bir kategoriye yazmaya başlayınca diğer oyuncular bunu görür.
- 📊 **Sıralama animasyonu** — Puan değişimlerinde skor tablosundaki sıralar FLIP animasyonuyla güncellenir.
- 😊 **Emoji reaksiyon sistemi** — Alt bardaki reaksiyon butonuyla 8 farklı emoji (👏🔥😂😮❤️💯😡😢) ekrana fırlatılabilir.
- ✂️ **Çizgili cevap efekti** — Admin bir cevabı iptal ettiğinde üstünden kırmızı çizgi animasyonuyla silinir.
- 🎉 **Kazanan konfeti** — Oyun bitişinde ekrana renkli konfeti yağar.
- 🚫 **Hile önleme** — Tur sırasında sekme/uygulama değiştiren oyuncu **10 puan ceza** alır.
- 🛠️ **Admin araçları** — Hatalı cevapları iptal etme (geri alınabilir), turu/oyunu bitirme, lobiye dönme. İptal sırasında kartların yeri değişmez.
- 🚫 **Oyuncu atma & oda kilitleme** — Admin istenmeyen oyuncuyu atabilir ve odayı yeni oyunculara kapatabilir.
- 🚩 **Cevap bildirme** — Oyuncular hatalı cevapları bildirebilir; bildirilen cevaplar admin ekranında renk değiştirir.
- 💬 **Gerçek zamanlı sohbet** — FAB butonu ile açılır. Emoji desteği, kişi renkleri, mesaj geçmişi. Masaüstünde sabit panel, mobilde tam ekran.
- 💬 **Lobi baloncukları** — Lobide kısa mesaj + hızlı emoji; ekranda süzülerek yükselir.
- 🎙️ **Sesli sohbet** — WebRTC tabanlı gerçek zamanlı sesli iletişim; sunucu üzerinden geçmez. Mikrofon ve hoparlör ayrı ayrı kontrol edilebilir.
- 🏆 **Final skor tablosu** — Madalyalı, kazanan vurgulu, konfetili.
- 📱 **Mobil uyumlu** — Klavye açıkken panel küçülür. Tam ekran modu ile adres çubuğu gizlenebilir (Android).
- 🔢 **Oda kapasitesi** — Bir odaya maksimum 10 oyuncu girebilir.
- 🔄 **Puan koruması** — Oyuncu oyundan ayrılıp geri dönerse puanı sıfırlanmaz.
- 💾 **İsim hatırlama** — Son kullanılan takma ad bir sonraki girişte otomatik doldurulur.
- 🎨 **Gaming teması** — Glassmorphism, neon glow, animasyonlu grid arka plan, Russo One + Chakra Petch fontlar.

---

## 🛡️ Admin Paneli

`/admin.php` adresinden şifreyle erişilir.

- 📊 **Dashboard** — Toplam giriş, benzersiz IP, oyun başlatma, tur sayısı, mobil/masaüstü oranı, aktif odalar ve tarayıcı istatistikleri.
- 📋 **Aktivite Logu** — Sayfa başına 20 kayıt, filtreli arama (aksiyon, tarih, oda, IP, tarayıcı, cihaz). Sayfalama filtreleri korur.
- 🗂️ **Havuz** — Loglardan toplanan oyuncu isimleri, özel kategori geçmişi ve oda numaraları; kullanım sıklığına göre sıralı, arama destekli.

---

## 🚀 Çalıştırma

### Yerel (test)

```bash
php -S localhost:8000
```

Tarayıcıda `http://localhost:8000` aç. Farklı sekme/cihazlarda aynı oda numarasıyla katıl.

### Sunucu (hosting)

Tüm dosyaları PHP destekleyen bir hosting'e yükle:

- **`data/` klasörü yazılabilir olmalı** (PHP'nin oda JSON'larını yazabilmesi için).
- Apache dışı sunucuda `data/` klasörüne dışarıdan erişimi kapat (Apache için `data/.htaccess` hazır).

> Gereksinim: **PHP 8.0+** (harici eklenti gerekmez).

---

## 📁 Yapı

```
.
├── index.php        # Giriş ekranı (oda no + takma ad)
├── game.php         # Oyun ekranı
├── api.php          # Tüm işlemler (JSON API)
├── lib.php          # Yardımcılar: JSON I/O, Türkçe harf, puanlama
├── admin.php        # Admin paneli (dashboard, log, havuz)
├── assets/
│   ├── app.js       # İstemci: polling, slot, sohbet, WebRTC, animasyonlar
│   └── style.css    # Arayüz
└── data/rooms/      # Oda JSON'ları (çalışma anında oluşur)
```

## ⚙️ Nasıl çalışır?

- **Gerçek zamanlılık:** WebSocket yok; istemci ~1.5 sn'de bir `state` uç noktasını yoklar (AJAX polling).
- **Depolama:** Her oda `data/rooms/{oda}.json` dosyasında, `flock` ile kilitli yazılır.
- **Kimlik:** Katılımda rastgele token üretilir, tarayıcıda `localStorage`'da saklanır.
- **Oturum sürekliliği:** Oyuncu 5 dakika içinde geri dönerse token yenilenir; puan korunur.
- **Sesli iletişim:** WebRTC tam-mesh topoloji; PHP sadece offer/answer/ICE sinyallerini taşır.

---

## 🎮 Oynanış

1. Oda numarası (sadece rakam) ve takma ad ile gir (son kullanılan ad otomatik gelir).
2. Admin isteğe bağlı özel kategoriler ekler, ardından **Oyunu Başlat** der.
3. Slot döner, harf onaylanır.
4. Herkes tüm kategorileri doldurur.
5. İlk bitiren **Bitirdim** der (15 sn geri sayım) ya da admin turu bitirir.
6. Puanlar açıklanır; oyuncular hatalı cevapları bildirebilir, admin iptal edebilir.
7. Admin yeni tura geçer veya oyunu bitirir.
8. Final skor tablosu + konfeti! 🏆

---

Made with ❤️ + PHP.
