import { NextResponse } from "next/server";

// ─── Types ───────────────────────────────────────────────────────────
interface BatterParsed {
    name: string;
    status: string;
    runs: string;
    balls: string;
    minutes: string;
    fours: string;
    sixes: string;
    sr: string;
}

interface BowlerParsed {
    name: string;
    overs: string;
    maidens: string;
    runs: string;
    wickets: string;
    dots: string;
    fours: string;
    sixes: string;
    wd: string;
    nb: string;
    eco: string;
}

interface FowEntry {
    score: string;
    wicket: string;
    batsman: string;
    over: string;
}

interface InningParsed {
    teamName: string;
    score: string;
    overs: string;
    inningsLabel: string;
    bowlingTeamLabel: string;
    batting: BatterParsed[];
    bowling: BowlerParsed[];
    extras: { text: string; total: string };
    totalSummary: string;
    totalScore: string;
    yetToBat: string[];
    fow: FowEntry[];
}

interface ParsedMatch {
    tournamentName: string;
    matchTitle: string;
    date: string;
    time: string;
    matchOvers: string;
    matchResult: string;
    manOfTheMatch: string;
    innings: InningParsed[];
}

// ─── Name Cleaning Utility ──────────────────────────────────────────
function cleanPlayerName(name: string): string {
    if (!name) return "";

    // 1. Strip technical indicators and their parentheses
    // Removing (RHB), (LHB), (c), (wk), etc.
    let cleaned = name.replace(/\((RHB|LHB|RH|LH|c|wk|c & wk|C|WK|RH|LH)\)/gi, "");
    // Strip standalone (c) or (wk) or RHB that might linger
    cleaned = cleaned.replace(/\s+(c|wk|RHB|LHB|RH|LH)\s+/gi, " ");
    // Strip RHB/LHB at the end
    cleaned = cleaned.replace(/\s+(RHB|LHB|RH|LH)$/gi, "");

    return cleaned.split(/\s+/).filter(Boolean).join(" ").trim();
}

// ─── PDF Text Parser ─────────────────────────────────────────────────

function parseMatchFromText(text: string): ParsedMatch {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    let tournamentName = "Cricket Match";
    let date = "N/A";
    let time = "N/A";
    let matchResult = "N/A";
    let matchOvers = "20 Overs";
    let matchTitle = "Team A vs Team B";
    let manOfTheMatch = "N/A";

    // Tournament Detection
    for (const line of lines) {
        if (line.includes("EAGLE PREMIER LEAGUE")) {
            tournamentName = line;
            break;
        }
    }

    // Date/Time Detection (Look for the "Date" line)
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().startsWith("date") && i + 1 < lines.length) {
            // Line might be: "2026-03-15, 04:20 AM UTC"
            const dateLine = lines[i + 1];
            const match = dateLine.match(/(\d{4}-\d{2}-\d{2}),?\s*(\d{2}:\d{2}\s*\w+)/i);
            if (match) {
                date = match[1];
                time = match[2];
            }
        }
        if (lines[i].toLowerCase() === "result" && i + 1 < lines.length) {
            matchResult = lines[i + 1];
        }
        if (lines[i].toLowerCase() === "match" && i + 1 < lines.length) {
            // Following lines are often Team 1 vs Team 2
            let t1 = lines[i + 1].replace(/vs/i, "").trim();
            let t2 = i + 2 < lines.length ? lines[i + 2].trim() : "Team B";
            matchTitle = `${t1} V/S ${t2}`;
        }
        if (lines[i].toLowerCase().includes("total") && i + 1 < lines.length) {
            const ovMatch = lines[i + 1].match(/\((\d+\.?\d*)\s*Ov\)/i);
            if (ovMatch) matchOvers = `${ovMatch[1]} Overs`;
        }
    }

    const inningsArray: InningParsed[] = [];
    const inningsHeaderRegex = /^(.+?)\s+(\d+\/\d+)\s*\((\d+\.?\d*)\s*Ov\)\s*\((\w+\s*Innings)\)/i;

    let currentInning: InningParsed | null = null;
    let section: "none" | "batting" | "bowling" | "fow" | "tobat" | "extras" = "none";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for innings header
        const inningsMatch = inningsHeaderRegex.exec(line);
        if (inningsMatch) {
            if (currentInning) inningsArray.push(currentInning);

            const battingTeam = inningsMatch[1].trim();

            currentInning = {
                teamName: battingTeam,
                score: inningsMatch[2],
                overs: inningsMatch[3],
                inningsLabel: inningsMatch[4],
                bowlingTeamLabel: "", // Will be set after all innings are parsed
                batting: [],
                bowling: [],
                extras: { text: "", total: "0" },
                totalSummary: "",
                totalScore: "",
                yetToBat: [],
                fow: [],
            };
            section = "none";
            continue;
        }

        if (!currentInning) continue;

        if (line.match(/^No\s+Batsman/i)) { section = "batting"; continue; }
        if (line.match(/^No\s+Bowler/i)) { section = "bowling"; continue; }
        if (line.match(/^Fall of Wickets/i)) { section = "fow"; continue; }
        if (line.match(/^To Bat:/i)) {
            section = "none";
            currentInning.yetToBat = line.replace(/To Bat:\s*/i, "").split(",").map(n => n.trim()).filter(Boolean);
            continue;
        }
        if (line.startsWith("Extras:")) {
            section = "extras";
            const m = line.match(/Extras:\s*\((.+)\)\s*(\d*)/i);
            if (m) {
                currentInning.extras.text = m[1];
                currentInning.extras.total = m[2] || "0";
            }
            continue;
        }
        if (line.startsWith("Total:")) {
            currentInning.totalSummary = line;
            const m = line.match(/Wickets\s+\d+\s*(\d+)/i);
            if (m) currentInning.totalScore = m[1];
            section = "none";
            continue;
        }

        if (section === "batting") {
            const parts = line.split(/\s+/);
            if (parts.length >= 8 && /^\d+$/.test(parts[0])) {
                const stats: string[] = [];
                let sr = "";
                let foundSR = false;

                for (let j = parts.length - 1; j >= 0; j--) {
                    if (!foundSR && parts[j].includes(".")) {
                        sr = parts[j];
                        foundSR = true;
                        continue;
                    }
                    if (foundSR && stats.length < 5 && /^\d+$/.test(parts[j])) {
                        stats.unshift(parts[j]);
                    } else if (foundSR && stats.length === 5) {
                        break;
                    }
                }

                if (stats.length === 5) {
                    const nameParts = [];
                    const statusParts = [];
                    let statusStarted = false;
                    const statusKeyWords = ["c", "b", "st", "lbw", "run", "not", "retired", "hit", "†"];

                    const statsStartIndex = parts.lastIndexOf(stats[0], parts.length - 6);

                    for (let j = 1; j < parts.length; j++) {
                        if (j === statsStartIndex) break;

                        if (!statusStarted && (statusKeyWords.includes(parts[j].toLowerCase()) || parts[j].startsWith("c") && parts[j].length > 1 && statusKeyWords.includes(parts[j][0].toLowerCase()))) {
                            statusStarted = true;
                        }

                        if (statusStarted) statusParts.push(parts[j]);
                        else nameParts.push(parts[j]);
                    }

                    currentInning.batting.push({
                        name: cleanPlayerName(nameParts.join(" ")),
                        status: statusParts.join(" ") || "not out",
                        runs: stats[0],
                        balls: stats[1],
                        minutes: stats[2],
                        fours: stats[3],
                        sixes: stats[4],
                        sr: sr
                    });
                }
            }
        }

        if (section === "bowling") {
            const parts = line.split(/\s+/);
            if (parts.length >= 11 && /^\d+$/.test(parts[0])) {
                const stats: string[] = [];
                let eco = "";
                let foundEco = false;

                for (let j = parts.length - 1; j >= 0; j--) {
                    if (!foundEco && parts[j].includes(".")) {
                        eco = parts[j];
                        foundEco = true;
                        continue;
                    }
                    if (foundEco && stats.length < 9 && /^[\d.]+$/.test(parts[j])) {
                        stats.unshift(parts[j]);
                    } else if (foundEco && stats.length === 9) {
                        break;
                    }
                }

                if (stats.length === 9) {
                    const nameParts = [];
                    for (let j = 1; j < parts.length; j++) {
                        if (parts[j] === stats[0]) break;
                        nameParts.push(parts[j]);
                    }

                    currentInning.bowling.push({
                        name: cleanPlayerName(nameParts.join(" ")),
                        overs: stats[0],
                        maidens: stats[1],
                        runs: stats[2],
                        wickets: stats[3],
                        dots: stats[4],
                        fours: stats[5],
                        sixes: stats[6],
                        wd: stats[7],
                        nb: stats[8],
                        eco: eco
                    });
                }
            }
        }

        if (section === "fow") {
            const entryRegex = /(\d+)-(\d+)\s*\(([^,]+),\s*([\d.]+)\s*ov\)/gi;
            let m;
            while ((m = entryRegex.exec(line)) !== null) {
                currentInning.fow.push({ score: m[1], wicket: m[2], batsman: m[3].trim(), over: m[4] });
            }
        }
    }

    if (currentInning) inningsArray.push(currentInning);

    // Cross-assign bowling team labels, and derive match title from innings
    if (inningsArray.length >= 2) {
        inningsArray[0].bowlingTeamLabel = inningsArray[1].teamName;
        inningsArray[1].bowlingTeamLabel = inningsArray[0].teamName;
        matchTitle = `${inningsArray[0].teamName} V/S ${inningsArray[1].teamName}`;
    } else if (inningsArray.length === 1) {
        inningsArray[0].bowlingTeamLabel = "OPPOSITION";
        matchTitle = inningsArray[0].teamName;
    }

    // Man of the Match detection (usually in Match Officials or end of text)
    const momMatch = text.match(/Man\s+of\s+the\s+Match:?\s+([^\n\(\)]+)/i);
    if (momMatch) manOfTheMatch = momMatch[1].trim();

    return {
        tournamentName,
        matchTitle,
        date,
        time,
        matchOvers,
        matchResult,
        manOfTheMatch,
        innings: inningsArray
    };
}

// ─── HTML Generator (Python-Style Layout) ─────────────────────────────
function generateScorecardHTML(parsed: ParsedMatch): string {
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Official Match Report</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap');
        @page { size: A4; margin: 0; }
        body {
            font-family: 'Roboto', sans-serif;
            margin: 0;
            padding: 20px 30px;
            color: #111;
            background-color: #fff;
            box-sizing: border-box;
        }
        .container { max-width: 100%; margin: 0 auto; }
        .header {
            text-align: center;
            margin-bottom: 10px;
            text-transform: uppercase;
            border-bottom: 3px solid #000;
            padding-bottom: 10px;
        }
        .header h1 { margin: 0 0 5px 0; font-size: 24px; font-weight: 900; letter-spacing: 1px; }
        .header h2 { margin: 0; font-size: 16px; font-weight: 500; color: #333; }
        .meta-section {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 15px;
            padding: 10px;
            background-color: #f4f4f4 !important;
            border: 2px solid #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .match-title {
            text-align: center;
            font-size: 18px;
            font-weight: 900;
            margin: 15px 0;
            padding: 10px;
            border: 2px solid #000;
            background-color: #fff;
            box-shadow: 3px 3px 0px #000;
        }
        .inning-section { margin-bottom: 20px; }
        .inning-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: #000 !important;
            color: #fff !important;
            font-size: 16px;
            font-weight: 900;
            margin-bottom: 0;
            border: 2px solid #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th {
            background-color: #e0e0e0 !important;
            color: #000;
            padding: 6px;
            text-align: center;
            font-weight: 800;
            font-size: 12px;
            text-transform: uppercase;
            border: 2px solid #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        td {
            padding: 6px;
            text-align: center;
            border: 2px solid #000;
            font-size: 14px;
            font-weight: 700;
        }
        .col-no { width: 40px; color: #444; font-size: 12px; }
        .col-name {
            text-align: left;
            padding-left: 10px;
            font-size: 14px;
            font-weight: 800;
            width: 45%;
        }
        .bowling-header {
            font-size: 14px;
            font-weight: 900;
            margin: 15px 0 5px 0;
            text-transform: uppercase;
            padding-left: 10px;
            border-left: 5px solid #000;
            line-height: 1;
        }
        .footer { margin-top: 20px; padding-top: 15px; }
        .footer-row {
            font-size: 14px;
            font-weight: 900;
            margin-bottom: 10px;
            padding: 10px;
            background: #f4f4f4;
            border: 2px solid #000;
        }
        .label { font-weight: 700; color: #555; margin-right: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Match Scorecard</h1>
            <h2>${parsed.tournamentName}</h2>
        </div>
        <div class="meta-section">
            <span>DATE: ${parsed.date}</span>
            <span>TIME: ${parsed.time}</span>
            <span>MATCH: ${parsed.matchOvers}</span>
        </div>
        <div class="match-title">${parsed.matchTitle}</div>`;

    for (const inn of parsed.innings) {
        // Sort batsmen by runs descending, then balls ascending (tie-breaker)
        const topBatsmen = [...inn.batting].sort((a, b) => {
            const runsA = parseInt(a.runs) || 0;
            const runsB = parseInt(b.runs) || 0;
            if (runsB !== runsA) return runsB - runsA;
            return (parseInt(a.balls) || 0) - (parseInt(b.balls) || 0);
        }).slice(0, 3);

        // Sort bowlers by wickets descending, then runs ascending (tie-breaker)
        const topBowlers = [...inn.bowling].sort((a, b) => {
            const wktsA = parseInt(a.wickets) || 0;
            const wktsB = parseInt(b.wickets) || 0;
            if (wktsB !== wktsA) return wktsB - wktsA;
            return (parseFloat(a.runs) || 0) - (parseFloat(b.runs) || 0);
        }).slice(0, 3);

        html += `
        <div class="inning-section">
            <div class="inning-header">
                <span>${inn.teamName}</span>
                <span>${inn.score} (${inn.overs} Ov)</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th class="col-no">No</th>
                        <th class="col-name">BATSMAN</th>
                        <th>RUNS (BALLS)</th>
                        <th>6S</th>
                        <th>4S</th>
                    </tr>
                </thead>
                <tbody>`;

        for (let idx = 0; idx < 3; idx++) {
            if (idx < topBatsmen.length) {
                const b = topBatsmen[idx];
                html += `
                    <tr>
                        <td class="col-no">0${idx + 1}</td>
                        <td class="col-name">${b.name}</td>
                        <td>${b.runs} (${b.balls})</td>
                        <td>${b.sixes}</td>
                        <td>${b.fours}</td>
                    </tr>`;
            } else {
                html += `
                    <tr>
                        <td class="col-no">0${idx + 1}</td>
                        <td class="col-name">&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                    </tr>`;
            }
        }

        html += `
                </tbody>
            </table>
            <div class="bowling-header">Bowling of: ${inn.bowlingTeamLabel || "OPPOSITION"}</div>
            <table>
                <thead>
                    <tr>
                        <th class="col-no">No</th>
                        <th class="col-name">BOWLER</th>
                        <th>OVERS</th>
                        <th>RUNS</th>
                        <th>WKTS</th>
                    </tr>
                </thead>
                <tbody>`;

        for (let idx = 0; idx < 3; idx++) {
            if (idx < topBowlers.length) {
                const b = topBowlers[idx];
                html += `
                    <tr>
                        <td class="col-no">0${idx + 1}</td>
                        <td class="col-name">${b.name}</td>
                        <td>${b.overs}</td>
                        <td>${b.runs}</td>
                        <td>${b.wickets}</td>
                    </tr>`;
            } else {
                html += `
                    <tr>
                        <td class="col-no">0${idx + 1}</td>
                        <td class="col-name">&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                    </tr>`;
            }
        }

        html += `
                </tbody>
            </table>
        </div>`;
    }

    html += `
        <div class="footer">
            <div class="footer-row"><span class="label">RESULT:</span> ${parsed.matchResult}</div>
            <div class="footer-row"><span class="label">MAN OF THE MATCH:</span> ${cleanPlayerName(parsed.manOfTheMatch)}</div>
        </div>
    </div>
</body>
</html>`;
    return html;
}

// ─── API Route ───────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Custom Pagerender to preserve spaces accurately
        const options = {
            pagerender: function (pageData: any) {
                return pageData.getTextContent()
                    .then(function (textContent: any) {
                        let lastX: number | undefined, lastY: number | undefined, lastWidth: number | undefined;
                        let text = '';

                        // Sort items by Y descending (top to bottom), then X ascending (left to right)
                        const items = [...textContent.items].sort((a: any, b: any) => {
                            const yDiff = b.transform[5] - a.transform[5];
                            if (Math.abs(yDiff) > 1) return yDiff;
                            return a.transform[4] - b.transform[4];
                        });

                        for (let item of items) {
                            const currentX = item.transform[4];
                            const currentY = item.transform[5];
                            const currentStr = item.str;

                            if (lastY !== undefined && Math.abs(lastY - currentY) < 1) {
                                // Same line: check horizontal gap
                                // pdf.js items usually have a 'width' or we can estimate it
                                // Some systems don't provide width, so we fall back to a small constant if missing
                                const gap = currentX - (lastX! + (lastWidth || 0));

                                // If gap is significant (> 2 units), add a space
                                if (gap > 2) {
                                    text += ' ' + currentStr;
                                } else {
                                    text += currentStr;
                                }
                            } else {
                                // New line
                                if (text !== '') text += '\n';
                                text += currentStr;
                            }

                            lastX = currentX;
                            lastY = currentY;
                            lastWidth = item.width; // PDF.js provides this in points
                        }
                        return text;
                    });
            }
        };

        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(buffer, options);
        const rawText = pdfData.text;

        const parsed = parseMatchFromText(rawText);
        const scorecardHTML = generateScorecardHTML(parsed);

        return NextResponse.json({ success: true, parsed, html: scorecardHTML, rawText });
    } catch (error: any) {
        console.error("PDF Parse Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
