/**
 * Morrow Market Data v1
 *
 * Deploy this file as the Cloudflare Worker behind:
 * https://morrow-price-feed.jnkbnfzksg.workers.dev/
 *
 * Keep TWELVE_DATA_API_KEY configured as a Cloudflare Worker secret.
 *
 * Routes:
 *   /health
 *   /search?q=apple
 *   /price?symbol=AAPL&exchange=NASDAQ
 *   /quote?symbol=AAPL                 (legacy response retained)
 *   /vuag                              (Newton Analytics EOD)
 *   /vuag-history                      (Newton Analytics history)
 */

const ALLOWED_ORIGIN = "https://rpr9bn8wf7-create.github.io";
const NEWTON_BASE = "https://api.newtonanalytics.com/price/";

function makeHeaders(origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
  if (origin === ALLOWED_ORIGIN) headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  return headers;
}

function reply(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function twelveData(path, params, env) {
  if (!env.TWELVE_DATA_API_KEY) {
    throw new Error("Price feed is not configured.");
  }

  const apiUrl = new URL("https://api.twelvedata.com/" + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      apiUrl.searchParams.set(key, String(value));
    }
  }
  apiUrl.searchParams.set("apikey", env.TWELVE_DATA_API_KEY);

  const response = await fetch(apiUrl.toString());
  const data = await response.json();

  if (!response.ok || data.status === "error" || data.code) {
    const error = new Error(data.message || "The price provider returned an error.");
    error.providerCode = data.code || null;
    throw error;
  }
  return data;
}

async function newtonData(dataType, observations) {
  const priceUrl = new URL(NEWTON_BASE);
  priceUrl.searchParams.set("ticker", "VUAG.L");
  priceUrl.searchParams.set("interval", "1d");
  priceUrl.searchParams.set("dataType", String(dataType));
  priceUrl.searchParams.set("observations", String(observations));

  const response = await fetch(priceUrl.toString());
  const data = await response.json();

  if (!response.ok || data.status !== "200" ||
      !Array.isArray(data.data) || !data.data.length) {
    throw new Error("Unable to retrieve VUAG data.");
  }
  return data;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = makeHeaders(origin);

    if (origin && origin !== ALLOWED_ORIGIN) {
      return reply({ error: "Origin not allowed" }, 403, headers);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "GET") {
      return reply({ error: "GET requests only" }, 405, headers);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/health" || path === "/") {
      return reply({
        ok: true,
        service: "Morrow Market Data",
        version: 1
      }, 200, headers);
    }

    if (path === "/vuag") {
      try {
        return reply(await newtonData("04", 1), 200, headers);
      } catch (error) {
        return reply({ error: "Unable to retrieve VUAG price." }, 502, headers);
      }
    }

    if (path === "/vuag-history") {
      try {
        return reply(await newtonData("06", 1260), 200, headers);
      } catch (error) {
        return reply({ error: "Unable to retrieve VUAG historical prices." }, 502, headers);
      }
    }

    if (path === "/search") {
      const query = (url.searchParams.get("q") || "").trim();
      if (query.length < 2 || query.length > 80) {
        return reply({
          error: "Enter a search term between 2 and 80 characters."
        }, 400, headers);
      }

      try {
        const data = await twelveData("symbol_search", {
          symbol: query,
          outputsize: 15
        }, env);

        const results = (data.data || []).map(item => ({
          symbol: item.symbol || "",
          name: item.instrument_name || item.name || item.symbol || "",
          exchange: item.exchange || "",
          micCode: item.mic_code || "",
          currency: item.currency || "",
          instrumentType: item.instrument_type || item.type || "Unknown",
          country: item.country || "",
          provider: "Twelve Data"
        }));

        return reply({
          results,
          provider: "Twelve Data",
          retrievedAt: new Date().toISOString()
        }, 200, headers);
      } catch (error) {
        return reply({ error: error.message || "Investment search failed." }, 502, headers);
      }
    }

    if (path === "/price" || path === "/quote") {
      const symbol = (url.searchParams.get("symbol") || "").trim();
      const exchange = (url.searchParams.get("exchange") || "").trim();

      if (!/^[A-Za-z0-9.:-]{1,30}$/.test(symbol)) {
        return reply({ error: "Please provide a valid ticker symbol." }, 400, headers);
      }

      try {
        const params = { symbol };
        if (exchange) params.exchange = exchange;

        // Keep /quote compatible with the original app's Twelve Data response.
        const data = await twelveData("quote", params, env);
        if (path === "/quote") return reply(data, 200, headers);

        const rawPrice = data.close || data.price;
        const price = Number(rawPrice);
        if (!Number.isFinite(price)) {
          return reply({ error: "The provider did not return a valid price." }, 502, headers);
        }

        return reply({
          symbol: data.symbol || symbol,
          name: data.name || "",
          exchange: data.exchange || exchange,
          currency: data.currency || "",
          price,
          timestamp: data.timestamp || null,
          datetime: data.datetime || null,
          provider: "Twelve Data",
          priceType: "provider_quote"
        }, 200, headers);
      } catch (error) {
        return reply({
          error: error.message || "Unable to retrieve the price.",
          code: error.providerCode || null
        }, 502, headers);
      }
    }

    return reply({ error: "Route not found." }, 404, headers);
  }
};
