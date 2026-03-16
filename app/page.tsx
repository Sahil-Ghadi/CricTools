'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ScorecardParser from '@/components/cricket/scorecard-parser'
import NrrCalculator from '@/components/cricket/nrr-calculator'

export default function CricketAnalytics() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-emerald-50 py-5 md:py-12 overflow-hidden relative">
      {/* Decorative background blobs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000" />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 relative z-10">
        {/* Header */}
        <div className="mb-6 md:mb-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-emerald-600 pb-1">
            Cricket Match Tools
          </h1>
          <p className="mt-2 text-sm md:text-lg text-slate-600 max-w-2xl mx-auto font-medium">
            Scorecard parser & NRR scenario calculator
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="scorecard" className="w-full">
          <div className="flex justify-center mb-5 md:mb-8">
            <TabsList className="grid w-full max-w-md grid-cols-2 h-auto p-1 bg-slate-200/50 backdrop-blur-lg rounded-xl shadow-inner border border-slate-200/50">
              <TabsTrigger 
                value="scorecard" 
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all duration-300 font-semibold py-2.5 text-slate-600 border-none"
              >
                PDF Parser
              </TabsTrigger>
              <TabsTrigger 
                value="nrr" 
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm transition-all duration-300 font-semibold py-2.5 text-slate-600 border-none"
              >
                Smart NRR
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="transition-all duration-500 ease-in-out">
            {/* Tab 1: Scorecard Parser */}
            <TabsContent value="scorecard" className="space-y-6 mt-0 animate-in fade-in zoom-in-95 duration-500">
              <ScorecardParser />
            </TabsContent>

            {/* Tab 2: NRR Calculator */}
            <TabsContent value="nrr" className="space-y-6 mt-0 animate-in fade-in zoom-in-95 duration-500">
              <NrrCalculator />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
