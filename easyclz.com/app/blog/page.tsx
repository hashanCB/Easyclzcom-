import Header from "../components/Header";
import Footer from "../components/Footer";
import PageHero from "../components/PageHero";
import type { Metadata } from "next";
import BlogListClient from "./BlogListClient";

export const metadata: Metadata = {
  title: "Blog | Easyclz",
  description:
    "Read the latest articles and updates from Easyclz about class management in Sri Lanka.",
};

export default function BlogPage() {
  return (
    <div className="relative pt-[0.1px]">
      <Header />
      <div>
        <PageHero
          width="blog-width"
          titleEn="Easyclz Blog"
          titleSi="Easyclz බ්ලොග්"
          subEn="News, updates, and tips for Sri Lankan tutors and schools."
          subSi="ශ්‍රී ලාංකික ගුරුවරුන් සහ පාසල් සඳහා පුවත්, යාවත්කාලීන සහ ඉඟි."
        />

        <BlogListClient />
      </div>

      <Footer />
    </div>
  );
}
