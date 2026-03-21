'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Trophy, TrendingUp, FlaskConical, CheckCircle2, XCircle, Save, FolderOpen, Calculator } from 'lucide-react'

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

interface DefendEdgeCase {
  restrictTo: number
  margin: number
  defenderNRR: number
  chaserNRR: number
}

interface DefendResultData {
  defenderName: string
  chaserName: string
  firstInningsScore: number
  minMargin: number
  maxAllowed: number
  defenderNRR: number
  edgeCases: DefendEdgeCase[]
}

// --- Custom scenario result ---
interface CustomChaseResult {
  chaserNRR: number
  opponentNRR: number
  passes: boolean   // beats opponent (and 3rd if provided)
  beats3rd: boolean | null
}

interface CustomDefendResult {
  defenderNRR: number
  chaserNRR: number
  passes: boolean   // defender beats chaser (and 3rd if provided)
  beats3rd: boolean | null
}

// --- Logic ---
function compute(
  teamA: TeamStats, teamB: TeamStats,
  battingFirst: 'A' | 'B',
  firstInningsScore: string, matchOvers: string,
  thirdNRR: number | null
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
      const nrrThreshold = thirdNRR !== null ? thirdNRR : opponentNRR
      if (chaserNRR > nrrThreshold) {
        if (extra === 0) { safestBalls = balls; finalOpponentNRR = opponentNRR }
        edgeCases.push({
          runs: scenarioRuns, maxOvers: ballsToOvers(balls),
          chaserNRR: parseFloat(chaserNRR.toFixed(3)),
          opponentNRR: parseFloat(opponentNRR.toFixed(3)),
          nrrDiff: parseFloat((chaserNRR - nrrThreshold).toFixed(3)),
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

function computeDefend(
  teamA: TeamStats, teamB: TeamStats,
  battingFirst: 'A' | 'B',
  firstInningsScore: string, matchOvers: string,
  thirdNRR: number | null
): DefendResultData | null {
  const maxBalls = oversToBalls(matchOvers)
  const score = parseInt(firstInningsScore, 10)
  if (!score || !maxBalls) return null

  const defStats = battingFirst === 'A' ? teamA : teamB
  const chStats = battingFirst === 'A' ? teamB : teamA
  const defName = (battingFirst === 'A' ? teamA.name : teamB.name).trim() || (battingFirst === 'A' ? 'Team A' : 'Team B')
  const chName = (battingFirst === 'A' ? teamB.name : teamA.name).trim() || (battingFirst === 'A' ? 'Team B' : 'Team A')

  const hasDefender = defStats.runsScored && defStats.oversFaced && defStats.runsConceded && defStats.oversBowled
  const hasChaser = chStats.runsScored && chStats.oversFaced && chStats.runsConceded && chStats.oversBowled
  if (!hasDefender || !hasChaser) return null

  const defRunsFor = Number(defStats.runsScored) + score
  const defOvFor = oversDecimal(defStats.oversFaced) + maxBalls / 6
  const defRunsAgBase = Number(defStats.runsConceded)
  const defOvAgBase = oversDecimal(defStats.oversBowled)
  const chRunsFor = Number(chStats.runsScored)
  const chOvFor = oversDecimal(chStats.oversFaced)
  const chRunsAgBase = Number(chStats.runsConceded) + score
  const chOvAgBase = oversDecimal(chStats.oversBowled) + maxBalls / 6

  const edgeCases: DefendEdgeCase[] = []
  let minMargin = -1
  let defenderNRRAtMin = 0

  for (let margin = 1; margin <= score; margin++) {
    const oppScore = score - margin
    const defNRR = (defRunsFor / defOvFor) - ((defRunsAgBase + oppScore) / (defOvAgBase + maxBalls / 6))
    const chNRR = ((chRunsFor + oppScore) / (chOvFor + maxBalls / 6)) - (chRunsAgBase / chOvAgBase)
    const nrrThreshold = thirdNRR !== null ? thirdNRR : chNRR
    if (defNRR > nrrThreshold) {
      if (minMargin === -1) { minMargin = margin; defenderNRRAtMin = defNRR }
      edgeCases.push({ restrictTo: oppScore, margin, defenderNRR: parseFloat(defNRR.toFixed(3)), chaserNRR: parseFloat(chNRR.toFixed(3)) })
    }
  }

  if (edgeCases.length === 0) return null

  return {
    defenderName: defName,
    chaserName: chName,
    firstInningsScore: score,
    minMargin,
    maxAllowed: score - minMargin,
    defenderNRR: parseFloat(defenderNRRAtMin.toFixed(3)),
    edgeCases: edgeCases.slice(0, 6),
  }
}

function computeSingleScenario(
  team: TeamStats,
  baseScore: string,
  targetNRR: string,
  matchOvers: string,
  role: 'chasing' | 'defending'
): ResultData | null {
  const tNRR = parseFloat(targetNRR)
  const score = parseInt(baseScore, 10)
  const maxOvers = parseInt(matchOvers, 10)
  if (isNaN(tNRR) || isNaN(score) || !maxOvers) return null
  if (!team.runsScored || !team.oversFaced || !team.runsConceded || !team.oversBowled) return null

  const chExistingRuns = Number(team.runsScored)
  const chExistingOversDec = oversDecimal(team.oversFaced)
  const chRunsConcededBase = Number(team.runsConceded)
  const chOversBowledDecBase = oversDecimal(team.oversBowled)
  const edgeCases: EdgeCase[] = []
  let safestValue = 0

  if (role === 'chasing') {
    const target = score + 1
    const finalRunsConceded = chRunsConcededBase + score
    const finalOversBowled = chOversBowledDecBase + maxOvers
    for (let extra = 0; extra <= 36; extra++) {
      const scenarioRuns = target + extra
      for (let balls = maxOvers * 6; balls >= 1; balls--) {
        const chaserRunsFinal = chExistingRuns + scenarioRuns
        const chaserOversFinal = chExistingOversDec + balls / 6
        const chaserNRR = (chaserRunsFinal / chaserOversFinal) - (finalRunsConceded / finalOversBowled)
        if (chaserNRR > tNRR) {
          if (extra === 0) safestValue = balls
          edgeCases.push({ runs: scenarioRuns, maxOvers: ballsToOvers(balls), chaserNRR: parseFloat(chaserNRR.toFixed(3)), opponentNRR: tNRR, nrrDiff: parseFloat((chaserNRR - tNRR).toFixed(3)) })
          break
        }
      }
    }
    if (edgeCases.length === 0) return null
    return { chaserName: team.name || 'Team', opponentName: 'Target NRR', target, opponentFinalNRR: tNRR, safestOvers: safestValue > 0 ? ballsToOvers(safestValue) : 'N/A', edgeCases: edgeCases.slice(0, 6) }
  } else {
    const finalRunsScored = chExistingRuns + score
    const finalOversFaced = chExistingOversDec + maxOvers
    for (let extra = 0; extra <= 100; extra++) {
      const oppScore = score - extra
      if (oppScore < 0) break
      const finalRunsConceded = chRunsConcededBase + oppScore
      const finalOversBowled = chOversBowledDecBase + maxOvers
      const finalNRR = (finalRunsScored / finalOversFaced) - (finalRunsConceded / finalOversBowled)
      if (finalNRR > tNRR) {
        if (extra === 0) safestValue = oppScore
        edgeCases.push({ runs: oppScore, maxOvers: matchOvers, chaserNRR: parseFloat(finalNRR.toFixed(3)), opponentNRR: tNRR, nrrDiff: parseFloat((finalNRR - tNRR).toFixed(3)) })
      }
    }
    if (edgeCases.length === 0) return null
    const sortedEdges = edgeCases.sort((a, b) => b.runs - a.runs)
    return { chaserName: team.name || 'Team', opponentName: 'Target NRR', target: score, opponentFinalNRR: tNRR, safestOvers: sortedEdges[0].runs.toString() + ' runs', edgeCases: sortedEdges.slice(0, 6) }
  }
}

// --- Compute NRRs for a single custom chase scenario ---
// Runs are always fixed at target (score + 1); only overs vary
function computeCustomChase(
  teamA: TeamStats, teamB: TeamStats,
  battingFirst: 'A' | 'B',
  firstInningsScore: string, matchOvers: string,
  customOvers: string,
  thirdNRR: number | null
): CustomChaseResult | null {
  const maxBalls = oversToBalls(matchOvers)
  const score = parseInt(firstInningsScore, 10)
  const runs = score + 1  // always chase the target
  const balls = oversToBalls(customOvers)
  if (!score || !maxBalls || !balls) return null

  const chaserStats = battingFirst === 'A' ? teamB : teamA
  const opponentStats = battingFirst === 'A' ? teamA : teamB
  const hasChaser = chaserStats.runsScored && chaserStats.oversFaced && chaserStats.runsConceded && chaserStats.oversBowled
  const hasOpponent = opponentStats.runsScored && opponentStats.oversFaced && opponentStats.runsConceded && opponentStats.oversBowled
  if (!hasChaser || !hasOpponent) return null

  const chExistingRuns = Number(chaserStats.runsScored)
  const chExistingOversDec = oversDecimal(chaserStats.oversFaced)
  const chRunsConcededBase = Number(chaserStats.runsConceded) + score
  const chOversBowledDecBase = oversDecimal(chaserStats.oversBowled) + maxBalls / 6

  const oppRunsScoredBase = Number(opponentStats.runsScored) + score
  const oppOversFacedDecBase = oversDecimal(opponentStats.oversFaced) + maxBalls / 6
  const oppRunsConcededBase = Number(opponentStats.runsConceded)
  const oppOversBowledDecBase = oversDecimal(opponentStats.oversBowled)

  const chaserRunsFinal = chExistingRuns + runs
  const chaserOversFinal = chExistingOversDec + balls / 6
  const chaserNRR = (chaserRunsFinal / chaserOversFinal) - (chRunsConcededBase / chOversBowledDecBase)

  const oppRunsConcededFinal = oppRunsConcededBase + runs
  const oppOversBowledFinal = oppOversBowledDecBase + balls / 6
  const opponentNRR = (oppRunsScoredBase / oppOversFacedDecBase) - (oppRunsConcededFinal / oppOversBowledFinal)

  const passes = thirdNRR !== null ? chaserNRR > thirdNRR : chaserNRR > opponentNRR
  const beats3rd = thirdNRR !== null ? chaserNRR > thirdNRR : null

  return {
    chaserNRR: parseFloat(chaserNRR.toFixed(3)),
    opponentNRR: parseFloat(opponentNRR.toFixed(3)),
    passes,
    beats3rd,
  }
}

// --- Compute NRRs for a single custom defend scenario ---
function computeCustomDefend(
  teamA: TeamStats, teamB: TeamStats,
  battingFirst: 'A' | 'B',
  firstInningsScore: string, matchOvers: string,
  customRestrictTo: string,
  thirdNRR: number | null
): CustomDefendResult | null {
  const maxBalls = oversToBalls(matchOvers)
  const score = parseInt(firstInningsScore, 10)
  const oppScore = parseInt(customRestrictTo, 10)
  if (!score || !maxBalls || isNaN(oppScore)) return null

  const defStats = battingFirst === 'A' ? teamA : teamB
  const chStats = battingFirst === 'A' ? teamB : teamA
  const hasDefender = defStats.runsScored && defStats.oversFaced && defStats.runsConceded && defStats.oversBowled
  const hasChaser = chStats.runsScored && chStats.oversFaced && chStats.runsConceded && chStats.oversBowled
  if (!hasDefender || !hasChaser) return null

  const defRunsFor = Number(defStats.runsScored) + score
  const defOvFor = oversDecimal(defStats.oversFaced) + maxBalls / 6
  const defRunsAgBase = Number(defStats.runsConceded)
  const defOvAgBase = oversDecimal(defStats.oversBowled)
  const chRunsFor = Number(chStats.runsScored)
  const chOvFor = oversDecimal(chStats.oversFaced)
  const chRunsAgBase = Number(chStats.runsConceded) + score
  const chOvAgBase = oversDecimal(chStats.oversBowled) + maxBalls / 6

  const defNRR = (defRunsFor / defOvFor) - ((defRunsAgBase + oppScore) / (defOvAgBase + maxBalls / 6))
  const chNRR = ((chRunsFor + oppScore) / (chOvFor + maxBalls / 6)) - (chRunsAgBase / chOvAgBase)

  const passes = thirdNRR !== null ? defNRR > thirdNRR : defNRR > chNRR
  const beats3rd = thirdNRR !== null ? defNRR > thirdNRR : null

  return {
    defenderNRR: parseFloat(defNRR.toFixed(3)),
    chaserNRR: parseFloat(chNRR.toFixed(3)),
    passes,
    beats3rd,
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
  const [thirdNRR, setThirdNRR] = useState('')

  const [singleTeam, setSingleTeam] = useState<TeamStats>(emptyTeam())
  const [targetNRR, setTargetNRR] = useState('')
  const [baseScore, setBaseScore] = useState('')
  const [role, setRole] = useState<'chasing' | 'defending'>('chasing')

  const [matchOvers, setMatchOvers] = useState('20')
  const [customOvers, setCustomOvers] = useState('')
  const [customRestrictTo, setCustomRestrictTo] = useState('')
  const [customChaseResult, setCustomChaseResult] = useState<CustomChaseResult | null>(null)
  const [customDefendResult, setCustomDefendResult] = useState<CustomDefendResult | null>(null)
  const [error, setError] = useState('')

  // -- NEW: Calculation Trigger State --
  const [calculatedResult, setCalculatedResult] = useState<{
    result: ResultData | null;
    defendResult: DefendResultData | null;
    customChaseResult: CustomChaseResult | null;
    customDefendResult: CustomDefendResult | null;
  } | null>(null)

  const handleCalculate = () => {
    setError('')
    const t3Raw = thirdNRR.trim()
    const t3 = t3Raw !== '' ? parseFloat(t3Raw) : null
    const t3Val = t3 !== null && !isNaN(t3) ? t3 : null

    if (mode === 'vs-team') {
      const res = compute(teamA, teamB, battingFirst, firstInningsScore, matchOvers, t3Val)
      const defRes = computeDefend(teamA, teamB, battingFirst, firstInningsScore, matchOvers, t3Val)
      const cChase = computeCustomChase(teamA, teamB, battingFirst, firstInningsScore, matchOvers, customOvers || matchOvers, t3Val)
      const cDefend = computeCustomDefend(teamA, teamB, battingFirst, firstInningsScore, matchOvers, customRestrictTo, t3Val)

      setCalculatedResult({
        result: res,
        defendResult: defRes,
        customChaseResult: cChase,
        customDefendResult: cDefend
      })
    } else {
      const res = computeSingleScenario(singleTeam, baseScore, targetNRR, matchOvers, role)
      setCalculatedResult({
        result: res,
        defendResult: null,
        customChaseResult: null,
        customDefendResult: null
      })
    }
  }

  // Live update ONLY for custom scenario inputs if results already exist
  useEffect(() => {
    if (calculatedResult && mode === 'vs-team') {
      const t3Raw = thirdNRR.trim()
      const t3 = t3Raw !== '' ? parseFloat(t3Raw) : null
      const t3Val = t3 !== null && !isNaN(t3) ? t3 : null

      setCustomChaseResult(computeCustomChase(teamA, teamB, battingFirst, firstInningsScore, matchOvers, customOvers || matchOvers, t3Val))
      setCustomDefendResult(computeCustomDefend(teamA, teamB, battingFirst, firstInningsScore, matchOvers, customRestrictTo, t3Val))
    }
  }, [customOvers, customRestrictTo, teamA, teamB, battingFirst, firstInningsScore, matchOvers, thirdNRR])

  // -- NEW: In-memory/LocalStorage Saver --
  const saveState = () => {
    const data = {
      teamA, teamB, battingFirst, firstInningsScore, thirdNRR,
      singleTeam, targetNRR, baseScore, role, matchOvers, mode
    }
    localStorage.setItem('nrr_calc_save', JSON.stringify(data))
    alert('Data saved successfully!')
  }

  const loadState = () => {
    const saved = localStorage.getItem('nrr_calc_save')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.teamA) setTeamA(data.teamA)
        if (data.teamB) setTeamB(data.teamB)
        if (data.battingFirst) setBattingFirst(data.battingFirst)
        if (data.firstInningsScore) setFirstInningsScore(data.firstInningsScore)
        if (data.thirdNRR) setThirdNRR(data.thirdNRR)
        if (data.singleTeam) setSingleTeam(data.singleTeam)
        if (data.targetNRR) setTargetNRR(data.targetNRR)
        if (data.baseScore) setBaseScore(data.baseScore)
        if (data.role) setRole(data.role)
        if (data.matchOvers) setMatchOvers(data.matchOvers)
        if (data.mode) setMode(data.mode)
        setCalculatedResult(null) // Fresh start
      } catch (e) {
        console.error('Failed to load state', e)
      }
    } else {
      alert('No saved data found.')
    }
  }

  const nrrA = teamA.runsScored && teamA.oversFaced && teamA.runsConceded && teamA.oversBowled
    ? calcNRR(Number(teamA.runsScored), teamA.oversFaced, Number(teamA.runsConceded), teamA.oversBowled) : null
  const nrrB = teamB.runsScored && teamB.oversFaced && teamB.runsConceded && teamB.oversBowled
    ? calcNRR(Number(teamB.runsScored), teamB.oversFaced, Number(teamB.runsConceded), teamB.oversBowled) : null
  const nrrSingle = singleTeam.runsScored && singleTeam.oversFaced && singleTeam.runsConceded && singleTeam.oversBowled
    ? calcNRR(Number(singleTeam.runsScored), singleTeam.oversFaced, Number(singleTeam.runsConceded), singleTeam.oversBowled) : null

  const teamAName = teamA.name.trim() || 'Team A'
  const teamBName = teamB.name.trim() || 'Team B'

  const t3Parsed = thirdNRR.trim() !== '' ? parseFloat(thirdNRR) : null
  const has3 = t3Parsed !== null && !isNaN(t3Parsed)

  const setA = useCallback((f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) => setTeamA(prev => ({ ...prev, [f]: e.target.value })), [])
  const setB = useCallback((f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) => setTeamB(prev => ({ ...prev, [f]: e.target.value })), [])
  const setSingle = useCallback((f: keyof TeamStats) => (e: React.ChangeEvent<HTMLInputElement>) => setSingleTeam(prev => ({ ...prev, [f]: e.target.value })), [])

  // Chaser / defender names for display
  const chaserName = (battingFirst === 'A' ? teamB.name : teamA.name).trim() || (battingFirst === 'A' ? 'Team B' : 'Team A')
  const defenderName = (battingFirst === 'A' ? teamA.name : teamB.name).trim() || (battingFirst === 'A' ? 'Team A' : 'Team B')
  const opponentOfChaser = (battingFirst === 'A' ? teamA.name : teamB.name).trim() || (battingFirst === 'A' ? 'Team A' : 'Team B')

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-8 text-slate-900">

      {/* Mode Toggle & Saver */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-xl p-1 bg-slate-100 border border-slate-200">
          <button onClick={() => { setMode('vs-team'); setCalculatedResult(null) }}
            className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-bold transition-all duration-200 ${mode === 'vs-team' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Head to Head
          </button>
          <button onClick={() => { setMode('vs-nrr'); setCalculatedResult(null) }}
            className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-bold transition-all duration-200 ${mode === 'vs-nrr' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Target NRR
          </button>
        </div>
        <div className="flex gap-1.5 px-1">
          <button onClick={saveState} title="Save current data"
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm">
            <Save className="h-4 w-4" />
          </button>
          <button onClick={loadState} title="Load saved data"
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm">
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mode === 'vs-team' ? (
        <>
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

          <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden relative !py-0 !gap-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
            <div className="p-4 sm:p-5 flex flex-col gap-4">
              <p className="text-base font-bold text-slate-900">This Match</p>
              <div className="grid gap-2 grid-cols-4">
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
                <div className="space-y-1">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">3rd NRR (opt.)</Label>
                  <Input placeholder="-0.047" value={thirdNRR} onChange={(e) => setThirdNRR(e.target.value)}
                    className="border-slate-200 focus-visible:ring-violet-500 font-bold rounded-lg h-9 px-2 text-xs sm:text-sm" />
                </div>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <>
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

          <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden relative !py-0 !gap-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
            <div className="p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-base font-bold text-slate-900">This Match</p>
                  <p className="text-sm text-slate-500 font-medium">Select your role and enter match details.</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-inner">
                  <button onClick={() => setRole('chasing')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${role === 'chasing' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500'}`}>
                    CHASE
                  </button>
                  <button onClick={() => setRole('defending')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${role === 'defending' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500'}`}>
                    DEFEND
                  </button>
                </div>
              </div>
              <div className="grid gap-2 grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase">Overs</Label>
                  <Input placeholder="20" value={matchOvers} onChange={(e) => setMatchOvers(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 rounded-lg h-9 px-2 text-xs sm:text-sm font-medium" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">
                    {role === 'chasing' ? 'Opp Score' : 'Your Score'}
                  </Label>
                  <Input placeholder="156" value={baseScore} onChange={(e) => setBaseScore(e.target.value)}
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

      <button
        onClick={handleCalculate}
        className="w-full py-4 rounded-xl bg-slate-900 border-b-4 border-slate-950 text-white font-black text-lg shadow-lg hover:bg-slate-800 transition-all active:translate-y-1 active:border-b-0 flex items-center justify-center gap-3 overflow-hidden relative group"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-emerald-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        <Calculator className="h-6 w-6 group-hover:rotate-12 transition-transform" />
        CALCULATE SCENARIOS
      </button>

      {error && (
        <Alert variant="destructive" className="rounded-lg border-rose-200 bg-rose-50 text-rose-800">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-bold text-sm">Error</AlertTitle>
          <AlertDescription className="text-xs font-medium mt-1">{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Chasing Results ── */}
      {calculatedResult?.result && calculatedResult.result.safestOvers !== ballsToOvers(oversToBalls(matchOvers)) && (() => {
        const result = calculatedResult.result
        const defendResult = calculatedResult.defendResult
        const customChaseResult = calculatedResult.customChaseResult
        const customDefendResult = calculatedResult.customDefendResult
        const colsCls = has3 ? 'grid-cols-5' : 'grid-cols-4'
        return (
          <div className="space-y-4 pt-2 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="rounded-full bg-emerald-100 p-2 text-emerald-600 shrink-0"><Trophy className="h-5 w-5" /></div>
              <div>
                <p className="text-emerald-800 text-xs font-bold uppercase tracking-wider mb-1">Target Scenario</p>
                <p className="text-slate-800 text-base font-medium leading-relaxed">
                  {mode === 'vs-nrr' && role === 'defending' ? (
                    <><span className="font-bold">{result.chaserName}</span> needs to restrict the opponent to <span className="font-bold">{result.safestOvers}</span> to maintain/reach <span className="font-bold">NRR {result.opponentFinalNRR >= 0 ? '+' : ''}{result.opponentFinalNRR}</span></>
                  ) : (
                    <><span className="font-bold">{result.chaserName}</span> needs to score <span className="font-bold">{result.target}</span> runs in <span className="font-bold">{result.safestOvers}</span> to surpass{' '}
                      {mode === 'vs-nrr' ? <span className="font-bold">NRR {result.opponentFinalNRR >= 0 ? '+' : ''}{result.opponentFinalNRR}</span>
                        : has3 ? <span className="text-violet-700 font-bold">3rd team NRR ({t3Parsed! >= 0 ? '+' : ''}{t3Parsed!.toFixed(3)})</span>
                          : <><span className="font-bold">{result.opponentName}</span> (NRR: {result.opponentFinalNRR.toFixed(3)})</>}
                    </>
                  )}
                </p>
                {has3 && <p className="text-xs font-bold mt-1.5 text-violet-700">3rd Team NRR benchmark: <span className="font-black">{t3Parsed! >= 0 ? '+' : ''}{t3Parsed!.toFixed(3)}</span></p>}
              </div>
            </div>

            <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden relative !py-0 !gap-0">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-400 to-slate-600" />
              <div className="px-4 py-3 sm:px-5 sm:py-4">
                <p className="text-base font-bold text-slate-900">{mode === 'vs-nrr' && role === 'defending' ? 'Defending Scenarios' : 'Alternative Chase Targets'}</p>
              </div>
              <div className={`grid ${colsCls} gap-1 bg-slate-50 border-y border-slate-200 px-3 py-2`}>
                <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500">{mode === 'vs-nrr' && role === 'defending' ? 'Restrict To' : 'Runs'}</div>
                <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500 text-center">{mode === 'vs-nrr' && role === 'defending' ? 'Win Margin' : 'Finish By'}</div>
                <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500 text-right truncate pl-1">{mode === 'vs-nrr' ? 'Target NRR' : result.chaserName}</div>
                <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500 text-right truncate">{mode === 'vs-nrr' ? result.chaserName : result.opponentName}</div>
                {has3 && <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-violet-500 text-right truncate">3rd NRR</div>}
              </div>
              <div className="divide-y divide-slate-100">
                {result.edgeCases.map((sc, idx) => (
                  <div key={idx} className={`px-3 py-3 transition-colors ${idx === 0 ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}`}>
                    <div className={`grid ${colsCls} gap-1 items-center`}>
                      <span className={`text-lg sm:text-xl font-black ${idx === 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{sc.runs}</span>
                      <div className="flex justify-center">
                        <span className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-sm font-bold shadow-sm ${idx === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-100 border border-slate-200 text-slate-700'}`}>
                          {mode === 'vs-nrr' && role === 'defending' ? (result.target - sc.runs) + ' runs' : sc.maxOvers + (sc.maxOvers.includes('ov') ? '' : ' ov')}
                        </span>
                      </div>
                      <span className={`text-right font-mono text-sm font-bold ${has3 ? (sc.chaserNRR > t3Parsed! ? 'text-emerald-600' : 'text-slate-500') : 'text-emerald-700'}`}>
                        {mode === 'vs-nrr' ? (sc.opponentNRR >= 0 ? '+' : '') + sc.opponentNRR.toFixed(3) : (sc.chaserNRR >= 0 ? '+' : '') + sc.chaserNRR.toFixed(3)}
                      </span>
                      <span className={`text-right font-mono text-sm font-bold ${has3 ? (sc.opponentNRR > t3Parsed! ? 'text-slate-700' : 'text-slate-500') : 'text-slate-700'}`}>
                        {mode === 'vs-nrr' ? (sc.chaserNRR >= 0 ? '+' : '') + sc.chaserNRR.toFixed(3) : (sc.opponentNRR >= 0 ? '+' : '') + sc.opponentNRR.toFixed(3)}
                      </span>
                      {has3 && <span className="text-right font-mono text-sm font-bold text-violet-500">{t3Parsed! >= 0 ? '+' : ''}{t3Parsed!.toFixed(3)}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Custom Chase Scenario Checker ── */}
              <div className="border-t border-slate-200 bg-slate-50/50">
                {/* Header */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <FlaskConical className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Try a scenario</p>
                </div>
                {/* Input row */}
                <div className="flex items-center gap-3 px-3 pb-3">
                  <p className="text-xs font-semibold text-slate-500 shrink-0">Chase <span className="font-black text-slate-700">{result.target}</span> in</p>
                  <Input
                    placeholder={matchOvers}
                    value={customOvers}
                    onChange={(e) => setCustomOvers(e.target.value)}
                    className="border-slate-200 rounded-lg h-8 px-2 text-sm font-bold w-20 bg-white focus-visible:ring-emerald-400"
                  />
                  <p className="text-xs font-semibold text-slate-500 shrink-0">overs</p>
                  {customChaseResult && (
                    <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${customChaseResult.passes
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-600'
                      }`}>
                      {customChaseResult.passes
                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : <XCircle className="h-3.5 w-3.5" />}
                      {customChaseResult.passes ? 'Qualifies' : 'Not enough'}
                    </span>
                  )}
                </div>
                {/* Result row — same column layout as table above */}
                {customChaseResult && (
                  <div className={`grid ${has3 ? 'grid-cols-5' : 'grid-cols-4'} gap-1 border-t border-slate-200 bg-white px-3 py-3`}>
                    {/* col1: runs */}
                    <span className="text-lg font-black text-slate-700">{result.target}</span>
                    {/* col2: overs badge */}
                    <div className="flex justify-center">
                      <span className="inline-flex items-center justify-center rounded-md px-2 py-1 text-sm font-bold bg-slate-100 border border-slate-200 text-slate-700">
                        {(customOvers || matchOvers) + ((customOvers || matchOvers).includes('.') ? '' : '.0') + ' ov'}
                      </span>
                    </div>
                    {/* col3: chaser NRR */}
                    <span className={`text-right font-mono text-sm font-bold ${has3
                      ? (customChaseResult.chaserNRR > t3Parsed! ? 'text-emerald-600' : 'text-slate-400')
                      : 'text-emerald-700'
                      }`}>
                      {customChaseResult.chaserNRR >= 0 ? '+' : ''}{customChaseResult.chaserNRR.toFixed(3)}
                    </span>
                    {/* col4: opponent NRR */}
                    <span className={`text-right font-mono text-sm font-bold ${has3
                      ? (customChaseResult.opponentNRR > t3Parsed! ? 'text-slate-700' : 'text-slate-400')
                      : 'text-slate-700'
                      }`}>
                      {customChaseResult.opponentNRR >= 0 ? '+' : ''}{customChaseResult.opponentNRR.toFixed(3)}
                    </span>
                    {/* col5: 3rd NRR */}
                    {has3 && (
                      <span className={`text-right font-mono text-sm font-bold ${customChaseResult.beats3rd ? 'text-violet-600' : 'text-slate-400'}`}>
                        {t3Parsed! >= 0 ? '+' : ''}{t3Parsed!.toFixed(3)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )
      })()}

      {/* ── Defending Results ── */}
      {mode === 'vs-team' && calculatedResult?.defendResult && calculatedResult.defendResult.minMargin > 1 && (() => {
        const defendResult = calculatedResult.defendResult
        const colsCls = has3 ? 'grid-cols-5' : 'grid-cols-4'
        return (
          <div className="space-y-4 pt-2 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="rounded-xl border border-rose-200 bg-rose-50 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="rounded-full bg-rose-100 p-2 text-rose-600 shrink-0"><Trophy className="h-5 w-5" /></div>
              <div>
                <p className="text-rose-800 text-xs font-bold uppercase tracking-wider mb-1">Defending Scenario</p>
                <p className="text-slate-800 text-base font-medium leading-relaxed">
                  <span className="font-bold">{defendResult.defenderName}</span> needs to restrict{' '}
                  <span className="font-bold">{defendResult.chaserName}</span> to max{' '}
                  <span className="font-bold">{defendResult.maxAllowed} runs</span>{' '}(win by{' '}
                  <span className="font-bold">{defendResult.minMargin}+ runs</span>) to stay ahead on NRR

                </p>
                {has3 && <p className="text-xs font-bold mt-1.5 text-violet-700">3rd Team NRR benchmark: <span className="font-black">{t3Parsed! >= 0 ? '+' : ''}{t3Parsed!.toFixed(3)}</span></p>}
              </div>
            </div>

            <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden relative !py-0 !gap-0">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-400 to-orange-400" />
              <div className="px-4 py-3 sm:px-5 sm:py-4">
                <p className="text-base font-bold text-slate-900">Defending Scenarios</p>
              </div>
              <div className={`grid ${colsCls} gap-1 bg-slate-50 border-y border-slate-200 px-3 py-2`}>
                <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500">Restrict To</div>
                <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500 text-center">Win Margin</div>
                <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500 text-right truncate pl-1">{defendResult.defenderName}</div>
                <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-500 text-right truncate">{defendResult.chaserName}</div>
                {has3 && <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-violet-500 text-right truncate">3rd NRR</div>}
              </div>
              <div className="divide-y divide-slate-100">
                {defendResult.edgeCases.map((sc, idx) => (
                  <div key={idx} className={`px-3 py-3 transition-colors ${idx === 0 ? 'bg-rose-50/40' : 'hover:bg-slate-50'}`}>
                    <div className={`grid ${colsCls} gap-1 items-center`}>
                      <span className={`text-lg sm:text-xl font-black ${idx === 0 ? 'text-rose-600' : 'text-slate-800'}`}>{sc.restrictTo}</span>
                      <div className="flex justify-center">
                        <span className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-sm font-bold shadow-sm ${idx === 0 ? 'bg-rose-500 text-white' : 'bg-slate-100 border border-slate-200 text-slate-700'}`}>
                          {sc.margin} runs
                        </span>
                      </div>
                      <span className={`text-right font-mono text-sm font-bold ${has3 ? (sc.defenderNRR > t3Parsed! ? 'text-rose-600' : 'text-slate-500') : 'text-rose-600'}`}>
                        {sc.defenderNRR >= 0 ? '+' : ''}{sc.defenderNRR.toFixed(3)}
                      </span>
                      <span className={`text-right font-mono text-sm font-bold ${has3 ? (sc.chaserNRR > t3Parsed! ? 'text-slate-700' : 'text-slate-500') : 'text-slate-700'}`}>
                        {sc.chaserNRR >= 0 ? '+' : ''}{sc.chaserNRR.toFixed(3)}
                      </span>
                      {has3 && <span className="text-right font-mono text-sm font-bold text-violet-500">{t3Parsed! >= 0 ? '+' : ''}{t3Parsed!.toFixed(3)}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Custom Defend Scenario Checker ── */}
              <div className="border-t border-slate-200 bg-slate-50/50">
                {/* Header */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <FlaskConical className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Try a scenario</p>
                </div>
                {/* Input row */}
                <div className="flex items-center gap-3 px-3 pb-3">
                  <p className="text-xs font-semibold text-slate-500 shrink-0">Restrict to</p>
                  <Input
                    placeholder="e.g. 172"
                    value={customRestrictTo}
                    onChange={(e) => setCustomRestrictTo(e.target.value)}
                    className="border-slate-200 rounded-lg h-8 px-2 text-sm font-bold w-20 bg-white focus-visible:ring-rose-400"
                  />
                  <p className="text-xs font-semibold text-slate-500 shrink-0">runs</p>
                  {customDefendResult && (
                    <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${customDefendResult.passes
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-600'
                      }`}>
                      {customDefendResult.passes
                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : <XCircle className="h-3.5 w-3.5" />}
                      {customDefendResult.passes ? 'Qualifies' : 'Not enough'}
                    </span>
                  )}
                </div>
                {/* Result row — same column layout as table above */}
                {customDefendResult && (
                  <div className={`grid ${has3 ? 'grid-cols-5' : 'grid-cols-4'} gap-1 border-t border-slate-200 bg-white px-3 py-3`}>
                    {/* col1: restrict-to runs */}
                    <span className="text-lg font-black text-slate-700">{customRestrictTo}</span>
                    {/* col2: win margin badge */}
                    <div className="flex justify-center">
                      <span className="inline-flex items-center justify-center rounded-md px-2 py-1 text-sm font-bold bg-slate-100 border border-slate-200 text-slate-700">
                        {parseInt(firstInningsScore) - parseInt(customRestrictTo)} runs
                      </span>
                    </div>
                    {/* col3: defender NRR */}
                    <span className={`text-right font-mono text-sm font-bold ${has3
                      ? (customDefendResult.defenderNRR > t3Parsed! ? 'text-rose-600' : 'text-slate-400')
                      : 'text-rose-600'
                      }`}>
                      {customDefendResult.defenderNRR >= 0 ? '+' : ''}{customDefendResult.defenderNRR.toFixed(3)}
                    </span>
                    {/* col4: chaser NRR */}
                    <span className={`text-right font-mono text-sm font-bold ${has3
                      ? (customDefendResult.chaserNRR > t3Parsed! ? 'text-slate-700' : 'text-slate-400')
                      : 'text-slate-700'
                      }`}>
                      {customDefendResult.chaserNRR >= 0 ? '+' : ''}{customDefendResult.chaserNRR.toFixed(3)}
                    </span>
                    {/* col5: 3rd NRR */}
                    {has3 && (
                      <span className={`text-right font-mono text-sm font-bold ${customDefendResult.beats3rd ? 'text-violet-600' : 'text-slate-400'}`}>
                        {t3Parsed! >= 0 ? '+' : ''}{t3Parsed!.toFixed(3)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )
      })()}
    </div>
  )
}