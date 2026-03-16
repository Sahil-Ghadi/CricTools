'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, FileText, Download, CheckCircle2 } from 'lucide-react'

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
        setUploadedFile(file)
        setError('')
        setParsedOk(false)
        setScorecardHTML('')
        setMatchTitle('scorecard')
        setManOfTheMatch('')
      } else {
        setError('Please upload a valid PDF file')
        setUploadedFile(null)
      }
    }
  }

  const handleUpload = async () => {
    if (!uploadedFile) {
      setError('Please select a file first')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', uploadedFile)

      const res = await fetch('/api/generate-scorecard-pdf', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse PDF')
      }

      setScorecardHTML(data.html)
      if (data.parsed?.matchTitle) {
        setMatchTitle(data.parsed.matchTitle)
      }
      // Pre-fill MOM if the parser detected one
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

    // Inject the user-entered MOM into the HTML before printing
    let finalHTML = scorecardHTML
    if (manOfTheMatch.trim()) {
      finalHTML = scorecardHTML.replace(
        /(<span class="label">MAN OF THE MATCH:<\/span>)\s*[^<]*/,
        `$1 ${manOfTheMatch.trim()}`
      )
    }

    // Update the <title> so the browser uses it as the PDF filename
    finalHTML = finalHTML.replace(
      /<title>[^<]*<\/title>/,
      `<title>${matchTitle}<\/title>`
    )

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(finalHTML)
      printWindow.document.close()
      setTimeout(() => {
        printWindow.print()
      }, 1000)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('border-green-500', 'bg-green-50')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('border-green-500', 'bg-green-50')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('border-green-500', 'bg-green-50')
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (file.type === 'application/pdf') {
        setUploadedFile(file)
        setError('')
        setParsedOk(false)
        setScorecardHTML('')
        setMatchTitle('scorecard')
        setManOfTheMatch('')
      } else {
        setError('Please upload a valid PDF file')
      }
    }
  }

  return (
    <div className="space-y-5 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Upload Section */}
      <Card className="rounded-xl md:rounded-2xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg md:shadow-xl overflow-hidden relative transition-all duration-300">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-400" />
        <CardHeader className="px-4 md:px-6 pb-2 md:pb-4 pt-5 md:pt-6">
          <CardTitle className="text-lg md:text-2xl font-bold text-slate-800">Upload Scorecard PDF</CardTitle>
          <CardDescription className="text-sm md:text-base font-medium">Upload a CricHeroes PDF to generate a scorecard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 md:space-y-6 px-4 md:px-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center gap-3 md:gap-5 rounded-xl md:rounded-2xl border-2 border-dashed border-blue-200/60 bg-white/50 backdrop-blur-sm px-4 md:px-6 py-8 md:py-14 transition-all duration-300 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="p-3 md:p-4 bg-white rounded-full shadow-sm group-hover:scale-110 group-hover:shadow-md transition-transform duration-300">
              <Upload className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
            </div>
            <div className="text-center space-y-0.5">
              <p className="font-bold text-slate-800 text-base md:text-lg">Drag & drop your PDF here</p>
              <p className="text-xs md:text-sm font-medium text-slate-500">or tap to browse</p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              className="hidden"
            />
            <Button
              variant="outline"
              className="mt-1 md:mt-3 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 font-semibold text-sm h-9 md:h-10"
            >
              Browse Files
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {uploadedFile && !parsedOk && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-blue-50/80 p-3 md:p-5 shadow-sm animate-in zoom-in-95 duration-300">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-3 bg-white rounded-xl shadow-sm">
                  <FileText className="h-5 w-5 md:h-6 md:w-6 text-indigo-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm md:text-base truncate max-w-[200px] sm:max-w-none">{uploadedFile.name}</p>
                  <p className="text-sm font-medium text-slate-500">
                    {(uploadedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center p-3">
                  <Spinner className="h-6 w-6 text-indigo-600" />
                </div>
              ) : (
                <Button
                  onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all w-full sm:w-auto"
                  size="lg"
                >
                  Parse PDF
                </Button>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500">
            ✓ Supports CricHeroes cricket scorecard PDFs
            <br />✓ Maximum file size: 10 MB
          </p>
        </CardContent>
      </Card>

      {/* After parse: MOM input + Download */}
      {parsedOk && (
        <Card className="rounded-xl md:rounded-2xl border-white/40 bg-white/60 backdrop-blur-xl shadow-lg md:shadow-xl overflow-hidden relative animate-in slide-in-from-bottom-6 fade-in duration-700">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />
          <CardHeader className="px-4 md:px-6 pb-2 md:pb-4 pt-5 md:pt-6">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-emerald-100/50 rounded-full">
                <CheckCircle2 className="h-5 w-5 md:h-6 md:w-6 text-emerald-600" />
              </div>
              <CardTitle className="text-lg md:text-2xl font-bold text-emerald-900 tracking-tight">PDF Parsed Successfully</CardTitle>
            </div>
            <CardDescription className="text-sm md:text-base font-medium pl-9 md:pl-11">Enter Man of the Match and download</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6 px-4 md:px-6">
            <div className="space-y-1.5">
              <Label htmlFor="mom-input" className="font-bold text-slate-800 text-sm ml-0.5">
                Man of the Match
              </Label>
              <Input
                id="mom-input"
                placeholder="e.g. Chetan Govekar given by Bala Sawant"
                value={manOfTheMatch}
                onChange={(e) => setManOfTheMatch(e.target.value)}
                className="text-sm md:text-base bg-white/80 border-emerald-200 focus-visible:ring-emerald-400 rounded-lg md:rounded-xl h-10 md:h-12 shadow-sm font-medium transition-all"
              />
            </div>

            <Button
              onClick={handleDownloadPDF}
              className="w-full bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white text-base md:text-lg font-bold py-4 md:py-6 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
              size="lg"
            >
              <Download className="mr-2 h-6 w-6 group-hover:animate-bounce" />
              Download Final Scorecard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
