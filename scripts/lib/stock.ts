/**
 * Провайдеры бесплатного стока для наполнения роликов ассетами.
 * Запускается в Node (через tsx), НЕ в браузере/композиции. Ключи — из .env.
 *
 *   Unsplash — фото (портретная ориентация)
 *   Pexels   — фото и видео
 *   Pixabay  — фото и видео
 *
 * Все три бесплатны и разрешают коммерческое использование. Пустой ключ =
 * провайдер пропускается в цепочке фолбэка.
 */

export type StockKind = "photo" | "video";

export type StockItem = {
  source: "unsplash" | "pexels" | "pixabay";
  kind: StockKind;
  id: string;
  /** Прямая ссылка на файл для скачивания. */
  downloadUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  /** Готовая строка атрибуции (кладём в manifest.json). */
  credit: string;
  creditUrl: string;
  ext: string;
};

const env = (k: string): string => (process.env[k] ?? "").trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

// ---------------- Unsplash (только фото) ----------------
async function unsplashPhotos(query: string, count: number): Promise<StockItem[]> {
  const key = env("UNSPLASH_ACCESS_KEY");
  if (!key) return [];
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
    query,
  )}&per_page=${count}&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
  if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`);
  const data = (await res.json()) as Json;
  return (data.results ?? []).map(
    (p: Json): StockItem => ({
      source: "unsplash",
      kind: "photo",
      id: String(p.id),
      downloadUrl: `${p.urls.raw}&w=1080&fm=jpg&q=85`,
      previewUrl: p.urls.small,
      width: p.width,
      height: p.height,
      credit: `Фото: ${p.user.name} / Unsplash`,
      creditUrl: p.links.html,
      ext: "jpg",
    }),
  );
}

// ---------------- Pexels ----------------
async function pexelsPhotos(query: string, count: number): Promise<StockItem[]> {
  const key = env("PEXELS_API_KEY");
  if (!key) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query,
  )}&per_page=${count}&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const data = (await res.json()) as Json;
  return (data.photos ?? []).map(
    (p: Json): StockItem => ({
      source: "pexels",
      kind: "photo",
      id: String(p.id),
      downloadUrl: p.src.large2x ?? p.src.original,
      previewUrl: p.src.medium,
      width: p.width,
      height: p.height,
      credit: `Фото: ${p.photographer} / Pexels`,
      creditUrl: p.url,
      ext: "jpg",
    }),
  );
}

async function pexelsVideos(query: string, count: number): Promise<StockItem[]> {
  const key = env("PEXELS_API_KEY");
  if (!key) return [];
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
    query,
  )}&per_page=${count}&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels Video HTTP ${res.status}`);
  const data = (await res.json()) as Json;
  return (data.videos ?? []).map((v: Json): StockItem => {
    // Берём mp4 максимального качества с шириной <= 1080, иначе самый маленький.
    const files = (v.video_files ?? [])
      .filter((f: Json) => f.file_type === "video/mp4")
      .sort((a: Json, b: Json) => (a.width ?? 0) - (b.width ?? 0));
    const pick =
      files.filter((f: Json) => (f.width ?? 0) <= 1080).pop() ?? files[0];
    return {
      source: "pexels",
      kind: "video",
      id: String(v.id),
      downloadUrl: pick?.link,
      previewUrl: v.image,
      width: v.width,
      height: v.height,
      credit: `Видео: ${v.user?.name} / Pexels`,
      creditUrl: v.url,
      ext: "mp4",
    };
  });
}

// ---------------- Pixabay ----------------
async function pixabayPhotos(query: string, count: number): Promise<StockItem[]> {
  const key = env("PIXABAY_API_KEY");
  if (!key) return [];
  const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(
    query,
  )}&per_page=${Math.max(count, 3)}&image_type=photo&orientation=vertical`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  const data = (await res.json()) as Json;
  return (data.hits ?? []).map(
    (h: Json): StockItem => ({
      source: "pixabay",
      kind: "photo",
      id: String(h.id),
      downloadUrl: h.largeImageURL,
      previewUrl: h.previewURL,
      width: h.imageWidth,
      height: h.imageHeight,
      credit: `Фото: ${h.user} / Pixabay`,
      creditUrl: h.pageURL,
      ext: "jpg",
    }),
  );
}

async function pixabayVideos(query: string, count: number): Promise<StockItem[]> {
  const key = env("PIXABAY_API_KEY");
  if (!key) return [];
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(
    query,
  )}&per_page=${Math.max(count, 3)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay Video HTTP ${res.status}`);
  const data = (await res.json()) as Json;
  return (data.hits ?? []).map((h: Json): StockItem => {
    const v = h.videos?.large ?? h.videos?.medium ?? h.videos?.small;
    return {
      source: "pixabay",
      kind: "video",
      id: String(h.id),
      downloadUrl: v?.url,
      previewUrl: h.videos?.small?.thumbnail ?? "",
      width: v?.width ?? 0,
      height: v?.height ?? 0,
      credit: `Видео: ${h.user} / Pixabay`,
      creditUrl: h.pageURL,
      ext: "mp4",
    };
  });
}

/**
 * Единый поиск с фолбэком по провайдерам. Фото: Unsplash → Pexels → Pixabay.
 * Видео: Pexels → Pixabay. Возвращает первый непустой результат.
 */
export async function searchStock(
  query: string,
  kind: StockKind,
  count: number,
): Promise<StockItem[]> {
  const chain =
    kind === "photo"
      ? [unsplashPhotos, pexelsPhotos, pixabayPhotos]
      : [pexelsVideos, pixabayVideos];

  for (const provider of chain) {
    try {
      const items = await provider(query, count);
      if (items.length > 0) {
        console.log(`  → источник: ${provider.name} (${items.length})`);
        return items.filter((i) => i.downloadUrl).slice(0, count);
      }
    } catch (e) {
      console.warn(`  ! ${provider.name}: ${(e as Error).message}`);
    }
  }
  return [];
}
