(() => {
  const host = (location.hostname || '').toLowerCase();
  const allowed = /(^|\.)sahibinden\.com$/.test(host) || host === 'parselsorgu.tkgm.gov.tr';
  if (!allowed) return;

  const citySelector = '.classifiedInfo > h2:nth-child(4) > a:nth-child(1)';
  const districtSelector = '.classifiedInfo > h2:nth-child(4) > a:nth-child(3)';
  const streetSelector = '.classifiedInfo > h2:nth-child(4) > a:nth-child(5)';
  const adaSelector = '.classifiedInfoList > li:nth-child(7) > span:nth-child(2)';
  const parselSelector = '.classifiedInfoList > li:nth-child(8) > span:nth-child(2)';

  function getText(selector) {
    try {
      const el = document.querySelector(selector);
      return el ? el.textContent.trim() : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeText(value) {
    return String(value || '')
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
      .replace(/[^a-z0-9/\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getModalText(selector) {
    try {
      const el = document.querySelector(selector);
      return el ? el.textContent.trim() : null;
    } catch (e) {
      return null;
    }
  }

  function sanitizeDigits(value) {
    return String(value || '').replace(/[^0-9]/g, '');
  }

  function clickSelector(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    try { el.click(); return true; } catch (e) { return false; }
  }

  function simulateMouseClick(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    } catch (e) {}
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    try {
      el.dispatchEvent(new MouseEvent('mousemove', opts));
      el.dispatchEvent(new MouseEvent('mouseover', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    } catch (e) {
      return false;
    }
  }

  function simulateClickSelector(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    return simulateMouseClick(el);
  }

  function setInputValue(selector, value) {
    if (value == null) return false;
    let el = document.querySelector(selector) || document.querySelector(selector + ' input');
    if (!el) el = document.querySelector('#administrative-query-container input[type="text"]');
    if (!el) {
      const inputs = Array.from(document.querySelectorAll('#administrative-query-container input[type="text"], #administrative-query-container input'));
      if (inputs.length >= 2) {
        el = selector.includes('block') ? inputs[0] : selector.includes('parcel') ? inputs[1] : inputs[0];
      }
    }
    if (!el) return false;
    try {
      el.focus && el.focus();
      el.value = '';
      dispatchInputEvents(el);
      const s = String(value);
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true }));
        el.value += ch;
        dispatchInputEvents(el);
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
      }
      dispatchInputEvents(el);
      el.blur && el.blur();
      return true;
    } catch (e) {
      try { el.value = String(value); dispatchInputEvents(el); return true; } catch (e2) { return false; }
    }
  }

  function getMatchScore(source, target) {
      const a = normalizeText(source || '');
      const b = normalizeText(target || '');
      if (!a || !b) return 0;
      if (a === b) return 1;

      function levenshtein(aStr, bStr) {
        const aLen = aStr.length;
        const bLen = bStr.length;
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
      const intersection = aParts.filter(part => bParts.includes(part));
      const union = Array.from(new Set([...aParts, ...bParts]));
      const jaccard = union.length ? intersection.length / union.length : 0;

      const prefixBonus = (aParts[0] && bParts[0] && aParts[0] === bParts[0]) ? 0.08 : 0;
      const includesBonus = (a.includes(b) || b.includes(a)) ? 0.15 : 0;

      // Blend scores: give more weight to Levenshtein for typo resilience
      const score = Math.max(levSim * 0.6 + jaccard * 0.3 + prefixBonus + includesBonus, 0);
      return Math.min(score, 1);
    }

    function setSelectBySimilarText(selector, text) {
      const el = document.querySelector(selector);
      if (!el || !text) return false;
      const search = normalizeText(text);
      const options = Array.from(el.options || []);

      // If exact or clear include exists, pick it quickly
      let exact = options.find(o => normalizeText(o.textContent) === search);
      if (exact) {
        el.value = exact.value;
        dispatchInputEvents(el);
        return true;
      }

      // Compute best fuzzy match
      let best = null;
      let bestScore = 0;
      for (const o of options) {
        const score = getMatchScore(o.textContent, search);
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      }

      // Lower threshold but ensure reasonable similarity
      if (!best || bestScore < 0.25) return false;
      el.value = best.value;
      dispatchInputEvents(el);
      return true;
    }

    async function waitForDropdownOption(selector, text, interval = 150, maxAttempts = 60) {
      const search = normalizeText(text);
      return retry(() => {
        const el = document.querySelector(selector);
        if (!el) return false;
        return Array.from(el.options || []).some(o => getMatchScore(o.textContent, search) >= 0.25);
      }, interval, maxAttempts);
    }

    // Waits for the query button to become clickable (not disabled, visible).
    // Falls back after maxMs if it never becomes enabled.
    function waitForQueryButtonReady(btnSelector = '#administrative-query-btn', maxMs = 3000) {
      return new Promise(resolve => {
        const start = Date.now();
        // Check immediately
        const el = document.querySelector(btnSelector);
        if (el && !el.disabled) { resolve(true); return; }

        let mo;
        const done = (result) => {
          if (mo) { try { mo.disconnect(); } catch (e) {} }
          clearInterval(poll);
          resolve(result);
        };

        // MutationObserver reacts instantly when the button's disabled attr changes
        try {
          mo = new MutationObserver(() => {
            const btn = document.querySelector(btnSelector);
            if (btn && !btn.disabled) done(true);
          });
          const container = document.querySelector('#administrative-query-container') || document.body;
          mo.observe(container, { subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });
        } catch (e) {}

        // Fallback poll at 100ms intervals
        const poll = setInterval(() => {
          const btn = document.querySelector(btnSelector);
          if ((btn && !btn.disabled) || Date.now() - start >= maxMs) {
            done(!!(btn && !btn.disabled));
          }
        }, 100);
      });
    }

    // Waits for a leaflet map polygon to exist in the DOM.
    function waitForLeafletReady(maxMs = 3000) {
      return new Promise(resolve => {
        const start = Date.now();
        const check = () => !!(document.querySelector('path.leaflet-interactive') || document.querySelector('.leaflet-interactive'));
        if (check()) { resolve(true); return; }

        let mo;
        const done = (result) => {
          if (mo) { try { mo.disconnect(); } catch (e) {} }
          clearInterval(poll);
          resolve(result);
        };

        try {
          mo = new MutationObserver(() => { if (check()) done(true); });
          mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
        } catch (e) {}

        const poll = setInterval(() => {
          if (check() || Date.now() - start >= maxMs) done(check());
        }, 100);
      });
    }
  function fetchModalValues() {
    const modal = document.querySelector('#modal-region') || document.querySelector('.modal') || document.body;
    // Try exact known selectors first (modal-local then document-wide)
    const selTapu = '.table > tbody:nth-child(1) > tr:nth-child(7) > td:nth-child(2)';
    const selNitelik = '.table > tbody:nth-child(1) > tr:nth-child(8) > td:nth-child(2)';
    try {
      let tEl = null, nEl = null;
      if (modal && modal.querySelector) {
        try { tEl = modal.querySelector(selTapu); } catch (e) { tEl = null; }
        try { nEl = modal.querySelector(selNitelik); } catch (e) { nEl = null; }
      }
      if (!tEl) {
        try { tEl = document.querySelector(selTapu); } catch (e) { tEl = null; }
      }
      if (!nEl) {
        try { nEl = document.querySelector(selNitelik); } catch (e) { nEl = null; }
      }
      const tapuExact = tEl ? (tEl.textContent || '').trim() : null;
      const nitelikExact = nEl ? (nEl.textContent || '').trim() : null;
      if ((tapuExact && tapuExact !== '-') || (nitelikExact && nitelikExact !== '-')) {
        return { tapu: tapuExact || null, nitelik: nitelikExact || null };
      }
    } catch (e) { /* ignore selector errors */ }

    // Prefer tables inside modal, but fallback to document tables if modal has none
    let tables = [];
    try {
      if (modal && modal.querySelectorAll) tables = Array.from(modal.querySelectorAll('table'));
    } catch (e) { tables = []; }
    if (!tables.length) {
      try { tables = Array.from(document.querySelectorAll('table')); } catch (e) { tables = []; }
    }
    const labelCandidates = ['tapu alan', 'tapu alanı', 'tapu alanı (m2)', 'tapu', 'tapualani'];
    const nitelikCandidates = ['nitelik', 'niteli'];
    let tapu = null, nitelik = null;

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr'));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length < 2) continue;
        const key = normalizeText(cells[0].textContent || '');
        const val = (cells[1].textContent || '').trim();
        if (!tapu) {
          for (const cand of labelCandidates) {
            if (key.includes(normalizeText(cand))) { tapu = val; break; }
          }
        }
        if (!nitelik) {
          for (const cand of nitelikCandidates) {
            if (key.includes(normalizeText(cand))) { nitelik = val; break; }
          }
        }
        if (tapu && nitelik) break;
      }
      if (tapu && nitelik) break;
    }
    return { tapu, nitelik };
  }

  async function waitForModalData(intervalMs = 500, maxAttempts = 40) {
    return new Promise(resolve => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        const { tapu, nitelik } = fetchModalValues();
        if ((tapu && String(tapu).trim()) || (nitelik && String(nitelik).trim()) || attempts >= maxAttempts) {
          clearInterval(timer);
          resolve({ tapu: tapu || null, nitelik: nitelik || null });
        }
      }, intervalMs);
    });
  }

  async function waitForModalOpen(interval = 200, maxAttempts = 25) {
    return retry(() => {
      try {
        const bodyOpen = document.body && document.body.classList && document.body.classList.contains('modal-open');
        const modal = document.querySelector('#modal-region');
        const modalIn = modal && modal.classList && modal.classList.contains('in');
        return !!(bodyOpen && modalIn);
      } catch (e) {
        return false;
      }
    }, interval, maxAttempts);
  }

  async function waitForModalContent(timeoutMs = 10000) {
    return new Promise(resolve => {
      const start = Date.now();
      const checkNow = () => {
        try {
          const data = fetchModalValues();
          const goodTapu = data.tapu && String(data.tapu).trim() && String(data.tapu).trim() !== '-';
          const goodNitelik = data.nitelik && String(data.nitelik).trim() && String(data.nitelik).trim() !== '-';
          if (goodTapu || goodNitelik) return data;
        } catch (e) {}
        return null;
      };

      const immediate = checkNow();
      if (immediate) { resolve(immediate); return; }

      const modal = document.querySelector('#modal-region') || document.querySelector('.modal') || document.documentElement;
      let mo;
      try {
        mo = new MutationObserver(() => {
          const found = checkNow();
          if (found) {
            try { mo.disconnect(); } catch (e) {}
            resolve(found);
          }
        });
        mo.observe(modal, { childList: true, subtree: true, characterData: true, attributes: true });
      } catch (e) {
        // ignore observer errors
      }

      const poll = setInterval(() => {
        const found = checkNow();
        if (found) {
          clearInterval(poll);
          try { mo && mo.disconnect(); } catch (e) {}
          resolve(found);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(poll);
          try { mo && mo.disconnect(); } catch (e) {}
          resolve(fetchModalValues());
        }
      }, 400);
    });
  }

  async function analyzeHashPage() {
    try {
      if (!location.hash || !location.hash.includes('#ara/idari')) return;
      // Wait for leaflet map to be ready instead of a blind sleep
      await waitForLeafletReady(3000);
      loadStoredData(async (values) => {
        // try clicking any map polygon that may open a popup
        await retry(() => simulateClickSelector('path.leaflet-interactive:nth-child(2)') || simulateClickSelector('.leaflet-interactive') || clickSelector('.leaflet-interactive') || clickSelector('path.leaflet-interactive'), 200, 20);
        // Small yield to let the click event propagate
        await sleep(100);

        // try to activate modal region if present
        try {
          const modalRegion = document.querySelector('#modal-region');
          if (modalRegion) {
            modalRegion.click && modalRegion.click();
            modalRegion.dispatchEvent && modalRegion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }
        } catch (e) { /* ignore */ }

        const modalOpen = await waitForModalOpen(100, 30);
        if (!modalOpen) {
          await sleep(200);
        }

        const modalData = await waitForModalData(300, 40);
        const finalStatus = modalData.tapu || modalData.nitelik ? 'Modal loaded (hash)' : 'Modal not found (hash)';
        const updated = { ...(values || {}), tapuAlani: modalData.tapu, nitelik: modalData.nitelik, status: finalStatus };
        renderInfoBox(updated);
        saveTkgmStatus(updated);
      });
    } catch (e) {
      console.warn('[Addon] analyzeHashPage error', e);
    }
  }

  function retry(action, interval = 500, maxAttempts = 20) {
    return new Promise(resolve => {
      // Check immediately before the first interval
      if (action()) { resolve(true); return; }
      let attempts = 1;
      const timer = setInterval(() => {
        attempts += 1;
        if (action() || attempts >= maxAttempts) {
          clearInterval(timer);
          resolve(action());
        }
      }, interval);
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function renderInfoBox(data) {
    const id = 'sahibinden-addon-info';
    let container = document.getElementById(id);

    if (!container) {
      container = document.createElement('div');
      container.id = id;
      container.className = 'mhsmlno';
      container.style.overflow = 'auto';
      container.style.marginTop = '15px';
    }

    const fields = [
      ['City', data.city || '-'],
      ['District', data.district || '-'],
      ['Street', data.street || '-'],
      ['AdaNo', data.adaNo || '-'],
      ['ParselNo', data.parselNo || '-'],
      ['TapuAlanı', data.tapuAlani || '-'],
      ['Nitelik', data.nitelik || '-'],
      ['URL', data.url || '-'],
      ['Scraped', data.scrapedAt || '-'],
      ['Status', data.status || '-']
    ];

    let bodyRows = '';
    for (let i = 0; i < fields.length; i++) {
      const [k, v] = fields[i];
      const bgColor = i % 2 === 0 ? 'rgb(239, 239, 239)' : 'rgb(245, 245, 245)';
      let displayValue = v;
      if (k === 'Status' && typeof v === 'string' && (v.toLowerCase().includes('error') || v.toLowerCase().includes('limit'))) {
        displayValue = `<span style="color:red; font-weight:bold;">${v}</span>`;
      } else if (k === 'Status' && typeof v === 'string' && v.toLowerCase().includes('done')) {
        displayValue = `<span style="color:green; font-weight:bold;">${v}</span>`;
      }
      bodyRows += `<tr style="background-color: ${bgColor};"><td style="padding: 3px; text-align: left; padding-left:6px; width: 35%;">${k}</td><td style="padding: 3px; text-align: left; padding-left:6px;">${displayValue}</td></tr>`;
    }

    container.innerHTML = `<table style="width: 100%;"><thead class="waiu" style="background: -webkit-linear-gradient(rgb(221, 221, 221) 0px, rgb(238, 238, 238) 100%);"><tr><th class="iyguml">Yer</th><th class="iyguml">Bilgi</th></tr></thead><tbody>${bodyRows}</tbody></table>`;

    const targetContainer = document.querySelector('.classifiedOtherBoxes');
    if (!document.getElementById(id)) {
      if (targetContainer) {
        targetContainer.appendChild(container);
        console.log('[Addon] Inserted info box into classifiedOtherBoxes');
      } else {
        (document.body || document.documentElement).appendChild(container);
        console.log('[Addon] classifiedOtherBoxes not found, appended to body');
      }
    } else {
      console.log('[Addon] Updated existing info box');
    }
    // Ensure placement in case `.classifiedOtherBoxes` appears later
    ensureInfoBoxPlacement();
    // Add TKGM open button for sahibinden pages
    try {
      const existingBtn = container.querySelector('#open-tkgm-from-box');
      if (!existingBtn) {
        const actions = document.createElement('div');
        actions.className = 'mhsmlno-actions';
        actions.style.marginTop = '8px';
        actions.style.textAlign = 'left';

        const btn = document.createElement('button');
        btn.id = 'open-tkgm-from-box';
        btn.textContent = 'Open TKGM';
        btn.style.padding = '6px 10px';
        btn.style.border = '1px solid #888';
        btn.style.background = '#f5f5f5';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => {
          try { saveTkgmStatus({ status: 'Opening TKGM...' }); } catch (e) {}
          const getData = callback => {
            try {
              if (typeof browser !== 'undefined') {
                browser.storage.local.get(['city','district','street','adaNo','parselNo']).then(data => callback(data)).catch(() => callback({}));
              } else if (typeof chrome !== 'undefined') {
                chrome.storage.local.get(['city','district','street','adaNo','parselNo'], data => callback(data || {}));
              } else callback({});
            } catch (e) { callback({}); }
          };

          getData(async (data) => {
            if (!data || !data.city || !data.district || !data.street || !data.adaNo || !data.parselNo) {
              saveTkgmStatus({ status: 'Missing listing data' });
              return;
            }
            try {
              if (typeof browser !== 'undefined') {
                await browser.runtime.sendMessage({ type: 'openTkgm', values: data });
                saveTkgmStatus({ status: 'TKGM opened' });
              } else if (typeof chrome !== 'undefined') {
                chrome.runtime.sendMessage({ type: 'openTkgm', values: data }, resp => {
                  saveTkgmStatus({ status: resp && resp.success ? 'TKGM opened' : 'Failed to open TKGM' });
                });
              }
            } catch (e) {
              saveTkgmStatus({ status: 'Error opening TKGM' });
            }
          });
        });

        actions.appendChild(btn);
        container.appendChild(actions);
      }
    } catch (e) { /* ignore */ }
  }

  function ensureInfoBoxPlacement() {
    try {
      const id = 'sahibinden-addon-info';
      const container = document.getElementById(id);
      if (!container) return;
      const target = document.querySelector('.classifiedOtherBoxes');
      if (target && container.parentNode !== target) {
        target.appendChild(container);
        console.log('[Addon] Moved info box into classifiedOtherBoxes');
        if (window.__movedInfoBoxObserver) {
          try { window.__movedInfoBoxObserver.disconnect(); } catch (e) {}
          window.__movedInfoBoxObserver = null;
        }
        return;
      }

      // If target not present, set up a one-time observer to move it when available
      if (!target && !window.__movedInfoBoxObserver) {
        const mo = new MutationObserver((mutations, obs) => {
          const found = document.querySelector('.classifiedOtherBoxes');
          if (found) {
            try { found.appendChild(container); } catch (e) {}
            console.log('[Addon] Moved info box into classifiedOtherBoxes (observer)');
            obs.disconnect();
            window.__movedInfoBoxObserver = null;
          }
        });
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
        window.__movedInfoBoxObserver = mo;
      }
    } catch (e) { /* ignore */ }
  }

  function watchStorageChanges() {
    const listener = (changes, area) => {
      if (area !== 'local') return;
      const tracked = ['city', 'district', 'street', 'adaNo', 'parselNo', 'tkgmStatus', 'tapuAlani', 'nitelik'];
      if (!Object.keys(changes).some(key => tracked.includes(key))) return;
      loadStoredData(values => {
        if (values && Object.keys(values).length) {
          // Prevent cross-tab contamination
          if (values.tkgmCachedUrl && values.tkgmCachedUrl !== location.href) return;
          
          values.url = location.href;
          values.scrapedAt = new Date().toLocaleString();
          if (changes.tkgmStatus) values.status = changes.tkgmStatus.newValue;
          if (changes.tapuAlani) values.tapuAlani = changes.tapuAlani.newValue;
          if (changes.nitelik) values.nitelik = changes.nitelik.newValue;
          renderInfoBox(values);
        }
      });
    };

    if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener(listener);
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(listener);
    }
  }

  watchStorageChanges();

  async function fillTkgmForm(values) {
    // mark auto-fill in progress so we can resume after page reload
    try {
      window.__tkgmAutoRunning = true;
    } catch (e) {}
    try {
      localStorage.setItem('tkgm_fill_pending', '1');
    } catch (e) {}
    const status = { status: 'Waiting for form...' };
    renderInfoBox({ ...values, ...status });
    // Brief yield so the browser can process any pending framework updates
    await sleep(50);
    try {

    const cityReady = await retry(() => setSelectBySimilarText('#administrative-query-container > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > select:nth-child(2)', values.city), 150, 40);
    if (!cityReady) {
      const updated = { ...values, status: 'City not found' };
      renderInfoBox(updated);
      saveTkgmStatus(updated);
      return;
    }
    // Small yield for framework to react to city selection before district loads
    await sleep(50);

    const districtSelector = '#administrative-query-container > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > select:nth-child(2)';
    const districtReady = await waitForDropdownOption(districtSelector, values.district);
    if (!districtReady) {
      const updated = { ...values, status: 'District options not loaded yet' };
      renderInfoBox(updated);
      saveTkgmStatus(updated);
      return;
    }

    const districtSelected = await retry(() => setSelectBySimilarText(districtSelector, values.district), 150, 40);
    if (!districtSelected) {
      const updated = { ...values, status: 'District not found' };
      renderInfoBox(updated);
      saveTkgmStatus(updated);
      return;
    }
    // Small yield for framework to react to district selection before street loads
    await sleep(50);

    const streetSelector = '#administrative-query-container > div:nth-child(1) > div:nth-child(3) > div:nth-child(1) > select:nth-child(2)';
    const streetReady = await waitForDropdownOption(streetSelector, values.street);
    if (!streetReady) {
      const updated = { ...values, status: 'Street options not loaded yet' };
      renderInfoBox(updated);
      saveTkgmStatus(updated);
      return;
    }

    const streetSelected = await retry(() => setSelectBySimilarText(streetSelector, values.street), 150, 40);
    if (!streetSelected) {
      const updated = { ...values, status: 'Street not found' };
      renderInfoBox(updated);
      saveTkgmStatus(updated);
      return;
    }
    // Small yield before filling numeric inputs
    await sleep(50);

    const blockReady = setInputValue('#block-input', sanitizeDigits(values.adaNo));
    const parcelReady = setInputValue('#parcel-input', sanitizeDigits(values.parselNo));
    if (!blockReady || !parcelReady) {
      const updated = { ...values, status: 'AdaNo or ParselNo input not found' };
      renderInfoBox(updated);
      saveTkgmStatus(updated);
      return;
    }

    // Wait for the query button to become ready (replaces blind 3000ms sleep).
    // TKGM typically enables it within a few hundred ms after the inputs are set.
    await waitForQueryButtonReady('#administrative-query-btn', 3000);

    const queryReady = { ...values, status: 'Ready to query' };
    renderInfoBox(queryReady);
    saveTkgmStatus(queryReady);
    clickSelector('#administrative-query-btn');
    // Small yield then wait for leaflet polygons to render before clicking
    await sleep(50);

    // Wait for the map to render a polygon, then click it
    await waitForLeafletReady(5000);
    const clicked = await retry(() => simulateClickSelector('path.leaflet-interactive:nth-child(2)') || simulateClickSelector('.leaflet-interactive') || clickSelector('.leaflet-interactive') || clickSelector('path.leaflet-interactive'), 200, 30);
    if (!clicked) {
      const updated = { ...values, status: 'No map polygon found' };
      renderInfoBox(updated);
      saveTkgmStatus(updated);
      return;
    }

    // Try to activate the modal region (some pages open popup on a separate element)
    try {
      const modalRegion = document.querySelector('#modal-region');
      if (modalRegion) {
        modalRegion.click && modalRegion.click();
        modalRegion.dispatchEvent && modalRegion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    } catch (e) { /* ignore */ }

    // Wait for modal to be visible (body.modal-open and #modal-region.in) — no blind sleep
    const modalOpen = await waitForModalOpen(100, 30);
    if (!modalOpen) {
      // try clicking modal-region again briefly
      try {
        const modalRegion2 = document.querySelector('#modal-region');
        if (modalRegion2) modalRegion2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      } catch (e) { }
      // One last short wait if modal still hasn't opened
      await waitForModalOpen(100, 15);
    }

    const modalData = await waitForModalContent(5000);
    const finalStatus = modalData.tapu || modalData.nitelik ? 'Modal loaded' : 'Modal not found';
    const updated = { ...values, tapuAlani: modalData.tapu, nitelik: modalData.nitelik, status: finalStatus };
    renderInfoBox(updated);
    saveTkgmStatus(updated);
    // Signal background to close this tab (background auto-fill mode)
    try {
      if (typeof browser !== 'undefined') {
        browser.runtime.sendMessage({ type: 'tkgmDone' }).catch(() => {});
      } else if (typeof chrome !== 'undefined') {
        chrome.runtime.sendMessage({ type: 'tkgmDone' });
      }
    } catch (e) {}
    } finally {
      try { localStorage.removeItem('tkgm_fill_pending'); } catch (e) {}
      try { window.__tkgmAutoRunning = false; } catch (e) {}
    }
  }

  function savePageData() {
    const city = getText(citySelector);
    const district = getText(districtSelector);
    const street = getText(streetSelector);
    const adaNo = getText(adaSelector);
    const parselNo = getText(parselSelector);
    const toSave = {};
    if (city) toSave.city = city;
    if (district) toSave.district = district;
    if (street) toSave.street = street;
    if (adaNo) toSave.adaNo = adaNo;
    if (parselNo) toSave.parselNo = parselNo;

    if (Object.keys(toSave).length === 0) return false;

    toSave.url = location.href;
    toSave.scrapedAt = new Date().toLocaleString();

    if (typeof browser !== 'undefined') {
      browser.storage.local.set(toSave).catch(() => {});
    } else if (typeof chrome !== 'undefined') {
      chrome.storage.local.set(toSave);
    }

    console.log('[Addon] Saved values:', toSave);
    // Merge with any previously scraped TKGM values so they are not wiped,
    // then decide whether to auto-trigger a background TKGM lookup.
    try {
      loadStoredData(stored => {
        const merged = { ...toSave };
        const cacheHit = stored.tkgmCachedUrl && stored.tkgmCachedUrl === toSave.url;
        
        if (cacheHit) {
          if (stored.tapuAlani) merged.tapuAlani = stored.tapuAlani;
          if (stored.nitelik) merged.nitelik = stored.nitelik;
          if (stored.tkgmStatus) merged.status = stored.tkgmStatus;
        } else {
          // New URL -> clear old data so it doesn't mislead the user
          merged.tapuAlani = '';
          merged.nitelik = '';
          merged.status = 'New listing detected, checking...';
        }
        
        renderInfoBox(merged);

        // --- Auto-trigger TKGM background API lookup ---
        // Skip if: already running, or we have both values for this URL
        const alreadyRunning = !!window.__tkgmAutoRunning;
        const fullCacheHit = cacheHit && stored.tapuAlani && stored.nitelik;
        if (!alreadyRunning && !fullCacheHit) {
          window.__tkgmAutoRunning = true;
          renderInfoBox({ ...merged, status: 'TKGM lookup running...' });
          const trigger = () => {
            try {
              if (typeof browser !== 'undefined') {
                browser.runtime.sendMessage({ type: 'autoTkgm', values: toSave })
                  .catch(() => { window.__tkgmAutoRunning = false; });
              } else if (typeof chrome !== 'undefined') {
                chrome.runtime.sendMessage({ type: 'autoTkgm', values: toSave }, () => {
                  window.__tkgmAutoRunning = false;
                });
              }
            } catch (e) { window.__tkgmAutoRunning = false; }
          };
          trigger();
        }
      });
    } catch (e) { /* ignore */ }
    return true;
  }

  function loadStoredData(callback) {
    try {
      const keys = ['city', 'district', 'street', 'adaNo', 'parselNo', 'tkgmStatus', 'tapuAlani', 'nitelik', 'tkgmCachedUrl'];
      if (typeof browser !== 'undefined') {
        browser.storage.local.get(keys).then(data => callback(data)).catch(() => callback({}));
      } else if (typeof chrome !== 'undefined') {
        chrome.storage.local.get(keys, data => callback(data || {}));
      }
    } catch (e) {
      callback({});
    }
  }

  function saveTkgmStatus(values) {
    const save = { tkgmStatus: values.status || '' };
    if (values.tapuAlani) save.tapuAlani = values.tapuAlani;
    if (values.nitelik) save.nitelik = values.nitelik;
    // Cache the listing URL so sahibinden page can detect a hit on next load
    if ((values.tapuAlani || values.nitelik) && values.url) {
      save.tkgmCachedUrl = values.url;
    }
    if (typeof browser !== 'undefined') {
      browser.storage.local.set(save).catch(() => {});
      try { browser.runtime.sendMessage({ type: 'tkgmStatusChanged', payload: save }).catch(() => {}); } catch (e) {}
    } else if (typeof chrome !== 'undefined') {
      chrome.storage.local.set(save, () => {
        try { chrome.runtime.sendMessage({ type: 'tkgmStatusChanged', payload: save }); } catch (e) {}
      });
    }
  }

  function onFillTkgmMessage() {
    if (window.__tkgmAutoRunning) return;
    loadStoredData(values => {
      if (!values || !values.city || !values.district || !values.street || !values.adaNo || !values.parselNo) {
        renderInfoBox({ ...values, status: 'Missing stored data for TKGM search' });
        return;
      }
      fillTkgmForm(values);
    });
  }

  const isTkgm = location.hostname.includes('parselsorgu.tkgm.gov.tr');

  if (typeof browser !== 'undefined' && browser.runtime) {
    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'fillTkgm') {
        onFillTkgmMessage();
        sendResponse({ started: true });
      }
      if (msg && msg.type === 'tkgmUpdated') {
        // Another tab reports TKGM update; refresh stored data and UI
        loadStoredData(values => {
          if (values && Object.keys(values).length) {
            if (values.tkgmCachedUrl && values.tkgmCachedUrl !== location.href) return;
            values.url = location.href;
            values.scrapedAt = new Date().toLocaleString();
            renderInfoBox(values);
          }
        });
      }
    });
  } else if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'fillTkgm') {
        onFillTkgmMessage();
        sendResponse({ started: true });
      }
      if (msg && msg.type === 'tkgmUpdated') {
        loadStoredData(values => {
          if (values && Object.keys(values).length) {
            if (values.tkgmCachedUrl && values.tkgmCachedUrl !== location.href) return;
            values.url = location.href;
            values.scrapedAt = new Date().toLocaleString();
            renderInfoBox(values);
          }
        });
      }
    });
  }

  if (isTkgm) {
    const pending = (() => { try { return !!localStorage.getItem('tkgm_fill_pending'); } catch (e) { return false; } })();
    const hashPending = location.hash && location.hash.includes('#ara/idari');
    if (hashPending) {
      analyzeHashPage();
    } else if (pending) {
      onFillTkgmMessage();
    } else {
      loadStoredData(values => {
        if (!values || !values.city || !values.district || !values.street || !values.adaNo || !values.parselNo) {
          renderInfoBox({ ...values, status: 'Missing stored data for TKGM search' });
          return;
        }
        renderInfoBox({ ...values, status: 'Waiting for TKGM button click' });
      });
    }
    return;
  }

  // Initial load
  loadStoredData(values => {
    if (values && Object.keys(values).length) {
      if (values.tkgmCachedUrl && values.tkgmCachedUrl !== location.href) return;
      values.url = location.href;
      values.scrapedAt = new Date().toLocaleString();
      renderInfoBox(values);
    }
  });

  // Track URL to handle SPA navigation and retry scraping if DOM is slow
  let lastUrl = location.href;
  let scrapeAttempts = 0;
  
  const attemptScrape = () => {
    if (savePageData()) {
      scrapeAttempts = 0; // Success
    } else {
      scrapeAttempts++;
      if (scrapeAttempts < 15) {
        setTimeout(attemptScrape, 500); // Retry a few times if DOM elements are missing
      }
    }
  };

  attemptScrape();

  // Watch for SPA URL changes
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scrapeAttempts = 0;
      attemptScrape();
    }
  }, 1000);
})();
