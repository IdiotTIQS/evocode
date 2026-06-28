import { SiteNav } from "@/components/SiteNav";
import { Hero } from "@/components/Hero";
import { Pipeline } from "@/components/Pipeline";
import { Agents } from "@/components/Agents";
import { Workflow } from "@/components/Workflow";
import { Principles } from "@/components/Principles";
import { CTA } from "@/components/CTA";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Pipeline />
        <Agents />
        <Workflow />
        <Principles />
        <CTA />
      </main>
      <SiteFooter />
    </>
  );
}
