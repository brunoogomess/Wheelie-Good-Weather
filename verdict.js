const WMO_CODES = {
  0: { desc: "Clear sky", riding: "good" },
  1: { desc: "Mainly clear", riding: "good" },
  2: { desc: "Partly cloudy", riding: "good" },
  3: { desc: "Overcast", riding: "caution" },
  45: { desc: "Foggy", riding: "caution" },
  48: { desc: "Depositing rime fog", riding: "caution" },
  51: { desc: "Light drizzle", riding: "bad" },
  53: { desc: "Moderate drizzle", riding: "bad" },
  55: { desc: "Dense drizzle", riding: "bad" },
  56: { desc: "Light freezing drizzle", riding: "bad" },
  57: { desc: "Dense freezing drizzle", riding: "bad" },
  61: { desc: "Slight rain", riding: "caution" },
  63: { desc: "Moderate rain", riding: "bad" },
  65: { desc: "Heavy rain", riding: "bad" },
  66: { desc: "Light freezing rain", riding: "bad" },
  67: { desc: "Heavy freezing rain", riding: "bad" },
  71: { desc: "Slight snow", riding: "bad" },
  73: { desc: "Moderate snow", riding: "bad" },
  75: { desc: "Heavy snow", riding: "bad" },
  77: { desc: "Snow grains", riding: "bad" },
  80: { desc: "Slight rain showers", riding: "caution" },
  81: { desc: "Moderate rain showers", riding: "bad" },
  82: { desc: "Violent rain showers", riding: "bad" },
  85: { desc: "Slight snow showers", riding: "bad" },
  86: { desc: "Heavy snow showers", riding: "bad" },
  95: { desc: "Thunderstorm", riding: "bad" },
  96: { desc: "Thunderstorm with slight hail", riding: "bad" },
  99: { desc: "Thunderstorm with heavy hail", riding: "bad" }
};

const DEFAULT_THRESHOLDS = {
  minTemp: 10,
  maxTemp: 35,
  maxPrecipProb: 20,
  maxWindSpeed: 40,
  rainTolerance: 0,
  badWeatherCodes: [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99],
  cautionWeatherCodes: [3,45,48,61]
};

function calculateHourScore(hour, thresholds = DEFAULT_THRESHOLDS) {
  let score = 100;
  let reasons = [];

  const temp = hour.temp;
  if (temp < thresholds.minTemp) {
    score -= 40;
    reasons.push(`Too cold (${temp}°C)`);
  } else if (temp > thresholds.maxTemp) {
    score -= 40;
    reasons.push(`Too hot (${temp}°C)`);
  }

  const precipProb = hour.precip;
  const effectiveRainProb = Math.max(0, precipProb - thresholds.rainTolerance);
  
  if (effectiveRainProb > 70) {
    score -= 50;
    reasons.push(`High rain chance (${effectiveRainProb}%)`);
  } else if (effectiveRainProb > 50) {
    score -= 30;
    reasons.push(`Moderate rain chance (${effectiveRainProb}%)`);
  } else if (effectiveRainProb > thresholds.maxPrecipProb) {
    score -= 15;
    reasons.push(`Some rain risk (${effectiveRainProb}%)`);
  }

  const weathercode = hour.weathercode;
  if (thresholds.badWeatherCodes.includes(weathercode)) {
    score -= 50;
    reasons.push(WMO_CODES[weathercode]?.desc || "Bad weather");
  } else if (thresholds.cautionWeatherCodes.includes(weathercode)) {
    score -= 20;
    reasons.push(WMO_CODES[weathercode]?.desc || "Caution weather");
  }

  if (hour.windSpeed && hour.windSpeed > thresholds.maxWindSpeed) {
    score -= 30;
    reasons.push(`High wind (${hour.windSpeed} km/h)`);
  }

  return { score: Math.max(0, score), reasons };
}

function findBestRidingWindow(weatherSummary, thresholds = DEFAULT_THRESHOLDS) {
  let bestWindow = null;
  let bestScore = 0;
  let bestIndex = 0;

  weatherSummary.forEach((hour, index) => {
    const { score } = calculateHourScore(hour, thresholds);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
      bestWindow = hour;
    }
  });

  return { window: bestWindow, score: bestScore, index: bestIndex };
}

function generateVerdict(weatherData, location, preferences = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...preferences };
  const now = new Date();
  const allHours = [];
  
  weatherData.forEach(source => {
    source.hourly.forEach(hour => {
      const hourTime = new Date(hour.time);
      if (hourTime >= now) {
        allHours.push({
          time: hour.time,
          temp: hour.temp,
          precip: hour.precip,
          weathercode: hour.weathercode,
          source: source.name
        });
      }
    });
  });

  if (allHours.length === 0) {
    return {
      verdict: "NO DATA",
      verdictClass: "bad",
      verdictIcon: "🏍️❌",
      bestWindow: null,
      bestScore: 0,
      location,
      sources: weatherData.map(s => s.name),
      hourlyScores: [],
      message: "No future hours available for this location"
    };
  }

  const consensusHours = {};
  allHours.forEach(hour => {
    const hourTime = new Date(hour.time);
    const hourKey = `${hourTime.toISOString().slice(0, 13)}`;
    if (!consensusHours[hourKey]) {
      consensusHours[hourKey] = [];
    }
    consensusHours[hourKey].push(hour);
  });

  const averagedHours = Object.entries(consensusHours).map(([key, readings]) => {
    const avgTemp = readings.reduce((sum, r) => sum + r.temp, 0) / readings.length;
    const avgPrecip = readings.reduce((sum, r) => sum + r.precip, 0) / readings.length;
    const avgWeatherCode = Math.round(readings.reduce((sum, r) => sum + r.weathercode, 0) / readings.length);
    return {
      time: readings[0].time,
      temp: Math.round(avgTemp * 10) / 10,
      precip: Math.round(avgPrecip),
      weathercode: avgWeatherCode
    };
  });

  averagedHours.sort((a, b) => new Date(a.time) - new Date(b.time));

  const { window: bestWindow, score: bestScore } = findBestRidingWindow(averagedHours, thresholds);

  let verdict = "GARAGE DAY";
  let verdictClass = "bad";
  let verdictIcon = "🏍️❌";

  if (bestScore >= 70) {
    verdict = "WHEELIE GOOD";
    verdictClass = "good";
    verdictIcon = "🏍️🔥";
  } else if (bestScore >= 40) {
    verdict = "RIDE WITH CAUTION";
    verdictClass = "caution";
    verdictIcon = "🏍️⚠️";
  }

  const hourlyScores = averagedHours.map((hour) => {
    const { score, reasons } = calculateHourScore(hour, thresholds);
    return {
      ...hour,
      score,
      reasons,
      desc: WMO_CODES[hour.weathercode]?.desc || "Unknown"
    };
  });

  return {
    verdict,
    verdictClass,
    verdictIcon,
    bestWindow,
    bestScore,
    location,
    sources: weatherData.map(s => s.name),
    hourlyScores,
    currentTime: now.toISOString()
  };
}

module.exports = { generateVerdict, calculateHourScore, WMO_CODES, DEFAULT_THRESHOLDS };
