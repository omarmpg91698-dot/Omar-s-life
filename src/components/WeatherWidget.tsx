import React, {useCallback, useEffect, useRef, useState} from 'react';
import {fetchWeatherClientSide, searchCitiesClientSide} from '../services/weatherClient';
import {
  ChevronDown,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  LocateFixed,
  MapPin,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Wind,
  X,
} from 'lucide-react';

interface WeatherPayload {
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
  provider?: 'google-weather' | 'open-meteo';
}

interface SearchCandidate {
  lat: number;
  lng: number;
  label: string;
  formattedAddress: string;
}

const CITY_PREF_KEY = 'omars_life_weather_city';

const QUICK_CITIES = ['العبور', 'القاهرة', 'الجيزة', 'الإسكندرية', 'المنصورة', 'الرياض', 'دبي'];

const ARABIC_CONDITION_FALLBACK: Record<string, string> = {
  CLEAR: 'صافي',
  MOSTLY_CLEAR: 'صافي غالباً',
  PARTLY_CLOUDY: 'غائم جزئياً',
  MOSTLY_CLOUDY: 'غائم غالباً',
  CLOUDY: 'غائم',
  WINDY: 'رياح نشطة',
  WIND_AND_RAIN: 'رياح ومطر',
  LIGHT_RAIN_SHOWERS: 'زخات مطر خفيفة',
  CHANCE_OF_SHOWERS: 'احتمال زخات مطر',
  SCATTERED_SHOWERS: 'أمطار متفرقة',
  RAIN_SHOWERS: 'زخات مطر',
  HEAVY_RAIN_SHOWERS: 'أمطار غزيرة',
  LIGHT_TO_MODERATE_RAIN: 'مطر خفيف إلى متوسط',
  MODERATE_TO_HEAVY_RAIN: 'مطر متوسط إلى غزير',
  RAIN: 'ممطر',
  LIGHT_RAIN: 'مطر خفيف',
  HEAVY_RAIN: 'مطر غزير',
  RAIN_PERIODICALLY_HEAVY: 'مطر يشتد على فترات',
  LIGHT_SNOW: 'ثلوج خفيفة',
  SNOW: 'ثلوج',
  HEAVY_SNOW: 'ثلوج كثيفة',
  THUNDERSTORM: 'عاصفة رعدية',
  THUNDERSHOWER: 'أمطار رعدية',
  LIGHT_THUNDERSTORM_RAIN: 'مطر رعدي خفيف',
  SCATTERED_THUNDERSTORMS: 'عواصف رعدية متفرقة',
  HEAVY_THUNDERSTORM: 'عاصفة رعدية شديدة',
  FOG: 'ضباب',
  HAZE: 'شبورة خفيفة',
  DUST: 'أتربة',
  SANDSTORM: 'عاصفة رملية',
};

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function formatObservedTime(isoString: string, timeZoneId: string | null): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ar-EG', {
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZoneId ? {timeZone: timeZoneId} : {}),
    }).format(date);
  } catch {
    return '';
  }
}

function getFallbackWeatherIcon(conditionType: string, isDaytime: boolean) {
  const type = conditionType.toUpperCase();
  if (type.includes('THUNDER')) return CloudLightning;
  if (type.includes('SNOW') || type.includes('ICE') || type.includes('SLEET')) return CloudSnow;
  if (type.includes('DRIZZLE') || type.includes('LIGHT_RAIN')) return CloudDrizzle;
  if (type.includes('RAIN') || type.includes('SHOWER')) return CloudRain;
  if (type.includes('FOG') || type.includes('HAZE') || type.includes('MIST')) return CloudFog;
  if (type.includes('PARTLY_CLOUDY') || type.includes('MOSTLY_CLEAR')) {
    return isDaytime ? CloudSun : Cloud;
  }
  if (type.includes('CLOUD')) return Cloud;
  if (type.includes('CLEAR') || type.includes('SUN')) {
    return isDaytime ? Sun : Moon;
  }
  return isDaytime ? CloudSun : Cloud;
}

export const WeatherWidget: React.FC = () => {
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [iconFailed, setIconFailed] = useState(false);

  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [searchResults, setSearchResults] = useState<SearchCandidate[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);

  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchWeatherEndpoint = useCallback(
    async (
      params: URLSearchParams,
      options?: {
        persistCityQuery?: string | null;
        clearPersistedCity?: boolean;
        seq?: number;
      },
    ): Promise<boolean> => {
      const seq = options?.seq ?? ++requestSeqRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const tz = getBrowserTimeZone();
      if (tz && !params.has('tz')) {
        params.set('tz', tz);
      }

      const persistCity = () => {
        try {
          if (options?.clearPersistedCity) {
            localStorage.removeItem(CITY_PREF_KEY);
          } else if (options?.persistCityQuery) {
            localStorage.setItem(CITY_PREF_KEY, options.persistCityQuery);
          }
        } catch {
          // ignore storage errors
        }
      };

      setLoading(true);
      setErrorMsg('');
      setIconFailed(false);

      try {
        const res = await fetch(`/api/weather?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {Accept: 'application/json'},
        });
        const data = (await res.json().catch(() => ({}))) as Partial<WeatherPayload> & {
          error?: string;
          status?: string;
          message?: string;
        };

        if (!mountedRef.current || seq !== requestSeqRef.current) {
          return false;
        }

        if (
          res.status === 429 ||
          data.status === 'RESOURCE_EXHAUSTED' ||
          data.error === 'quota_exceeded'
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          setErrorMsg('وصلنا للحد اليومي لخدمة الطقس حالياً.');
          return false;
        }

        if (!res.ok || !data.location) {
          // The installed Android build has no server for /api/weather:
          // fall back to the direct client-side provider (Open-Meteo).
          const clientData = await fetchWeatherClientSide(params);
          if (!mountedRef.current || seq !== requestSeqRef.current) {
            return false;
          }
          if (clientData) {
            setWeather(clientData);
            setErrorMsg('');
            setInfoMsg('');
            persistCity();
            return true;
          }
          setErrorMsg(
            data.message || 'مقدرناش نحمّل حالة الطقس دلوقتي. جرّب تاني أو اكتب اسم مدينتك.',
          );
          return false;
        }

        setWeather(data as WeatherPayload);
        setErrorMsg('');
        setInfoMsg('');
        persistCity();

        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return false;
        }
        // No server at all in the installed build: try the direct provider.
        try {
          const clientData = await fetchWeatherClientSide(params);
          if (!mountedRef.current || seq !== requestSeqRef.current) {
            return false;
          }
          if (clientData) {
            setWeather(clientData);
            setErrorMsg('');
            setInfoMsg('');
            persistCity();
            return true;
          }
        } catch {
          // fall through to the connectivity message
        }
        if (mountedRef.current && seq === requestSeqRef.current) {
          setErrorMsg('مفيش اتصال بالإنترنت لتحديث حالة الطقس حالياً.');
        }
        return false;
      } finally {
        if (mountedRef.current && seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const detectAndFetchWeather = useCallback(
    (options: {explicitUserAction: boolean}) => {
      const seq = ++requestSeqRef.current;
      abortRef.current?.abort();

      const fallbackToTimezone = () => {
        if (!mountedRef.current || seq !== requestSeqRef.current) return;
        const params = new URLSearchParams({mode: 'approx'});
        void fetchWeatherEndpoint(params, {seq});
      };

      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        setLoading(true);
        setErrorMsg('');
        setInfoMsg('');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!mountedRef.current || seq !== requestSeqRef.current) return;
            const params = new URLSearchParams({
              lat: pos.coords.latitude.toFixed(5),
              lng: pos.coords.longitude.toFixed(5),
              source: 'gps',
            });
            void fetchWeatherEndpoint(params, {
              clearPersistedCity: true,
              seq,
            });
          },
          (geoErr) => {
            if (!mountedRef.current || seq !== requestSeqRef.current) return;
            if (options.explicitUserAction) {
              setLoading(false);
              setCityPickerOpen(true);
              if (geoErr.code === geoErr.PERMISSION_DENIED) {
                setInfoMsg(
                  'المتصفح منع الوصول لموقعك تلقائياً — اكتب اسم مدينتك أو اختارها من تحت.',
                );
              } else {
                setInfoMsg('مقدرناش نحدد موقعك بـ GPS دلوقتي — اكتب اسم مدينتك أو اختارها من تحت.');
              }
              return;
            }
            fallbackToTimezone();
          },
          {
            enableHighAccuracy: options.explicitUserAction,
            timeout: options.explicitUserAction ? 10_000 : 5_000,
            maximumAge: options.explicitUserAction ? 0 : 120_000,
          },
        );
      } else if (options.explicitUserAction) {
        setLoading(false);
        setCityPickerOpen(true);
        setInfoMsg('المتصفح مش بيدعم تحديد الموقع تلقائياً — اختار مدينتك من تحت.');
      } else {
        fallbackToTimezone();
      }
    },
    [fetchWeatherEndpoint],
  );

  useEffect(() => {
    mountedRef.current = true;
    const savedCity =
      typeof localStorage !== 'undefined' ? localStorage.getItem(CITY_PREF_KEY)?.trim() : '';
    if (savedCity) {
      const params = new URLSearchParams({city: savedCity});
      void fetchWeatherEndpoint(params);
    } else {
      detectAndFetchWeather({explicitUserAction: false});
    }
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [detectAndFetchWeather, fetchWeatherEndpoint]);

  // Debounced live location suggestions via Google Geocoding API
  useEffect(() => {
    if (!cityPickerOpen) {
      setSearchResults([]);
      return;
    }
    const q = cityInput.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchingPlaces(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingPlaces(true);
      try {
        let results: SearchCandidate[] | null = null;
        try {
          const params = new URLSearchParams({q});
          const tz = getBrowserTimeZone();
          if (tz) params.set('tz', tz);
          const res = await fetch(`/api/weather/search?${params.toString()}`, {
            cache: 'no-store',
            signal: controller.signal,
            headers: {Accept: 'application/json'},
          });
          const data = (await res.json().catch(() => ({}))) as {
            results?: SearchCandidate[];
            status?: string;
            error?: string;
          };
          if (
            res.status === 429 ||
            data.status === 'RESOURCE_EXHAUSTED' ||
            data.error === 'quota_exceeded'
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            return;
          }
          if (res.ok && Array.isArray(data.results)) {
            results = data.results;
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw err;
          }
        }
        if (results === null) {
          // No server in the installed build: search cities client-side.
          results = await searchCitiesClientSide(q, controller.signal);
        }
        setSearchResults(results);
      } catch {
        // Ignore aborted or transient autocomplete errors
      } finally {
        setSearchingPlaces(false);
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cityInput, cityPickerOpen]);

  const selectCityByName = async (cityName: string) => {
    const clean = cityName.trim();
    if (!clean) return;
    const params = new URLSearchParams({city: clean});
    const ok = await fetchWeatherEndpoint(params, {persistCityQuery: clean});
    if (ok && mountedRef.current) {
      setCityPickerOpen(false);
      setCityInput('');
      setSearchResults([]);
    }
  };

  const selectCandidate = async (candidate: SearchCandidate) => {
    const params = new URLSearchParams({
      lat: String(candidate.lat),
      lng: String(candidate.lng),
      source: 'city',
      label: candidate.label,
    });
    const ok = await fetchWeatherEndpoint(params, {
      persistCityQuery: candidate.formattedAddress || candidate.label,
    });
    if (ok && mountedRef.current) {
      setCityPickerOpen(false);
      setCityInput('');
      setSearchResults([]);
    }
  };

  const handleCitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void selectCityByName(cityInput);
  };

  const handleUseMyLocation = () => {
    setCityPickerOpen(false);
    setSearchResults([]);
    detectAndFetchWeather({explicitUserAction: true});
  };

  const handleRefresh = () => {
    const savedCity =
      typeof localStorage !== 'undefined' ? localStorage.getItem(CITY_PREF_KEY)?.trim() : '';
    if (savedCity) {
      void fetchWeatherEndpoint(new URLSearchParams({city: savedCity}));
    } else if (weather?.location.source === 'gps') {
      void fetchWeatherEndpoint(
        new URLSearchParams({
          lat: String(weather.location.latitude),
          lng: String(weather.location.longitude),
          source: 'gps',
        }),
      );
    } else {
      detectAndFetchWeather({explicitUserAction: false});
    }
  };

  const FallbackIcon = weather
    ? getFallbackWeatherIcon(weather.conditionType, weather.isDaytime)
    : CloudSun;

  const conditionDisplay = weather
    ? weather.conditionText ||
      ARABIC_CONDITION_FALLBACK[weather.conditionType] ||
      'حالة الطقس الحالية'
    : '';

  const locationSourceLabel =
    weather?.location.source === 'gps'
      ? 'موقعك الحالي (GPS)'
      : weather?.location.source === 'timezone'
        ? 'حسب منطقتك الزمنية'
        : weather?.location.source === 'approx'
          ? 'موقع تقريبي'
          : 'مدينة محددة';

  const observedTimeLabel = weather
    ? formatObservedTime(weather.currentTime, weather.timeZoneId)
    : '';

  return (
    <section
      aria-label="حالة الطقس الحالية"
      className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90 lg:flex-1"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCityPickerOpen((v) => !v)}
          aria-expanded={cityPickerOpen}
          title="اضغط لتغيير المدينة أو المنطقة"
          className="group flex min-h-[34px] min-w-0 items-center gap-1.5 rounded-lg pe-2 text-start text-xs font-semibold text-slate-700 transition-colors hover:text-accent dark:text-slate-200"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="truncate">
            {weather ? weather.location.label : 'الطقس الحالي'}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:text-accent ${
              cityPickerOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCityPickerOpen((v) => !v)}
            aria-label="تغيير المدينة"
            title="تغيير المدينة"
            className={`flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg transition-colors ${
              cityPickerOpen
                ? 'bg-accent-soft text-accent'
                : 'text-slate-500 hover:bg-slate-100 hover:text-accent dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            {cityPickerOpen ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={loading}
            aria-label="تحديد موقعي بـ GPS"
            title="تحديد موقعي بـ GPS"
            className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-accent disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <LocateFixed className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="تحديث حالة الطقس"
            title="تحديث حالة الطقس"
            className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-accent disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Inline City Picker + Live Results + Quick Cities */}
      {cityPickerOpen && (
        <div className="mt-3 space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
          <form onSubmit={handleCitySubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="اكتب المدينة أو المنطقة (مثلاً: المعادي، الإسكندرية)..."
              className="min-h-[38px] min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={loading || !cityInput.trim()}
              className="min-h-[38px] shrink-0 whitespace-nowrap rounded-xl bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              عرض
            </button>
          </form>

          {searchingPlaces && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">جاري البحث عن المكان...</p>
          )}

          {searchResults.length > 0 && (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
              {searchResults.map((item, idx) => (
                <button
                  key={`${item.lat}-${item.lng}-${idx}`}
                  type="button"
                  onClick={() => void selectCandidate(item)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs text-slate-700 transition-colors hover:bg-accent-soft hover:text-accent dark:text-slate-200"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.label}</span>
                    {item.formattedAddress && item.formattedAddress !== item.label && (
                      <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">
                        {item.formattedAddress}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_CITIES.map((city) => (
              <button
                key={city}
                type="button"
                disabled={loading}
                onClick={() => void selectCityByName(city)}
                className="min-h-[30px] rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-accent hover:text-accent disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {city}
              </button>
            ))}
          </div>
        </div>
      )}

      {infoMsg && (
        <p className="mt-2.5 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {infoMsg}
        </p>
      )}

      {/* Body: Loading / Error / Data */}
      {loading && !weather ? (
        <div className="my-4 space-y-3" aria-busy="true">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-9 w-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />
              <div className="h-3.5 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
            </div>
            <div className="h-12 w-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
          </div>
          <div className="h-3.5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
        </div>
      ) : errorMsg && !weather ? (
        <div className="my-3 space-y-2.5">
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{errorMsg}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="min-h-[36px] whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={() => setCityPickerOpen(true)}
              className="min-h-[36px] whitespace-nowrap rounded-xl bg-accent px-3 text-xs font-semibold text-white"
            >
              اختيار مدينة
            </button>
          </div>
        </div>
      ) : weather ? (
        <div className="my-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {weather.temperatureC !== null ? `${weather.temperatureC}°` : '--'}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">م°</span>
              </div>
              <p className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                {conditionDisplay}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {weather.feelsLikeC !== null ? `الإحساس ${weather.feelsLikeC}°` : ''}
                {weather.feelsLikeC !== null &&
                weather.maxTempC !== null &&
                weather.minTempC !== null
                  ? ' · '
                  : ''}
                {weather.maxTempC !== null && weather.minTempC !== null
                  ? `العظمى ${weather.maxTempC}° / الصغرى ${weather.minTempC}°`
                  : ''}
              </p>
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-900/70">
              {weather.iconBaseUri && !iconFailed ? (
                <img
                  src={`${weather.iconBaseUri}.svg`}
                  alt={conditionDisplay}
                  referrerPolicy="no-referrer"
                  onError={() => setIconFailed(true)}
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <FallbackIcon className="h-8 w-8 text-accent" />
              )}
            </div>
          </div>

          {errorMsg && (
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              {errorMsg}
            </p>
          )}
        </div>
      ) : null}

      {/* Bottom Operational Metrics Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {weather ? (
          <div className="flex flex-wrap items-center gap-2 tabular-nums">
            {weather.humidity !== null && (
              <span className="inline-flex items-center gap-1">
                <Droplets className="h-3.5 w-3.5 text-sky-500" />
                <span>رطوبة {weather.humidity}%</span>
              </span>
            )}
            {weather.humidity !== null && weather.windKmh !== null && (
              <span aria-hidden="true">·</span>
            )}
            {weather.windKmh !== null && (
              <span className="inline-flex items-center gap-1">
                <Wind className="h-3.5 w-3.5 text-slate-400" />
                <span>رياح {weather.windKmh} كم/س</span>
              </span>
            )}
          </div>
        ) : (
          <span>الطقس المباشر</span>
        )}

        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {weather
            ? `${locationSourceLabel}${observedTimeLabel ? ` · ${observedTimeLabel}` : ''} · ${
                weather.provider === 'open-meteo' ? 'Open-Meteo' : 'Google Weather'
              }`
            : 'Google Weather'}
        </span>
      </div>
    </section>
  );
};
