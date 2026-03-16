'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Trophy } from 'lucide-react'

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
  const innings1Balls = maxBalls
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
  const oppRunsScoredBase = Number(opponentStats.runsScored) + score
  const oppOversFacedDecBase = oversDecimal(opponentStats.oversFaced) + innings1Balls / 6
  const oppRunsConcededBase = Number(opponentStats.runsConceded)
  const oppOversBowledDecBase = oversDecimal(opponentStats.oversBowled)
  const chExistingRuns = Number(chaserStats.runsScored)
  const chExistingOversDec = oversDecimal(chaserStats.oversFaced)
  const chRunsConcededBase = Number(chaserStats.runsConceded) + score
  const chOversBowledDecBase = oversDecimal(chaserStats.oversBowled) + innings1Balls / 6

  const edgeCases: EdgeCase[] = []
  let safestBalls = 0
  let finalOpponentNRR = 0

  for (let extra = 0; extra <= 36; extra++) {
    const scenarioRuns = target + extra
    for (let balls = maxBalls; balls >= 1; balls--) {
      const chaserRunsFinal = chExistingRuns + scenarioRuns
      const chaserOversFinal = chExistingOversDec + balls / 6
      const chaserNRR = (chaserRunsFinal / chaserOversFinal) - (chRunsConcededBase / chOversBowledDecBase)
      const oppRunsConcededFinal = oppRunsConcededBase + scenarioRuns
      const oppOversBowledFinal = oppOversBowledDecBase + balls / 6
      const opponentNRR = (oppRunsScoredBase / oppOversFacedDecBase) - (oppRunsConcededFinal / oppOversBowledFinal)
      if (chaserNRR > opponentNRR) {
        if (extra === 0) { safestBalls = balls; finalOpponentNRR = opponentNRR }
        edgeCases.push({
          runs: scenarioRuns, maxOvers: ballsToOvers(balls),
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setError('')
      setResult(compute(teamA, teamB, battingFirst, firstInningsScore, matchOvers))
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [teamA, teamB, battingFirst, firstInningsScore, matchOvers])

  const nrrA = teamA.runsScored && teamA.oversFaced && teamA.runsConceded && teamA.oversBowled
    ? calcNRR(Number(teamA.runsScored), teamA.oversFaced, Number(teamA.runsConceded), teamA.oversBowled) : null
  const nrrB = teamB.runsScored && teamB.oversFaced && teamB.runsConceded && teamB.oversBowled
    ? calcNRR(Number(teamB.runsScored), teamB.oversFaced, Number(teamB.runsConceded), teamB.oversBowled) : null

  const teamAName = teamA.name.trim() || 'Team A'
  const teamBName = teamB.name.trim() || 'Team B'

  const setA = (f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setTeamA(prev => ({ ...prev, [f]: e.target.value }))
  const setB = (f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setTeamB(prev => ({ ...prev, [f]: e.target.value }))

  // Shared team input block
  const TeamBlock = ({
    team, setField, color, placeholder, nrr
  }: {
    team: TeamStats
    setField: (f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) => void
    color: 'blue' | 'orange'
    placeholder: string
    nrr: number | null
  }) => {
    const c = color === 'blue'
      ? { border: 'border-blue-200/50', bg: 'from-blue-50/80 to-blue-100/50', label: 'text-blue-600', input: 'border-blue-200 focus-visible:ring-blue-400', nrrBorder: 'border-blue-200/60' }
      : { border: 'border-orange-200/50', bg: 'from-orange-50/80 to-orange-100/50', label: 'text-orange-600', input: 'border-orange-200 focus-visible:ring-orange-400', nrrBorder: 'border-orange-200/60' }

    return (
      <div className={`space-y-2.5 rounded-xl border ${c.border} bg-gradient-to-b ${c.bg} p-3 shadow-sm`}>
        <div>
          <Label className={`text-[10px] font-bold tracking-wider uppercase ${c.label}`}>Team Name</Label>
          <Input placeholder={placeholder} value={team.name} onChange={setField('name')}
            className={`mt-1 bg-white/80 ${c.input} font-bold text-sm rounded-lg h-9`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['runsScored', 'oversFaced', 'runsConceded', 'oversBowled'] as (keyof TeamStats)[]).map((field) => (
            <div key={field} className="space-y-0.5">
              <Label className="text-[10px] font-semibold text-slate-600">
                {field === 'runsScored' ? 'Runs Scored' : field === 'oversFaced' ? 'Overs Faced' : field === 'runsConceded' ? 'Runs Conceded' : 'Overs Bowled'}
              </Label>
              <Input placeholder={field.includes('Runs') || field === 'runsScored' || field === 'runsConceded' ? '0' : '0.0'}
                value={team[field]} onChange={setField(field)}
                className={`bg-white/80 ${c.input} rounded-lg text-sm h-8`} />
            </div>
          ))}
        </div>
        {nrr !== null && (
          <div className={`flex items-center justify-between rounded-lg border ${c.nrrBorder} bg-white/90 px-3 py-2`}>
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500">NRR</span>
            <span className={`text-lg font-black ${nrr >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {nrr >= 0 ? '+' : ''}{nrr.toFixed(3)}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Tournament Stats Card */}
      <Card className="rounded-xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg overflow-hidden relative !py-0 !gap-0">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-orange-400" />
        <div className="px-4 py-3 flex flex-col gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Tournament Stats</p>
            <p className="text-xs text-slate-500 font-medium">Enter both teams' cumulative stats so far</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <TeamBlock team={teamA} setField={setA} color="blue" placeholder="Team A" nrr={nrrA} />
            <TeamBlock team={teamB} setField={setB} color="orange" placeholder="Team B" nrr={nrrB} />
          </div>
        </div>
      </Card>

      {/* Match Setup Card */}
      <Card className="rounded-xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg overflow-hidden relative !py-0 !gap-0">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />
        <div className="px-4 py-3 flex flex-col gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">This Match</p>
            <p className="text-xs text-slate-500 font-medium">First innings — predictions update automatically</p>
          </div>
          <div className="grid gap-2 grid-cols-3">
            <div className="space-y-0.5">
              <Label className="text-[10px] font-semibold text-slate-600">Max Overs</Label>
              <Input placeholder="20" value={matchOvers} onChange={(e) => setMatchOvers(e.target.value)}
                className="bg-white/80 border-slate-200 focus-visible:ring-emerald-400 rounded-lg h-9 text-sm" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-semibold text-slate-600">Batted First</Label>
              <Select value={battingFirst} onValueChange={(v) => setBattingFirst(v as 'A' | 'B')}>
                <SelectTrigger className="w-full bg-white/80 border-slate-200 focus-visible:ring-emerald-400 rounded-lg h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200/60 bg-white/95 backdrop-blur-xl">
                  <SelectItem value="A" className="font-medium rounded-lg">{teamAName}</SelectItem>
                  <SelectItem value="B" className="font-medium rounded-lg">{teamBName}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-semibold text-slate-600">1st Innings Score</Label>
              <Input placeholder="156" value={firstInningsScore} onChange={(e) => setFirstInningsScore(e.target.value)}
                className="bg-white/80 border-slate-200 focus-visible:ring-emerald-400 font-bold rounded-lg h-9 text-sm" />
            </div>
          </div>
          {error && (
            <Alert variant="destructive" className="rounded-xl border-rose-200 bg-rose-50/80 py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="font-bold text-xs">Error</AlertTitle>
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-2 animate-in slide-in-from-bottom-6 fade-in duration-700">
          <Alert className="rounded-xl border-emerald-300/50 bg-gradient-to-r from-emerald-50/90 to-teal-50/90 backdrop-blur-xl shadow-lg border-l-4 border-l-emerald-500 py-3 px-4">
            <Trophy className="h-4 w-4 text-emerald-600 absolute top-3" />
            <div className="pl-7">
              <AlertTitle className="text-emerald-900 text-sm font-bold">NRR Qualification Scenario</AlertTitle>
              <AlertDescription className="mt-1 text-slate-700 text-xs font-medium leading-relaxed">
                <strong className="text-emerald-800">{result.chaserName}</strong> must chase{' '}
                <strong className="text-slate-900 px-1 py-0.5 bg-white rounded border border-slate-200 text-xs">{result.target}</strong> runs within{' '}
                <strong className="text-slate-900 px-1 py-0.5 bg-white rounded border border-slate-200 text-xs">{result.safestOvers} ov</strong> to surpass{' '}
                <strong className="text-emerald-800">{result.opponentName}</strong> (NRR: {result.opponentFinalNRR})
              </AlertDescription>
            </div>
          </Alert>

          <Card className="rounded-xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg overflow-hidden relative !py-0 !gap-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-400 to-slate-300" />
            <div className="px-4 py-3">
              <p className="text-sm font-bold text-slate-800">Chase Targets</p>
              <p className="text-xs text-slate-500 font-medium mb-2">Max overs for each scoring total</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr className="bg-slate-900/90 text-white">
                    <th className="px-4 py-2.5 text-left font-bold tracking-wider uppercase text-[10px]">Runs</th>
                    <th className="px-4 py-2.5 text-left font-bold tracking-wider uppercase text-[10px]">Finish By</th>
                    <th className="px-4 py-2.5 text-right font-bold tracking-wider uppercase text-[10px] text-blue-300">{result.chaserName} NRR</th>
                    <th className="px-4 py-2.5 text-right font-bold tracking-wider uppercase text-[10px] text-orange-300">{result.opponentName} NRR</th>
                    <th className="px-4 py-2.5 text-right font-bold tracking-wider uppercase text-[10px] text-emerald-300">Gain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.edgeCases.map((sc, idx) => (
                    <tr key={idx} className={`transition-colors hover:bg-white/80 ${idx === 0 ? 'bg-gradient-to-r from-emerald-50/80 to-teal-50/80 font-medium' : idx % 2 === 0 ? 'bg-white/40' : 'bg-slate-50/40'}`}>
                      <td className="px-4 py-2.5 font-bold text-slate-900">{sc.runs}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${idx === 0 ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                          {sc.maxOvers} Ov
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-blue-700 font-semibold">{sc.chaserNRR >= 0 ? '+' : ''}{sc.chaserNRR.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-orange-700 font-semibold">{sc.opponentNRR >= 0 ? '+' : ''}{sc.opponentNRR.toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono font-bold text-emerald-600 bg-emerald-100/50 px-1.5 py-0.5 rounded">+{sc.nrrDiff.toFixed(3)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}