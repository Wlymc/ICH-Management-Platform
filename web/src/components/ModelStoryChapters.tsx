import { MODEL_STORY_STEPS } from '../data/model-story';
import type { ModelStoryStep } from '../data/model-story';

export function ModelStoryChapters({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (step: ModelStoryStep) => void;
}) {
  const activeIndex = MODEL_STORY_STEPS.findIndex((step) => step.id === activeId);

  return (
    <nav className="model-story-chapters" aria-label="陶瓷主题导览">
      <span className="model-story-chapters-label">故事导览</span>
      <ol className="model-story-track">
        {MODEL_STORY_STEPS.map((step, index) => {
          const isActive = activeId === step.id;
          const isDone = activeIndex > index;
          return (
            <li
              className={`model-story-node${isActive ? ' is-active' : ''}${
                isDone ? ' is-done' : ''
              }`}
              key={step.id}
            >
              <button
                className="model-story-chapter"
                type="button"
                aria-pressed={isActive}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onSelect(step)}
              >
                <span className="model-story-seal" aria-hidden="true">
                  {step.number}
                </span>
                <span className="model-story-copy">
                  <strong>{step.title}</strong>
                  <small>{step.kicker}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
