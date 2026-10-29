import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphNode } from '../types';

interface PersonSphereProps {
  people: GraphNode[];
  selectedId?: string;
  query: string;
  onSelect: (person: GraphNode) => void;
}

interface SpherePoint {
  person: GraphNode;
  x: number;
  y: number;
  z: number;
  color: string;
  baseSize: number;
  screenX: number;
  screenY: number;
  screenR: number;
  depth: number;
  matched: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  国家级: '#e0bb45',
  省级: '#d24b45',
  市级: '#7fa8d8',
  县级: '#7fbd92',
};

function personSearchText(person: GraphNode) {
  return `${person.label} ${person.levelName || ''} ${person.regionLabel || ''}`.toLocaleLowerCase('zh-CN');
}

export function PersonSphere({ people, selectedId = '', query, onSelect }: PersonSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(0);
  const rotationRef = useRef({ x: -0.16, y: 0.42 });
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hoverRef = useRef<SpherePoint | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const [hoveredName, setHoveredName] = useState('');
  const deferredQuery = query.trim().toLocaleLowerCase('zh-CN');

  const points = useMemo(() => {
    const count = Math.max(1, people.length);
    return people.map((person, index) => {
      const y = 1 - (index / Math.max(1, count - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = index * 2.399963229728653;
      return {
        person,
        x: Math.cos(theta) * radius,
        y,
        z: Math.sin(theta) * radius,
        color: LEVEL_COLORS[person.levelName || ''] || '#7fa8d8',
        baseSize: 3.7 + Math.min(3, Number(person.inheritorCount || 1)) * 0.75,
        screenX: 0,
        screenY: 0,
        screenR: 0,
        depth: 0,
        matched: !deferredQuery || personSearchText(person).includes(deferredQuery),
      };
    });
  }, [deferredQuery, people]);

  const focusId = useMemo(() => {
    if (selectedId) return selectedId;
    if (!deferredQuery) return '';
    return points.find((point) => point.matched)?.person.id || '';
  }, [deferredQuery, points, selectedId]);

  useEffect(() => {
    const point = points.find((item) => item.person.id === focusId);
    if (!point) {
      targetRef.current = null;
      return;
    }
    targetRef.current = {
      x: Math.asin(Math.max(-1, Math.min(1, point.y))),
      y: -Math.atan2(point.z, point.x),
    };
  }, [focusId, points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { width: Math.max(280, rect.width), height: Math.max(320, rect.height), dpr };
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
    };

    const project = (point: SpherePoint) => {
      const { width, height } = sizeRef.current;
      const { x: rotX, y: rotY } = rotationRef.current;
      const sx = Math.sin(rotY);
      const cx = Math.cos(rotY);
      const sy = Math.sin(rotX);
      const cy = Math.cos(rotX);
      const x1 = point.x * cx + point.z * sx;
      const z1 = -point.x * sx + point.z * cx;
      const y1 = point.y * cy - z1 * sy;
      const z2 = point.y * sy + z1 * cy;
      const depth = (z2 + 1) / 2;
      const radius = Math.min(width, height) * 0.36;
      const scale = 0.72 + depth * 0.38;
      return {
        x: width / 2 + x1 * radius * scale,
        y: height / 2 + y1 * radius * scale,
        z: z2,
        depth,
        r: point.baseSize * (0.72 + depth * 0.55),
      };
    };

    const draw = () => {
      const { width, height, dpr } = sizeRef.current;
      if (!width || !height) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.36;

      context.save();
      context.strokeStyle = 'rgba(200,164,92,.15)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([4, 7]);
      for (const ratio of [0.4, 0.72]) {
        context.beginPath();
        context.ellipse(centerX, centerY, radius, radius * ratio, 0, 0, Math.PI * 2);
        context.stroke();
      }
      context.beginPath();
      context.ellipse(centerX, centerY, radius * 0.42, radius, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();

      const projected = points
        .map((point) => ({ point, projected: project(point) }))
        .sort((left, right) => left.projected.z - right.projected.z);

      for (const item of projected) {
        const { point, projected: position } = item;
        point.screenX = position.x;
        point.screenY = position.y;
        point.screenR = Math.max(2.5, position.r + 5);
        point.depth = position.depth;
        const selected = point.person.id === selectedId;
        const hovered = hoverRef.current?.person.id === point.person.id;
        const alpha = (point.matched ? 0.24 + position.depth * 0.76 : 0.07) * (selected || hovered ? 1.2 : 1);
        context.save();
        context.globalAlpha = Math.min(1, alpha);
        if (selected || hovered) {
          const glow = context.createRadialGradient(position.x, position.y, 0, position.x, position.y, position.r * 4);
          glow.addColorStop(0, `${point.color}99`);
          glow.addColorStop(1, `${point.color}00`);
          context.fillStyle = glow;
          context.beginPath();
          context.arc(position.x, position.y, position.r * 4, 0, Math.PI * 2);
          context.fill();
        }
        context.fillStyle = point.color;
        context.beginPath();
        context.arc(position.x, position.y, Math.max(1.8, position.r), 0, Math.PI * 2);
        context.fill();
        if (selected || hovered) {
          context.strokeStyle = '#f1ddb0';
          context.lineWidth = 1.2;
          context.beginPath();
          context.arc(position.x, position.y, Math.max(1.8, position.r) + 4, 0, Math.PI * 2);
          context.stroke();
        }
        context.restore();
      }

      const hovered = hoverRef.current;
      if (hovered) {
        context.save();
        context.font = '12px KaiTi, STKaiti, "Kaiti SC", SimSun, serif';
        context.textAlign = 'center';
        context.textBaseline = 'bottom';
        context.lineWidth = 3;
        context.strokeStyle = '#091721';
        context.fillStyle = '#f2dfb2';
        context.strokeText(hovered.person.label, hovered.screenX, hovered.screenY - hovered.screenR - 5);
        context.fillText(hovered.person.label, hovered.screenX, hovered.screenY - hovered.screenR - 5);
        context.restore();
      }
    };

    const animate = () => {
      const target = targetRef.current;
      if (target) {
        rotationRef.current.x += (target.x - rotationRef.current.x) * 0.09;
        rotationRef.current.y += (target.y - rotationRef.current.y) * 0.09;
        if (Math.abs(target.x - rotationRef.current.x) < 0.002 && Math.abs(target.y - rotationRef.current.y) < 0.002) {
          targetRef.current = null;
        }
      } else if (!dragRef.current && !hoverRef.current) {
        rotationRef.current.y += 0.0021;
      }
      draw();
      frameRef.current = requestAnimationFrame(animate);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [points, selectedId]);

  const hitTest = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let closest: SpherePoint | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const point of points) {
      const distance = Math.hypot(point.screenX - x, point.screenY - y);
      if (distance <= point.screenR + 5 && distance < closestDistance) {
        closest = point;
        closestDistance = distance;
      }
    }
    return closest;
  };

  return (
    <canvas
      ref={canvasRef}
      className="person-sphere-canvas"
      role="img"
      aria-label={`三维传承人星群，共 ${people.length} 位传承人，可拖拽旋转并点击查看档案`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (drag) {
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (Math.hypot(dx, dy) > 2) drag.moved = true;
          rotationRef.current.y += dx * 0.006;
          rotationRef.current.x = Math.max(-1.25, Math.min(1.25, rotationRef.current.x + dy * 0.006));
          drag.x = event.clientX;
          drag.y = event.clientY;
          hoverRef.current = null;
          setHoveredName('');
          return;
        }
        const point = hitTest(event.clientX, event.clientY);
        hoverRef.current = point;
        setHoveredName(point?.person.label || '');
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag && !drag.moved) {
          const point = hitTest(event.clientX, event.clientY);
          if (point) onSelect(point.person);
        }
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onPointerLeave={() => {
        if (!dragRef.current) {
          hoverRef.current = null;
          setHoveredName('');
        }
      }}
    >
      {hoveredName ? `当前人物：${hoveredName}` : ''}
    </canvas>
  );
}
