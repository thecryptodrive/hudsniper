(function() {
    const OrigWS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        const ws = new OrigWS(url, protocols);
        
        ws.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(event.data);
                // Detection logic for BC Game's data packets
                // Note: You may need to 'Inspect -> Network -> WS' to find the exact key
                if (msg.price || msg.last) {
                    const price = msg.price || msg.last;
                    const symbol = msg.symbol || "BTC/USDT";
                    
                    window.dispatchEvent(new CustomEvent("BC_PRICE_UPDATE", {
                        detail: { price: parseFloat(price), symbol: symbol }
                    }));
                }
            } catch (e) {}
        });
        return ws;
    };
    window.WebSocket.prototype = OrigWS.prototype;
})();