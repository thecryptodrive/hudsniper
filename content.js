let lastPrice = null;
let currentSignal = null;
let signalLockTime = 0;
const SIGNAL_STABILITY_MS = 5000;

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
    // Entry price is labeled "Price(USDT)" - must be EXACTLY this text, not containing "profit", "loss", "take", "stop"
    // Look for labels where the direct text content (not children) contains "Price(USDT)"
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
const setVal = async (el, val, retries = 3) => {
    if (!el) return false;
    
    for (let i = 0; i < retries; i++) {
        try {
            el.focus();
            el.click();
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            
            await new Promise(r => setTimeout(r, 50));
            
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, val);
            
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            
            await new Promise(r => setTimeout(r, 100));
            if (el.value.includes(val.toString().slice(0, 5))) {
                console.log(`✅ Value set successfully: ${val}`);
                return true;
            }
        } catch (e) {
            console.warn(`Retry ${i + 1} failed:`, e);
        }
        await new Promise(r => setTimeout(r, 200));
    }
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

// ==================== AUTOFILL (MAIN FUNCTION) ====================
async function autofillBCGame() {
    if (!currentSignal) {
        console.error('❌ No signal available');
        await showHUD();
        return;
    }

    console.log('🎯 Starting autofill with signal:', currentSignal);

    // Step 1: Enable TP/SL panel
    let tpSlEnabled = false;
    const checkbox = getTPSLCheckbox();
    
    if (checkbox) {
        console.log('📋 Found TP/SL control:', checkbox);
        
        const isChecked = checkbox.checked || 
                         checkbox.getAttribute('aria-checked') === 'true' ||
                         checkbox.getAttribute('data-checked') === 'true';
        
        if (!isChecked) {
            checkbox.click();
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            
            if (checkbox.tagName !== 'INPUT') {
                const parentCheckbox = checkbox.querySelector('input[type="checkbox"]');
                if (parentCheckbox) {
                    parentCheckbox.checked = true;
                    parentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            
            console.log('✅ Clicked TP/SL toggle');
            tpSlEnabled = true;
        } else {
            console.log('ℹ️ TP/SL already enabled');
            tpSlEnabled = true;
        }
        
        await new Promise(r => setTimeout(r, 1000));
    } else {
        console.log('⚠️ TP/SL control not found');
    }

    // Step 2: Fill LEVERAGE
    const levInput = getLeverageInput();
    if (levInput) {
        await setVal(levInput, currentSignal.leverage.toString());
        console.log(`✅ Set leverage to: ${currentSignal.leverage}`);
    } else {
        console.log('❌ Leverage input not found!');
    }

    await new Promise(r => setTimeout(r, 300));

    // Step 3: Fill ENTRY PRICE (the "Price(USDT)" field at top)
    const entryInput = getEntryInput();
    if (entryInput) {
        console.log('💰 Filling ENTRY price:', currentSignal.entry);
        await setVal(entryInput, currentSignal.entry);
        console.log(`✅ Set entry price to: ${currentSignal.entry}`);
    } else {
        console.log('❌ Entry price input not found!');
    }

    await new Promise(r => setTimeout(r, 500));

    // Step 4: Fill TAKE PROFIT (only if TP/SL is enabled)
    let tpInput = null;
    if (tpSlEnabled) {
        tpInput = getTPInput();
        if (tpInput) {
            console.log('🎯 Filling TP:', currentSignal.tp);
            const success = await setVal(tpInput, currentSignal.tp);
            if (success) {
                console.log(`✅ Set TP to: ${currentSignal.tp}`);
            } else {
                console.log('⚠️ TP value may not have been set correctly');
            }
        } else {
            console.log('❌ TP input not found! Make sure TP/SL is enabled.');
        }
    }

    await new Promise(r => setTimeout(r, 300));

    // Step 5: Fill STOP LOSS (only if TP/SL is enabled)
    let slInput = null;
    if (tpSlEnabled) {
        slInput = getSLInput();
        if (slInput) {
            console.log('🛑 Filling SL:', currentSignal.sl);
            const success = await setVal(slInput, currentSignal.sl);
            if (success) {
                console.log(`✅ Set SL to: ${currentSignal.sl}`);
            } else {
                console.log('⚠️ SL value may not have been set correctly');
            }
        } else {
            console.log('❌ SL input not found!');
        }
    }

    // Button feedback
    const btn = document.getElementById('copy-to-bc');
    if (btn) {
        let msg = "✅ STAGED!";
        let missing = [];
        
        if (!levInput) missing.push('LEV');
        if (!entryInput) missing.push('ENTRY');
        if (tpSlEnabled && !tpInput) missing.push('TP');
        if (tpSlEnabled && !slInput) missing.push('SL');
        
        if (missing.length > 0) {
            msg = `⚠️ PARTIAL (missing: ${missing.join(', ')})`;
        }
        
        btn.innerText = msg;
        btn.style.background = missing.length > 0 ? "#ffa500" : "#00eb81";
        setTimeout(() => { 
            if (btn) {
                btn.innerText = "PREPARE TRADE";
                btn.style.background = "";
            }
        }, 3000);
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
        <button id="copy-to-bc" style="width:100%; margin-top:14px; padding:10px; background:${accentColor}; border:none; border-radius:8px; color:#000; font-weight:700; cursor:pointer; font-size:12px; transition:all 0.2s;">PREPARE TRADE</button>
        <button id="refresh-hud" style="width:100%; margin-top:8px; padding:8px; background:#4a5568; border:none; border-radius:8px; color:#fff; font-weight:600; cursor:pointer; font-size:11px;">🔄 Refresh</button>
    `;

    document.getElementById('copy-to-bc').onclick = autofillBCGame;
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