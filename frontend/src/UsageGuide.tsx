import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Search } from 'lucide-react'
import { filterGuideTopics, guideTopicForRoute, guideTopics } from './guide-catalog'
import type { GuideTopic } from './guide-catalog'
import GuideDemo from './GuideDemo'

type Props = { route: string; onNavigate: (route: string) => void }
const views = ['图解演示', '详细说明', '常见问题']

function ChapterContent({ topic }: { topic: GuideTopic }) {
  const [view, setView] = useState(0)
  const [sectionIndex, setSectionIndex] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const section = topic.sections[sectionIndex]
  return <>
    <div className="guide-view-tabs" role="tablist" aria-label="说明阅读区域">{views.map((label, index) => <button key={label} ref={element => { tabs.current[index] = element }} id={`guide-tab-${index}`} role="tab" aria-selected={view === index} aria-controls={`guide-panel-${index}`} tabIndex={view === index ? 0 : -1} onClick={() => setView(index)} onKeyDown={event => {
      let next = index
      if (event.key === 'ArrowRight') next = (index + 1) % views.length
      else if (event.key === 'ArrowLeft') next = (index + views.length - 1) % views.length
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = views.length - 1
      else return
      event.preventDefault(); setView(next); tabs.current[next]?.focus()
    }}>{label}</button>)}</div>
    <div className="guide-view-panel" id="guide-panel-0" role="tabpanel" aria-labelledby="guide-tab-0" hidden={view !== 0}><GuideDemo topicId={topic.id}/></div>
    <div className="guide-view-panel" id="guide-panel-1" role="tabpanel" aria-labelledby="guide-tab-1" hidden={view !== 1}>
      <div className="guide-section-picker" aria-label="详细说明小节">{topic.sections.map((item, index) => <button key={item.title} aria-pressed={sectionIndex === index} onClick={() => setSectionIndex(index)}><span>{String(index + 1).padStart(2, '0')}</span>{item.title}</button>)}</div>
      <section className="guide-section" aria-label={section.title}><h3>{section.title}</h3>{section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        {section.steps && <ol className="guide-steps">{section.steps.map((step, stepIndex) => <li key={step.title}><span className="guide-step-number" aria-hidden="true">{stepIndex + 1}</span><div><h4>{step.title}</h4><p>{step.body}</p></div></li>)}</ol>}
        {section.terms && <dl className="guide-terms">{section.terms.map(term => <div key={term.label}><dt>{term.label}</dt><dd>{term.body}</dd></div>)}</dl>}
      </section>
    </div>
    <div className="guide-view-panel" id="guide-panel-2" role="tabpanel" aria-labelledby="guide-tab-2" hidden={view !== 2}><section className="guide-questions" aria-label="本章常见问题"><h3>常见问题</h3>{topic.questions.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section></div>
  </>
}

export default function UsageGuide({ route, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const topic = guideTopicForRoute(route)
  const index = guideTopics.indexOf(topic)
  const visible = filterGuideTopics(query)
  const heading = useRef<HTMLHeadingElement>(null)
  const previousTopic = useRef(topic.id)
  useEffect(() => {
    if (previousTopic.current !== topic.id) heading.current?.focus({ preventScroll: true })
    previousTopic.current = topic.id
  }, [topic.id])

  return <div className="usage-guide">
    <aside className="guide-directory" aria-label="使用说明目录">
      <h2><BookOpen size={17}/>使用目录</h2>
      <label className="guide-search"><Search size={16}/><input aria-label="搜索使用说明" placeholder="搜索板块或操作" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <label className="guide-mobile-select">选择章节<select aria-label="选择说明章节" value={topic.id} onChange={event => onNavigate(`guide/${event.target.value}`)}>{guideTopics.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <nav aria-label="说明章节">{visible.map(item => <a key={item.id} href={`#guide/${item.id}`} aria-current={topic.id === item.id ? 'page' : undefined} className={topic.id === item.id ? 'selected' : ''}><span>{item.title}</span>{topic.id === item.id && <ArrowRight size={14}/>}</a>)}</nav>
      {!visible.length && <div className="guide-no-results"><p>未找到相关章节</p><button className="text-button" onClick={() => setQuery('')}>清除搜索</button></div>}
    </aside>
    <article className="guide-article" aria-labelledby="guide-topic-title">
      <header className="guide-article-head"><span className="guide-chapter">使用说明 / {String(index + 1).padStart(2, '0')}</span><h2 ref={heading} id="guide-topic-title" tabIndex={-1}>{topic.title}</h2><p>{topic.summary}</p>{topic.destination && <a className="button guide-open" href={`#${topic.destination}`} onClick={event => { event.preventDefault(); onNavigate(topic.destination!) }}>进入{topic.title}<ArrowRight size={15}/></a>}</header>
      <ChapterContent key={topic.id} topic={topic}/>
      <footer className="guide-pagination">{index > 0 ? <a href={`#guide/${guideTopics[index - 1].id}`}><ArrowLeft size={15}/><span>{guideTopics[index - 1].title}</span></a> : <span/>}{index < guideTopics.length - 1 && <a href={`#guide/${guideTopics[index + 1].id}`}><span>{guideTopics[index + 1].title}</span><ArrowRight size={15}/></a>}</footer>
    </article>
  </div>
}
