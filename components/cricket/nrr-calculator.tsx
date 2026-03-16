'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Trophy } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────

function oversToBalls(overs: string): number {
  const parts = overs.split('.')
  const w = parseInt(parts[0] || '0', 10) || 0
  const b = parseInt(parts[1] || '0', 10) || 0
  return w * 6 + Math.min(b, 5)
}

function ballsToOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`
}

function oversDecimal(overs: string): number {
  return oversToBalls(overs) / 6
}

function calcNRR(runsFor: number, oversFor: string, runsAgainst: number, oversAgainst: string): number {
  const d1 = oversDecimal(oversFor)
  const d2 = oversDecimal(oversAgainst)
  return d1 > 0 && d2 > 0 ? runsFor / d1 - runsAgainst / d2 : 0
}

interface TeamStats {
  name: string
  runsScored: string
  oversFaced: string
  runsConceded: string
  oversBowled: string
}

interface EdgeCase {
  runs: number
  maxOvers: string
  chaserNRR: number
  opponentNRR: number
  nrrDiff: number
}

interface ResultData {
  chaserName: string
  opponentName: string
  target: number
  opponentFinalNRR: number
  safestOvers: string
  edgeCases: EdgeCase[]
}

function compute(
  teamA: TeamStats, teamB: TeamStats,
  battingFirst: 'A' | 'B',
  firstInningsScore: string, matchOvers: string
): ResultData | null {
  const maxBalls = oversToBalls(matchOvers)
  const innings1Balls = maxBalls   // Always use full match overs for first innings
  const score = parseInt(firstInningsScore, 10)

  if (!score || !innings1Balls || !maxBalls) return null

  const chaserStats = battingFirst === 'A' ? teamB : teamA
  const opponentStats = battingFirst === 'A' ? teamA : teamB
  const chaserName = (battingFirst === 'A' ? teamB.name : teamA.name).trim() || (battingFirst === 'A' ? 'Team B' : 'Team A')
  const opponentName = (battingFirst === 'A' ? teamA.name : teamB.name).trim() || (battingFirst === 'A' ? 'Team A' : 'Team B')

  const hasChaser = chaserStats.runsScored && chaserStats.oversFaced && chaserStats.runsConceded && chaserStats.oversBowled
  const hasOpponent = opponentStats.runsScored && opponentStats.oversFaced && opponentStats.runsConceded && opponentStats.oversBowled
  if (!hasChaser || !hasOpponent) return null

  const target = score + 1

  // Opponent's base stats (after batting 1st innings)
  const oppRunsScoredBase = Number(opponentStats.runsScored) + score
  const oppOversFacedDecBase = oversDecimal(opponentStats.oversFaced) + innings1Balls / 6
  const oppRunsConcededBase = Number(opponentStats.runsConceded)
  const oppOversBowledDecBase = oversDecimal(opponentStats.oversBowled)

  // Chaser's base stats (after bowling 1st innings)
  const chExistingRuns = Number(chaserStats.runsScored)
  const chExistingOversDec = oversDecimal(chaserStats.oversFaced)
  const chRunsConcededBase = Number(chaserStats.runsConceded) + score
  const chOversBowledDecBase = oversDecimal(chaserStats.oversBowled) + innings1Balls / 6

  const edgeCases: EdgeCase[] = []
  let safestBalls = 0
  let finalOpponentNRR = 0

  for (let extra = 0; extra <= 36; extra++) {
    const scenarioRuns = target + extra
    // Scan from max balls DOWN to 1 — find the LATEST ball where NRR is still positive
    for (let balls = maxBalls; balls >= 1; balls--) {
      // Chaser NRR calculation
      const chaserRunsFinal = chExistingRuns + scenarioRuns
      const chaserOversFinal = chExistingOversDec + balls / 6
      const chaserNRR = (chaserRunsFinal / chaserOversFinal) - (chRunsConcededBase / chOversBowledDecBase)

      // Opponent NRR calculation (must recalculate as they are bowling now)
      const oppRunsConcededFinal = oppRunsConcededBase + scenarioRuns
      const oppOversBowledFinal = oppOversBowledDecBase + balls / 6
      const opponentNRR = (oppRunsScoredBase / oppOversFacedDecBase) - (oppRunsConcededFinal / oppOversBowledFinal)

      if (chaserNRR > opponentNRR) {
        const overs = ballsToOvers(balls)
        if (extra === 0) {
          safestBalls = balls
          finalOpponentNRR = opponentNRR
        }
        edgeCases.push({
          runs: scenarioRuns,
          maxOvers: overs,
          chaserNRR: parseFloat(chaserNRR.toFixed(3)),
          opponentNRR: parseFloat(opponentNRR.toFixed(3)),
          nrrDiff: parseFloat((chaserNRR - opponentNRR).toFixed(3)),
        })
        break
      }
    }
  }

  return {
    chaserName, opponentName, target,
    opponentFinalNRR: parseFloat(finalOpponentNRR.toFixed(3)),
    safestOvers: safestBalls > 0 ? ballsToOvers(safestBalls) : 'N/A',
    edgeCases: edgeCases.slice(0, 6),
  }
}

const emptyTeam = (): TeamStats => ({ name: '', runsScored: '', oversFaced: '', runsConceded: '', oversBowled: '' })

export default function NrrCalculator() {
  const [teamA, setTeamA] = useState<TeamStats>(emptyTeam())
  const [teamB, setTeamB] = useState<TeamStats>(emptyTeam())
  const [matchOvers, setMatchOvers] = useState('20')
  const [battingFirst, setBattingFirst] = useState<'A' | 'B'>('A')
  const [firstInningsScore, setFirstInningsScore] = useState('')
  const [result, setResult] = useState<ResultData | null>(null)
  const [error, setError] = useState('')

  // Debounce calculation 400ms after last change
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setError('')
      const res = compute(teamA, teamB, battingFirst, firstInningsScore, matchOvers)
      setResult(res)
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [teamA, teamB, battingFirst, firstInningsScore, matchOvers])

  // Live NRR display (lightweight, no debounce needed)
  const nrrA = teamA.runsScored && teamA.oversFaced && teamA.runsConceded && teamA.oversBowled
    ? calcNRR(Number(teamA.runsScored), teamA.oversFaced, Number(teamA.runsConceded), teamA.oversBowled)
    : null
  const nrrB = teamB.runsScored && teamB.oversFaced && teamB.runsConceded && teamB.oversBowled
    ? calcNRR(Number(teamB.runsScored), teamB.oversFaced, Number(teamB.runsConceded), teamB.oversBowled)
    : null

  const teamAName = teamA.name.trim() || 'Team A'
  const teamBName = teamB.name.trim() || 'Team B'

  const setA = (f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setTeamA(prev => ({ ...prev, [f]: e.target.value }))
  const setB = (f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setTeamB(prev => ({ ...prev, [f]: e.target.value }))

  return (
    <div className="space-y-5 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Teams */}
      <Card className="rounded-xl md:rounded-2xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg md:shadow-xl overflow-hidden relative transition-all duration-300">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-orange-400" />
        <CardHeader className="px-4 md:px-6 pb-2 md:pb-4 pt-5 md:pt-6">
          <CardTitle className="text-lg md:text-2xl font-bold text-slate-800">Tournament Stats</CardTitle>
          <CardDescription className="text-sm md:text-base font-medium">Enter both teams’ cumulative stats so far</CardDescription>
        </CardHeader>
        <CardContent className="px-4 md:px-6">
          <div className="grid gap-4 md:gap-6 md:grid-cols-2">
            {/* Team A */}
            <div className="group space-y-3 md:space-y-4 rounded-xl md:rounded-2xl border border-blue-200/50 bg-gradient-to-b from-blue-50/80 to-blue-100/50 p-4 md:p-5 shadow-sm transition-all duration-300 hover:shadow-md">
              <div>
                <Label className="text-[11px] md:text-xs font-bold tracking-wider uppercase text-blue-600">Team Name</Label>
                <Input placeholder="Team A" value={teamA.name} onChange={setA('name')} className="mt-1 bg-white/80 backdrop-blur-sm border-blue-200 focus-visible:ring-blue-400 font-bold text-base md:text-lg rounded-lg md:rounded-xl h-10 md:h-11 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-2.5 md:gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Runs Scored</Label>
                  <Input placeholder="350" value={teamA.runsScored} onChange={setA('runsScored')} className="bg-white/80 border-blue-200 focus-visible:ring-blue-400 rounded-lg text-sm md:text-base h-9 md:h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Overs Faced</Label>
                  <Input placeholder="40.0" value={teamA.oversFaced} onChange={setA('oversFaced')} className="bg-white/80 border-blue-200 focus-visible:ring-blue-400 rounded-lg text-sm md:text-base h-9 md:h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Runs Conceded</Label>
                  <Input placeholder="320" value={teamA.runsConceded} onChange={setA('runsConceded')} className="bg-white/80 border-blue-200 focus-visible:ring-blue-400 rounded-lg text-sm md:text-base h-9 md:h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Overs Bowled</Label>
                  <Input placeholder="40.0" value={teamA.oversBowled} onChange={setA('oversBowled')} className="bg-white/80 border-blue-200 focus-visible:ring-blue-400 rounded-lg text-sm md:text-base h-9 md:h-10" />
                </div>
              </div>
              {nrrA !== null && (
                <div className="flex items-center justify-between rounded-lg md:rounded-xl border border-blue-200/60 bg-white/90 backdrop-blur-md px-3 md:px-5 py-2.5 md:py-3 shadow-sm">
                  <span className="text-xs md:text-sm font-semibold tracking-wide text-slate-500 uppercase">NRR</span>
                  <span className={`text-xl md:text-2xl font-black tracking-tight ${nrrA >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {nrrA >= 0 ? '+' : ''}{nrrA.toFixed(3)}
                  </span>
                </div>
              )}
            </div>

            {/* Team B */}
            <div className="group space-y-3 md:space-y-4 rounded-xl md:rounded-2xl border border-orange-200/50 bg-gradient-to-b from-orange-50/80 to-orange-100/50 p-4 md:p-5 shadow-sm transition-all duration-300 hover:shadow-md">
              <div>
                <Label className="text-[11px] md:text-xs font-bold tracking-wider uppercase text-orange-600">Team Name</Label>
                <Input placeholder="Team B" value={teamB.name} onChange={setB('name')} className="mt-1 bg-white/80 backdrop-blur-sm border-orange-200 focus-visible:ring-orange-400 font-bold text-base md:text-lg rounded-lg md:rounded-xl h-10 md:h-11 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-2.5 md:gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Runs Scored</Label>
                  <Input placeholder="320" value={teamB.runsScored} onChange={setB('runsScored')} className="bg-white/80 border-orange-200 focus-visible:ring-orange-400 rounded-lg text-sm md:text-base h-9 md:h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Overs Faced</Label>
                  <Input placeholder="40.0" value={teamB.oversFaced} onChange={setB('oversFaced')} className="bg-white/80 border-orange-200 focus-visible:ring-orange-400 rounded-lg text-sm md:text-base h-9 md:h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Runs Conceded</Label>
                  <Input placeholder="350" value={teamB.runsConceded} onChange={setB('runsConceded')} className="bg-white/80 border-orange-200 focus-visible:ring-orange-400 rounded-lg text-sm md:text-base h-9 md:h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Overs Bowled</Label>
                  <Input placeholder="40.0" value={teamB.oversBowled} onChange={setB('oversBowled')} className="bg-white/80 border-orange-200 focus-visible:ring-orange-400 rounded-lg text-sm md:text-base h-9 md:h-10" />
                </div>
              </div>
              {nrrB !== null && (
                <div className="flex items-center justify-between rounded-lg md:rounded-xl border border-orange-200/60 bg-white/90 backdrop-blur-md px-3 md:px-5 py-2.5 md:py-3 shadow-sm">
                  <span className="text-xs md:text-sm font-semibold tracking-wide text-slate-500 uppercase">NRR</span>
                  <span className={`text-xl md:text-2xl font-black tracking-tight ${nrrB >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {nrrB >= 0 ? '+' : ''}{nrrB.toFixed(3)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Match Setup */}
      <Card className="rounded-xl md:rounded-2xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg md:shadow-xl overflow-hidden relative transition-all duration-300">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />
        <CardHeader className="px-4 md:px-6 pb-2 md:pb-4 pt-5 md:pt-6">
          <CardTitle className="text-lg md:text-2xl font-bold text-slate-800">This Match</CardTitle>
          <CardDescription className="text-sm md:text-base font-medium">First innings — live predictions update automatically</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 md:space-y-5 px-4 md:px-6">
          <div className="grid gap-3 md:gap-5 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Max Overs</Label>
              <Input placeholder="20" value={matchOvers} onChange={(e) => setMatchOvers(e.target.value)} className="bg-white/80 border-slate-200 focus-visible:ring-emerald-400 rounded-lg md:rounded-xl h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] md:text-xs font-semibold text-slate-600">Batted First</Label>
              <Select value={battingFirst} onValueChange={(v) => setBattingFirst(v as 'A' | 'B')}>
                <SelectTrigger className="w-full bg-white/80 border-slate-200 focus-visible:ring-emerald-400 rounded-lg md:rounded-xl h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200/60 bg-white/95 backdrop-blur-xl">
                  <SelectItem value="A" className="font-medium rounded-lg">{teamAName}</SelectItem>
                  <SelectItem value="B" className="font-medium rounded-lg">{teamBName}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] md:text-xs font-semibold text-slate-600">First Innings Score</Label>
              <Input placeholder="e.g. 156" value={firstInningsScore} onChange={(e) => setFirstInningsScore(e.target.value)} className="bg-white/80 border-slate-200 focus-visible:ring-emerald-400 text-base md:text-lg font-bold rounded-lg md:rounded-xl h-10" />
            </div>
          </div>
          {error && (
            <Alert variant="destructive" className="rounded-xl border-rose-200 bg-rose-50/80 backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="font-bold">Error</AlertTitle>
              <AlertDescription className="font-medium">{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-6 animate-in slide-in-from-bottom-6 fade-in duration-700">
          <Alert className="rounded-xl md:rounded-2xl border-emerald-300/50 bg-gradient-to-r from-emerald-50/90 to-teal-50/90 backdrop-blur-xl shadow-lg border-l-4 border-l-emerald-500 p-3 md:p-5">
            <Trophy className="h-5 w-5 md:h-6 md:w-6 text-emerald-600 absolute top-3 md:top-5" />
            <div className="pl-8 md:pl-10">
              <AlertTitle className="text-emerald-900 text-base md:text-lg font-bold tracking-tight">NRR Qualification Scenario</AlertTitle>
              <AlertDescription className="mt-1 md:mt-1.5 text-slate-700 text-sm md:text-base font-medium leading-relaxed">
                <strong className="text-emerald-800">{result.chaserName}</strong> must chase <strong className="text-slate-900 px-1 py-0.5 bg-white rounded shadow-sm border border-slate-200 text-sm">{result.target}</strong> runs within <strong className="text-slate-900 px-1 py-0.5 bg-white rounded shadow-sm border border-slate-200 text-sm">{result.safestOvers} ov</strong> to surpass <strong className="text-emerald-800">{result.opponentName}</strong> (NRR: {result.opponentFinalNRR}).
              </AlertDescription>
            </div>
          </Alert>

          <Card className="rounded-xl md:rounded-2xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg md:shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-400 to-slate-300" />
            <CardHeader className="px-4 md:px-6 pb-2 md:pb-4 pt-5 md:pt-6">
              <CardTitle className="text-lg md:text-2xl font-bold text-slate-800">Chase Targets</CardTitle>
              <CardDescription className="text-sm md:text-base font-medium">Max overs for each scoring total</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto pb-1 -webkit-overflow-scrolling-touch">
                <table className="w-full text-xs md:text-sm min-w-[520px]">
                  <thead>
                    <tr className="bg-slate-900/90 backdrop-blur-md text-white border-b-2 border-slate-800">
                      <th className="px-5 py-4 text-left font-bold tracking-wider uppercase text-xs">Runs to Score</th>
                      <th className="px-5 py-4 text-left font-bold tracking-wider uppercase text-xs">Finish By</th>
                      <th className="px-5 py-4 text-right font-bold tracking-wider uppercase text-xs text-blue-300">{result.chaserName} NRR</th>
                      <th className="px-5 py-4 text-right font-bold tracking-wider uppercase text-xs text-orange-300">{result.opponentName} NRR</th>
                      <th className="px-5 py-4 text-right font-bold tracking-wider uppercase text-xs text-emerald-300">NRR Gain</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 border-t border-slate-200">
                    {result.edgeCases.map((sc, idx) => (
                      <tr
                        key={idx}
                        className={`transition-colors hover:bg-white/80 ${idx === 0 ? 'bg-gradient-to-r from-emerald-50/80 to-teal-50/80 font-medium' : idx % 2 === 0 ? 'bg-white/40' : 'bg-slate-50/40'}`}
                      >
                        <td className="px-5 py-3.5 font-bold text-slate-900 text-base">{sc.runs}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold tracking-wide shadow-sm transform transition-transform hover:scale-105 ${idx === 0 ? 'bg-emerald-500 text-white shadow-emerald-200' : 'bg-white border border-slate-200 text-slate-700'}`}>
                            {sc.maxOvers} Ov
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-blue-700 font-semibold">{sc.chaserNRR >= 0 ? '+' : ''}{sc.chaserNRR.toFixed(3)}</td>
                        <td className="px-5 py-3.5 text-right font-mono text-orange-700 font-semibold">{sc.opponentNRR >= 0 ? '+' : ''}{sc.opponentNRR.toFixed(3)}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="font-mono font-bold text-emerald-600 bg-emerald-100/50 px-2 py-1 rounded-md">+{sc.nrrDiff.toFixed(3)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
