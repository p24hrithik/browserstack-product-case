import express from 'express'
import cors from 'cors'

import { GoogleGenAI } from "@google/genai";

console.log(
  "OPENAI KEY CHECK:",
  process.env.OPENAI_API_KEY?.slice(0, 7)
);


// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const ai = new GoogleGenAI({});

const app = express()
app.use(cors())
app.use(express.json())

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

/**
 * -----------------------------
 * Helper: clean + parse LLM JSON
 * -----------------------------
 */
function safeJsonParse(text) {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch (e) {
    console.error('❌ LLM JSON parse failed:\n', cleaned)
    throw new Error('LLM returned invalid JSON')
  }
}

/**
 * -----------------------------
 * Normalize initiatives
 * (must align with frontend)
 * -----------------------------
 */
function normalizeInitiatives(raw = []) {
  return raw.map((i, idx) => ({
    id: Number.isFinite(i.id) ? i.id : Date.now() + idx,
    title: String(i.title || `Task ${idx + 1}`),
    effortManDays: Number(i.effortManDays) || 0,
    week: Number(i.week) || 1,
    okr: String(i.okr || 'Unassigned'),
    taskDependencies: Array.isArray(i.taskDependencies)
      ? i.taskDependencies
      : [],
    teamDependencies: Array.isArray(i.teamDependencies)
      ? i.teamDependencies
      : []
  }))
}

/**
 * -----------------------------
 * POST /ai/generate-roadmap
 * -----------------------------
 */
app.post('/ai/generate-roadmap', async (req, res) => {
  try {
    const { okrs, context = {}, constraints = {} } = req.body

    const {
      organisation = '',
      team = '',
      goal = '',
      additionalContext = ''
    } = context

    const {
      manDays = 0,
      timelineWeeks = 1,
      startDate = ''
    } = constraints

    if (!Array.isArray(okrs) || okrs.length === 0) {
      return res.status(400).json({ error: 'At least one OKR is required' })
    }
    const weeklyCapacity = manDays / timelineWeeks

    const prompt = `
    You are an expert product manager creating a REALISTIC execution roadmap.
First, create initiatives for each OKR. Then estimate efforts for each item,
and as per the priority order of the OKRs, create the roadmap. Map each initiative to a week.

Generate a weekly product roadmap as STRICT JSON ONLY.
No markdown. No explanations outside JSON.

Context:
- Organisation: ${organisation}
- Team: ${team}
- Overarching goal: ${goal}
- Additional context: ${additionalContext}

OKRs:
${okrs.map(o => `- ${o}`).join('\n')}

Constraints:
- Total man-days available: ${manDays}
- Timeline (weeks): ${timelineWeeks}
- Start date: ${startDate}

Rules:
- Break work into realistic initiatives
- Effort must be in man-days (integers, realistic)
- Assign each initiative to ONE OKR
- Include dependencies where relevant
- Do NOT exceed total effort
- Weeks may be reused by multiple initiatives
- Output ONLY valid JSON
- Do NOT invent or rename OKRs
- Every initiative must map to an OKR EXACTLY
- Ensure that initiatives are contextual to the OKR and realistic
- Weeks must be 1..${timelineWeeks}
- NEVER exceed weekly capacity (${weeklyCapacity.toFixed(1)} MD) while mapping initiatives to weeks
- Higher-priority OKRs consume capacity first - ENSURE THIS ALWAYS
- If work doesn't fit, move it to later weeks
- Effort estimates must be realistic and independent of capacity.
- Do NOT reduce effort to fit the timeline.
- If work exceeds capacity, spill to backlog.
- Weeks must not be empty if there is backlog, if an item cannot be accommodated, follow the next rule.
- If a task exceeds maximum capacity in a week, split it into two parts and accommodate the spillover in the next week.
- All initiatives that are prerequisites for an initiative must be added to taskDependencies. Add the name of the initiative instead of the id.
- Assume current team to be ${team}. All teams outside of the current team must be listed under the teamDependencies. Add the names of the external teams here.



Schema:
{
  "initiatives": [
    {
      "id": number,
      "title": string,
      "effortManDays": number,
      "week": number,
      "okr": string,
      "taskDependencies": string[],
      "teamDependencies": string[]
    }
  ]
}
`

    const aiRes = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    // const aiRes = await ai.models.generateContent({
    //   model: "gemini-2.5-flash",
    //   contents: prompt,
    // });
    // console.log(aiRes)
    const raw = await aiRes.json()
    console.log(JSON.stringify(raw, null, 2));

    const content = raw.choices[0].message.content

    if (!content) {
      throw new Error('Empty response from OpenAI')
    }

    const parsed = safeJsonParse(content)
    const initiatives = normalizeInitiatives(parsed.initiatives)

    res.json({ initiatives })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      error: err.message || 'Failed to generate roadmap'
    })
  }
})

/**
 * -----------------------------
 * POST /ai/modify-roadmap
 * -----------------------------
 */
app.post('/ai/modify-roadmap', async (req, res) => {
  try {
    const {
      command,
      initiatives = [],
      okrs = [],
      context = {},
      constraints = {}
    } = req.body

    const {
      organisation = '',
      team = '',
      goal = '',
      additionalContext = ''
    } = context

    const {
      manDays = 0,
      timelineWeeks = 1,
      startDate = ''
    } = constraints

    if (!command) {
      return res.status(400).json({ error: 'Command is required' })
    }

    const prompt = `
You are an expert product manager.

Modify the existing roadmap based on the user instruction.
Return valid JSON only strictly.
Do not use markdown.

Context:
- Organisation: ${organisation}
- Team: ${team}
- Overarching goal: ${goal}
- Additional context: ${additionalContext}

Constraints:
- Total man-days: ${manDays}
- Timeline weeks: ${timelineWeeks}
- Start date: ${startDate}

User instruction:
"${command}"

Rules:
- Preserve initiative IDs unless splitting
- Respect effort realism
- Maintain OKR alignment
- Do NOT exceed total effort
- Dependencies must remain arrays

Existing roadmap:
${JSON.stringify(initiatives, null, 2)}

Schema:
{
  "initiatives": [
    {
      "id": number,
      "title": string,
      "effortManDays": number,
      "week": number,
      "okr": string,
      "taskDependencies": string[],
      "teamDependencies": string[]
    }
  ]
}
`

    // const aiRes = await fetch(OPENAI_URL, {
    //   method: 'POST',
    //   headers: {
    //     Authorization: `Bearer ${OPENAI_API_KEY}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     model: 'gpt-4o-mini',
    //     temperature: 0.3,
    //     messages: [{ role: 'user', content: prompt }]
    //   })
    // })

    const aiRes = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    
    // const aiRes = await ai.models.generateContent({
    //   model: "gemini-2.5-flash",
    //   contents: prompt,
    // });

    const raw = await aiRes.json()
    console.log(JSON.stringify(raw, null, 2));

    const content = raw.choices[0].message.content

    if (!content) {
      throw new Error('Empty response from OpenAI')
    }

    const parsed = safeJsonParse(content)
    const updated = normalizeInitiatives(parsed.initiatives)

    res.json({ initiatives: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      error: err.message || 'Failed to modify roadmap'
    })
  }
})

/**
 * -----------------------------
 * Server
 * -----------------------------
 */
app.listen(3000, () => {
  console.log('AI Roadmap backend running on http://localhost:3000')
})