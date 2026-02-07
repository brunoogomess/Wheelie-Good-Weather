const credentials = require("./credentials.json");

const url_list = [
  (lat, lon, key) => `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,precipitation_probability,weather_code&forecast_days=1`,
  //api url for openweathermap
  //(lat, lon, key) => `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${key}`
];

async function call_api(lat, lon) {
  for (const url of url_list) {
    const endpoint = url(lat, lon, credentials.api_key);
    try {
      const res = await fetch(endpoint);
      const weatherForecast = await res.json()
      console.log(weatherForecast)
      let hourOfTheDay = weatherForecast.hourly.time
      let hourlyTemp = weatherForecast.hourly.temperature_2m
      let hourlyPrecipitationProbability = weatherForecast.hourly.precipitation_probability
      let hourlyWeatherCode = weatherForecast.hourly.weather_code
      const weatherSummary = hourOfTheDay.map((hour, index) => {
        return {
          time: hour,
          temp: hourlyTemp[index],
          precip: hourlyPrecipitationProbability[index],
          weathercode: hourlyWeatherCode[index]
        };
      });
      console.log(weatherSummary)
    } catch (err) {
      console.error("Failed to fetch:", err.message)
    }
  }
}

//add the latitude and longitude here:
call_api(41.579481, -8.426921);
