/**
 * Olivia: Decentralised Permissionless Predicition Market 
 * Copyright (c) 2025 Ayush Srivastava
 *
 * Licensed under the Apache 2.0
 */

import { MainLayout } from '@/src/layout/Layout';

export default function News() {
  return (
    <MainLayout>
      <div className="relative w-full min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-full flex items-center justify-center pt-32 pb-16" style={{ minHeight: 'calc(100vh - 200px)' }}>
          <div className="text-center px-4 max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-light mb-6 text-white" style={{ textShadow: '0 0 20px rgba(0,0,0,1), 0 0 40px rgba(0,0,0,1), 0 0 60px rgba(0,0,0,0.9), 2px 2px 8px rgba(0,0,0,1)', WebkitTextStroke: '1px rgba(0,0,0,0.8)' }}>
              News
            </h1>
            <p className="text-white text-lg mb-6 max-w-2xl mx-auto leading-relaxed" style={{ textShadow: '0 0 15px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,1), 2px 2px 6px rgba(0,0,0,1)', WebkitTextStroke: '0.5px rgba(0,0,0,0.8)' }}>
              Stay informed with the latest developments in Olivia&apos;s ecosystem. From new market launches to protocol updates and community highlights, get timely updates on everything happening in the prediction market space.
            </p>
            <p className="text-white text-lg mb-6 max-w-2xl mx-auto leading-relaxed" style={{ textShadow: '0 0 15px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,1), 2px 2px 6px rgba(0,0,0,1)', WebkitTextStroke: '0.5px rgba(0,0,0,0.8)' }}>
              Our news section covers market trends, successful predictions, governance proposals, and integration announcements. Learn about upcoming features, read analysis from experienced traders, and discover emerging opportunities across different prediction categories.
            </p>
            <p className="text-white text-lg mb-8 max-w-2xl mx-auto leading-relaxed" style={{ textShadow: '0 0 15px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,1), 2px 2px 6px rgba(0,0,0,1)', WebkitTextStroke: '0.5px rgba(0,0,0,0.8)' }}>
              Knowledge is power in prediction markets—stay ahead of the curve with curated updates from Olivia.
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
