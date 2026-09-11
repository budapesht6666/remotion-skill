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
  {
    slug: "the-office-s03e04",
    title: "Офис — s03e04 «Grief Counseling» (2006)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E04.Grief.Counseling.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e05",
    title: "Офис — s03e05 «Initiation» (2006)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E05.Initiation.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e06",
    title: "Офис — s03e06 «Diwali» (2006)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E06.Diwali.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e07",
    title: "Офис — s03e07 «Branch Closing» (2006)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E07.Branch.Closing.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e08",
    title: "Офис — s03e08 «The Merger» (2006)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E08.The.Merger.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e09",
    title: "Офис — s03e09 «The Convict» (2006)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E09.The.Convict.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e10",
    title: "Офис — s03e10 «A Benihana Christmas» (2006)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E10.A.Benihana.Christmas.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e11",
    title: "Офис — s03e11 «Back from Vacation» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E11.Back.from.Vacation.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e12",
    title: "Офис — s03e12 «Traveling Salesmen» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E12.Traveling.Salesmen.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e13",
    title: "Офис — s03e13 «The Return» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E13.The.Return.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e14",
    title: "Офис — s03e14 «Ben Franklin» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E14.Ben.Franklin.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e15",
    title: "Офис — s03e15 «Phyllis Wedding» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E15.Phyllis.Wedding.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e16",
    title: "Офис — s03e16 «Business School» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E16.Business.School.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e17",
    title: "Офис — s03e17 «Cocktails» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E17.Cocktails.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e18",
    title: "Офис — s03e18 «The Negotiation» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E18.The.Negotiation.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e19",
    title: "Офис — s03e19 «Safety Training» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E19.Safety.Training.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e20",
    title: "Офис — s03e20 «Product Recall» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E20.Product.Recall.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e21",
    title: "Офис — s03e21 «Women's Appreciation» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E21.Womens.Appreciation.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e22",
    title: "Офис — s03e22 «Beach Games» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E22.Beach.Games.WEB-DLRip.avi",
    language: "ru",
  },
  {
    slug: "the-office-s03e23",
    title: "Офис — s03e23 «The Job» (2006–2007)",
    path: "C:/torrent/The.Office.US.S03.WEB-DLRip/The.Office.US.S03E23.The.Job.WEB-DLRip.avi",
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
