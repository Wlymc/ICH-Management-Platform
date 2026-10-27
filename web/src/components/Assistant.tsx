import { useEffect, useRef, useState } from 'react';
import { publicApi } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import type { ChatLink, ChatMessage, ChatSource } from '../types';

const HISTORY_KEY = 'ich.ai.history.v1';

interface RecognitionResultLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface RecognitionConstructor {
  new (): RecognitionLike;
}

function readHistory(): ChatMessage[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]') as ChatMessage[];
    return Array.isArray(value)
      ? value.filter((item) => ['user', 'assistant'].includes(item.role) && item.content).slice(-6)
      : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(
        messages
          .filter((item) => item.content)
          .slice(-6)
          .map(({ role, content }) => ({ role, content })),
      ),
    );
  } catch {
    // Privacy mode can disable sessionStorage.
  }
}

function SourceList({ sources }: { sources: ChatSource[] }) {
  if (!sources.length) return null;
  const labels = {
    verified: '已核实',
    example: '平台示例',
    unverified: '待核实',
  };
  return (
    <div className="ai-source">
      <b>来源</b>
      <ul>
        {sources.slice(0, 4).map((source) => (
          <li key={`${source.type}-${source.id}`}>
            <span className="ai-source-tag">
              {source.type === 'project' ? '项目' : source.type === 'inheritor' ? '传承人' : '知识'}
            </span>
            <span className={`ai-source-verification is-${source.verification}`}>
              {labels[source.verification]}
            </span>
            <a href={source.href || undefined}>{source.title}</a>
          </li>
        ))}
      </ul>
      {sources.some((source) => source.verification === 'example') ? (
        <p className="ai-source-warning">
          其中有平台示例资料，具体信息请以官方名录或保护单位公布为准。
        </p>
      ) : null}
    </div>
  );
}

function RecommendationLinks({ links }: { links: ChatLink[] }) {
  if (!links.length) return null;
  return (
    <div className="ai-recommendations">
      <b>继续探索</b>
      <div className="ai-links">
        {links.map((link) => (
          <a className="ai-link" href={link.href} key={`${link.href}-${link.label}`}>
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function AssistantConversation({ compact = false }: { compact?: boolean }) {
  const context = useAppStore((state) => state.assistantContext);
  const [messages, setMessages] = useState<ChatMessage[]>(() => readHistory());
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  useEffect(() => {
    if (!messages.length) {
      const intro: ChatMessage = {
        role: 'assistant',
        content: context.projectName
          ? `你正在看「${context.projectName}」。想先了解它的历史、技艺，还是背后的传承人？`
          : '你好，我是传承学徒小遗。我会先查站内已发布档案，再认真回答你的问题。',
      };
      setMessages([intro]);
    }
  }, [context.projectName, messages.length]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    setError('');
    setInput('');
    setPending(true);
    const previous = messages.filter((message) => message.role !== 'assistant' || message.sources);
    const history = previous
      .filter((message) => message.content)
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: 'user', content: text }]);
    try {
      const response = await publicApi.chat({
        message: text,
        history,
        context,
      });
      const assistant: ChatMessage = {
        role: 'assistant',
        content: response.reply,
        sources: response.sources,
        links: response.links,
      };
      setMessages((current) => {
        const next = [...current, assistant].slice(-8);
        saveHistory(next);
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '小遗暂时无法回答。');
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.94;
    speechSynthesis.speak(utterance);
  };

  const startVoice = () => {
    const speechWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      if (transcript) void send(transcript);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const reset = () => {
    saveHistory([]);
    setError('');
    setMessages([
      {
        role: 'assistant',
        content: '新对话已开始。告诉我你想了解的非遗项目、技艺或传承人。',
      },
    ]);
  };

  return (
    <div className={`ai-root react-ai ${compact ? 'is-fab' : 'is-inline'}`}>
      <div className="ai-narrator">
        <div className="ai-narrator-avatar" aria-hidden="true">
          <span className="ai-avatar-ring" />
          <span className="ai-avatar-core">遗</span>
          <span className="ai-avatar-wave">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="ai-narrator-copy">
          <strong>小遗 · 传承学徒</strong>
          <span>基于站内档案回答，事实附来源</span>
        </div>
        <button className="ai-new-chat" type="button" onClick={reset}>
          新对话
        </button>
      </div>
      <div className="ai-thread" ref={threadRef} aria-live="polite">
        {messages.map((message, index) => (
          <div className={`ai-msg is-${message.role === 'assistant' ? 'bot' : 'user'}`} key={index}>
            <div>{message.content}</div>
            {message.links ? <RecommendationLinks links={message.links} /> : null}
            {message.sources ? <SourceList sources={message.sources} /> : null}
            {message.role === 'assistant' ? (
              <div className="ai-speech-tools">
                <button className="ai-speak" type="button" onClick={() => speak(message.content)}>
                  朗读
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {pending ? (
          <div className="ai-msg is-bot">
            <span className="ai-typing">小遗正在检索站内档案…</span>
          </div>
        ) : null}
        {error ? (
          <div className="ai-msg is-bot">
            <span className="ai-error">{error}</span>
          </div>
        ) : null}
      </div>
      <form
        className="ai-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <button className="ai-mic" type="button" onClick={startVoice} aria-label="语音输入">
          <span aria-hidden="true" />
        </button>
        <input
          ref={inputRef}
          className="ai-input"
          value={input}
          maxLength={200}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            context.projectName ? `就「${context.projectName}」提问…` : '输入你想了解的非遗问题…'
          }
        />
        <button className="btn btn-primary" type="submit" disabled={pending || !input.trim()}>
          发送
        </button>
      </form>
      <div className="ai-samples">
        <span className="ai-samples-label">试试：</span>
        {(context.projectId
          ? ['它的历史渊源是什么？', '它用了哪些材料？', '有哪些传承人？']
          : ['传统技艺类项目有哪些？', '推荐一个我可能喜欢的项目', '你能帮我做什么？']
        ).map((sample) => (
          <button
            className="ai-sample"
            type="button"
            onClick={() => void send(sample)}
            key={sample}
          >
            {sample}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AssistantFab() {
  const open = useAppStore((state) => state.assistantOpen);
  const setOpen = useAppStore((state) => state.setAssistantOpen);
  return (
    <div className="ai-fab react-ai-fab">
      <button className="ai-fab-toggle" type="button" onClick={() => setOpen(!open)}>
        {open ? '收起小遗' : '问小遗'}
      </button>
      {open ? (
        <div className="ai-fab-panel">
          <header className="ai-fab-head">
            <strong>传承学徒 · 小遗</strong>
            <button
              className="ai-fab-close"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭"
            >
              ×
            </button>
          </header>
          <AssistantConversation compact />
        </div>
      ) : null}
    </div>
  );
}

export function AssistantInline() {
  return <AssistantConversation />;
}
