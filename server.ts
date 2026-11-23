import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

const GMP_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

class QuotaExceededError extends Error {
  constructor(message = 'Google Maps Platform quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

function getMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
    ''
  );
}

function isQuotaErrorPayload(status: number, body: unknown): boolean {
  if (status === 429) return true;
  if (!body || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  const topStatus = typeof obj.status === 'string' ? obj.status : '';
  if (topStatus === 'OVER_QUERY_LIMIT' || topStatus === 'OVER_DAILY_LIMIT') return true;
  const err = obj.error as Record<string, unknown> | undefined;
  if (err) {
    if (err.status === 'RESOURCE_EXHAUSTED' || err.code === 429) return true;
    const errorsList = Array.isArray(err.errors) ? err.errors : [];
    for (const entry of errorsList) {
      if (entry && typeof entry === 'object') {
        const reason = (entry as Record<string, unknown>).reason;
        if (reason === 'dailyLimitExceeded' || reason === 'userRateLimitExceeded') {
          return true;
        }
      }
    }
  }
  return false;
}

interface AddressComponentLike {
  longText?: string;
  long_name?: string;
  types?: string[];
}

function extractCityLabelFromComponents(components: AddressComponentLike[] | undefined): string {
  if (!Array.isArray(components) || components.length === 0) return '';
  const findByType = (typesToMatch: string[]): string => {
    for (const targetType of typesToMatch) {
      const found = components.find((c) => Array.isArray(c.types) && c.types.includes(targetType));
      const text = found?.longText || found?.long_name;
      if (text) return text;
    }
    return '';
  };

  const city = findByType([
    'locality',
    'administrative_area_level_2',
    'administrative_area_level_1',
    'sublocality',
  ]);
  const country = findByType(['country']);
  if (city && country && city !== country) return `${city}، ${country}`;
  return city || country || '';
}

const TIMEZONE_CITY_MAP: Record<string, {city: string; region: string}> = {
  'Africa/Cairo': {city: 'Cairo, Egypt', region: 'EG'},
  'Africa/Alexandria': {city: 'Alexandria, Egypt', region: 'EG'},
  'Asia/Riyadh': {city: 'Riyadh, Saudi Arabia', region: 'SA'},
  'Asia/Dubai': {city: 'Dubai, United Arab Emirates', region: 'AE'},
  'Asia/Kuwait': {city: 'Kuwait City, Kuwait', region: 'KW'},
  'Asia/Qatar': {city: 'Doha, Qatar', region: 'QA'},
  'Asia/Bahrain': {city: 'Manama, Bahrain', region: 'BH'},
  'Asia/Muscat': {city: 'Muscat, Oman', region: 'OM'},
  'Asia/Amman': {city: 'Amman, Jordan', region: 'JO'},
  'Asia/Beirut': {city: 'Beirut, Lebanon', region: 'LB'},
  'Asia/Baghdad': {city: 'Baghdad, Iraq', region: 'IQ'},
  'Africa/Tripoli': {city: 'Tripoli, Libya', region: 'LY'},
  'Africa/Tunis': {city: 'Tunis, Tunisia', region: 'TN'},
  'Africa/Algiers': {city: 'Algiers, Algeria', region: 'DZ'},
  'Africa/Casablanca': {city: 'Casablanca, Morocco', region: 'MA'},
  'Africa/Khartoum': {city: 'Khartoum, Sudan', region: 'SD'},
  'Asia/Gaza': {city: 'Gaza', region: 'PS'},
  'Asia/Hebron': {city: 'Hebron', region: 'PS'},
  'Asia/Aden': {city: 'Sanaa, Yemen', region: 'YE'},
  'Europe/Istanbul': {city: 'Istanbul, Turkey', region: 'TR'},
  'Europe/London': {city: 'London, United Kingdom', region: 'GB'},
  'Europe/Paris': {city: 'Paris, France', region: 'FR'},
  'Europe/Berlin': {city: 'Berlin, Germany', region: 'DE'},
  'America/New_York': {city: 'New York, United States', region: 'US'},
  'America/Los_Angeles': {city: 'Los Angeles, United States', region: 'US'},
  'America/Chicago': {city: 'Chicago, United States', region: 'US'},
  'America/Toronto': {city: 'Toronto, Canada', region: 'CA'},
};

function inferLocationHintFromTimezone(timeZone: string): {city: string; region?: string} | null {
  const cleanTz = timeZone.trim();
  if (!cleanTz || cleanTz.length > 64) return null;
  if (TIMEZONE_CITY_MAP[cleanTz]) {
    return TIMEZONE_CITY_MAP[cleanTz];
  }
  const parts = cleanTz.split('/');
  const rawCity = parts[parts.length - 1]?.replace(/_/g, ' ').trim();
  if (!rawCity || rawCity.toUpperCase() === 'UTC' || rawCity.toUpperCase() === 'GMT') {
    return null;
  }
  return {city: rawCity};
}

function normalizeRegionCode(rawRegion: string): string {
  const clean = rawRegion.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(clean) ? clean : '';
}

interface GeocodedCandidate {
  lat: number;
  lng: number;
  label: string;
  formattedAddress: string;
}

async function resolveApproxCoordsViaGeolocationApi(
  apiKey: string,
): Promise<{lat: number; lng: number; accuracy?: number}> {
  const url = `https://www.googleapis.com/geolocation/v1/geolocate?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
    },
    body: JSON.stringify({considerIp: true}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (isQuotaErrorPayload(res.status, data)) {
    throw new QuotaExceededError();
  }
  if (!res.ok) {
    throw new Error(`Geolocation API failed (${res.status})`);
  }
  const loc = data.location as {lat?: number; lng?: number} | undefined;
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') {
    throw new Error('Geolocation API returned no coordinates');
  }
  return {
    lat: loc.lat,
    lng: loc.lng,
    accuracy: typeof data.accuracy === 'number' ? data.accuracy : undefined,
  };
}

async function geocodeCityCandidates(
  cityQuery: string,
  apiKey: string,
  regionCode = '',
): Promise<GeocodedCandidate[]> {
  const safeRegion = normalizeRegionCode(regionCode);

  // Primary: Geocoding API v4
  const encodedAddress = encodeURIComponent(cityQuery);
  const v4Url = new URL(`https://geocode.googleapis.com/v4/geocode/address/${encodedAddress}`);
  v4Url.searchParams.set('languageCode', 'ar');
  if (safeRegion) {
    v4Url.searchParams.set('regionCode', safeRegion);
  }
  const v4Res = await fetch(v4Url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'results.location,results.formattedAddress,results.addressComponents',
      'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
    },
  });
  const v4Data = (await v4Res.json().catch(() => ({}))) as Record<string, unknown>;
  if (isQuotaErrorPayload(v4Res.status, v4Data)) {
    throw new QuotaExceededError();
  }
  if (v4Res.ok && Array.isArray(v4Data.results) && v4Data.results.length > 0) {
    const candidates: GeocodedCandidate[] = [];
    for (const item of v4Data.results.slice(0, 5)) {
      const entry = item as {
        location?: {latitude?: number; longitude?: number};
        formattedAddress?: string;
        addressComponents?: AddressComponentLike[];
      };
      if (
        typeof entry.location?.latitude === 'number' &&
        typeof entry.location?.longitude === 'number'
      ) {
        const label =
          extractCityLabelFromComponents(entry.addressComponents) ||
          entry.formattedAddress ||
          cityQuery;
        candidates.push({
          lat: entry.location.latitude,
          lng: entry.location.longitude,
          label,
          formattedAddress: entry.formattedAddress || label,
        });
      }
    }
    if (candidates.length > 0) return candidates;
  }

  // Fallback: Standard Geocoding REST API
  const restUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  restUrl.searchParams.set('address', cityQuery);
  restUrl.searchParams.set('language', 'ar');
  if (safeRegion) {
    restUrl.searchParams.set('region', safeRegion.toLowerCase());
  }
  restUrl.searchParams.set('key', apiKey);
  const restRes = await fetch(restUrl.toString(), {
    method: 'GET',
    headers: {'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID},
  });
  const restData = (await restRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (isQuotaErrorPayload(restRes.status, restData)) {
    throw new QuotaExceededError();
  }
  if (restRes.ok && Array.isArray(restData.results) && restData.results.length > 0) {
    const candidates: GeocodedCandidate[] = [];
    for (const item of restData.results.slice(0, 5)) {
      const entry = item as {
        geometry?: {location?: {lat?: number; lng?: number}};
        formatted_address?: string;
        address_components?: AddressComponentLike[];
      };
      if (
        typeof entry.geometry?.location?.lat === 'number' &&
        typeof entry.geometry?.location?.lng === 'number'
      ) {
        const label =
          extractCityLabelFromComponents(entry.address_components) ||
          entry.formatted_address ||
          cityQuery;
        candidates.push({
          lat: entry.geometry.location.lat,
          lng: entry.geometry.location.lng,
          label,
          formattedAddress: entry.formatted_address || label,
        });
      }
    }
    if (candidates.length > 0) return candidates;
  }

  return [];
}

async function forwardGeocodeCity(
  cityQuery: string,
  apiKey: string,
  regionCode = '',
): Promise<{lat: number; lng: number; label: string} | null> {
  const candidates = await geocodeCityCandidates(cityQuery, apiKey, regionCode);
  return candidates[0] ?? null;
}

async function reverseGeocodeLabel(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<string> {
  try {
    const v4Url = new URL('https://geocode.googleapis.com/v4/geocode/location');
    v4Url.searchParams.set('location.latitude', String(lat));
    v4Url.searchParams.set('location.longitude', String(lng));
    v4Url.searchParams.set('languageCode', 'ar');

    const v4Res = await fetch(v4Url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'results.formattedAddress,results.addressComponents',
        'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
      },
    });
    const v4Data = (await v4Res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isQuotaErrorPayload(v4Res.status, v4Data)) {
      throw new QuotaExceededError();
    }
    if (v4Res.ok && Array.isArray(v4Data.results) && v4Data.results.length > 0) {
      const first = v4Data.results[0] as {
        formattedAddress?: string;
        addressComponents?: AddressComponentLike[];
      };
      const label =
        extractCityLabelFromComponents(first.addressComponents) || first.formattedAddress || '';
      if (label) return label;
    }

    // Fallback: Standard Geocoding REST API
    const restUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    restUrl.searchParams.set('latlng', `${lat},${lng}`);
    restUrl.searchParams.set('language', 'ar');
    restUrl.searchParams.set('key', apiKey);
    const restRes = await fetch(restUrl.toString(), {
      method: 'GET',
      headers: {'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID},
    });
    const restData = (await restRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (isQuotaErrorPayload(restRes.status, restData)) {
      throw new QuotaExceededError();
    }
    if (restRes.ok && Array.isArray(restData.results) && restData.results.length > 0) {
      const first = restData.results[0] as {
        formatted_address?: string;
        address_components?: AddressComponentLike[];
      };
      return (
        extractCityLabelFromComponents(first.address_components) || first.formatted_address || ''
      );
    }
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
  }
  return '';
}

async function fetchGoogleCurrentWeather(lat: number, lng: number, apiKey: string) {
  const url = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('location.latitude', String(lat));
  url.searchParams.set('location.longitude', String(lng));
  url.searchParams.set('unitsSystem', 'METRIC');
  url.searchParams.set('languageCode', 'ar');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (isQuotaErrorPayload(res.status, data)) {
    throw new QuotaExceededError();
  }
  if (!res.ok) {
    throw new Error(`Weather API error (${res.status})`);
  }
  return data;
}

async function fetchGoogleTodayForecast(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<{maxTempC: number | null; minTempC: number | null}> {
  try {
    const url = new URL('https://weather.googleapis.com/v1/forecast/days:lookup');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('location.latitude', String(lat));
    url.searchParams.set('location.longitude', String(lng));
    url.searchParams.set('days', '1');
    url.searchParams.set('pageSize', '1');
    url.searchParams.set('unitsSystem', 'METRIC');
    url.searchParams.set('languageCode', 'ar');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      forecastDays?: Array<{
        maxTemperature?: {degrees?: number};
        minTemperature?: {degrees?: number};
      }>;
    };
    if (isQuotaErrorPayload(res.status, data)) {
      throw new QuotaExceededError();
    }
    const today = res.ok && Array.isArray(data.forecastDays) ? data.forecastDays[0] : undefined;
    return {
      maxTempC:
        typeof today?.maxTemperature?.degrees === 'number'
          ? Math.round(today.maxTemperature.degrees)
          : null,
      minTempC:
        typeof today?.minTemperature?.degrees === 'number'
          ? Math.round(today.minTemperature.degrees)
          : null,
    };
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
    return {maxTempC: null, minTempC: null};
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '128kb'}));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ok: true, app: "Omar's Life", timestamp: Date.now()});
  });

  app.get('/api/weather/search', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: 'api_key_missing',
        message: 'مفتاح Google Maps Platform مش متوفر حالياً على الخادم.',
      });
      return;
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const tzParam = typeof req.query.tz === 'string' ? req.query.tz.trim() : '';
    const regionParam = typeof req.query.region === 'string' ? req.query.region.trim() : '';
    const inferredRegion = regionParam || inferLocationHintFromTimezone(tzParam)?.region || '';

    if (!q || q.length > 100) {
      res.status(400).json({error: 'invalid_query', results: []});
      return;
    }

    try {
      const results = await geocodeCityCandidates(q, apiKey, inferredRegion);
      res.json({results});
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        res.status(429).json({
          error: 'quota_exceeded',
          status: 'RESOURCE_EXHAUSTED',
          message: 'تم الوصول للحد اليومي لاستخدام خدمة المواقع.',
        });
        return;
      }
      res.status(502).json({error: 'search_failed', results: []});
    }
  });

  app.get('/api/weather', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: 'api_key_missing',
        message: 'مفتاح Google Maps Platform مش متوفر حالياً على الخادم.',
      });
      return;
    }

    try {
      const cityParam = typeof req.query.city === 'string' ? req.query.city.trim() : '';
      const latParam = typeof req.query.lat === 'string' ? Number(req.query.lat) : NaN;
      const lngParam = typeof req.query.lng === 'string' ? Number(req.query.lng) : NaN;
      const modeParam = typeof req.query.mode === 'string' ? req.query.mode : '';
      const tzParam = typeof req.query.tz === 'string' ? req.query.tz.trim() : '';
      const regionParam = typeof req.query.region === 'string' ? req.query.region.trim() : '';
      const sourceParam = typeof req.query.source === 'string' ? req.query.source.trim() : '';
      const labelParam = typeof req.query.label === 'string' ? req.query.label.trim() : '';

      const tzHint = inferLocationHintFromTimezone(tzParam);
      const effectiveRegion = normalizeRegionCode(regionParam || tzHint?.region || '');

      let lat: number;
      let lng: number;
      let locationLabel = '';
      let locationSource: 'gps' | 'timezone' | 'approx' | 'city' = 'approx';

      if (cityParam) {
        if (cityParam.length > 100) {
          res.status(400).json({error: 'invalid_city', message: 'اسم المدينة طويل جداً.'});
          return;
        }
        const geo = await forwardGeocodeCity(cityParam, apiKey, effectiveRegion);
        if (!geo) {
          res.status(404).json({
            error: 'city_not_found',
            message: 'مقدرناش نلاقي المدينة دي، جرّب تكتب اسم مدينة تاني.',
          });
          return;
        }
        lat = geo.lat;
        lng = geo.lng;
        locationLabel = geo.label;
        locationSource = 'city';
      } else if (
        Number.isFinite(latParam) &&
        Number.isFinite(lngParam) &&
        latParam >= -90 &&
        latParam <= 90 &&
        lngParam >= -180 &&
        lngParam <= 180
      ) {
        lat = latParam;
        lng = lngParam;
        locationLabel = labelParam.slice(0, 120);
        locationSource = sourceParam === 'city' ? 'city' : 'gps';
      } else if (modeParam === 'approx' || (!cityParam && Number.isNaN(latParam))) {
        // Avoid geolocating the Cloud Run server's IP (e.g. London) when browser timezone is available.
        let resolvedFromTz = false;
        if (tzHint) {
          const geoFromTz = await forwardGeocodeCity(tzHint.city, apiKey, tzHint.region ?? '');
          if (geoFromTz) {
            lat = geoFromTz.lat;
            lng = geoFromTz.lng;
            locationLabel = geoFromTz.label;
            locationSource = 'timezone';
            resolvedFromTz = true;
          }
        }
        if (!resolvedFromTz) {
          const approx = await resolveApproxCoordsViaGeolocationApi(apiKey);
          lat = approx.lat;
          lng = approx.lng;
          locationSource = 'approx';
        }
      } else {
        res.status(400).json({error: 'invalid_coords', message: 'إحداثيات الموقع غير صالحة.'});
        return;
      }

      const [weatherRaw, todayForecast, resolvedLabel] = await Promise.all([
        fetchGoogleCurrentWeather(lat!, lng!, apiKey),
        fetchGoogleTodayForecast(lat!, lng!, apiKey),
        locationLabel ? Promise.resolve(locationLabel) : reverseGeocodeLabel(lat!, lng!, apiKey),
      ]);

      const weather = weatherRaw as {
        currentTime?: string;
        timeZone?: {id?: string};
        isDaytime?: boolean;
        weatherCondition?: {
          type?: string;
          iconBaseUri?: string;
          description?: {text?: string};
        };
        temperature?: {degrees?: number; unit?: string};
        feelsLikeTemperature?: {degrees?: number; unit?: string};
        relativeHumidity?: number;
        uvIndex?: number;
        cloudCover?: number;
        wind?: {
          speed?: {value?: number; unit?: string};
          direction?: {degrees?: number; cardinal?: string};
        };
        precipitation?: {
          probability?: {percent?: number; type?: string};
        };
        currentConditionsHistory?: {
          maxTemperature?: {degrees?: number};
          minTemperature?: {degrees?: number};
        };
      };

      const historyMax =
        typeof weather.currentConditionsHistory?.maxTemperature?.degrees === 'number'
          ? Math.round(weather.currentConditionsHistory.maxTemperature.degrees)
          : null;
      const historyMin =
        typeof weather.currentConditionsHistory?.minTemperature?.degrees === 'number'
          ? Math.round(weather.currentConditionsHistory.minTemperature.degrees)
          : null;

      res.json({
        location: {
          label: resolvedLabel || `${lat!.toFixed(2)}, ${lng!.toFixed(2)}`,
          latitude: lat!,
          longitude: lng!,
          source: locationSource,
        },
        currentTime: weather.currentTime ?? new Date().toISOString(),
        timeZoneId: weather.timeZone?.id ?? null,
        isDaytime: weather.isDaytime ?? true,
        conditionType: weather.weatherCondition?.type ?? 'UNKNOWN',
        conditionText: weather.weatherCondition?.description?.text ?? '',
        iconBaseUri: weather.weatherCondition?.iconBaseUri ?? null,
        temperatureC:
          typeof weather.temperature?.degrees === 'number'
            ? Math.round(weather.temperature.degrees)
            : null,
        feelsLikeC:
          typeof weather.feelsLikeTemperature?.degrees === 'number'
            ? Math.round(weather.feelsLikeTemperature.degrees)
            : null,
        maxTempC: todayForecast.maxTempC ?? historyMax,
        minTempC: todayForecast.minTempC ?? historyMin,
        humidity:
          typeof weather.relativeHumidity === 'number' ? weather.relativeHumidity : null,
        windKmh:
          typeof weather.wind?.speed?.value === 'number'
            ? Math.round(weather.wind.speed.value)
            : null,
        precipChance:
          typeof weather.precipitation?.probability?.percent === 'number'
            ? weather.precipitation.probability.percent
            : null,
        uvIndex: typeof weather.uvIndex === 'number' ? weather.uvIndex : null,
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        res.status(429).json({
          error: 'quota_exceeded',
          status: 'RESOURCE_EXHAUSTED',
          message: 'تم الوصول للحد اليومي لاستخدام خدمة الطقس والمواقع.',
        });
        return;
      }
      console.error('Weather proxy error:', err instanceof Error ? err.message : err);
      res.status(502).json({
        error: 'weather_unavailable',
        message: 'مقدرناش نحدّث حالة الطقس دلوقتي. جرّب تاني أو اكتب اسم مدينتك.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true, hmr: false},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Service-Worker-Allowed', '/');
          }
        },
      }),
    );
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Omar's Life server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Omar's Life server:", err);
  process.exit(1);
});
