import React, { useEffect, useMemo, useRef, useState } from 'react';

const colors = {
  base: '#e8ebf2',
  shadow: '#c7ccdb',
  highlight: '#f7f9ff',
  accent: '#6c5dd3',
  accentSoft: '#9da5f1',
  ink: '#2d2a32',
};

type ShapeKind = 'rectangle' | 'ellipse' | 'diamond' | 'text';

type Shape = {
  id: string;
  type: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fill: string;
  stroke: string;
};

type Connector = {
  id: string;
  from: string;
  to: string;
  variant: 'straight' | 'curved';
  label: string;
  jitter: number;
};

type BranchConnector = {
  id: string;
  from: string;
  branches: { id: string; to: string; controlOffset: number }[];
  label: string;
};

type Tool = 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'connector' | 'mindmap';

type WorkspacePoint = { x: number; y: number };

const randomId = () => crypto.randomUUID();

function applyRandomness(value: number, jitter: number) {
  return value + (Math.random() - 0.5) * jitter;
}

function buildConnectorPath(
  start: WorkspacePoint,
  end: WorkspacePoint,
  variant: 'straight' | 'curved',
  jitter: number,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const midX = start.x + dx / 2;
  const midY = start.y + dy / 2;

  if (variant === 'straight') {
    const c1x = applyRandomness(midX - dx * 0.1, jitter);
    const c1y = applyRandomness(midY - dy * 0.1, jitter);
    const c2x = applyRandomness(midX + dx * 0.1, jitter);
    const c2y = applyRandomness(midY + dy * 0.1, jitter);
    return `M ${start.x},${start.y} C ${c1x},${c1y} ${c2x},${c2y} ${end.x},${end.y}`;
  }

  const curveOffset = Math.max(Math.abs(dx), Math.abs(dy)) * 0.2 + 40;
  const c1x = applyRandomness(midX, jitter) + curveOffset * Math.sign(dy || 1);
  const c1y = applyRandomness(start.y, jitter) - curveOffset * Math.sign(dx || 1);
  const c2x = applyRandomness(midX, jitter) - curveOffset * Math.sign(dy || 1);
  const c2y = applyRandomness(end.y, jitter) + curveOffset * Math.sign(dx || 1);

  return `M ${start.x},${start.y} C ${c1x},${c1y} ${c2x},${c2y} ${end.x},${end.y}`;
}

function buildDiamondPath(x: number, y: number, width: number, height: number) {
  const halfW = width / 2;
  const halfH = height / 2;
  return `M ${x + halfW},${y} L ${x + width},${y + halfH} ${x + halfW},${y + height} ${x},${y + halfH} Z`;
}

function usePanZoom(containerRef: React.RefObject<HTMLDivElement>) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      setScale((prev) => Math.min(2.5, Math.max(0.5, prev + delta)));
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 2) {
        event.preventDefault();
        isPanning.current = true;
        lastPos.current = { x: event.clientX, y: event.clientY };
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isPanning.current) return;
      const dx = event.clientX - lastPos.current.x;
      const dy = event.clientY - lastPos.current.y;
      lastPos.current = { x: event.clientX, y: event.clientY };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    };

    const onMouseUp = () => {
      isPanning.current = false;
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    node.addEventListener('contextmenu', (event) => event.preventDefault());

    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [containerRef]);

  return { pan, setPan, scale, setScale } as const;
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(24);
  const [burgerOpen, setBurgerOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [accent, setAccent] = useState(colors.accent);
  const [shapes, setShapes] = useState<Shape[]>([
    {
      id: randomId(),
      type: 'rectangle',
      x: 100,
      y: 60,
      width: 170,
      height: 96,
      text: 'Welcome card',
      fill: '#f5f6fb',
      stroke: colors.accent,
    },
    {
      id: randomId(),
      type: 'ellipse',
      x: 360,
      y: 220,
      width: 150,
      height: 96,
      text: 'Idea bubble',
      fill: '#f0f1ff',
      stroke: '#7fb4ff',
    },
    {
      id: randomId(),
      type: 'diamond',
      x: 620,
      y: 120,
      width: 140,
      height: 120,
      text: 'Decision',
      fill: '#fdf7f3',
      stroke: '#f6a559',
    },
  ]);

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [branches, setBranches] = useState<BranchConnector[]>([]);

  const { pan, setPan, scale, setScale } = usePanZoom(containerRef);

  useEffect(() => {
    if (shapes.length < 2) return;
    const [first, second, third] = shapes;
    setConnectors([
      {
        id: 'baseline-1',
        from: first.id,
        to: second.id,
        variant: 'curved',
        label: 'Flow',
        jitter: 18,
      },
      {
        id: 'baseline-2',
        from: second.id,
        to: third?.id ?? first.id,
        variant: 'straight',
        label: 'Decision path',
        jitter: 10,
      },
    ]);

    setBranches([
      {
        id: 'mind-1',
        from: second.id,
        label: 'Mind map',
        branches: [
          { id: 'branch-a', to: first.id, controlOffset: 70 },
          { id: 'branch-b', to: third?.id ?? first.id, controlOffset: -60 },
        ],
      },
    ]);
  }, [shapes]);

  const selectedShape = useMemo(() => shapes.find((s) => s.id === selected), [selected, shapes]);

  const toWorkspacePoint = (event: React.MouseEvent) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    const x = (event.clientX - bounds.left - pan.x) / scale;
    const y = (event.clientY - bounds.top - pan.y) / scale;
    return { x, y };
  };

  const addShape = (point: WorkspacePoint) => {
    const palette = ['#f8fafc', '#fdf6fd', '#f8f4ff', '#f6fbff'];
    const newShape: Shape = {
      id: randomId(),
      type: tool as ShapeKind,
      x: point.x - 60,
      y: point.y - 40,
      width: 140,
      height: 90,
      text: tool === 'text' ? 'New note' : 'New shape',
      fill: palette[Math.floor(Math.random() * palette.length)],
      stroke: accent,
    };
    setShapes((prev) => [...prev, newShape]);
    setSelected(newShape.id);
  };

  const addConnector = (point: WorkspacePoint) => {
    if (shapes.length === 0) return;
    const target = shapes.at(-1)!;
    const connector: Connector = {
      id: randomId(),
      from: target.id,
      to: shapes[0].id,
      variant: Math.random() > 0.5 ? 'curved' : 'straight',
      label: 'Sketch link',
      jitter: 14 + Math.random() * 10,
    };
    setConnectors((prev) => [...prev, connector]);
  };

  const addBranch = (point: WorkspacePoint) => {
    if (shapes.length < 2) return;
    const focus = shapes[1] ?? shapes[0];
    const newShape: Shape = {
      id: randomId(),
      type: 'text',
      x: point.x - 60,
      y: point.y - 32,
      width: 140,
      height: 70,
      text: 'Mind branch',
      fill: '#f9fffb',
      stroke: '#66d89a',
    };
    setShapes((prev) => [...prev, newShape]);
    const branchConnector: BranchConnector = {
      id: randomId(),
      from: focus.id,
      label: 'Branches',
      branches: [
        { id: randomId(), to: newShape.id, controlOffset: point.y - focus.y },
      ],
    };
    setBranches((prev) => [...prev, branchConnector]);
  };

  const handleCanvasClick = (event: React.MouseEvent) => {
    if (event.button === 2) return;
    const point = toWorkspacePoint(event);

    switch (tool) {
      case 'rectangle':
      case 'ellipse':
      case 'diamond':
      case 'text':
        addShape(point);
        break;
      case 'connector':
        addConnector(point);
        break;
      case 'mindmap':
        addBranch(point);
        break;
      default:
        setSelected(null);
        break;
    }
  };

  const updateSelected = (key: keyof Shape, value: string | number) => {
    if (!selected) return;
    setShapes((prev) =>
      prev.map((shape) => (shape.id === selected ? { ...shape, [key]: value } : shape)),
    );
  };

  const renderShape = (shape: Shape) => {
    const common = {
      fill: shape.fill,
      stroke: shape.stroke,
      strokeWidth: 2,
      filter: 'url(#neomorph)',
    };

    switch (shape.type) {
      case 'rectangle':
        return (
          <g key={shape.id} onClick={() => setSelected(shape.id)}>
            <rect
              x={shape.x}
              y={shape.y}
              rx={14}
              ry={14}
              width={shape.width}
              height={shape.height}
              {...common}
            />
            {shape.text && (
              <text x={shape.x + shape.width / 2} y={shape.y + shape.height / 2} className="shape-text">
                {shape.text}
              </text>
            )}
          </g>
        );
      case 'ellipse':
        return (
          <g key={shape.id} onClick={() => setSelected(shape.id)}>
            <ellipse
              cx={shape.x + shape.width / 2}
              cy={shape.y + shape.height / 2}
              rx={shape.width / 2}
              ry={shape.height / 2}
              {...common}
            />
            {shape.text && (
              <text x={shape.x + shape.width / 2} y={shape.y + shape.height / 2} className="shape-text">
                {shape.text}
              </text>
            )}
          </g>
        );
      case 'diamond':
        return (
          <g key={shape.id} onClick={() => setSelected(shape.id)}>
            <path d={buildDiamondPath(shape.x, shape.y, shape.width, shape.height)} {...common} />
            {shape.text && (
              <text x={shape.x + shape.width / 2} y={shape.y + shape.height / 2} className="shape-text">
                {shape.text}
              </text>
            )}
          </g>
        );
      case 'text':
        return (
          <g key={shape.id} onClick={() => setSelected(shape.id)}>
            <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} {...common} opacity={0.3} />
            {shape.text && (
              <text x={shape.x + 12} y={shape.y + shape.height / 2} className="shape-text text-left">
                {shape.text}
              </text>
            )}
          </g>
        );
      default:
        return null;
    }
  };

  const buildPathForConnector = (connector: Connector) => {
    const from = shapes.find((s) => s.id === connector.from);
    const to = shapes.find((s) => s.id === connector.to);
    if (!from || !to) return '';
    const start: WorkspacePoint = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end: WorkspacePoint = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    return buildConnectorPath(start, end, connector.variant, connector.jitter);
  };

  const renderMindBranch = (branch: BranchConnector) => {
    const from = shapes.find((s) => s.id === branch.from);
    if (!from) return null;
    const start: WorkspacePoint = { x: from.x + from.width, y: from.y + from.height / 2 };

    return branch.branches.map((b) => {
      const target = shapes.find((s) => s.id === b.to);
      if (!target) return null;
      const end: WorkspacePoint = { x: target.x, y: target.y + target.height / 2 };
      const controlX = start.x + (end.x - start.x) / 2;
      const controlY = (start.y + end.y) / 2 + b.controlOffset * 0.1;
      const d = `M ${start.x},${start.y} Q ${controlX},${controlY} ${end.x},${end.y}`;

      return (
        <g key={b.id} className="connector">
          <path id={`branch-${b.id}`} d={d} className="connector-path" />
          <text className="connector-label">
            <textPath startOffset="50%" href={`#branch-${b.id}`}>
              {branch.label}
            </textPath>
          </text>
        </g>
      );
    });
  };

  return (
    <div className="app" ref={containerRef}>
      <header className="top-bar">
        <div className="brand">
          <button className="ghost" onClick={() => setBurgerOpen((prev) => !prev)} aria-label="Open menu">
            ☰
          </button>
          <div>
            <p className="eyebrow">Neomorphic Studio</p>
            <h1>Infinite Workspace</h1>
          </div>
        </div>
        <div className="toolbar">
          {(
            [
              ['select', 'Select'],
              ['rectangle', 'Rect'],
              ['ellipse', 'Ellipse'],
              ['diamond', 'Diamond'],
              ['text', 'Text'],
              ['connector', 'Link'],
              ['mindmap', 'Branches'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={tool === value ? 'chip active' : 'chip'}
              onClick={() => setTool(value)}
            >
              {label}
            </button>
          ))}
          <div className="divider" />
          <div className="quick-style">
            <label>Accent</label>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
            <button
              className="chip"
              onClick={() => {
                if (!selectedShape) return;
                updateSelected('fill', colors.highlight);
                updateSelected('stroke', accent);
              }}
            >
              Quick style
            </button>
          </div>
          <div className="zoom">
            <label>Zoom</label>
            <input
              type="range"
              min={50}
              max={250}
              value={scale * 100}
              onChange={(e) => setScale(Number(e.target.value) / 100)}
            />
            <span>{Math.round(scale * 100)}%</span>
          </div>
        </div>
        <div className="right-actions">
          <button className="chip ghost" onClick={() => setGridEnabled((prev) => !prev)}>
            Grid {gridEnabled ? 'On' : 'Off'}
          </button>
          <button className="chip ghost" onClick={() => setPropertiesOpen((prev) => !prev)}>
            Properties
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className={burgerOpen ? 'side-panel open' : 'side-panel'}>
          <h3>Workspace</h3>
          <button className="pill">New file</button>
          <button className="pill">Import</button>
          <button className="pill">Export</button>
          <div className="muted">
            <p>About</p>
            <p>Help center</p>
          </div>
        </aside>

        <main className="canvas-shell" onClick={handleCanvasClick}>
          <div className="workspace" style={{ backgroundSize: `${gridSize}px ${gridSize}px` }}>
            {gridEnabled && <div className="grid-overlay" style={{ backgroundSize: `${gridSize}px ${gridSize}px` }} />}
            <svg
              ref={svgRef}
              className="canvas"
              width="100%"
              height="100%"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >
              <defs>
                <filter id="neomorph" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="-4" dy="-4" stdDeviation="6" floodColor={colors.highlight} />
                  <feDropShadow dx="5" dy="5" stdDeviation="8" floodColor={colors.shadow} floodOpacity="0.7" />
                </filter>
                <linearGradient id="connectorStroke" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stopColor="#2c2733" stopOpacity="0.7" />
                  <stop offset="100%" stopColor={accent} stopOpacity="0.9" />
                </linearGradient>
                <marker id="taper-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 5 L 10 1 L 7 5 L 10 9 Z" fill={colors.ink} />
                </marker>
                <marker id="taper-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill={accent} />
                </marker>
              </defs>

              {connectors.map((connector) => {
                const path = buildPathForConnector(connector);
                if (!path) return null;
                return (
                  <g key={connector.id} className="connector">
                    <path
                      id={`connector-${connector.id}`}
                      d={path}
                      className="connector-path"
                      stroke="url(#connectorStroke)"
                      markerStart="url(#taper-start)"
                      markerEnd="url(#taper-end)"
                    />
                    <text className="connector-label">
                      <textPath startOffset="50%" href={`#connector-${connector.id}`}>
                        {connector.label}
                      </textPath>
                    </text>
                  </g>
                );
              })}

              {branches.map((branch) => renderMindBranch(branch))}

              {shapes.map((shape) => renderShape(shape))}
            </svg>
          </div>
        </main>

        <aside className={propertiesOpen ? 'side-panel right open' : 'side-panel right'}>
          <h3>Properties</h3>
          {selectedShape ? (
            <div className="properties">
              <label>
                Label
                <input
                  type="text"
                  value={selectedShape.text ?? ''}
                  onChange={(e) => updateSelected('text', e.target.value)}
                />
              </label>
              <label>
                Fill
                <input type="color" value={selectedShape.fill} onChange={(e) => updateSelected('fill', e.target.value)} />
              </label>
              <label>
                Stroke
                <input
                  type="color"
                  value={selectedShape.stroke}
                  onChange={(e) => updateSelected('stroke', e.target.value)}
                />
              </label>
              <label>
                Width
                <input
                  type="range"
                  min={80}
                  max={260}
                  value={selectedShape.width}
                  onChange={(e) => updateSelected('width', Number(e.target.value))}
                />
              </label>
              <label>
                Height
                <input
                  type="range"
                  min={60}
                  max={200}
                  value={selectedShape.height}
                  onChange={(e) => updateSelected('height', Number(e.target.value))}
                />
              </label>
            </div>
          ) : (
            <p className="muted">Select any shape to see its properties.</p>
          )}

          <div className="properties">
            <label>
              Grid size
              <input
                type="range"
                min={12}
                max={48}
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
              />
            </label>
            <label>
              Pan X
              <input
                type="range"
                min={-400}
                max={400}
                value={pan.x}
                onChange={(e) => setPan((prev) => ({ ...prev, x: Number(e.target.value) }))}
              />
            </label>
            <label>
              Pan Y
              <input
                type="range"
                min={-400}
                max={400}
                value={pan.y}
                onChange={(e) => setPan((prev) => ({ ...prev, y: Number(e.target.value) }))}
              />
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
