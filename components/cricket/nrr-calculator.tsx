'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Trophy, TrendingUp } from 'lucide-react'

// --- Math Helpers ---
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

// --- Interfaces ---
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

// --- Logic ---
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

function computeSingleScenario(
  team: TeamStats,
  oppScore: string,
  targetNRR: string,
  matchOvers: string
): ResultData | null {
  const tNRR = parseFloat(targetNRR)
  const score = parseInt(oppScore, 10)
  const maxOvers = parseInt(matchOvers, 10)

  if (isNaN(tNRR) || isNaN(score) || !maxOvers) return null
  if (!team.runsScored || !team.oversFaced || !team.runsConceded || !team.oversBowled) return null

  const target = score + 1
  const chExistingRuns = Number(team.runsScored)
  const chExistingOversDec = oversDecimal(team.oversFaced)
  const chRunsConcededBase = Number(team.runsConceded) + score
  const chOversBowledDecBase = oversDecimal(team.oversBowled) + maxOvers

  const edgeCases: EdgeCase[] = []
  let safestBalls = 0

  for (let extra = 0; extra <= 36; extra++) {
    const scenarioRuns = target + extra
    for (let balls = maxOvers * 6; balls >= 1; balls--) {
      const chaserRunsFinal = chExistingRuns + scenarioRuns
      const chaserOversFinal = chExistingOversDec + balls / 6
      const chaserNRR = (chaserRunsFinal / chaserOversFinal) - (chRunsConcededBase / chOversBowledDecBase)

      if (chaserNRR > tNRR) {
        if (extra === 0) safestBalls = balls
        edgeCases.push({
          runs: scenarioRuns, maxOvers: ballsToOvers(balls),
          chaserNRR: parseFloat(chaserNRR.toFixed(3)),
          opponentNRR: tNRR,
          nrrDiff: parseFloat((chaserNRR - tNRR).toFixed(3)),
        })
        break
      }
    }
  }

  if (edgeCases.length === 0) return null

  return {
    chaserName: team.name || 'Team',
    opponentName: 'Target NRR',
    target,
    opponentFinalNRR: tNRR,
    safestOvers: safestBalls > 0 ? ballsToOvers(safestBalls) : 'N/A',
    edgeCases: edgeCases.slice(0, 6),
  }
}

// ─── TeamBlock UI Component ──────────────────────────────────────────────────
interface TeamBlockProps {
  team: TeamStats
  setField: (f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) => void
  color: 'blue' | 'orange'
  placeholder: string
  nrr: number | null
}

function TeamBlock({ team, setField, color, placeholder, nrr }: TeamBlockProps) {
  const c = color === 'blue'
    ? { border: 'border-blue-200', bg: 'bg-blue-50/40', label: 'text-blue-700', input: 'border-blue-200 focus-visible:ring-blue-500', nrrBorder: 'border-blue-200 bg-white' }
    : { border: 'border-orange-200', bg: 'bg-orange-50/40', label: 'text-orange-700', input: 'border-orange-200 focus-visible:ring-orange-500', nrrBorder: 'border-orange-200 bg-white' }

  return (
    <div className={`space-y-3 rounded-xl border ${c.border} ${c.bg} p-3 sm:p-4 shadow-sm transition-all`}>
      <div>
        <Label className={`text-xs font-bold tracking-wider uppercase ${c.label}`}>Team Name</Label>
        <Input placeholder={placeholder} value={team.name} onChange={setField('name')}
          className={`mt-1.5 bg-white ${c.input} font-bold text-base rounded-lg h-9`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['runsScored', 'oversFaced', 'runsConceded', 'oversBowled'] as (keyof TeamStats)[]).map((field) => (
          <div key={field} className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {field.replace(/([A-Z])/g, ' $1').trim()}
            </Label>
            <Input
              placeholder={field.includes('overs') ? '0.0' : '0'}
              value={team[field]}
              onChange={setField(field)}
              className={`bg-white ${c.input} font-medium rounded-lg text-sm h-8`}
            />
          </div>
        ))}
      </div>
      {nrr !== null && (
        <div className={`flex items-center justify-between rounded-lg border ${c.nrrBorder} px-3 py-2 mt-1 shadow-sm`}>
          <span className="text-xs font-bold tracking-wider uppercase text-slate-500 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Current NRR
          </span>
          <span className={`text-base font-black ${nrr >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
            {nrr >= 0 ? '+' : ''}{nrr.toFixed(3)}
          </span>
        </div>
      )}
    </div>
  )
}

const emptyTeam = (): TeamStats => ({ name: '', runsScored: '', oversFaced: '', runsConceded: '', oversBowled: '' })

// ─── Main Component ──────────────────────────────────────────────────────────
export default function NrrCalculator() {
  const [mode, setMode] = useState<'vs-team' | 'vs-nrr'>('vs-team')

  const [teamA, setTeamA] = useState<TeamStats>(emptyTeam())
  const [teamB, setTeamB] = useState<TeamStats>(emptyTeam())
  const [battingFirst, setBattingFirst] = useState<'A' | 'B'>('A')
  const [firstInningsScore, setFirstInningsScore] = useState('')

  const [singleTeam, setSingleTeam] = useState<TeamStats>(emptyTeam())
  const [targetNRR, setTargetNRR] = useState('')
  const [oppScore, setOppScore] = useState('')

  const [matchOvers, setMatchOvers] = useState('20')
  const [result, setResult] = useState<ResultData | null>(null)
  const [error, setError] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setError('')
      if (mode === 'vs-team') {
        setResult(compute(teamA, teamB, battingFirst, firstInningsScore, matchOvers))
      } else {
        setResult(computeSingleScenario(singleTeam, oppScore, targetNRR, matchOvers))
      }
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [mode, teamA, teamB, battingFirst, firstInningsScore, matchOvers, singleTeam, targetNRR, oppScore])

  const nrrA = teamA.runsScored && teamA.oversFaced && teamA.runsConceded && teamA.oversBowled
    ? calcNRR(Number(teamA.runsScored), teamA.oversFaced, Number(teamA.runsConceded), teamA.oversBowled) : null
  const nrrB = teamB.runsScored && teamB.oversFaced && teamB.runsConceded && teamB.oversBowled
    ? calcNRR(Number(teamB.runsScored), teamB.oversFaced, Number(teamB.runsConceded), teamB.oversBowled) : null
  const nrrSingle = singleTeam.runsScored && singleTeam.oversFaced && singleTeam.runsConceded && singleTeam.oversBowled
    ? calcNRR(Number(singleTeam.runsScored), singleTeam.oversFaced, Number(singleTeam.runsConceded), singleTeam.oversBowled) : null

  const teamAName = teamA.name.trim() || 'Team A'
  const teamBName = teamB.name.trim() || 'Team B'

  const setA = useCallback((f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) => setTeamA(prev => ({ ...prev, [f]: e.target.value })), [])
  const setB = useCallback((f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) => setTeamB(prev => ({ ...prev, [f]: e.target.value })), [])
  const setSingle = useCallback((f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) => setSingleTeam(prev => ({ ...prev, [f]: e.target.value })), [])

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-8 text-slate-900">

      {/* Mode Toggle - Cleaner, pill-shaped */}
      <div className="flex rounded-xl p-1 bg-slate-100 border border-slate-200">
        <button
          onClick={() => { setMode('vs-team'); setResult(null) }}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all duration-200 ${mode === 'vs-team' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
        >
          Head to Head
        </button>
        <button
          onClick={() => { setMode('vs-nrr'); setResult(null) }}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all duration-200 ${mode === 'vs-nrr' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
        >
          Target NRR
        </button>
      </div>

      {mode === 'vs-team' ? (
        <>
          {/* Tournament Stats Card */}
          <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden relative !py-0 !gap-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-orange-400" />
            <div className="p-4 sm:p-5 flex flex-col gap-4">
              <div>
                <p className="text-base font-bold text-slate-900">Tournament Stats</p>
                <p className="text-sm text-slate-500 font-medium">Enter both teams' cumulative stats so far.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TeamBlock team={teamA} setField={setA} color="blue" placeholder="Team A Name" nrr={nrrA} />
                <TeamBlock team={teamB} setField={setB} color="orange" placeholder="Team B Name" nrr={nrrB} />
              </div>
            </div>
          </Card>

          {/* Match Setup Card */}
          <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden relative !py-0 !gap-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
            <div className="p-4 sm:p-5 flex flex-col gap-4">
              <div>
                <p className="text-base font-bold text-slate-900">This Match</p>
              </div>
              {/* Force 3 columns natively for mobile */}
              <div className="grid gap-2 grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase">Overs</Label>
                  <Input placeholder="20" value={matchOvers} onChange={(e) => setMatchOvers(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 rounded-lg h-9 px-2 text-xs sm:text-sm font-medium" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Bat 1st</Label>
                  <Select value={battingFirst} onValueChange={(v) => setBattingFirst(v as 'A' | 'B')}>
                    <SelectTrigger className="w-full border-slate-200 focus-visible:ring-emerald-500 rounded-lg h-9 px-2 text-xs sm:text-sm font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="A" className="font-medium text-xs sm:text-sm">{teamAName}</SelectItem>
                      <SelectItem value="B" className="font-medium text-xs sm:text-sm">{teamBName}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">1st Inn Score</Label>
                  <Input placeholder="156" value={firstInningsScore} onChange={(e) => setFirstInningsScore(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 font-bold rounded-lg h-9 px-2 text-xs sm:text-sm" />
                </div>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* Tournament Stats Card - Single */}
          <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden relative !py-0 !gap-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
            <div className="p-4 sm:p-5 flex flex-col gap-4">
              <div>
                <p className="text-base font-bold text-slate-900">Your Team's Stats</p>
                <p className="text-sm text-slate-500 font-medium">Cumulative tournament stats so far.</p>
              </div>
              <TeamBlock team={singleTeam} setField={setSingle} color="blue" placeholder="Your Team Name" nrr={nrrSingle} />
            </div>
          </Card>

          {/* Match Setup Card - Single */}
          <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden relative !py-0 !gap-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
            <div className="p-4 sm:p-5 flex flex-col gap-4">
              <div>
                <p className="text-base font-bold text-slate-900">This Match</p>
                <p className="text-sm text-slate-500 font-medium">Enter opponent's score & the NRR you need to beat.</p>
              </div>
              {/* Force 3 columns natively for mobile */}
              <div className="grid gap-2 grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase">Overs</Label>
                  <Input placeholder="20" value={matchOvers} onChange={(e) => setMatchOvers(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 rounded-lg h-9 px-2 text-xs sm:text-sm font-medium" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Opp Score</Label>
                  <Input placeholder="156" value={oppScore} onChange={(e) => setOppScore(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 font-bold rounded-lg h-9 px-2 text-xs sm:text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Target NRR</Label>
                  <Input placeholder="-0.500" value={targetNRR} onChange={(e) => setTargetNRR(e.target.value)}
                    className="border-slate-200 focus-visible:ring-blue-500 font-bold rounded-lg h-9 px-2 text-xs sm:text-sm" />
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {error && (
        <Alert variant="destructive" className="rounded-lg border-rose-200 bg-rose-50 text-rose-800">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-bold text-sm">Error</AlertTitle>
          <AlertDescription className="text-xs font-medium mt-1">{error}</AlertDescription>
        </Alert>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-4 pt-2 animate-in slide-in-from-bottom-4 fade-in duration-500">

          {/* Primary Summary Banner */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-600 shrink-0">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-emerald-800 text-xs font-bold uppercase tracking-wider mb-1">Target Scenario</p>
              <p className="text-slate-800 text-base font-medium leading-relaxed">
                <span className="font-bold">{result.chaserName}</span> needs to score{' '}
                <span className="font-bold">{result.target}</span> runs in{' '}
                <span className="font-bold">{result.safestOvers} ov</span> to surpass{' '}
                {mode === 'vs-nrr' ? (
                  <span className="font-bold">NRR {result.opponentFinalNRR >= 0 ? '+' : ''}{result.opponentFinalNRR}</span>
                ) : (
                  <><span className="font-bold">{result.opponentName}</span> (NRR: {result.opponentFinalNRR.toFixed(3)})</>
                )}
              </p>
            </div>
          </div>

          {/* Chase Targets Card */}
          <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden relative !py-0 !gap-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-400 to-slate-600" />

            <div className="px-4 py-3 sm:px-5 sm:py-4">
              <p className="text-base font-bold text-slate-900">Alternative Chase Targets</p>
            </div>

            {/* Header Row */}
            <div className="grid grid-cols-4 gap-2 bg-slate-50 border-y border-slate-200 px-3 py-2">
              <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500">Runs</div>
              <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500 text-center">Finish By</div>
              <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500 text-right truncate pl-1">{result.chaserName}</div>
              <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500 text-right truncate">{mode === 'vs-nrr' ? 'Target NRR' : result.opponentName}</div>
            </div>

            {/* Data Rows */}
            <div className="divide-y divide-slate-100">
              {result.edgeCases.map((sc, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-3 transition-colors ${idx === 0 ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}`}
                >
                  <div className="grid grid-cols-4 gap-2 items-center">
                    <span className={`text-lg sm:text-xl font-black ${idx === 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                      {sc.runs}
                    </span>
                    <div className="flex justify-center">
                      <span className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-sm font-bold shadow-sm ${idx === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-100 border border-slate-200 text-slate-700'}`}>
                        {sc.maxOvers} <span className="text-[10px] uppercase ml-0.5 opacity-80">ov</span>
                      </span>
                    </div>
                    <span className="text-right font-mono text-sm font-bold text-emerald-700">
                      {sc.chaserNRR >= 0 ? '+' : ''}{sc.chaserNRR.toFixed(3)}
                    </span>
                    <div className="flex justify-end">
                      <span className="font-mono text-sm font-bold text-slate-700">
                        {sc.opponentNRR >= 0 ? '+' : ''}{sc.opponentNRR.toFixed(3)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}