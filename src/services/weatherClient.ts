// Client-side weather for the installed Android build, where there is no
// server to answer /api/weather. Uses Open-Meteo (free, no API key) for the
// forecast and city geocoding, and BigDataCloud's free reverse-geocode client
// endpoint for an Arabic place label when we only have GPS coordinates.

export interface ClientWeatherPayload {
  location: {
    label: string;
    latitude: number;
    longitude: number;
    source: 'gps' | 'timezone' | 'approx' | 'city';
  };
  currentTime: string;
  timeZoneId: string | null;
  isDaytime: boolean;
  conditionType: string;
  conditionText: string;
  iconBaseUri: string | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  maxTempC: number | null;
  minTempC: number | null;
  humidity: number | null;
  windKmh: number | null;
  precipChance: number | null;
  uvIndex: number | null;
  provider: 'open-meteo';
}

export interface ClientCityCandidate {
  lat: number;
  lng: number;
  label: string;
  formattedAddress: string;
}

// Omar's home city: used whenever we have neither GPS nor a chosen city.
export const DEFAULT_CITY = {
  label: 'العبور، القليوبية',
  lat: 30.2231,
  lng: 31.4589,
};

const WMO_CONDITIONS: Record<number, {type: string; text: string}> = {
  0: {type: 'CLEAR', text: 'صافي'},
  1: {type: 'MOSTLY_CLEAR', text: 'صافي غالباً'},
  2: {type: 'PARTLY_CLOUDY', text: 'غائم جزئياً'},
  3: {type: 'CLOUDY', text: 'غائم'},
  45: {type: 'FOG', text: 'ضباب'},
  48: {type: 'FOG', text: 'ضباب متجمد'},
  51: {type: 'LIGHT_RAIN', text: 'رذاذ خفيف'},
  53: {type: 'LIGHT_RAIN', text: 'رذاذ'},
  55: {type: 'RAIN', text: 'رذاذ غزير'},
  56: {type: 'LIGHT_RAIN', text: 'رذاذ متجمد خفيف'},
  57: {type: 'RAIN', text: 'رذاذ متجمد'},
  61: {type: 'LIGHT_RAIN', text: 'مطر خفيف'},
  63: {type: 'RAIN', text: 'مطر'},
  65: {type: 'HEAVY_RAIN', text: 'مطر غزير'},
  66: {type: 'RAIN', text: 'مطر متجمد خفيف'},
  67: {type: 'HEAVY_RAIN', text: 'مطر متجمد'},
  71: {type: 'LIGHT_SNOW', text: 'ثلوج خفيفة'},
  73: {type: 'SNOW', text: 'ثلوج'},
  75: {type: 'HEAVY_SNOW', text: 'ثلوج كثيفة'},
  77: {type: 'SNOW', text: 'حبيبات ثلج'},
  80: {type: 'RAIN_SHOWERS', text: 'زخات مطر خفيفة'},
  81: {type: 'RAIN_SHOWERS', text: 'زخات مطر'},
  82: {type: 'HEAVY_RAIN_SHOWERS', text: 'زخات مطر غزيرة'},
  85: {type: 'LIGHT_SNOW', text: 'زخات ثلجية خفيفة'},
  86: {type: 'SNOW', text: 'زخات ثلجية'},
  95: {type: 'THUNDERSTORM', text: 'عاصفة رعدية'},
  96: {type: 'HEAVY_THUNDERSTORM', text: 'عاصفة رعدية مع بَرَد'},
  99: {type: 'HEAVY_THUNDERSTORM', text: 'عاصفة رعدية شديدة مع بَرَد'},
};

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const res = await fetch(url, {cache: 'no-store', signal});
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function reverseGeocodeLabel(lat: number, lng: number): Promise<string> {
  const data = (await fetchJson(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=ar`,
  )) as {city?: string; locality?: string; principalSubdivision?: string} | null;
  if (!data) return '';
  const city = (data.city || data.locality || '').trim();
  const region = (data.principalSubdivision || '').trim();
  if (city && region && city !== region) return `${city}، ${region}`;
  return city || region || '';
}

async function geocodeCity(
  name: string,
  signal?: AbortSignal,
): Promise<{lat: number; lng: number; label: string} | null> {
  const trySearch = async (countryCode: string) => {
    const cc = countryCode ? `&country_code=${countryCode}` : '';
    const data = (await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ar&format=json${cc}`,
      signal,
    )) as {results?: Array<{latitude: number; longitude: number; name: string; admin1?: string; country?: string}>} | null;
    const r = data?.results?.[0];
    if (!r) return null;
    const parts = [r.name, r.admin1, r.country].filter(
      (p): p is string => typeof p === 'string' && p.trim().length > 0,
    );
    const unique = parts.filter((p, i) => parts.indexOf(p) === i);
    return {lat: r.latitude, lng: r.longitude, label: unique.slice(0, 2).join('، ')};
  };
  return (await trySearch('EG')) ?? (await trySearch(''));
}

export async function searchCitiesClientSide(
  query: string,
  signal?: AbortSignal,
): Promise<ClientCityCandidate[]> {
  const data = (await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=ar&format=json`,
    signal,
  )) as {results?: Array<{latitude: number; longitude: number; name: string; admin1?: string; country?: string}>} | null;
  if (!data?.results) return [];
  return data.results.map((r) => {
    const parts = [r.name, r.admin1, r.country].filter(
      (p): p is string => typeof p === 'string' && p.trim().length > 0,
    );
    const unique = parts.filter((p, i) => parts.indexOf(p) === i);
    return {
      lat: r.latitude,
      lng: r.longitude,
      label: unique.slice(0, 2).join('، '),
      formattedAddress: unique.join('، '),
    };
  });
}

export async function fetchWeatherClientSide(
  params: URLSearchParams,
): Promise<ClientWeatherPayload | null> {
  let lat: number | null = null;
  let lng: number | null = null;
  let label = '';
  let source: ClientWeatherPayload['location']['source'] = 'approx';

  const latParam = params.get('lat');
  const lngParam = params.get('lng');
  const cityParam = params.get('city')?.trim();
  const labelParam = params.get('label')?.trim();
  const sourceParam = params.get('source');

  if (latParam && lngParam && Number.isFinite(Number(latParam)) && Number.isFinite(Number(lngParam))) {
    lat = Number(latParam);
    lng = Number(lngParam);
    source = sourceParam === 'city' ? 'city' : 'gps';
    label = labelParam || (await reverseGeocodeLabel(lat, lng)) || 'موقعك الحالي';
  } else if (cityParam) {
    const hit = await geocodeCity(cityParam);
    if (!hit) return null;
    lat = hit.lat;
    lng = hit.lng;
    label = hit.label;
    source = 'city';
  } else {
    // No GPS, no chosen city: fall back to Omar's home city (العبور).
    lat = DEFAULT_CITY.lat;
    lng = DEFAULT_CITY.lng;
    label = DEFAULT_CITY.label;
    source = 'approx';
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max` +
    `&forecast_days=1&timezone=auto&wind_speed_unit=kmh`;

  const data = (await fetchJson(url)) as {
    timezone?: string;
    current?: {
      time?: string;
      temperature_2m?: number;
      apparent_temperature?: number;
      relative_humidity_2m?: number;
      is_day?: number;
      weather_code?: number;
      wind_speed_10m?: number;
    };
    daily?: {
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: Array<number | null>;
      uv_index_max?: Array<number | null>;
    };
  } | null;

  if (!data?.current) return null;

  const code = typeof data.current.weather_code === 'number' ? data.current.weather_code : 0;
  const cond = WMO_CONDITIONS[code] ?? {type: 'CLOUDY', text: 'غائم جزئياً'};
  const round = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;

  return {
    location: {label, latitude: lat, longitude: lng, source},
    currentTime: data.current.time || new Date().toISOString(),
    timeZoneId: data.timezone || null,
    isDaytime: data.current.is_day !== 0,
    conditionType: cond.type,
    conditionText: cond.text,
    iconBaseUri: null,
    temperatureC: round(data.current.temperature_2m),
    feelsLikeC: round(data.current.apparent_temperature),
    maxTempC: round(data.daily?.temperature_2m_max?.[0]),
    minTempC: round(data.daily?.temperature_2m_min?.[0]),
    humidity: round(data.current.relative_humidity_2m),
    windKmh: round(data.current.wind_speed_10m),
    precipChance: round(data.daily?.precipitation_probability_max?.[0]),
    uvIndex: round(data.daily?.uv_index_max?.[0]),
    provider: 'open-meteo',
  };
}
