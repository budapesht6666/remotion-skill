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
  {
    slug: "beekeeper",
    title: "Пчеловод (2024)",
    path: "C:/torrent/Pchelovod.2024.AMZN.WEB-DLRip.AVC.mkv",
    language: "ru",
  },
  {
    slug: "godzilla-kong",
    title: "Годзилла и Конг: Новая империя (2024)",
    path: "C:/torrent/Godzilla x Kong. The New Empire (2024).mkv",
    language: "ru",
  },
  {
    slug: "silicon-valley-s01e01",
    title: "Кремниевая долина — s01e01 «Minimum Viable Product» (2014)",
    path: "C:/torrent/Silicon.Valley.2014-2019.web-dlrip_[teko]/Season_01/s01e01_Minimum.Viable.Product.avi",
    language: "ru",
  },
  {
    slug: "silicon-valley-s01e02",
    title: "Кремниевая долина — s01e02 «The Cap Table» (2014)",
    path: "C:/torrent/Silicon.Valley.2014-2019.web-dlrip_[teko]/Season_01/s01e02_The.Cap.Table.avi",
    language: "ru",
  },
  {
    slug: "silicon-valley-s01e03",
    title: "Кремниевая долина — s01e03 «Articles of Incorporation» (2014)",
    path: "C:/torrent/Silicon.Valley.2014-2019.web-dlrip_[teko]/Season_01/s01e03_Articles.of.Incorporation.avi",
    language: "ru",
  },
  {
    slug: "silicon-valley-s01e04",
    title: "Кремниевая долина — s01e04 «Fiduciary Duties» (2014)",
    path: "C:/torrent/Silicon.Valley.2014-2019.web-dlrip_[teko]/Season_01/s01e04_Fiduciary.Duties.avi",
    language: "ru",
  },
  {
    slug: "silicon-valley-s01e05",
    title: "Кремниевая долина — s01e05 «Signaling Risk» (2014)",
    path: "C:/torrent/Silicon.Valley.2014-2019.web-dlrip_[teko]/Season_01/s01e05_Signaling.Risk.avi",
    language: "ru",
  },
  {
    slug: "silicon-valley-s01e06",
    title: "Кремниевая долина — s01e06 «Third Party Insourcing» (2014)",
    path: "C:/torrent/Silicon.Valley.2014-2019.web-dlrip_[teko]/Season_01/s01e06_Third.Party.Insourcing.avi",
    language: "ru",
  },
  {
    slug: "silicon-valley-s01e07",
    title: "Кремниевая долина — s01e07 «Proof of Concept» (2014)",
    path: "C:/torrent/Silicon.Valley.2014-2019.web-dlrip_[teko]/Season_01/s01e07_Proof.of.Concept.avi",
    language: "ru",
  },
  {
    slug: "silicon-valley-s01e08",
    title: "Кремниевая долина — s01e08 «Optimal Tip-to-Tip Efficiency» (2014)",
    path: "C:/torrent/Silicon.Valley.2014-2019.web-dlrip_[teko]/Season_01/s01e08_Optimal.Tip-To-Tip.Efficiency.avi",
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
