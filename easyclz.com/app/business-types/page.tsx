import Header from "../components/Header";
import Footer from "../components/Footer";
import PageHero from "../components/PageHero";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Business Types | Easyclz",
  description:
    "Easyclz serves tutors, coaching centers, and schools across Sri Lanka.",
};

const businessTypes = [
  { name: "Tuition Classes", image: "/images/business-types/tuition.png", homeImage: "/images/business-types/home-tuition.png" },
  { name: "Language Schools", image: "/images/business-types/language.png", homeImage: "/images/business-types/home-language.png" },
  { name: "Music Schools", image: "/images/business-types/music.png", homeImage: "/images/business-types/home-music.png" },
  { name: "Sports Academies", image: "/images/business-types/sport.png", homeImage: "/images/business-types/home-sports-1.png" },
  { name: "Preschools", image: "/images/business-types/preschool.png", homeImage: "/images/business-types/home-preschool.png" },
  { name: "Art Classes", image: "/images/business-types/art.png", homeImage: "/images/business-types/home-art.png" },
  { name: "Dance Schools", image: "/images/business-types/dance.png", homeImage: "/images/business-types/home-dance.png" },
];

export default function BusinessTypesPage() {
  return (
    <div className="relative pt-[0.1px]">
      <Header />
      <div>
        <PageHero
          titleEn="Built for every kind of class"
          titleSi="සෑම ආකාරයකම පන්ති සඳහා"
          subEn="Easyclz is built for tutors, coaching centers, and schools across Sri Lanka."
          subSi="Easyclz ශ්‍රී ලංකාව පුරා උපදේශකයින්, පුහුණු මධ්‍යස්ථාන සහ පාසල් සඳහා නිර්මාණය කර ඇත."
        />

        {/* Business types grid */}
        <section className="st-width py-12">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {businessTypes.map((bt) => (
              <div
                key={bt.name}
                className="group relative aspect-square overflow-hidden shadow-card"
                style={{ borderRadius: "20.513px" }}
                aria-label={bt.name}
              >
                <div
                  className="absolute inset-0 transition duration-300"
                  style={{
                    background: `linear-gradient(180deg, rgba(0, 0, 0, 0.00) 0%, #000 129.2%), url('${bt.homeImage}') lightgray 50% / cover no-repeat`,
                  }}
                ></div>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 pl-4 pr-4 md:p-9 pb-3 md:pb-8">
                  <span className="display-subtitle text-left font-bold text-white">
                    {bt.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
      <Footer />
    </div>
  );
}
