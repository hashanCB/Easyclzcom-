import Header from "../components/Header";
import Footer from "../components/Footer";
import PageHero from "../components/PageHero";
import type { Metadata } from "next";
import GuidesClient from "./GuidesClient";

export const metadata: Metadata = {
  title: "How To Guides | Easyclz",
  description:
    "Step-by-step guides to set up and run your tuition class with Easyclz, from adding students to collecting payments.",
};

export default function GuidesPage() {
  return (
    <div className="relative pt-[0.1px]">
      <Header />
      <PageHero
        width="blog-width"
        titleEn="How To Guides"
        titleSi="මාර්ගෝපදේශ"
        subEn="Step-by-step guides to set up and run your class with Easyclz, from adding students to publishing exam marks."
        subSi="ශිෂ්‍යයන් එක් කිරීමේ සිට විභාග ලකුණු ප්‍රකාශනය දක්වා, Easyclz සමඟ ඔබේ පන්තිය සැකසීමට පියවරෙන් පියවර මාර්ගෝපදේශ."
      />
      <GuidesClient />
      <Footer />
    </div>
  );
}
