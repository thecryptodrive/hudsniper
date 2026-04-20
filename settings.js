// Load current settings when the popup opens
chrome.storage.local.get(['minLev', 'maxLev', 'posX', 'posY', 'opacity', 'maxTpPct', 'maxSlPct'], (data) => {
  if (data.minLev) document.getElementById('minL').value = data.minLev;
  if (data.maxLev) document.getElementById('maxL').value = data.maxLev;
  if (data.posX) document.getElementById('posX').value = data.posX;
  if (data.posY) document.getElementById('posY').value = data.posY;
  if (data.opacity) document.getElementById('opacity').value = data.opacity;
  if (data.maxTpPct) document.getElementById('maxTp').value = data.maxTpPct;
  if (data.maxSlPct) document.getElementById('maxSl').value = data.maxSlPct;
});

// Save settings
document.getElementById('save').onclick = () => {
  const btn = document.getElementById('save');
  const settings = {
    minLev: document.getElementById('minL').value,
    maxLev: document.getElementById('maxL').value,
    posX: document.getElementById('posX').value,
    posY: document.getElementById('posY').value,
    opacity: document.getElementById('opacity').value,
    maxTpPct: document.getElementById('maxTp').value,
    maxSlPct: document.getElementById('maxSl').value
  };

  chrome.storage.local.set(settings, () => {
    btn.innerText = "SAVED!";
    btn.style.backgroundColor = "#00eb81";
    btn.style.color = "#000";

    setTimeout(() => {
      btn.innerText = "Save Settings";
      btn.style.backgroundColor = "";
      btn.style.color = "";
    }, 2000);
  });
};