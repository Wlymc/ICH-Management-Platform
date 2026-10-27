import { useState } from 'react';
import { publicApi } from '../api/client';
import type { NarrationData } from '../types';

type Mode = 'brief' | 'detailed' | 'child';

export function ProjectNarration({
  projectId,
  projectName,
}: {
  projectId: number;
  projectName: string;
}) {
  const [mode, setMode] = useState<Mode>('brief');
  const [result, setResult] = useState<NarrationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await publicApi.narrate(projectId, mode));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '讲解词生成失败');
    } finally {
      setLoading(false);
    }
  };

  const speak = () => {
    if (!result || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(result.script);
    utterance.lang = 'zh-CN';
    speechSynthesis.speak(utterance);
  };

  return (
    <section className="block react-narration">
      <div className="ai-narration-head">
        <div>
          <span className="ai-narration-kicker">PROJECT NARRATION</span>
          <strong>听小遗讲「{projectName}」</strong>
        </div>
      </div>
      <div className="ai-narration-modes" role="group" aria-label="讲解版本">
        {(
          [
            ['brief', '简短版'],
            ['detailed', '详细版'],
            ['child', '儿童版'],
          ] as Array<[Mode, string]>
        ).map(([value, label]) => (
          <button
            className={mode === value ? 'is-active' : ''}
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setResult(null);
            }}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ai-narration-actions">
        <button
          className="ai-narration-generate"
          type="button"
          disabled={loading}
          onClick={generate}
        >
          {loading ? '正在整理讲解词…' : '生成讲解词'}
        </button>
        {result ? (
          <button className="ai-speak" type="button" onClick={speak}>
            朗读
          </button>
        ) : null}
      </div>
      {error ? <p className="ai-error">{error}</p> : null}
      {result ? (
        <div className="ai-narration-result">
          {result.sections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              <p>{section.text}</p>
            </section>
          ))}
          <p className="ai-narration-source">依据：{result.source}</p>
        </div>
      ) : null}
    </section>
  );
}
