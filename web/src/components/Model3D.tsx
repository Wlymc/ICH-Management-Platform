import { useEffect, useRef, useState } from 'react';
import type { ModelAsset } from '../types';

export function Model3D({ models }: { models: ModelAsset[] }) {
  const viewerRef = useRef<ModelViewerElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState(models[0]);
  const [started, setStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const onLoad = () => {
      setLoaded(true);
      setError(false);
    };
    const onError = () => {
      setError(true);
      setLoaded(false);
    };
    viewer.addEventListener('load', onLoad);
    viewer.addEventListener('error', onError);
    return () => {
      viewer.removeEventListener('load', onLoad);
      viewer.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    if (!started || !viewerRef.current) return;
    setLoaded(false);
    setError(false);
    viewerRef.current.setAttribute('src', selected.url);
    viewerRef.current.setAttribute('loading', 'eager');
    viewerRef.current.alt = `${selected.title}三维模型`;
  }, [selected, started]);

  if (!models.length) return null;

  const load = (model: ModelAsset) => {
    setSelected(model);
    setStarted(true);
  };

  const zoom = (factor: number) => {
    const viewer = viewerRef.current;
    if (!viewer || !loaded) return;
    const orbit = viewer.getCameraOrbit();
    const radius = Math.max(0.1, Math.min(orbit.radius * factor, orbit.radius * 6));
    viewer.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${radius}m`;
  };

  return (
    <section className="block project3d-section">
      <header className="project3d-head">
        <div>
          <span className="project3d-kicker">DIGITAL OBJECT · 三维器物</span>
          <h2 className="section-title">走近器物的空间与细节</h2>
          <p>按需加载模型，可旋转、缩放并查看作者与许可。</p>
        </div>
        <span className="project3d-count">{models.length} 个模型</span>
      </header>
      <div className="project3d-stage" ref={stageRef}>
        <model-viewer
          ref={viewerRef}
          className="project3d-viewer"
          camera-controls
          loading="lazy"
          reveal="auto"
          touch-action="pan-y"
          shadow-intensity="1.25"
          shadow-softness="0.8"
          exposure="1.05"
          environment-image="neutral"
          interaction-prompt="auto"
          auto-rotate={autoRotate || undefined}
        />
        {!started ? (
          <div className="project3d-empty">
            <span>3D</span>
            <strong>{selected.title}</strong>
            <button type="button" onClick={() => load(selected)}>
              加载三维模型
            </button>
            <small>模型按需加载，避免拖慢档案页面</small>
          </div>
        ) : null}
        {started && !loaded && !error ? (
          <div className="project3d-loading">
            <span />
            <strong>正在载入三维模型</strong>
            <small>大模型首次加载可能需要几秒</small>
          </div>
        ) : null}
        {error ? (
          <div className="project3d-error">
            <strong>模型未能加载</strong>
            <p>请检查文件或稍后重试，档案其他内容仍可查看。</p>
          </div>
        ) : null}
      </div>
      <div className="project3d-toolbar">
        <button
          type="button"
          disabled={!loaded}
          aria-pressed={autoRotate}
          onClick={() => setAutoRotate((value) => !value)}
        >
          {autoRotate ? '停止旋转' : '自动旋转'}
        </button>
        <button type="button" disabled={!loaded} onClick={() => zoom(0.82)}>
          放大
        </button>
        <button type="button" disabled={!loaded} onClick={() => zoom(1.2)}>
          缩小
        </button>
        <button
          type="button"
          disabled={!loaded}
          onClick={() => {
            setAutoRotate(false);
            if (!viewerRef.current) return;
            viewerRef.current.cameraOrbit = '35deg 72deg auto';
            viewerRef.current.fieldOfView = '30deg';
            viewerRef.current.jumpCameraToGoal?.();
          }}
        >
          重置
        </button>
        <button
          type="button"
          disabled={!loaded}
          onClick={() => void stageRef.current?.requestFullscreen()}
        >
          全屏
        </button>
      </div>
      <div className="project3d-models">
        {models.map((model, index) => (
          <button
            className={`project3d-model-option${selected.id === model.id ? ' is-active' : ''}`}
            type="button"
            key={model.id}
            onClick={() => load(model)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{model.title}</strong>
            <small>{model.relationLabel}</small>
          </button>
        ))}
      </div>
      <div className="project3d-meta">
        <div>
          <span>{selected.relationLabel}</span>
          <h3>{selected.title}</h3>
          <p>{selected.note}</p>
        </div>
        <div className="project3d-credit">
          <span>
            作者：<b>{selected.author}</b>
          </span>
          <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
            模型来源 ↗
          </a>
          <a href={selected.licenseUrl} target="_blank" rel="noreferrer">
            {selected.license}
          </a>
        </div>
      </div>
      <p className="project3d-disclaimer">
        三维模型用于教学与展示。部分模型为同类工艺参考器物，具体归属以来源页和官方名录为准。
      </p>
    </section>
  );
}
