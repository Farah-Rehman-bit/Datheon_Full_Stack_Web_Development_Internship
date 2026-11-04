 "use strict";
    /* Optional: paste your key between the quotes. Otherwise enter it in the page (saved in your browser). */
    const DEFAULT_API_KEY = "";
    const BASE = "https://api.openweathermap.org/data/2.5";

    const $ = (id) => document.getElementById(id);
    const store = {
      get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    };
    let units = store.get("units", "metric");
    let lastQuery = null, requestId = 0;
    const getKey = () => (store.get("owm_key", "") || DEFAULT_API_KEY).trim();

    const show = (el, on) => el.classList.toggle("hidden", !on);
    const deg = () => (units === "metric" ? "°C" : "°F");
    const round = (n) => Math.round(n);
    const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const cityDate = (unix, tz) => new Date((unix + tz) * 1000);   // read with getUTC* for the city's own clock
    const hhmm = (d) => String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
    const windText = (ms) => units === "metric" ? round(ms * 3.6) + " km/h" : round(ms) + " mph";
    const iconUrl = (code) => "https://openweathermap.org/img/wn/" + code + "@2x.png";

    function themeFor(id, night) {
      if (id === 800 || id === 801) return night ? "clear-night" : "clear-day";
      if (id >= 200 && id < 300) return "thunder";
      if (id >= 300 && id < 600) return "rain";
      if (id >= 600 && id < 700) return "snow";
      if (id >= 700 && id < 800) return "mist";
      return "clouds";
    }

    function setLoading(on) { show($("status"), on); if (on) show($("error"), false); }
    function showError(title, msg) {
      setLoading(false); show($("result"), false);
      $("error").innerHTML = "<b></b><span></span>";
      $("error").firstChild.textContent = title;
      $("error").lastChild.textContent = msg;
      show($("error"), true);
    }

    class AppError extends Error { constructor(title, msg, needKey) { super(msg); this.title = title; this.needKey = !!needKey; } }

    async function api(path, params) {
      const key = getKey();
      if (!key) throw new AppError("API key needed", "Add your OpenWeatherMap key below to load live data.", true);
      const url = BASE + "/" + path + "?" + new URLSearchParams(Object.assign({}, params, { units: units, appid: key }));
      let res;
      try { res = await fetch(url); }
      catch (e) {
        throw new AppError("Connection failed",
          "The request could not reach OpenWeatherMap. Check your internet, and open this file in Chrome or Edge from your computer (not inside a chat preview).");
      }
      if (res.ok) return res.json();
      if (res.status === 404) throw new AppError("City not found", "Check the spelling, or add a country code, for example Lahore,PK.");
      if (res.status === 401) throw new AppError("API key rejected", "The key is invalid or not active yet. New keys can take up to two hours to activate.", true);
      if (res.status === 429) throw new AppError("Too many requests", "The free plan limit was reached. Wait a minute and try again.");
      throw new AppError("Service error", "OpenWeatherMap returned status " + res.status + ". Please try again shortly.");
    }

    async function load(query) {
      const id = ++requestId;
      lastQuery = query;
      setLoading(true);
      try {
        const results = await Promise.all([api("weather", query), api("forecast", query)]);
        if (id !== requestId) return;
        render(results[0], results[1]);
        if (query.q) remember(results[0].name);
      } catch (err) {
        if (id !== requestId) return;
        if (err.needKey) show($("keyPanel"), true);
        showError(err.title || "Something went wrong", err.message);
      }
    }

    function render(now, fc) {
      const tz = now.timezone, local = cityDate(now.dt, tz);
      const night = now.dt < now.sys.sunrise || now.dt > now.sys.sunset;
      document.body.dataset.theme = themeFor(now.weather[0].id, night);

      $("cityName").textContent = now.name + (now.sys.country ? ", " + now.sys.country : "");
      $("localTime").textContent = WEEK[local.getUTCDay()] + " · " + hhmm(local) + " local time";
      $("icon").src = iconUrl(now.weather[0].icon);
      $("icon").alt = now.weather[0].main;
      $("temp").innerHTML = round(now.main.temp) + "<small>" + deg() + "</small>";
      $("condText").textContent = now.weather[0].description;
      $("feels").textContent = "Feels like " + round(now.main.feels_like) + deg();
      $("hum").textContent = now.main.humidity + "%";
      $("wind").textContent = windText(now.wind.speed);
      $("pres").textContent = now.main.pressure + " hPa";
      $("vis").textContent = now.visibility != null ? (now.visibility / 1000).toFixed(1) + " km" : "n/a";
      $("rise").textContent = hhmm(cityDate(now.sys.sunrise, tz));
      $("set").textContent = hhmm(cityDate(now.sys.sunset, tz));

      // Group 3-hourly entries into calendar days using the city's own timezone.
      const days = {};
      fc.list.forEach((e) => {
        const d = cityDate(e.dt, fc.city.timezone), k = d.toISOString().slice(0, 10);
        (days[k] = days[k] || { date: d, items: [] }).items.push({ e: e, hour: d.getUTCHours() });
      });
      const cards = Object.values(days).slice(0, 5).map((g) => {
        const temps = g.items.map((i) => i.e.main.temp);
        const mid = g.items.reduce((a, b) => Math.abs(b.hour - 13) < Math.abs(a.hour - 13) ? b : a);
        return {
          name: WEEK[g.date.getUTCDay()].slice(0, 3), icon: mid.e.weather[0].icon.replace("n", "d"),
          text: mid.e.weather[0].main, hi: round(Math.max.apply(null, temps)), lo: round(Math.min.apply(null, temps))
        };
      });
      $("forecast").innerHTML = cards.map((c) =>
        '<div class="day"><div class="name">' + c.name + '</div><img src="' + iconUrl(c.icon) + '" alt="' + c.text + '">' +
        '<div class="sub">' + c.text + '</div><div class="hi">' + c.hi + deg() + '</div><div class="lo">' + c.lo + deg() + '</div></div>'
      ).join("");

      setLoading(false); show($("error"), false); show($("keyPanel"), false); show($("result"), true);
    }

    /* Demo data lets you check the layout before your API key is active. */
    function demo() {
      const t = Math.floor(Date.now() / 1000);
      const now = {
        name: "Peshawar (demo)", sys: { country: "PK", sunrise: t - 4 * 3600, sunset: t + 5 * 3600 }, timezone: 18000, dt: t,
        visibility: 8000, weather: [{ id: 801, main: "Clouds", description: "few clouds", icon: "02d" }],
        main: { temp: 24, feels_like: 23, humidity: 46, pressure: 1014 }, wind: { speed: 3.2 }
      };
      const list = Array.from({ length: 40 }, (_, i) => ({
        dt: t + i * 10800, main: { temp: 20 + Math.round(6 * Math.sin(i / 2.5)) },
        weather: [i % 9 === 0 ? { id: 500, main: "Rain", icon: "10d" } : { id: 800, main: "Clear", icon: "01d" }]
      }));
      render(now, { list: list, city: { timezone: 18000 } });
    }

    function remember(name) {
      let list = []; try { list = JSON.parse(store.get("recent", "[]")); } catch (e) { }
      list = [name].concat(list.filter((c) => c.toLowerCase() !== name.toLowerCase())).slice(0, 5);
      store.set("recent", JSON.stringify(list)); drawRecent();
    }
    function drawRecent() {
      let list = []; try { list = JSON.parse(store.get("recent", "[]")); } catch (e) { }
      $("recent").replaceChildren.apply($("recent"), list.map((c) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip"; b.textContent = c;
        b.addEventListener("click", () => { $("cityInput").value = c; load({ q: c }); });
        return b;
      }));
    }

    $("searchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const city = $("cityInput").value.trim();
      if (!city) return showError("Enter a city", "Type a city name in the search box first.");
      load({ q: city });
    });
    $("unitBtn").addEventListener("click", () => {
      units = units === "metric" ? "imperial" : "metric";
      store.set("units", units); $("unitBtn").textContent = deg();
      if (lastQuery) load(lastQuery);
    });
    $("locBtn").addEventListener("click", () => {
      if (!navigator.geolocation) return showError("Not supported", "Your browser cannot share your location. Search for a city instead.");
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (p) => load({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => showError("Location blocked", "Allow location access in your browser, or search for a city instead.")
      );
    });
    $("saveKey").addEventListener("click", () => {
      const k = $("keyInput").value.trim();
      if (!k) return;
      store.set("owm_key", k); show($("keyPanel"), false);
      const city = $("cityInput").value.trim();
      if (lastQuery) load(lastQuery); else if (city) load({ q: city });
    });
    $("demoBtn").addEventListener("click", demo);
    $("changeKey").addEventListener("click", () => show($("keyPanel"), true));

    setInterval(() => { $("clock").textContent = "Live weather telemetry · " + new Date().toLocaleTimeString(); }, 1000);
    $("unitBtn").textContent = deg();
    drawRecent();
    if (!getKey()) show($("keyPanel"), true);
    else { try { const r = JSON.parse(store.get("recent", "[]")); if (r[0]) { $("cityInput").value = r[0]; load({ q: r[0] }); } } catch (e) { } }
 