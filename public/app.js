let selectedLocation = null;
let searchTimeout = null;
let cachedResults = [];

const DEFAULT_PREFERENCES = {
  minTemp: 10,
  maxTemp: 35,
  maxPrecipProb: 20,
  maxWindSpeed: 40,
  rainTolerance: 0
};

function loadPreferences() {
  try {
    const saved = localStorage.getItem('weatherPreferences');
    if (saved) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load preferences:', e);
  }
  return DEFAULT_PREFERENCES;
}

function savePreferencesToStorage(prefs) {
  try {
    localStorage.setItem('weatherPreferences', JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save preferences:', e);
  }
}

function loadPreferencesUI() {
  const prefs = loadPreferences();
  document.getElementById('min-temp').value = prefs.minTemp;
  document.getElementById('max-temp').value = prefs.maxTemp;
  document.getElementById('max-rain').value = prefs.maxPrecipProb;
  document.getElementById('max-wind').value = prefs.maxWindSpeed;
  document.getElementById('rain-tolerance').value = prefs.rainTolerance;
}

function getPreferences() {
  return {
    minTemp: parseInt(document.getElementById('min-temp').value) || 10,
    maxTemp: parseInt(document.getElementById('max-temp').value) || 35,
    maxPrecipProb: parseInt(document.getElementById('max-rain').value) || 20,
    maxWindSpeed: parseInt(document.getElementById('max-wind').value) || 40,
    rainTolerance: parseInt(document.getElementById('rain-tolerance').value) || 0
  };
}

function savePreferences() {
  const prefs = getPreferences();
  savePreferencesToStorage(prefs);
  
  const btn = document.getElementById('save-prefs-btn');
  if (btn) {
    btn.textContent = 'Saved!';
    btn.style.background = 'var(--good)';
    setTimeout(() => {
      btn.textContent = 'Save Preferences';
      btn.style.background = '';
    }, 1500);
  }
  
  if (selectedLocation) {
    fetchWeather();
  }
}

function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  if (panel) {
    panel.classList.toggle('hidden');
  }
}

function clearLocation() {
  selectedLocation = null;
  cachedResults = [];
  
  const locEl = document.getElementById('selected-location');
  if (locEl) locEl.classList.add('hidden');
  
  const cityInput = document.getElementById('city-input');
  if (cityInput) cityInput.value = '';
  
  const checkBtn = document.getElementById('check-btn');
  if (checkBtn) {
    checkBtn.disabled = true;
    checkBtn.textContent = 'Select a location first';
  }
  
  const resultEl = document.getElementById('result');
  if (resultEl) resultEl.classList.add('hidden');
}

function selectLocation(result) {
  selectedLocation = {
    lat: result.latitude,
    lon: result.longitude,
    name: `${result.name}, ${result.country || ''}`.trim()
  };
  
  hideSearchResults();
  
  const cityInput = document.getElementById('city-input');
  if (cityInput) cityInput.value = selectedLocation.name;
  
  const locEl = document.getElementById('selected-location');
  const locName = document.getElementById('location-name');
  if (locEl && locName) {
    locName.textContent = selectedLocation.name;
    locEl.classList.remove('hidden');
  }
  
  const checkBtn = document.getElementById('check-btn');
  if (checkBtn) {
    checkBtn.disabled = false;
    checkBtn.textContent = 'Check Weather';
  }
}

function hideSearchResults() {
  const resultsEl = document.getElementById('search-results');
  if (resultsEl) resultsEl.classList.add('hidden');
}

function showSearchResults() {
  const resultsEl = document.getElementById('search-results');
  if (resultsEl && cachedResults.length > 0) resultsEl.classList.remove('hidden');
}

async function searchCity() {
  const cityInput = document.getElementById('city-input');
  const query = cityInput ? cityInput.value.trim() : '';
  
  if (!query || query.length < 2) {
    hideSearchResults();
    return;
  }
  
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/geocode?city=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      
      cachedResults = await res.json();
      
      const resultsEl = document.getElementById('search-results');
      if (!resultsEl) return;
      
      if (cachedResults.length === 0) {
        resultsEl.innerHTML = '<div class="search-result-item">No locations found</div>';
      } else {
        resultsEl.innerHTML = cachedResults.map((r, i) => `
          <div class="search-result-item" data-index="${i}" role="option">
            <strong>${escapeHtml(r.name)}</strong>
            <small>${escapeHtml(r.country || '')}${r.admin1 ? ', ' + escapeHtml(r.admin1) : ''}</small>
          </div>
        `).join('');
      }
      
      showSearchResults();
    } catch (err) {
      console.error('Search failed:', err);
    }
  }, 300);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleSearchResultClick(e) {
  const item = e.target.closest('.search-result-item');
  if (item && item.dataset.index !== undefined) {
    const index = parseInt(item.dataset.index);
    if (cachedResults[index]) {
      selectLocation(cachedResults[index]);
    }
  }
}

async function fetchWeather() {
  if (!selectedLocation) return;

  const loadingEl = document.getElementById('loading');
  const resultEl = document.getElementById('result');
  const errorEl = document.getElementById('error');
  
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (resultEl) resultEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');

  const preferences = getPreferences();

  try {
    const res = await fetch('/api/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: selectedLocation.lat,
        lon: selectedLocation.lon,
        locationName: selectedLocation.name,
        preferences
      })
    });
    
    if (!res.ok) throw new Error("Failed to fetch weather");

    const data = await res.json();
    renderResult(data);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

function renderResult(data) {
  const resultEl = document.getElementById('result');
  if (resultEl) resultEl.classList.remove('hidden');

  const verdictEl = document.getElementById('verdict');
  if (verdictEl) {
    verdictEl.className = `verdict ${data.verdictClass}`;
    verdictEl.innerHTML = `
      <span class="verdict-icon">${data.verdictIcon}</span>
      <span class="verdict-text">${escapeHtml(data.verdict)}</span>
    `;
  }

  const bestWindowEl = document.getElementById('best-window');
  if (bestWindowEl) {
    if (data.bestWindow) {
      const time = new Date(data.bestWindow.time);
      const dateStr = time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      bestWindowEl.innerHTML = `
        <strong>Best time to ride:</strong><br>
        ${dateStr} at ${timeStr}
        | ${data.bestWindow.temp}°C 
        | ${data.bestWindow.precip}% rain
        <br><small>Score: ${data.bestScore}/100</small>
      `;
      bestWindowEl.classList.remove('hidden');
    } else if (data.message) {
      bestWindowEl.innerHTML = `<em>${escapeHtml(data.message)}</em>`;
      bestWindowEl.classList.remove('hidden');
    } else {
      bestWindowEl.classList.add('hidden');
    }
  }

  const sourcesEl = document.getElementById('sources-list');
  if (sourcesEl) sourcesEl.textContent = data.sources.join(", ");

  const hourlyGrid = document.getElementById('hourly-forecast');
  if (hourlyGrid) {
    if (!data.hourlyScores || data.hourlyScores.length === 0) {
      hourlyGrid.innerHTML = '<div class="hour-card"><span style="color:var(--text-muted)">No forecast data available</span></div>';
    } else {
      let currentDate = '';
      hourlyGrid.innerHTML = data.hourlyScores
        .map((hour) => {
          const time = new Date(hour.time);
          const dateStr = time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
          const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          
          let dateHeader = '';
          if (dateStr !== currentDate) {
            currentDate = dateStr;
            dateHeader = `<div class="date-header">${dateStr}</div>`;
          }
          
          let scoreClass = "bad";
          if (hour.score >= 70) scoreClass = "good";
          else if (hour.score >= 40) scoreClass = "caution";

          let precipClass = "precip-low";
          if (hour.precip > 50) precipClass = "precip-high";
          else if (hour.precip > 25) precipClass = "precip-med";

          const isBest = data.bestWindow && hour.time === data.bestWindow.time;

          return `
            ${dateHeader}
            <div class="hour-card ${scoreClass} ${isBest ? "best" : ""}">
              <span class="hour-time">${timeStr}</span>
              <span class="hour-temp">${hour.temp}°C</span>
              <span class="hour-desc">${escapeHtml(hour.desc)}</span>
              <span class="hour-precip ${precipClass}">${hour.precip}%</span>
            </div>
          `;
        })
        .join("");
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadPreferencesUI();
  
  const cityInput = document.getElementById('city-input');
  const searchBtn = document.getElementById('search-btn');
  const searchResults = document.getElementById('search-results');
  const settingsToggle = document.getElementById('settings-toggle');
  const savePrefsBtn = document.getElementById('save-prefs-btn');
  const changeBtn = document.getElementById('change-btn');
  const checkBtn = document.getElementById('check-btn');
  
  if (cityInput) {
    cityInput.addEventListener('input', () => {
      if (cityInput.value.length >= 2) {
        searchCity();
      } else {
        hideSearchResults();
        cachedResults = [];
      }
    });
    
    cityInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchCity();
      }
    });
    
    cityInput.addEventListener('focus', () => {
      if (cachedResults.length > 0) {
        showSearchResults();
      }
    });
  }
  
  if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      searchCity();
    });
  }
  
  if (searchResults) {
    searchResults.addEventListener('click', handleSearchResultClick);
  }
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-section')) {
      hideSearchResults();
    }
  });
  
  if (settingsToggle) {
    settingsToggle.addEventListener('click', toggleSettings);
  }
  
  if (savePrefsBtn) {
    savePrefsBtn.addEventListener('click', savePreferences);
  }
  
  if (changeBtn) {
    changeBtn.addEventListener('click', clearLocation);
  }
  
  if (checkBtn) {
    checkBtn.addEventListener('click', fetchWeather);
  }
});
