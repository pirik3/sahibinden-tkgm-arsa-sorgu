chrome.runtime.onInstalled.addListener(() => {
  console.log('Simple Firefox Add-on installed');
});

// Track the background TKGM tab so we can close it when done
let tkgmTabId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'openTkgm' && msg.values) {
    const openInBackground = !!msg.background;
    chrome.storage.local.set({ tkgmAutoData: msg.values, tkgmAutoRun: true }, () => {
      chrome.tabs.create({ url: 'https://parselsorgu.tkgm.gov.tr/', active: !openInBackground }, tab => {
        if (openInBackground) tkgmTabId = tab.id;
        sendResponse({ success: true });
      });
    });
    return true;
  }

  // TKGM tab finished — close it if it was a background tab
  if (msg.type === 'tkgmDone') {
    if (tkgmTabId !== null) {
      try { chrome.tabs.remove(tkgmTabId); } catch (e) {}
      tkgmTabId = null;
    } else if (sender && sender.tab && sender.tab.id) {
      // fallback: close whichever tab sent the message if it's a TKGM tab
      try {
        if (sender.tab.url && sender.tab.url.includes('parselsorgu.tkgm.gov.tr')) {
          chrome.tabs.remove(sender.tab.id);
        }
      } catch (e) {}
    }
    chrome.storage.local.set({ tkgmAutoRun: false });
  }

  // Broadcast TKGM status updates from the TKGM tab to sahibinden tabs
  if (msg.type === 'tkgmStatusChanged' && msg.payload) {
    try {
      chrome.tabs.query({}, tabs => {
        for (const t of tabs) {
          try {
            if (t && t.url && t.id && (t.url.includes('sahibinden.com') || t.url.includes('sahibinden.com/'))) {
              chrome.tabs.sendMessage(t.id, { type: 'tkgmUpdated', payload: msg.payload });
            }
          } catch (e) { /* ignore per-tab errors */ }
        }
      });
    } catch (e) { /* ignore broadcast errors */ }
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
