# El Yazısı Notlar

iPad + Apple Pencil ile basınca duyarlı çizim yapabildiğin, notları Supabase'e kaydeden,
build gerektirmeyen statik web uygulaması. Masaüstü (fare) ve telefonda (parmak) da çalışır.

## Ücretsiz Supabase Kurulumu

1. **Hesap aç:** https://supabase.com → "Start your project" (GitHub ile giriş, ücretsiz Free plan).
2. **Proje oluştur:** New project → isim + güçlü bir veritabanı şifresi + bölge seç (örn. Frankfurt). Birkaç dakika bekle.
3. **Tabloyu kur:** Sol menü → **SQL Editor** → `schema.sql` içeriğini yapıştır → **Run**.
   Ardından **`migration_v2.sql`** içeriğini de yapıştır → **Run** (sayfa türleri + PDF storage için).
4. **Anahtarları al:** Sol menü → **Project Settings → API**:
   - `Project URL` → kopyala
   - `Project API keys → anon / public` → kopyala
5. **Koda yaz:** `js/supabaseClient.js` dosyasını aç, `SUPABASE_URL` ve `SUPABASE_ANON_KEY`
   değerlerini bu ikisiyle değiştir.
   > Sadece **anon (public)** key kullan. `service_role` key'i ASLA koda koyma.

Free plan bu uygulama için fazlasıyla yeter (50.000 aylık aktif kullanıcı, 500MB veritabanı).

## Yerelde Çalıştırma

ES module + CORS yüzünden dosyayı çift tıklamak çalışmaz; basit bir statik sunucu kullan:

```bash
python3 -m http.server 8000
# tarayıcıda: http://localhost:8000
```

(Windows: `py -m http.server 8000`)

## GitHub Pages'te Yayınlama

1. Yeni bir GitHub reposu oluştur, dosyaları push'la.
2. Repo → **Settings → Pages** → "Deploy from a branch" → `main` / `root` → Save.
3. Birkaç dakikada site `https://KULLANICIADI.github.io/REPOADI` adresinde yayında olur.
4. **Supabase Auth ayarı:** Dashboard → **Authentication → URL Configuration**:
   - **Site URL** ve **Redirect URLs** alanlarına GitHub Pages adresini ekle.
   - Yoksa magic link / e-posta doğrulama linkleri çalışmaz.

## Güvenlik

Veriyi Row Level Security (RLS) korur — her kullanıcı yalnızca kendi notlarını görür/düzenler.
İstemcide yalnızca `anon` key bulunur; bu güvenlidir çünkü tüm erişim RLS politikalarıyla sınırlıdır.

## Özellikler (v2)

- **Sayfa türleri:** yeni not açarken Boş / Çizgili / Kareli / Noktalı seç. Çok sayfalı; alttan sayfa eklenebilir.
- **PDF içe aktarma:** kendi PDF'ini yükle, her sayfasının üstüne not al. PDF özel (private) Storage'da, sadece sahibi erişir.
- **Yüzen araç paleti** (Apple Pencil tarzı, sürüklenebilir): Kalem, Fosforlu, Silgi, renk paleti + serbest renk, kalınlık, geri/ileri al, temizle.
- Çizim **vektörel stroke (JSON)** olarak, sayfa-bağımsız koordinatlarla saklanır → her cihazda doğru ölçek, yeniden düzenlenebilir.
- Pointer Events + `getCoalescedEvents()` + basınç + high-DPI + quadratic eğriyle pürüzsüz çizim.
- Parmak varsayılan olarak çizmez (avuç reddi); palette'teki "Parmakla çiz" ile açılır.

> Not: Apple Pencil'in *native* PencilKit paleti (`PKToolPicker`) web'de kullanılamaz; bu palet ona benzeyen web karşılığıdır.
