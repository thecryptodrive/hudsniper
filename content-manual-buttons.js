<!-- Alternative content.js with MANUAL TP/SL buttons -->
<!-- User clicks in TP field, then clicks TP button to fill it -->
<!-- User clicks in SL field, then clicks SL button to fill it -->

let lastPrice = null;
let currentSignal = null;
let signalLockTime = 0;
const SIGNAL_STABILITY_MS = 5000;

// ==================== MARKET DATA ====================
function getMarketData() {
    const priceSpan = document.querySelector('span.font-700.mr-2') ||
                      document.querySelector('span[class*="font-700"][class*="mr-2"]') ||
                      document.querySelector('span[class*="text-"][class*="font-bold"]');

    const trendDiv = document.querySelector('.flex.items-center.text-down, .flex.items-center.text-up') ||
                     document.querySelector('[class*="text-down"], [class*="text-up"]');

    if (priceSpan) {
        const priceText = priceSpan.innerText.replace(/[^0-9.]/g, '');
        const price = parseFloat(priceText);
        const trend = (trendDiv && trendDiv.classList.contains('text-down')) ? 'DOWN' : 'UP';
        return { price: isNaN(price) ? null : price, trend };
    }
    return null;
}

// ==================== FIELD FINDERS ====================
function getLeverageInput() {
    return document.querySelector('input[inputmode="numeric"]');
}

function getEntryInput() {
    return document.querySelector('input[placeholder="Enter the price"]');
}

function getTPSLCheckbox() {
    const keywords = ['tp/sl', 'take profit', 'stop loss', 'tp & sl'];
    const elements = document.querySelectorAll('div, span, label, button, p');
    for (const el of elements) {
        const text = el.textContent.toLowerCase();
        if (keywords.some(k => text.includes(k))) {
            let control = el.querySelector('input[type="checkbox"]') ||
                          el.querySelector('input[role="switch"]') ||
                          el.closest('.flex, div')?.querySelector('input[type="checkbox"], div[role="checkbox"], button[aria-checked]');
            if (control) return control;
            if (el.tagName === 'BUTTON' || el.style.cursor === 'pointer' || el.onclick) {
                return el;
            }
        }
    }
    return null;
}

// ==================== VALUE SETTER ====================
const setVal = (el, val) => {
    if (!el) return;
    el.focus();
    
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
};

// ==================== INDIVIDUAL FILL FUNCTIONS ====================
async function fillLeverageAndEntry() {
    if (!currentSignal) return;

    // Enable TP/SL panel
    let checkbox = getTPSLCheckbox();
    if (checkbox) {
        if (checkbox.type === 'checkbox' && !checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.click();
        } else if (checkbox.getAttribute('aria-checked') === 'false') {
            checkbox.click();
        } else if (checkbox.tagName === 'BUTTON' || checkbox.onclick) {
            checkbox.click();
        }
        await new Promise(r => setTimeout(r, 500));
    }

    // Fill leverage
    const levInput = getLeverageInput();
    if (levInput) {
        setVal(levInput, currentSignal.leverage.toString());
    }

    await new Promise(r => setTimeout(r, 200));

    // Fill entry
    const entryInput = getEntryInput();
    if (entryInput) {
        setVal(entryInput, currentSignal.entry);
    }

    const btn = document.getElementById('fill-main');
    if (btn) {
        btn.innerText = "✅ FILLED";
        setTimeout(() => { if (btn) btn.innerText = "FILL LEV + ENTRY"; }, 2000);
    }
}

function fillTP() {
    if (!currentSignal) return;
    
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT') {
        setVal(activeEl, currentSignal.tp);
        
        const btn = document.getElementById('fill-tp');
        if (btn) {
            btn.innerText = "✅";
            setTimeout(() => { if (btn) btn.innerText = "FILL TP"; }, 2000);
        }
    } else {
        alert('Click in the TP field first!');
    }
}

function fillSL() {
    if (!currentSignal) return;
    
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT') {
        setVal(activeEl, currentSignal.sl);
        
        const btn = document.getElementById('fill-sl');
        if (btn) {
            btn.innerText = "✅";
            setTimeout(() => { if (btn) btn.innerText = "FILL SL"; }, 2000);
        }
    } else {
        alert('Click in the SL field first!');
    }
}

// ==================== DASHBOARD ====================
const observer = new MutationObserver(() => {
    const data = getMarketData();
    if (data && data.price && data.price !== lastPrice) {
        lastPrice = data.price;

        const url = window.location.href;
        const symbol = url.includes('ETH') ? 'ETH/USDT' :
                       url.includes('BTC') ? 'BTC/USDT' :
                       url.includes('SOL') ? 'SOL/USDT' : 'BTC/USDT';

        if (Date.now() > signalLockTime) {
            calculateTrade(data.price, data.trend, symbol);
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

async function calculateTrade(price, currentTrend, symbol) {
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
    renderDashboard(currentSignal);
}

async function renderDashboard(t) {
    let el = document.getElementById('sniper-hud');
    const s = await chrome.storage.local.get(['posX', 'posY', 'opacity']);

    if (!el) {
        el = document.createElement('div');
        el.id = 'sniper-hud';
        document.body.appendChild(el);
    }

    const accentColor = t.side === "BUY" ? "#00eb81" : "#ff3e3e";

    el.style.cssText = `
        position:fixed; 
        left:${s.posX || 20}px; 
        top:${s.posY || 20}px; 
        background:rgba(15,21,26,${s.opacity || 0.95}); 
        z-index:10000; 
        padding:15px; 
        border-radius:12px; 
        border:2px solid ${accentColor}; 
        color:#fff; 
        font-family:system-ui, -apple-system, sans-serif; 
        min-width:210px; 
        box-shadow:0 10px 40px rgba(0,0,0,0.9); 
        pointer-events:auto;
        user-select:none;
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
        
        <button id="fill-main" style="width:100%; margin-top:14px; padding:10px; background:${accentColor}; border:none; border-radius:8px; color:#000; font-weight:700; cursor:pointer; font-size:12px;">FILL LEV + ENTRY</button>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
            <button id="fill-tp" style="padding:8px; background:#00eb81; border:none; border-radius:6px; color:#000; font-weight:700; cursor:pointer; font-size:11px;">FILL TP</button>
            <button id="fill-sl" style="padding:8px; background:#ff3e3e; border:none; border-radius:6px; color:#000; font-weight:700; cursor:pointer; font-size:11px;">FILL SL</button>
        </div>
        
        <div style="margin-top:10px; font-size:10px; color:#666; text-align:center;">
            Click in TP/SL field, then click button
        </div>
    `;

    document.getElementById('fill-main').onclick = fillLeverageAndEntry;
    document.getElementById('fill-tp').onclick = fillTP;
    document.getElementById('fill-sl').onclick = fillSL;
}
