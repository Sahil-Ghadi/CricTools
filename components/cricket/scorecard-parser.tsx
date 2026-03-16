'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, CheckCircle2 } from 'lucide-react'

export default function ScorecardParser() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [scorecardHTML, setScorecardHTML] = useState<string>('')
  const [matchTitle, setMatchTitle] = useState<string>('scorecard')
  const [parsedOk, setParsedOk] = useState(false)
  const [manOfTheMatch, setManOfTheMatch] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type === 'application/pdf') {
        handleAutoParse(file)
      } else {
        setError('Please upload a valid PDF file')
        setUploadedFile(null)
      }
    }
  }

  const handleAutoParse = (file: File) => {
    setUploadedFile(file)
    setError('')
    setParsedOk(false)
    setScorecardHTML('')
    setMatchTitle('scorecard')
    setManOfTheMatch('')
    performUpload(file)
  }

  const performUpload = async (file: File) => {
    setIsLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/generate-scorecard-pdf', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse PDF')
      }

      setScorecardHTML(data.html)
      if (data.parsed?.matchTitle) setMatchTitle(data.parsed.matchTitle)
      if (data.parsed?.manOfTheMatch && data.parsed.manOfTheMatch !== 'N/A') {
        setManOfTheMatch(data.parsed.manOfTheMatch)
      }
      setParsedOk(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong while parsing the PDF')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadPDF = () => {
    if (!scorecardHTML) return

    let finalHTML = scorecardHTML
    if (manOfTheMatch.trim()) {
      finalHTML = scorecardHTML.replace(
        /(<span class="label">MAN OF THE MATCH:<\/span>)\s*[^<]*/,
        `$1 ${manOfTheMatch.trim()}`
      )
    }
    finalHTML = finalHTML.replace(
      /<title>[^<]*<\/title>/,
      `<title>${matchTitle}<\/title>`
    )

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(finalHTML)
      printWindow.document.close()
      setTimeout(() => printWindow.print(), 1000)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('border-blue-400', 'bg-blue-50/50')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50/50')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50/50')
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (file.type === 'application/pdf') handleAutoParse(file)
      else setError('Please upload a valid PDF file')
    }
  }

  return (
    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Upload Card */}
      <Card className="rounded-xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-400" />
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm font-bold text-slate-800">Upload Scorecard PDF</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 px-4 pb-3">
          {/* Compact drop zone — just a row with button + filename */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="flex items-center gap-2 rounded-lg border border-dashed border-blue-200 bg-white/50 px-3 py-2 transition-all duration-200"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              className="hidden"
            />

            {isLoading ? (
              <div className="flex items-center gap-2 w-full">
                <Spinner className="h-4 w-4 text-indigo-600 shrink-0" />
                <p className="text-xs font-semibold text-indigo-600 animate-pulse">Parsing scorecard…</p>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 font-semibold text-xs h-7 px-3"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose PDF
                </Button>
                <span className="text-xs text-slate-400 truncate">
                  {uploadedFile ? uploadedFile.name : 'or drag & drop here'}
                </span>
              </>
            )}
          </div>

          {error && (
            <Alert variant="destructive" className="py-1.5">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Parsed Card */}
      {parsedOk && (
        <Card className="rounded-xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg overflow-hidden relative animate-in slide-in-from-bottom-6 fade-in duration-700">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />
          <CardHeader className="px-4 py-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <CardTitle className="text-sm font-bold text-emerald-900">PDF Parsed Successfully</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3">
            <div className="space-y-1">
              <Label htmlFor="mom-input" className="font-bold text-slate-800 text-xs">
                Man of the Match
              </Label>
              <Input
                id="mom-input"
                placeholder="e.g. Chetan Govekar given by Bala Sawant"
                value={manOfTheMatch}
                onChange={(e) => setManOfTheMatch(e.target.value)}
                className="text-xs bg-white/80 border-emerald-200 focus-visible:ring-emerald-400 rounded-lg h-9 shadow-sm font-medium"
              />
            </div>
            <Button
              onClick={handleDownloadPDF}
              className="w-full bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white text-sm font-bold py-4 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
              size="lg"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Final Scorecard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}