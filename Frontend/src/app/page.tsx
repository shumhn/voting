/**
 * Olivia: Decentralised Permissionless Predicition Market 
 * Copyright (c) 2025 Ayush Srivastava
 *
 * Licensed under the Apache 2.0
 */

import FeatureSections from '../home/FeatureSections';
import { MainLayout } from '../layout/Layout';
import HeroSection from '../home/HeroSection';
import Dither from '../components/Dither';
import HomeBanner from '../home/HomeBanner';

export default function Home() {
  return (
    <MainLayout>
      {/* Fixed dark background to prevent white flash on refresh */}
      <div className="fixed inset-0 bg-[#0a0a0a]" style={{ zIndex: 0 }} />
      
      {/* Dither background - only on landing page */}
      <div className="fixed inset-0" style={{ zIndex: 1 }}>
        <Dither
          waveColor={[0.3, 0.3, 0.3]}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={0.3}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.05}
        />
      </div>
      <div className="relative w-full min-h-screen" style={{ zIndex: 10 }}>
        <HeroSection />
        <FeatureSections />
        <HomeBanner />
      </div>
    </MainLayout>
  );
}
