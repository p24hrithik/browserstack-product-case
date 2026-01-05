// AI Roadmap — Fully Customisable Weekly Planning Prototype (v2 locked)

import React, { useState, useMemo } from 'react'
import { Sparkles, ArrowUp, ArrowDown, X, RefreshCcw, Plus } from 'lucide-react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'

const API_BASE = 'http://localhost:3000'
const MAX_WEEKS = 26

interface Initiative {
  id: number
  title: string
  effortManDays: number
  week: number
  okr: string
  taskDependencies: string[]
  teamDependencies: string[]
}

interface Okr {
  id: number
  text: string
}

async function safeFetch<T>(url: string, options: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// PURE data normaliser — no JSX here
function normaliseInitiatives(raw: any[]): Initiative[] {
  return (raw || []).map((i, idx) => ({
    id: Number.isFinite(i.id) ? i.id : Date.now() + idx,
    title: String(i.title || `Task ${idx + 1}`),
    effortManDays: Math.round(Number(i.effortManDays) || 0),
    week: Number(i.week) || 1,
    okr: String(i.okr || 'Unassigned'),
    taskDependencies: Array.isArray(i.taskDependencies) ? i.taskDependencies : [],
    teamDependencies: Array.isArray(i.teamDependencies) ? i.teamDependencies : []
  }))
}

export default function AiRoadmapPrototype() {
  const [initiatives, setInitiatives] = useState<Initiative[]>([])
  const [okrs, setOkrs] = useState<Okr[]>([
    { id: 1, text: 'Increase paid conversion by 15%' }
  ])

  const [startDate, setStartDate] = useState('')
  const [teamName, setTeamName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [roadmapGoal, setRoadmapGoal] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')

  const [timelineWeeks, setTimelineWeeks] = useState<number>(12)
  const [manDays, setManDays] = useState<number>(50)

  const [command, setCommand] = useState<string>('')
  const [commandLoading, setCommandLoading] = useState<boolean>(false)
  const [generateLoading, setGenerateLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const safeWeeks = Number.isFinite(timelineWeeks) && timelineWeeks > 0 ? timelineWeeks : 1
  const weeklyCapacity = manDays / safeWeeks

  const schedule = useMemo(() => {
    const byWeek: Record<number, Initiative[]> = {}
    const backlog: Initiative[] = []
    // backlogByOkr removed – reverting to pre-alert v2
    

    for (let w = 1; w <= safeWeeks; w++) byWeek[w] = []

    const sorted = [...initiatives].sort((a, b) => a.week - b.week || a.id - b.id)

    for (const item of sorted) {
      let remaining = item.effortManDays
      let w = Math.max(1, item.week)

      while (remaining > 0 && w <= safeWeeks) {
        const used = byWeek[w].reduce((s, i) => s + i.effortManDays, 0)
        const capacityLeft = weeklyCapacity - used
        if (capacityLeft <= 0) {
          w++
          continue
        }
        const effortThisWeek = Math.min(remaining, capacityLeft)
        byWeek[w].push({ ...item, effortManDays: effortThisWeek, week: w })
        remaining -= effortThisWeek
        w++
      }

      if (remaining > 0) {
        backlog.push(item)
        // no-op (pre-alert v2)
      }
    }

    return { byWeek, backlog }
  }, [initiatives, safeWeeks, weeklyCapacity])

  function onDragEnd(event: any) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setInitiatives(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id)
      const newIndex = prev.findIndex(i => i.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  async function generateRoadmap() {
    setGenerateLoading(true)
    setError(null)
    try {
      const data = await safeFetch<any>(`${API_BASE}/ai/generate-roadmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          okrs: okrs.map(o => o.text),
          context: { organisation: orgName, team: teamName, goal: roadmapGoal, additionalContext },
          constraints: { manDays, timelineWeeks: safeWeeks, startDate }
        })
      })
      setInitiatives(normaliseInitiatives(data.initiatives))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerateLoading(false)
    }
  }

  async function applyAiInstruction() {
    setCommandLoading(true)
    setError(null)
    try {
      const data = await safeFetch<any>(`${API_BASE}/ai/modify-roadmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          initiatives,
          okrs: okrs.map(o => o.text),
          context: { organisation: orgName, team: teamName, goal: roadmapGoal, additionalContext },
          constraints: { manDays, timelineWeeks: safeWeeks, startDate }
        })
      })
      setInitiatives(normaliseInitiatives(data.initiatives))
      setCommand('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCommandLoading(false)
    }
  }

  return (
    <div className="h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-96 p-4 bg-white border-r overflow-auto">
        <div className="flex items-center gap-2 font-semibold mb-4">
          <Sparkles className="h-5 w-5" /> GoalStack
        </div>

        {/* OKRs */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">OKRs</div>
          {okrs.map((o, idx) => (
            <div key={o.id} className="flex items-center gap-2 mb-1">
              <input
                className="flex-1 border rounded p-1 text-sm"
                value={o.text}
                onChange={e => setOkrs(prev => prev.map(x => (x.id === o.id ? { ...x, text: e.target.value } : x)))}
              />
              
              <button disabled={idx === 0} onClick={() => setOkrs(prev => { const a=[...prev]; [a[idx-1],a[idx]]=[a[idx],a[idx-1]]; return a })}><ArrowUp className="h-4 w-4" /></button>
              <button disabled={idx === okrs.length - 1} onClick={() => setOkrs(prev => { const a=[...prev]; [a[idx],a[idx+1]]=[a[idx+1],a[idx]]; return a })}><ArrowDown className="h-4 w-4" /></button>
              <button onClick={() => { setOkrs(prev => prev.filter(x => x.id !== o.id)); setInitiatives(prev => prev.filter(i => i.okr !== o.text)) }}><X className="h-4 w-4 text-slate-400 hover:text-red-500" /></button>
            </div>
          ))}
          <button className="mt-2 w-full flex items-center justify-center gap-2 border rounded p-2 text-sm" onClick={() => setOkrs(prev => [...prev, { id: Date.now(), text: 'New OKR' }])}><Plus className="h-4 w-4" /> Add OKR</button>
        </div>

        {/* Context */}
        <div className="space-y-2 text-sm mb-4">
          <label>Organisation</label>
          <input className="border p-2 w-full" value={orgName} onChange={e => setOrgName(e.target.value)} />
          <label>Team</label>
          <input className="border p-2 w-full" value={teamName} onChange={e => setTeamName(e.target.value)} />
          <label>Roadmap goal</label>
          <input className="border p-2 w-full" value={roadmapGoal} onChange={e => setRoadmapGoal(e.target.value)} />
          <label>Additional context</label>
          <textarea className="border p-2 w-full" rows={3} value={additionalContext} onChange={e => setAdditionalContext(e.target.value)} />
        </div>

        {/* Constraints */}
        <div className="space-y-2 text-sm mb-4">
          <label>Start date</label>
          <input type="date" className="border p-2 w-full" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <label>Timeline (weeks)</label>
          <input type="number" min={1} max={MAX_WEEKS} className="border p-2 w-full" value={timelineWeeks} onChange={e => setTimelineWeeks(Number(e.target.value))} />
          <label>Total man-days</label>
          <input type="number" className="border p-2 w-full" value={manDays} onChange={e => setManDays(Number(e.target.value))} />
        </div>

        <button className="border p-2 w-full flex items-center justify-center gap-2" onClick={generateRoadmap} disabled={generateLoading}>
          {generateLoading && <RefreshCcw className="h-4 w-4 animate-spin" />}
          Generate roadmap
        </button>

        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}

        {/* AI instruction */}
        <textarea className="border rounded p-2 w-full mt-4" placeholder="Tell AI what to change" value={command} onChange={e => setCommand(e.target.value)} />
        <button className="border p-2 w-full mt-2" onClick={applyAiInstruction} disabled={commandLoading}>
          {commandLoading && <RefreshCcw className="h-4 w-4 animate-spin inline" />} Apply AI instruction
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-auto">
        <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          {Object.entries(schedule.byWeek).map(([w, items]) => (
            <div key={w} className="mb-4 bg-white border rounded p-3">
              <div className="font-semibold mb-2">Week {w}</div>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {items.map(i => (
                  <div key={i.id} className="border rounded p-2 mb-1">
                    <input
                      className="border p-1 w-full text-sm"
                      value={i.title}
                      onChange={e => setInitiatives(prev => prev.map(x => (x.id === i.id ? { ...x, title: e.target.value } : x)))}
                    />
                    <div className="flex gap-2 mt-1">
                      <input
                        type="number"
                        className="border p-1 w-20"
                        value={i.effortManDays}
                        onChange={e => setInitiatives(prev => prev.map(x => (x.id === i.id ? { ...x, effortManDays: Number(e.target.value) } : x)))}
                      />
                      <div className="text-xs text-slate-500">{i.okr}</div>
                    </div>
                    <div className="mt-2">
                      <div className="text-[10px] text-slate-500 mb-1">Task dependencies</div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {i.taskDependencies.map((d, idx) => (
                          <span key={idx} className="bg-slate-200 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                            {d}
                            <button onClick={() => setInitiatives(prev => prev.map(x => x.id === i.id ? { ...x, taskDependencies: x.taskDependencies.filter(dep => dep !== d) } : x))}>×</button>
                          </span>
                        ))}
                      </div>
                      <input
                        className="border p-1 w-full text-xs"
                        placeholder="Add task dependency + Enter"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const val = (e.target as HTMLInputElement).value.trim()
                            if (!val) return
                            setInitiatives(prev => prev.map(x => x.id === i.id ? { ...x, taskDependencies: [...new Set([...x.taskDependencies, val])] } : x))
                            ;(e.target as HTMLInputElement).value = ''
                          }
                        }}
                      />
                    </div>
                    <div className="mt-2">
                      <div className="text-[10px] text-slate-500 mb-1">Team dependencies</div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {i.teamDependencies.map((d, idx) => (
                          <span key={idx} className="bg-indigo-100 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                            {d}
                            <button onClick={() => setInitiatives(prev => prev.map(x => x.id === i.id ? { ...x, teamDependencies: x.teamDependencies.filter(dep => dep !== d) } : x))}>×</button>
                          </span>
                        ))}
                      </div>
                      <input
                        className="border p-1 w-full text-xs"
                        placeholder="Add team dependency + Enter"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const val = (e.target as HTMLInputElement).value.trim()
                            if (!val) return
                            setInitiatives(prev => prev.map(x => x.id === i.id ? { ...x, teamDependencies: [...new Set([...x.teamDependencies, val])] } : x))
                            ;(e.target as HTMLInputElement).value = ''
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </SortableContext>
            </div>
          ))}
        </DndContext>

        {/* Backlog */}
        <div className="mt-6">
          <div className="font-semibold mb-2">Backlog</div>
          {schedule.backlog.length === 0 && <div className="text-xs text-slate-400">No backlog items</div>}
          {schedule.backlog.map(i => (
            <div key={i.id} className="border rounded p-2 mb-2 bg-white">
              <input
                className="border p-1 w-full text-sm"
                value={i.title}
                onChange={e => setInitiatives(prev => prev.map(x => (x.id === i.id ? { ...x, title: e.target.value } : x)))}
              />
              <div className="flex gap-2 mt-1">
                <input
                  type="number"
                  className="border p-1 w-20"
                  value={i.effortManDays}
                  onChange={e => setInitiatives(prev => prev.map(x => (x.id === i.id ? { ...x, effortManDays: Number(e.target.value) } : x)))}
                />
                <div className="text-xs text-slate-500">{i.okr}</div>
              </div>
              <div className="mt-2">
                <div className="text-[10px] text-slate-500 mb-1">Task dependencies</div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {i.taskDependencies.map((d, idx) => (
                    <span key={idx} className="bg-slate-200 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                      {d}
                      <button onClick={() => setInitiatives(prev => prev.map(x => x.id === i.id ? { ...x, taskDependencies: x.taskDependencies.filter(dep => dep !== d) } : x))}>×</button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-2">
                <div className="text-[10px] text-slate-500 mb-1">Team dependencies</div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {i.teamDependencies.map((d, idx) => (
                    <span key={idx} className="bg-indigo-100 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                      {d}
                      <button onClick={() => setInitiatives(prev => prev.map(x => x.id === i.id ? { ...x, teamDependencies: x.teamDependencies.filter(dep => dep !== d) } : x))}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
