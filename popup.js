async function showStoredCity() {
  try {
    const data = await browser.storage.local.get(['city', 'district', 'street', 'adaNo', 'parselNo', 'tapuAlani', 'nitelik', 'tkgmStatus']);
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
  } catch (e) {
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
  }
}

document.getElementById('get-url').addEventListener('click', async () => {
  try {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    const url = tabs[0]?.url || 'No active tab';
    document.getElementById('url').textContent = url;
  } catch (err) {
    document.getElementById('url').textContent = 'Error: ' + err.message;
  }
});

document.getElementById('open-tkgm').addEventListener('click', async () => {
  const statusEl = document.getElementById('tkgm-status');
  statusEl.textContent = 'Opening TKGM...';
  try {
    const data = await browser.storage.local.get(['city', 'district', 'street', 'adaNo', 'parselNo']);
    if (!data.city || !data.district || !data.street || !data.adaNo || !data.parselNo) {
      statusEl.textContent = 'Missing listing data';
      return;
    }
    const response = await browser.runtime.sendMessage({type: 'openTkgm', values: data});
    statusEl.textContent = response && response.success ? 'TKGM opened' : 'Failed to open TKGM';
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  showStoredCity();
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
    });
  }
});
