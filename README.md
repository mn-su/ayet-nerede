# Ayet Nerede?

Okunan Kur'an'ı dinleyip ayeti bulur. Ayetin geçtiği Diyanet mushafı sayfasını gösterir; isteğe bağlı olarak Diyanet mealini de gösterir. Benzer ayetler alternatif olarak listelenir.

**Adres:** https://mn-su.github.io/ayet-nerede/

- İlk kelimelerle aramaya başlar, ses devam ettikçe sonucu iyileştirir.
- Tanıma cihaz üzerinde yapılır, ses hiçbir yere gönderilmez. İlk açılışta yaklaşık 75 MB indirilir, sonrasında internetsiz çalışır.
- Telefonda "Ana ekrana ekle" ile uygulama gibi kurulabilir.

## Geliştirme

Node.js 20+ gerekir.

```bash
npm ci
npm run model   # tanıma modelini public/models/ klasörüne indirir
npm run dev
```

## Yayınlama

`main` dalına her gönderimde `.github/workflows/pages.yml` siteyi derleyip GitHub Pages'e yükler. Model derleme sırasında indirilir, git'e girmez.

İlk kurulumda depoda **Settings › Pages › Source: GitHub Actions** seçilmelidir.

Model değişirse `src/offline.ts` ve `public/sw.js` içindeki önbellek adı (`ayet-nerede-v1`) artırılmalıdır.

## Kaynaklar ve lisanslar

- **Tanıma motoru:** [Tilawa](https://github.com/yazinsai/tilawa). Kod MIT lisanslıdır. Model ve fonem verisi **NPL-1.2** lisanslıdır: yalnızca ticari olmayan kullanıma izin verir. `vendor/tilawa-core/` klasöründe, [mn-su/tilawa](https://github.com/mn-su/tilawa) çatalındaki `identify()` ve `candidatesSoFar()` eklemelerini içeren derlenmiş SDK bulunur.
- **Mushaf sayfa düzeni, Arapça metin, Elif fontu ve meal:** Diyanet İşleri Başkanlığı.
