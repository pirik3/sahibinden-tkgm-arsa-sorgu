chrome.runtime.onInstalled.addListener(() => {
  console.log('Sahibinden TKGM Add-on installed');
});

const API_BASE = 'https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api';
const IL_LIST_URL = 'https://parselsorgu.tkgm.gov.tr/app/modules/administrativeQuery/data/ilListe.json';

// Simple normalization matching the content script's normalizeText
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

function bestMatch(list, text) {
  const target = norm(text);
  let best = null, bestScore = -1;
  for (const item of list) {
    const candidate = norm(item.text);
    if (candidate === target) return item; // exact
    // substring match score
    const score = candidate.includes(target) || target.includes(candidate)
      ? 0.9 - Math.abs(candidate.length - target.length) / 100
      : 0;
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore > 0 ? best : null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function featuresAsItems(geojson) {
  if (!geojson || !geojson.features) return [];
  return geojson.features.map(f => f.properties).filter(Boolean);
}

async function lookupTkgm(city, district, street, adaNo, parselNo) {
  // 1. City list
  const ilData = await fetchJson(IL_LIST_URL);
  const ilList = featuresAsItems(ilData);
  const il = bestMatch(ilList, city);
  if (!il) throw new Error(`City not found: ${city}`);

  // 2. District list
  const ilceData = await fetchJson(`${API_BASE}/idariYapi/ilceListe/${il.id}`);
  const ilceList = featuresAsItems(ilceData);
  const ilce = bestMatch(ilceList, district);
  if (!ilce) throw new Error(`District not found: ${district}`);

  // 3. Mahalle list
  const mahalleData = await fetchJson(`${API_BASE}/idariYapi/mahalleListe/${ilce.id}`);
  const mahalleList = featuresAsItems(mahalleData);
  const mahalle = bestMatch(mahalleList, street);
  if (!mahalle) throw new Error(`Street/Mahalle not found: ${street}`);

  // 4. Parcel query — returns nitelik + alan directly, no auth needed
  const ada = String(adaNo).replace(/\D/g, '') || '0';
  const parsel = String(parselNo).replace(/\D/g, '') || '0';
  const parcelData = await fetchJson(`${API_BASE}/parsel/${mahalle.id}/${ada}/${parsel}`);

  const props = parcelData && parcelData.properties;
  if (!props) throw new Error('No parcel data returned');

  return {
    tapuAlani: props.alan || null,
    nitelik: props.nitelik || null,
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // Fully background TKGM lookup via API — no tab opened
  if (msg.type === 'autoTkgm' && msg.values) {
    const { city, district, street, adaNo, parselNo, url } = msg.values;

    chrome.storage.local.get(['tkgmRequestCount', 'tkgmRequestDate'], data => {
      const today = new Date().toDateString();
      let count = data.tkgmRequestDate === today ? (data.tkgmRequestCount || 0) : 0;

      if (count >= 70) {
        const payload = { tkgmStatus: 'Daily limit reached (70/70)' };
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
        sendResponse({ success: false, error: 'Daily limit reached' });
        return;
      }

      // Increment limit optimistically
      count++;
      chrome.storage.local.set({ tkgmRequestCount: count, tkgmRequestDate: today });

      lookupTkgm(city, district, street, adaNo, parselNo)
        .then(({ tapuAlani, nitelik }) => {
          const payload = {
            tkgmStatus: `Done (${count}/70)`,
            tapuAlani: tapuAlani || '',
            nitelik: nitelik || '',
            tkgmCachedUrl: url || '',
          };
          // Persist to storage
          chrome.storage.local.set(payload);
          // Broadcast to all sahibinden tabs
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
          const payload = { tkgmStatus: `Error: ${err.message} (${count}/70)` };
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

    return true; // keep channel open for async sendResponse
  }

  // Legacy manual "Open TKGM" button — still opens a tab for manual use
  if (msg.type === 'openTkgm' && msg.values) {
    chrome.storage.local.set({ tkgmAutoData: msg.values, tkgmAutoRun: true }, () => {
      chrome.tabs.create({ url: 'https://parselsorgu.tkgm.gov.tr/', active: true }, tab => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  // Broadcast from TKGM content script (legacy tab path)
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url || !tab.url.includes('parselsorgu.tkgm.gov.tr')) return;
  chrome.storage.local.get(['tkgmAutoRun'], data => {
    if (data && data.tkgmAutoRun) {
      chrome.tabs.sendMessage(tabId, { type: 'fillTkgm' });
    }
  });
});
