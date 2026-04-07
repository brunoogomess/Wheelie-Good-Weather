const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { generateVerdict } = require("./verdict");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "1kb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later" }
});

app.use("/api/", apiLimiter);

const API_SOURCES = [
  {
    name: "Open-Meteo",
    url: (lat, lon) => `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=1&timezone=auto`
  }
];

function validateCoordinates(lat, lon) {
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  
  if (isNaN(latNum) || isNaN(lonNum)) {
    return { valid: false, error: "Coordinates must be numbers" };
  }
  if (latNum < -90 || latNum > 90) {
    return { valid: false, error: "Latitude must be between -90 and 90" };
  }
  if (lonNum < -180 || lonNum > 180) {
    return { valid: false, error: "Longitude must be between -180 and 180" };
  }
  return { valid: true, lat: latNum, lon: lonNum };
}

function validatePreferences(prefs) {
  if (!prefs) return {};
  
  const validated = {};
  const numFields = ["minTemp", "maxTemp", "maxPrecipProb", "maxWindSpeed", "rainTolerance"];
  
  for (const field of numFields) {
    if (prefs[field] !== undefined) {
      const val = parseInt(prefs[field]);
      if (!isNaN(val)) {
        validated[field] = Math.max(0, Math.min(val, field === "rainTolerance" ? 100 : 1000));
      }
    }
  }
  
  return validated;
}

async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results || [];
}

async function fetchWeatherData(lat, lon) {
  const results = [];

  for (const source of API_SOURCES) {
    try {
      const res = await fetch(source.url(lat, lon));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const hourly = data.hourly.time.map((time, i) => ({
        time,
        temp: data.hourly.temperature_2m[i],
        precip: data.hourly.precipitation_probability[i],
        weathercode: data.hourly.weather_code[i]
      }));

      results.push({
        name: source.name,
        hourly
      });
    } catch (err) {
      console.error(`${source.name} failed:`, err.message);
    }
  }

  return results;
}

app.get("/api/geocode", async (req, res) => {
  const city = req.query.city;
  if (!city || city.length < 2 || city.length > 100) {
    return res.status(400).json({ error: "City name must be 2-100 characters" });
  }
  
  try {
    const results = await geocode(city);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Geocoding failed" });
  }
});

app.post("/api/weather", async (req, res) => {
  const { lat, lon, locationName, preferences } = req.body;
  
  const coords = validateCoordinates(lat, lon);
  if (!coords.valid) {
    return res.status(400).json({ error: coords.error });
  }

  const validatedPrefs = validatePreferences(preferences);

  try {
    const weatherData = await fetchWeatherData(coords.lat, coords.lon);
    
    if (weatherData.length === 0) {
      return res.status(500).json({ error: "Failed to fetch weather data" });
    }

    const verdict = generateVerdict(weatherData, { lat: coords.lat, lon: coords.lon, name: locationName }, validatedPrefs);
    res.json(verdict);
  } catch (err) {
    console.error("Weather fetch error:", err);
    res.status(500).json({ error: "Failed to get weather verdict" });
  }
});

app.listen(PORT, () => {
  console.log(`Wheelie Good Weather running at http://localhost:${PORT}`);
});
