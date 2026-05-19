// Popup açıldığında Chrome/Firefox hafızasındaki (storage) son verileri okuyup ekrana basar.
async function showStoredCity() {
  try {
    // Hafızadaki tüm ihtiyacımız olan alanları topluca çekiyoruz
    const data = await browser.storage.local.get(['city', 'district', 'street', 'adaNo', 'parselNo', 'tapuAlani', 'nitelik', 'tkgmStatus', 'tkgmRequestCount', 'tkgmRequestDate']);
    
    // Değerleri ilgili HTML elementlerine yazıyoruz, boşsa 'Not set' diyelim şimdilik
    document.getElementById('city').textContent = data.city || 'Not set';
    document.getElementById('district').textContent = data.district || 'Not set';
    const streetEl = document.getElementById('street');
    if (streetEl) streetEl.textContent = data.street || 'Not set';
    const adaEl = document.getElementById('adaNo');
    if (adaEl) adaEl.textContent = data.adaNo || 'Not set';
    const parselEl = document.getElementById('parselNo');
    if (parselEl) parselEl.textContent = data.parselNo || 'Not set';
    const tapuAlaniEl = document.getElementById('tapuAlani');
    if (tapuAlaniEl) tapuAlaniEl.textContent = data.tapuAlani || 'Not set';
    const nitelikEl = document.getElementById('nitelik');
    if (nitelikEl) nitelikEl.textContent = data.nitelik || 'Not set';
    const statusEl = document.getElementById('tkgm-status');
    if (statusEl) statusEl.textContent = data.tkgmStatus || 'Not started';

    // Günlük limit sayacını hesaplayıp ekrana yazıyoruz (tarih bugüne eşit değilse sıfırlanmış say)
    const dailyCountEl = document.getElementById('daily-count');
    if (dailyCountEl) {
      const today = new Date().toDateString();
      const count = data.tkgmRequestDate === today ? (data.tkgmRequestCount || 0) : 0;
      dailyCountEl.textContent = `${count}/70`;
    }
  } catch (e) {
    // Bir şeyler ters giderse ekranda hata yazsın ki anlayalım
    document.getElementById('city').textContent = 'Error';
    document.getElementById('district').textContent = 'Error';
    const streetEl = document.getElementById('street');
    if (streetEl) streetEl.textContent = 'Error';
    const adaEl = document.getElementById('adaNo');
    if (adaEl) adaEl.textContent = 'Error';
    const parselEl = document.getElementById('parselNo');
    if (parselEl) parselEl.textContent = 'Error';
    const tapuAlaniEl = document.getElementById('tapuAlani');
    if (tapuAlaniEl) tapuAlaniEl.textContent = 'Error';
    const nitelikEl = document.getElementById('nitelik');
    if (nitelikEl) nitelikEl.textContent = 'Error';
    const statusEl = document.getElementById('tkgm-status');
    if (statusEl) statusEl.textContent = 'Error';
    const dailyCountEl = document.getElementById('daily-count');
    if (dailyCountEl) dailyCountEl.textContent = 'Error';
  }
}

// Popup'ın HTML içeriği yüklendiğinde çalışacak kısım
document.addEventListener('DOMContentLoaded', () => {
  showStoredCity(); // Önce bir verileri çekip gösterelim
  
  // Eğer biz popup'a bakarken arka planda bir sorgu biterse, anında ekranda da güncellensin diye dinleyici koyduk
  if (browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      
      if (changes.tkgmStatus) {
        const statusEl = document.getElementById('tkgm-status');
        if (statusEl) statusEl.textContent = changes.tkgmStatus.newValue || 'Not started';
      }
      if (changes.tapuAlani) {
        const el = document.getElementById('tapuAlani');
        if (el) el.textContent = changes.tapuAlani.newValue || 'Not set';
      }
      if (changes.nitelik) {
        const el = document.getElementById('nitelik');
        if (el) el.textContent = changes.nitelik.newValue || 'Not set';
      }
      if (changes.tkgmRequestCount || changes.tkgmRequestDate) {
        showStoredCity(); // Sayaç güncellenirse tüm formu bir daha tazelemek en temizi
      }
    });
  }
});
