async function searchAddress(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(4000),
    headers: {
      "User-Agent": "KvartalCoursework/1.0 (student project)",
      "Accept-Language": "ru"
    }
  });
  if (!response.ok) throw new Error("Geocoding service is unavailable");

  return response.json();
}

async function geocodeAddress(address, district) {
  const queries = [
    [address, district, "Санкт-Петербург", "Россия"],
    [address, "Санкт-Петербург", "Россия"],
    [address, "Санкт-Петербург"]
  ]
    .filter((parts) => parts[0])
    .map((parts) => parts.filter(Boolean).join(", "));

  let results = [];
  for (const query of [...new Set(queries)]) {
    results = await searchAddress(query);
    if (results[0]) break;
  }

  if (!results[0]) return { latitude: null, longitude: null };
  return {
    latitude: Number(results[0].lat),
    longitude: Number(results[0].lon)
  };
}

module.exports = { geocodeAddress };
