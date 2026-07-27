/**
 * Реестр исходников для нарезки.
 *
 * Сами файлы в репозиторий не попадают — здесь только пути к локальным копиям
 * на диске пользователя. Индексы (реплики, планы) складываются в
 * data/index/<slug>/ и переиспользуются между роликами.
 */
export type Film = {
  slug: string;
  title: string;
  /** Абсолютный путь к локальному файлу. */
  path: string;
  /** Язык звуковой дорожки (ISO-639-1) — подсказка для ASR. */
  language: string;
};

export const FILMS: Film[] = [
  {
    slug: "bloodsport",
    title: "Кровавый спорт (1988)",
    path: "C:/torrent/Кровавый спорт.1988.BDRip.Kinozal-Райдэн.avi",
    language: "ru",
  },
];

export function findFilm(slugOrPath: string): Film {
  const known = FILMS.find((f) => f.slug === slugOrPath);
  if (known) return known;
  if (slugOrPath.includes("/") || slugOrPath.includes("\\")) {
    const slug =
      slugOrPath
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "film";
    return { slug, title: slugOrPath, path: slugOrPath, language: "ru" };
  }
  throw new Error(
    `Неизвестный фильм «${slugOrPath}». Известные: ${FILMS.map((f) => f.slug).join(", ")}. ` +
      `Либо передайте полный путь к файлу.`,
  );
}
