// Eklenti ilk yüklendiğinde çalışır, ufak bir log atıyoruz.
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sahibinden TKGM Add-on yüklendi. Herkese iyi kodlamalar!');
});

// Tarayıcı her açıldığında gereksiz yer kaplamaması ve Firefox kurallarına uyması için
// eski kayıtları (cache) temizliyoruz. Limit sayacını silmiyoruz ki günü sıfırlamasın.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove([
    'city', 'district', 'street', 'adaNo', 'parselNo', 
    'tapuAlani', 'nitelik', 'shbndnCachedIlanNo', 'ilanNo', 'tkgmStatus'
  ]);
});

// TKGM API adresi ve il listesini çektiğimiz statik JSON dosyası
const API_BASE = 'https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api';
const IL_LIST_URL = 'https://parselsorgu.tkgm.gov.tr/app/modules/administrativeQuery/data/ilListe.json';

// Sahibinden'den gelen Türkçe karakterleri ve gereksiz boşlukları temizleyip,
// TKGM'nin saçma sapan veri yapısıyla eşleştirebilmek için yazdığımız basit bir norm fonksiyonu.
function norm(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// İsimler bazen tam uymuyor (örn: "Merkez" vs "Merkez Köyler", "Kayalar Mh" vs "KAYALAR MAHALLESİ").
// Content script'teki Levenshtein + Jaccard yaklaşımını buraya da taşıdık ki background API sorgusu da
// aynı esnek eşleştirmeyi yapabilsin.
function getMatchScore(source, target) {
  const a = norm(source);
  const b = norm(target);
  if (!a || !b) return 0;
  if (a === b) return 1;

  function levenshtein(aStr, bStr) {
    const aLen = aStr.length, bLen = bStr.length;
    if (aLen === 0) return bLen;
    if (bLen === 0) return aLen;
    const v0 = new Array(bLen + 1).fill(0);
    const v1 = new Array(bLen + 1).fill(0);
    for (let i = 0; i <= bLen; i++) v0[i] = i;
    for (let i = 0; i < aLen; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < bLen; j++) {
        const cost = aStr[i] === bStr[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      for (let k = 0; k <= bLen; k++) v0[k] = v1[k];
    }
    return v1[bLen];
  }

  const levDist = levenshtein(a, b);
  const levSim = 1 - levDist / Math.max(a.length, b.length, 1);

  const aParts = a.split(/[/\s]+/).filter(Boolean);
  const bParts = b.split(/[/\s]+/).filter(Boolean);
  const intersection = aParts.filter(p => bParts.includes(p));
  const union = Array.from(new Set([...aParts, ...bParts]));
  const jaccard = union.length ? intersection.length / union.length : 0;

  const prefixBonus = (aParts[0] && bParts[0] && aParts[0] === bParts[0]) ? 0.08 : 0;
  const includesBonus = (a.includes(b) || b.includes(a)) ? 0.15 : 0;

  const score = Math.max(levSim * 0.6 + jaccard * 0.3 + prefixBonus + includesBonus, 0);
  return Math.min(score, 1);
}

// Önce tam eşleşme, olmazsa yukarıdaki fuzzy skor ile en iyi adayı döndürür.
function bestMatch(list, text) {
  const target = norm(text);
  let best = null, bestScore = -1;
  for (const item of list) {
    const candidate = norm(item.text);
    if (candidate === target) return item;
    const score = getMatchScore(candidate, target);
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore >= 0.25 ? best : null;
}

// HTTP fetch işlemlerini kısaltmak için küçük bir yardımcı
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} hatası: ${url}`);
  return res.json();
}

// GeoJSON içindeki özellik (properties) listesini döndüren fonksiyon
function featuresAsItems(geojson) {
  if (!geojson || !geojson.features) return [];
  return geojson.features.map(f => f.properties).filter(Boolean);
}

// Tüm TKGM arama işlemini tek bir asenkron fonksiyonda topladık.
// Şehir -> İlçe -> Mahalle -> Parsel sırasıyla istek atıyor.
async function lookupTkgm(city, district, street, adaNo, parselNo) {
  // 1. Şehir listesini çekip eşleştiriyoruz
  const ilData = await fetchJson(IL_LIST_URL);
  const ilList = featuresAsItems(ilData);
  const il = bestMatch(ilList, city);
  if (!il) throw new Error(`Şehir bulunamadı: ${city}`);

  // 2. Bulduğumuz şehrin ilçe listesini çekip eşleştiriyoruz
  const ilceData = await fetchJson(`${API_BASE}/idariYapi/ilceListe/${il.id}`);
  const ilceList = featuresAsItems(ilceData);
  const ilce = bestMatch(ilceList, district);
  if (!ilce) throw new Error(`İlçe bulunamadı: ${district}`);

  // 3. Bulduğumuz ilçenin mahalle/sokak listesini çekiyoruz
  const mahalleData = await fetchJson(`${API_BASE}/idariYapi/mahalleListe/${ilce.id}`);
  const mahalleList = featuresAsItems(mahalleData);
  const mahalle = bestMatch(mahalleList, street);
  if (!mahalle) throw new Error(`Mahalle/Sokak bulunamadı: ${street}`);

  // 4. Nihai parsel sorgusu! (Nitelik ve tapu alanını buradan alıyoruz, auth gerekmiyor)
  const ada = String(adaNo).replace(/\D/g, '') || '0';
  const parsel = String(parselNo).replace(/\D/g, '') || '0';
  const parcelData = await fetchJson(`${API_BASE}/parsel/${mahalle.id}/${ada}/${parsel}`);

  const props = parcelData && parcelData.properties;
  if (!props) throw new Error('TKGM parsel verisi döndürmedi');

  return {
    tapuAlani: props.alan || null,
    nitelik: props.nitelik || null,
  };
}

// Sayfalardan gelen mesajları burada dinliyoruz
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // Sahibinden sayfasından otomatik TKGM sorgusu tetiklendiğinde burası çalışır
  if (msg.type === 'autoTkgm' && msg.values) {
    const { city, district, street, adaNo, parselNo, ilanNo } = msg.values;

    // TKGM'nin günlük 70 sorgu limiti var, o yüzden storage'da bir sayaç tutuyoruz.
    chrome.storage.local.get(['tkgmRequestCount', 'tkgmRequestDate'], data => {
      const today = new Date().toDateString();
      let count = data.tkgmRequestDate === today ? (data.tkgmRequestCount || 0) : 0;

      // Limiti aştıysak hiç TKGM'ye vurmadan direkt hata dön.
      if (count >= 70) {
        const payload = { tkgmStatus: 'Günlük limit doldu (70/70)' };
        chrome.storage.local.set(payload);
        
        // Açık olan tüm Sahibinden sekmelerine durumu haber veriyoruz ki kutucuklar güncellensin
        chrome.tabs.query({}, tabs => {
          for (const t of tabs) {
            try {
              if (t && t.url && t.id && t.url.includes('sahibinden.com')) {
                chrome.tabs.sendMessage(t.id, { type: 'tkgmUpdated', payload });
              }
            } catch (e) {}
          }
        });
        sendResponse({ success: false, error: 'Daily limit reached' });
        return;
      }

      // Limiti aşmadık, sayacı önden bir artıralım ki aynı anda iki sekme açıldığında şaşmasın
      count++;
      chrome.storage.local.set({ tkgmRequestCount: count, tkgmRequestDate: today });

      // Veriyi çekmeye başlıyoruz...
      lookupTkgm(city, district, street, adaNo, parselNo)
        .then(({ tapuAlani, nitelik }) => {
          const payload = {
            tkgmStatus: `Tamamlandı (${count}/70)`,
            tapuAlani: tapuAlani || '',
            nitelik: nitelik || '',
            shbndnCachedIlanNo: ilanNo || '', // Bunu Sahibinden'den alıyoruz, gereksiz TKGM request'i atmamak için
          };
          
          // Bulduğumuz sonucu kaydedelim
          chrome.storage.local.set(payload);
          
          // Ve yine Sahibinden sekmelerine haber verelim ki UI güncellensin
          chrome.tabs.query({}, tabs => {
            for (const t of tabs) {
              try {
                if (t && t.url && t.id && t.url.includes('sahibinden.com')) {
                  chrome.tabs.sendMessage(t.id, { type: 'tkgmUpdated', payload });
                }
              } catch (e) {}
            }
          });
          sendResponse({ success: true, tapuAlani, nitelik });
        })
        .catch(err => {
          console.warn('[TKGM API]', err.message);
          const payload = { tkgmStatus: `Hata: ${err.message} (${count}/70)` };
          chrome.storage.local.set(payload);
          
          chrome.tabs.query({}, tabs => {
            for (const t of tabs) {
              try {
                if (t && t.url && t.id && t.url.includes('sahibinden.com')) {
                  chrome.tabs.sendMessage(t.id, { type: 'tkgmUpdated', payload });
                }
              } catch (e) {}
            }
          });
          sendResponse({ success: false, error: err.message });
        });
    });

    return true; // Asenkron cevap vereceğimiz için kanalı açık tutuyoruz
  }

  // Eskiden kalan manuel "Open TKGM" butonu için eklendi (Hâlâ popup üzerinden kullanılabiliyor)
  if (msg.type === 'openTkgm' && msg.values) {
    chrome.storage.local.set({ tkgmAutoData: msg.values, tkgmAutoRun: true }, () => {
      chrome.tabs.create({ url: 'https://parselsorgu.tkgm.gov.tr/', active: true }, tab => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  // Eski sistem (parselsorgu.tkgm sayfasındaki content_script'ten gelen mesajlar için)
  if (msg.type === 'tkgmStatusChanged' && msg.payload) {
    try {
      chrome.tabs.query({}, tabs => {
        for (const t of tabs) {
          try {
            if (t && t.url && t.id && t.url.includes('sahibinden.com')) {
              chrome.tabs.sendMessage(t.id, { type: 'tkgmUpdated', payload: msg.payload });
            }
          } catch (e) {}
        }
      });
    } catch (e) {}
  }
});

// Eski sistem için: parselsorgu sekmesi açıldığında formu otomatik doldurma tetikleyicisi
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url || !tab.url.includes('parselsorgu.tkgm.gov.tr')) return;
  chrome.storage.local.get(['tkgmAutoRun'], data => {
    if (data && data.tkgmAutoRun) {
      chrome.tabs.sendMessage(tabId, { type: 'fillTkgm' });
    }
  });
});
