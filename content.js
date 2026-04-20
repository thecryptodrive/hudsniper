let lastPrice = null;
let currentSignal = null;
let signalLockTime = 0;
const SIGNAL_STABILITY_MS = 5000;

// ==================== NEW THREE-BUTTON SYSTEM ====================
let autofillWindowActive = false;
let autofillWindowExpiry = 0;
let lastClickedInputElement = null;
let countdownInterval = null;

// Track clicks on input fields
document.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
        lastClickedInputElement = e.target;
        console.log('📍 Input clicked:', e.target);
    }
});

// === CONFIGURATION ===
const CONFIG = {
  leverage: 125,
  windowDuration: 30000,
};

// === UTILITY: ROBUST INPUT SIMULATION ===
function setInputElementValue(input, value) {
  if (!input) return false;
  
  input.focus();
  input.value = '';
  
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }

  const inputEvent = new Event('input', { bubbles: true });
  const changeEvent = new Event('change', { bubbles: true });
  
  input.dispatchEvent(inputEvent);
  input.dispatchEvent(changeEvent);
  
  setTimeout(() => {
    input.blur();
  }, 100);

  return true;
}

// ==================== MARKET DATA ====================
function getMarketData() {
    try {
        const priceSelectors = [
            'span.font-700.mr-2',
            'span[class*="font-700"][class*="mr-2"]',
            'span[class*="text-"][class*="font-bold"]',
            '[class*="price"] span',
            '.text-lg.font-bold'
        ];
        
        let priceSpan = null;
        for (const selector of priceSelectors) {
            priceSpan = document.querySelector(selector);
            if (priceSpan && priceSpan.innerText) break;
        }

        const trendDiv = document.querySelector('.flex.items-center.text-down, .flex.items-center.text-up') ||
                         document.querySelector('[class*="text-down"], [class*="text-up"]');

        if (priceSpan) {
            const priceText = priceSpan.innerText.replace(/[^0-9.]/g, '');
            const price = parseFloat(priceText);
            const trend = (trendDiv && trendDiv.classList.contains('text-down')) ? 'DOWN' : 'UP';
            
            console.log('📊 Market data found:', { price, trend });
            return { price: isNaN(price) ? null : price, trend };
        }
        
        console.log('⚠️ Price element not found');
        return null;
    } catch (e) {
        console.error('❌ Error in getMarketData:', e);
        return null;
    }
}

// ==================== PRECISE BC.GAME FIELD FINDERS ====================
function getLeverageInput() {
    return document.querySelector('input[inputmode="numeric"]');
}

function getEntryInput() {
    // Strategy 1: Find by placeholder "Enter the price" (unique to entry field)
    const entryByPlaceholder = document.querySelector('input[placeholder="Enter the price"]');
    if (entryByPlaceholder && entryByPlaceholder.offsetParent !== null) {
        console.log('✅ Found Entry Price input by placeholder');
        return entryByPlaceholder;
    }
    
    // Strategy 2: Find by label "Price(USDT)" that is NOT inside TP/SL section
    const allLabels = document.querySelectorAll('label');
    
    for (const label of allLabels) {
        // Get only the direct text nodes, not text from child elements
        let directText = '';
        label.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                directText += node.textContent;
            }
        });
        directText = directText.trim();
        
        // Check if this is the Entry Price label
        // It should contain "Price" and "USDT" but NOT be inside a TP/SL section
        if ((directText.includes('Price') && directText.includes('USDT')) || 
            directText === 'Price(USDT)') {
            
            // Make sure parent doesn't contain TP/SL indicators
            const parentText = (label.parentElement?.textContent || '').toLowerCase();
            if (parentText.includes('take profit') || 
                parentText.includes('stop loss') ||
                parentText.includes('tp/sl')) {
                continue; // Skip if we're inside TP/SL section
            }
            
            // Find the associated input
            const forId = label.getAttribute('for');
            if (forId) {
                const input = document.getElementById(forId);
                if (input && input.offsetParent !== null) {
                    console.log('✅ Found Entry Price input by ID:', forId);
                    return input;
                }
            }
            
            // Fallback: find input in same form item
            let container = label.closest('.detrade-form-item, [class*="form-item"]');
            if (!container) {
                container = label.parentElement;
            }
            
            if (container) {
                const input = container.querySelector('input[inputmode="decimal"], input[type="text"]');
                if (input && input.offsetParent !== null) {
                    console.log('✅ Found Entry Price input in container');
                    return input;
                }
            }
        }
    }
    
    return null;
}

function getTPSLCheckbox() {
    const labels = document.querySelectorAll('label, div, span');
    for (const label of labels) {
        const text = label.textContent?.toLowerCase() || '';
        if (text.includes('tp/sl') || text.includes('take profit')) {
            const checkbox = label.querySelector('input[type="checkbox"]') ||
                           label.querySelector('div[role="checkbox"]') ||
                           label.querySelector('button[aria-checked]');
            if (checkbox) return checkbox;
            
            if (label.tagName === 'LABEL' || label.onclick || label.style.cursor === 'pointer') {
                return label;
            }
        }
    }
    
    const checkedBoxes = document.querySelectorAll('[aria-checked], [data-checked], input[type="checkbox"]');
    for (const box of checkedBoxes) {
        let parent = box.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
            const text = parent.textContent?.toLowerCase() || '';
            if (text.includes('tp/sl') || text.includes('profit') || text.includes('loss')) {
                return box;
            }
            parent = parent.parentElement;
            depth++;
        }
    }
    
    return null;
}

function getTPInput() {
    // ONLY find inputs under "Take profit at price(USDT)" label
    const labels = document.querySelectorAll('label, div');
    for (const label of labels) {
        const text = label.textContent?.trim() || '';
        if (text.includes('Take profit at price') && text.includes('USDT')) {
            let container = label.closest('.detrade-form-item, [class*="form-item"]') || label.parentElement;
            if (container) {
                const input = container.querySelector('input[placeholder="Price"], input[inputmode="decimal"]');
                if (input && input.offsetParent !== null) {
                    console.log('✅ Found TP input');
                    return input;
                }
            }
        }
    }
    
    const tpLabel = Array.from(document.querySelectorAll('label'))
        .find(l => l.textContent?.includes('Take profit at price'));
    if (tpLabel) {
        const forId = tpLabel.getAttribute('for');
        if (forId) {
            return document.getElementById(forId);
        }
    }
    
    return null;
}

function getSLInput() {
    // ONLY find inputs under "Stop loss at price(USDT)" label
    const labels = document.querySelectorAll('label, div');
    for (const label of labels) {
        const text = label.textContent?.trim() || '';
        if (text.includes('Stop loss at price') && text.includes('USDT')) {
            let container = label.closest('.detrade-form-item, [class*="form-item"]') || label.parentElement;
            if (container) {
                const input = container.querySelector('input[placeholder="Price"], input[inputmode="decimal"]');
                if (input && input.offsetParent !== null) {
                    console.log('✅ Found SL input');
                    return input;
                }
            }
        }
    }
    
    const slLabel = Array.from(document.querySelectorAll('label'))
        .find(l => l.textContent?.includes('Stop loss at price'));
    if (slLabel) {
        const forId = slLabel.getAttribute('for');
        if (forId) {
            return document.getElementById(forId);
        }
    }
    
    return null;
}

// ==================== NATIVE VALUE SETTER WITH RETRIES ====================
const setVal = async (el, val, retries = 1) => {
    if (!el) {
        console.error('❌ setVal: Element is null');
        return false;
    }
    
    console.log(`🔧 setVal: Setting value "${val}" on element`, el);
    
    // Check if value is already set correctly BEFORE doing anything
    if (el.value && el.value.toString().trim() === val.toString().trim()) {
        console.log(`✅ Value already correct: ${val}`);
        return true;
    }
    
    for (let i = 0; i <= retries; i++) {
        try {
            // Focus and clear
            el.focus();
            el.click();
            
            // Use native setter to clear
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            if (setter) {
                setter.call(el, '');
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                el.value = '';
            }
            
            await new Promise(r => setTimeout(r, 30));
            
            // Set the new value
            if (setter) {
                setter.call(el, val.toString());
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                el.value = val.toString();
            }
            
            await new Promise(r => setTimeout(r, 50));
            
            // Verify the value was set
            const currentValue = el.value;
            console.log(`🔍 Verification: Current="${currentValue}", Expected="${val}"`);
            
            if (currentValue && currentValue.toString().trim() === val.toString().trim()) {
                console.log(`✅ Value set successfully: ${val}`);
                el.blur();
                return true;
            }
            
            if (i < retries) {
                console.warn(`⚠️ Attempt ${i+1} failed, retrying...`);
                await new Promise(r => setTimeout(r, 100));
            }
        } catch (e) {
            console.error(`❌ Retry ${i + 1} failed:`, e);
            if (i < retries) await new Promise(r => setTimeout(r, 100));
        }
    }
    
    console.error(`❌ Failed to set value after ${retries + 1} attempts`);
    return false;
};

// ==================== WAIT FOR ELEMENT ====================
const waitForElement = async (selector, timeout = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) return el;
        await new Promise(r => setTimeout(r, 100));
    }
    return null;
};

// ==================== SHOW HUD MANUALLY ====================
async function showHUD() {
    console.log('🎯 Manual HUD trigger');
    
    if (!currentSignal) {
        const data = getMarketData();
        if (data && data.price) {
            const url = window.location.href;
            const symbol = url.includes('ETH') ? 'ETH/USDT' :
                           url.includes('BTC') ? 'BTC/USDT' :
                           url.includes('SOL') ? 'SOL/USDT' : 'BTC/USDT';
            
            currentSignal = {
                symbol,
                side: data.trend === 'UP' ? 'BUY' : 'SELL',
                entry: data.price.toFixed(2),
                tp: data.trend === 'UP' ? (data.price * 1.0025).toFixed(2) : (data.price * 0.9975).toFixed(2),
                sl: data.trend === 'UP' ? (data.price * 0.9988).toFixed(2) : (data.price * 1.0012).toFixed(2),
                leverage: 125
            };
        } else {
            currentSignal = {
                symbol: 'BTC/USDT',
                side: 'BUY',
                entry: '73974.84',
                tp: '74159.78',
                sl: '73882.41',
                leverage: 125
            };
        }
    }
    
    await renderDashboard(currentSignal);
}

// ==================== AUTOFILL LEVERAGE + ENTRY (BUTTON 1) ====================
async function autofillLevEntry() {
    console.log('🎯 [LEV+ENTRY] Button clicked!');
    
    if (!currentSignal) {
        console.error('❌ [LEV+ENTRY] No signal available, generating one...');
        await showHUD();
        if (!currentSignal) {
            alert('❌ Could not generate signal. Please refresh the page.');
            return;
        }
    }

    // Check if window is already active
    if (autofillWindowActive && Date.now() < autofillWindowExpiry) {
        const remaining = Math.ceil((autofillWindowExpiry - Date.now()) / 1000);
        console.log(`⏳ [LEV+ENTRY] Window still active for ${remaining}s`);
        return;
    }

    console.log('🎯 [LEV+ENTRY] Starting with signal:', currentSignal);

    // Load max TP% and SL% settings and apply caps
    const settings = await chrome.storage.local.get(['maxTpPct', 'maxSlPct']);
    const maxTpPct = parseFloat(settings.maxTpPct) || 5;
    const maxSlPct = parseFloat(settings.maxSlPct) || 2;
    
    const entryPrice = parseFloat(currentSignal.entry);
    const isLong = currentSignal.side === 'BUY';
    
    // Calculate capped TP and SL
    let cappedTp, cappedSl;
    if (isLong) {
        // Long: TP above entry, SL below entry
        const maxTp = entryPrice * (1 + maxTpPct / 100);
        const minSl = entryPrice * (1 - maxSlPct / 100);
        const originalTp = parseFloat(currentSignal.tp);
        const originalSl = parseFloat(currentSignal.sl);
        
        cappedTp = Math.min(originalTp, maxTp).toFixed(2);
        cappedSl = Math.max(originalSl, minSl).toFixed(2);
    } else {
        // Short: TP below entry, SL above entry
        const minTp = entryPrice * (1 - maxTpPct / 100);
        const maxSl = entryPrice * (1 + maxSlPct / 100);
        const originalTp = parseFloat(currentSignal.tp);
        const originalSl = parseFloat(currentSignal.sl);
        
        cappedTp = Math.max(originalTp, minTp).toFixed(2);
        cappedSl = Math.min(originalSl, maxSl).toFixed(2);
    }
    
    console.log(`📊 [LEV+ENTRY] TP cap applied: ${maxTpPct}%, SL cap: ${maxSlPct}%`);
    console.log(`   Original TP: ${currentSignal.tp} → Capped: ${cappedTp}`);
    console.log(`   Original SL: ${currentSignal.sl} → Capped: ${cappedSl}`);
    
    // Store capped values in a temporary variable for TP/SL buttons to use
    window.cappedSignalValues = {
        tp: cappedTp,
        sl: cappedSl
    };

    // Step 0: Check and enable TP/SL checkbox if unchecked
    const tpslCheckbox = getTPSLCheckbox();
    if (tpslCheckbox) {
        const isChecked = tpslCheckbox.getAttribute('aria-checked') === 'true' || 
                         tpslCheckbox.getAttribute('data-checked') === 'true' ||
                         tpslCheckbox.checked;
        
        if (!isChecked) {
            console.log('✅ TP/SL checkbox found, enabling it...');
            tpslCheckbox.click();
            // Wait longer for UI to expand and stabilize
            await new Promise(r => setTimeout(r, 800));
            console.log('✅ TP/SL checkbox enabled, UI expanded');
        } else {
            console.log('ℹ️ TP/SL checkbox already checked');
        }
    } else {
        console.warn('⚠️ TP/SL checkbox not found');
    }

    await new Promise(r => setTimeout(r, 300));

    // Step 1: Fill LEVERAGE
    const levInput = getLeverageInput();
    if (levInput) {
        console.log('💪 Found leverage input, setting to:', currentSignal.leverage);
        const levSuccess = await setVal(levInput, currentSignal.leverage.toString());
        if (levSuccess) {
            console.log(`✅ Leverage set successfully: ${currentSignal.leverage}`);
        } else {
            console.error('❌ Failed to set leverage');
        }
    } else {
        console.error('❌ Leverage input NOT FOUND!');
    }

    await new Promise(r => setTimeout(r, 300));

    // Step 2: Fill ENTRY PRICE - Click first then fill
    console.log('🔍 Searching for Entry Price input...');
    const entryInput = getEntryInput();
    if (entryInput) {
        console.log('💰 Found entry price input:', entryInput);
        console.log('   - ID:', entryInput.id);
        console.log('   - Placeholder:', entryInput.placeholder);
        console.log('   - Type:', entryInput.type);
        
        // Click the input first to ensure it's focused and ready
        entryInput.click();
        entryInput.focus();
        await new Promise(r => setTimeout(r, 150));
        
        console.log('   - Setting to:', currentSignal.entry);
        const entrySuccess = await setVal(entryInput, currentSignal.entry);
        if (entrySuccess) {
            console.log(`✅ Entry price set successfully: ${currentSignal.entry}`);
        } else {
            console.error('❌ Failed to set entry price');
        }
    } else {
        console.error('❌ Entry price input NOT FOUND!');
        console.log('📋 Debug: Available inputs on page:');
        document.querySelectorAll('input').forEach((inp, idx) => {
            console.log(`   ${idx}: id="${inp.id}", placeholder="${inp.placeholder}", type="${inp.type}", visible=${inp.offsetParent !== null}`);
        });
    }

    // Activate 30-second window
    autofillWindowActive = true;
    autofillWindowExpiry = Date.now() + 30000;
    
    console.log('⏱️ [LEV+ENTRY] 30-second window activated');
    
    // Clear any existing countdown
    if (window.activeCountdown) {
        clearInterval(window.activeCountdown);
    }
    
    // Button feedback
    const btn = document.getElementById('lev-entry-btn');
    if (btn) {
        btn.innerText = `⏳ ${30}s`;
        btn.style.background = "#ffa500";
        btn.disabled = true;
        
        // Start countdown using global reference
        window.activeCountdown = setInterval(() => {
            const remaining = Math.ceil((autofillWindowExpiry - Date.now()) / 1000);
            if (remaining <= 0) {
                clearInterval(window.activeCountdown);
                window.activeCountdown = null;
                autofillWindowActive = false;
                if (btn) {
                    btn.innerText = "LEV + ENTRY";
                    btn.style.background = "";
                    btn.disabled = false;
                }
                console.log('⏱️ [LEV+ENTRY] Window expired');
            } else {
                btn.innerText = `⏳ ${remaining}s`;
            }
        }, 1000);
    }
}

// ==================== AUTOFILL TP ONLY (BUTTON 2) ====================
async function autofillTP() {
    console.log('🎯 [TP] Button clicked!');
    
    if (!currentSignal) {
        console.error('❌ [TP] No signal available');
        alert('❌ No signal available. Click "Refresh" first.');
        return;
    }

    // Check if window is active
    if (!autofillWindowActive || Date.now() >= autofillWindowExpiry) {
        console.log('❌ [TP] 30s window expired. Click LEV+ENTRY first.');
        alert('⏰ Time window expired!\n\nClick "LEV + ENTRY" button first to activate the 30-second window.');
        return;
    }

    let tpInput = null;
    
    // Try to use last clicked input first
    if (lastClickedInputElement && lastClickedInputElement.offsetParent !== null) {
        console.log('📍 [TP] Using last clicked input:', lastClickedInputElement);
        tpInput = lastClickedInputElement;
    }
    
    // Fallback to finding TP input by label
    if (!tpInput) {
        tpInput = getTPInput();
        if (tpInput) {
            console.log('🎯 [TP] Found TP input by label');
        }
    }

    if (tpInput && tpInput.offsetParent !== null) {
        const tpValue = window.cappedSignalValues && window.cappedSignalValues.tp ? window.cappedSignalValues.tp : currentSignal.tp;
        console.log('💰 [TP] Filling TP value:', tpValue);
        const success = await setVal(tpInput, tpValue);
        if (success) {
            console.log(`✅ [TP] Set successfully: ${tpValue}`);
        } else {
            console.error('❌ [TP] Failed to set value');
            alert('⚠️ TP value could not be set. Make sure you clicked on the TP field first.');
        }
    } else {
        console.error('❌ [TP] Input not found!');
        alert('❌ TP input not found!\n\n1. Click on the Take Profit price field\n2. Then press this button again');
    }
}

// ==================== AUTOFILL SL ONLY (BUTTON 3) ====================
async function autofillSL() {
    console.log('🛑 [SL] Button clicked!');
    
    if (!currentSignal) {
        console.error('❌ [SL] No signal available');
        alert('❌ No signal available. Click "Refresh" first.');
        return;
    }

    // Check if window is active
    if (!autofillWindowActive || Date.now() >= autofillWindowExpiry) {
        console.log('❌ [SL] 30s window expired. Click LEV+ENTRY first.');
        alert('⏰ Time window expired!\n\nClick "LEV + ENTRY" button first to activate the 30-second window.');
        return;
    }

    let slInput = null;
    
    // Try to use last clicked input first
    if (lastClickedInputElement && lastClickedInputElement.offsetParent !== null) {
        console.log('📍 [SL] Using last clicked input:', lastClickedInputElement);
        slInput = lastClickedInputElement;
    }
    
    // Fallback to finding SL input by label
    if (!slInput) {
        slInput = getSLInput();
        if (slInput) {
            console.log('🛑 [SL] Found SL input by label');
        }
    }

    if (slInput && slInput.offsetParent !== null) {
        const slValue = window.cappedSignalValues && window.cappedSignalValues.sl ? window.cappedSignalValues.sl : currentSignal.sl;
        console.log('🛑 [SL] Filling SL value:', slValue);
        const success = await setVal(slInput, slValue);
        if (success) {
            console.log(`✅ [SL] Set successfully: ${slValue}`);
        } else {
            console.error('❌ [SL] Failed to set value');
            alert('⚠️ SL value could not be set. Make sure you clicked on the SL field first.');
        }
    } else {
        console.error('❌ [SL] Input not found!');
        alert('❌ SL input not found!\n\n1. Click on the Stop Loss price field\n2. Then press this button again');
    }
}

// ==================== DASHBOARD & OBSERVER ====================
async function renderDashboard(t) {
    console.log('📊 Rendering dashboard with:', t);
    
    let el = document.getElementById('sniper-hud');
    const s = await chrome.storage.local.get(['posX', 'posY', 'opacity']);

    if (!el) {
        console.log('🆕 Creating new HUD element');
        el = document.createElement('div');
        el.id = 'sniper-hud';
        document.body.appendChild(el);
    }

    const accentColor = t.side === "BUY" ? "#00eb81" : "#ff3e3e";

    el.style.cssText = `
        position:fixed !important;
        left:${s.posX || 20}px !important;
        top:${s.posY || 20}px !important;
        background:rgba(15,21,26,${s.opacity || 0.95}) !important;
        z-index:999999 !important;
        padding:15px !important;
        border-radius:12px !important;
        border:2px solid ${accentColor} !important;
        color:#fff !important;
        font-family:system-ui, -apple-system, sans-serif !important;
        min-width:210px !important;
        box-shadow:0 10px 40px rgba(0,0,0,0.9) !important;
        pointer-events:auto !important;
        user-select:none !important;
        display:block !important;
        visibility:visible !important;
        opacity:1 !important;
    `;

    el.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:11px; color:#aaa; font-weight:700; margin-bottom:8px; text-transform:uppercase;">
            <span>${t.symbol}</span>
            <span style="color:#888;">${t.leverage}x</span>
        </div>
        <div style="font-size:26px; font-weight:900; letter-spacing:-1px; color:${accentColor};">${t.side}</div>
        <div style="margin:12px 0 6px; font-size:14px; display:flex; justify-content:space-between;">
            <span>Entry</span>
            <span style="font-weight:700;">${t.entry}</span>
        </div>
        <div style="margin:4px 0; font-size:14px; color:#00eb81; display:flex; justify-content:space-between;">
            <span>TP</span>
            <span style="font-weight:700;">${t.tp}</span>
        </div>
        <div style="margin:4px 0; font-size:14px; color:#ff3e3e; display:flex; justify-content:space-between;">
            <span>SL</span>
            <span style="font-weight:700;">${t.sl}</span>
        </div>
        <button id="lev-entry-btn" style="width:100%; margin-top:14px; padding:10px; background:${accentColor}; border:none; border-radius:8px; color:#000; font-weight:700; cursor:pointer; font-size:12px; transition:all 0.2s;">LEV + ENTRY</button>
        <div style="display:flex; gap:8px; margin-top:8px;">
            <button id="tp-btn" style="flex:1; padding:8px; background:#00eb81; border:none; border-radius:6px; color:#000; font-weight:600; cursor:pointer; font-size:11px;">TP</button>
            <button id="sl-btn" style="flex:1; padding:8px; background:#ff3e3e; border:none; border-radius:6px; color:#fff; font-weight:600; cursor:pointer; font-size:11px;">SL</button>
        </div>
        <button id="refresh-hud" style="width:100%; margin-top:8px; padding:8px; background:#4a5568; border:none; border-radius:8px; color:#fff; font-weight:600; cursor:pointer; font-size:11px;">🔄 Refresh</button>
    `;

    document.getElementById('lev-entry-btn').onclick = autofillLevEntry;
    document.getElementById('tp-btn').onclick = autofillTP;
    document.getElementById('sl-btn').onclick = autofillSL;
    document.getElementById('refresh-hud').onclick = async () => {
        console.log('🔄 Refreshing HUD...');
        const data = getMarketData();
        if (data && data.price) {
            const url = window.location.href;
            const symbol = url.includes('ETH') ? 'ETH/USDT' :
                           url.includes('BTC') ? 'BTC/USDT' :
                           url.includes('SOL') ? 'SOL/USDT' : 'BTC/USDT';
            await calculateTrade(data.price, data.trend, symbol);
        }
    };
    
    console.log('✅ HUD rendered successfully');
}

const observer = new MutationObserver(() => {
    // Don't update if we're in the autofill window
    if (autofillWindowActive && Date.now() < autofillWindowExpiry) {
        return;
    }
    
    try {
        const data = getMarketData();
        if (data && data.price && data.price !== lastPrice) {
            console.log('💰 Price changed:', lastPrice, '->', data.price);
            lastPrice = data.price;

            const url = window.location.href;
            const symbol = url.includes('ETH') ? 'ETH/USDT' :
                           url.includes('BTC') ? 'BTC/USDT' :
                           url.includes('SOL') ? 'SOL/USDT' : 'BTC/USDT';

            if (Date.now() > signalLockTime) {
                calculateTrade(data.price, data.trend, symbol);
            }
        }
    } catch (e) {
        console.error('❌ Observer error:', e);
    }
});

// Start observer
setTimeout(() => {
    console.log('👁️ Starting mutation observer...');
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    
    setTimeout(async () => {
        console.log('⏰ Initial HUD check...');
        const data = getMarketData();
        if (data && data.price) {
            const url = window.location.href;
            const symbol = url.includes('ETH') ? 'ETH/USDT' :
                           url.includes('BTC') ? 'BTC/USDT' :
                           url.includes('SOL') ? 'SOL/USDT' : 'BTC/USDT';
            await calculateTrade(data.price, data.trend, symbol);
        } else {
            console.log('⚠️ No market data found yet, showing test HUD');
            await showHUD();
        }
    }, 2000);
}, 1000);

async function calculateTrade(price, currentTrend, symbol) {
    try {
        const s = await chrome.storage.local.get(['minLev', 'maxLev']);
        const minL = parseInt(s.minLev) || 50;
        const maxL = parseInt(s.maxLev) || 200;

        currentSignal = {
            symbol,
            side: currentTrend === 'UP' ? 'BUY' : 'SELL',
            entry: price.toFixed(2),
            tp: currentTrend === 'UP' ? (price * 1.0025).toFixed(2) : (price * 0.9975).toFixed(2),
            sl: currentTrend === 'UP' ? (price * 0.9988).toFixed(2) : (price * 1.0012).toFixed(2),
            leverage: Math.floor((minL + maxL) / 2)
        };

        signalLockTime = Date.now() + SIGNAL_STABILITY_MS;
        await renderDashboard(currentSignal);
    } catch (e) {
        console.error('❌ Error in calculateTrade:', e);
    }
}

// Add keyboard shortcut to show HUD (Press 'H' key)
document.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
        console.log('⌨️ H key pressed, showing HUD');
        showHUD();
    }
});