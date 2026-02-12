import { useEffect, useMemo, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { classNames } from '~/utils/classNames';

export type SketchElement =
  | {
      id: string;
      type: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      id: string;
      type: 'text';
      x: number;
      y: number;
      text: string;
    };

interface SketchCanvasProps {
  onChange?: (elements: SketchElement[]) => void;
}

export function SketchCanvas({ onChange }: SketchCanvasProps) {
  const [open, setOpen] = useState(false);
  const [elements, setElements] = useState<SketchElement[]>([]);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [previewRect, setPreviewRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    onChange?.(elements);
  }, [elements, onChange]);

  const sketchJson = useMemo(() => {
    return JSON.stringify(
      {
        type: 'sketch-v1',
        elements,
      },
      null,
      2,
    );
  }, [elements]);

  return (
    <div className="relative">
      <IconButton
        title="Sketch canvas"
        className={classNames('transition-all', open ? 'bg-bolt-elements-item-backgroundAccent' : '')}
        onClick={() => setOpen((value) => !value)}
      >
        <div className="i-ph:pencil-ruler text-xl" />
      </IconButton>

      {open && (
        <div className="absolute bottom-12 left-0 z-40 w-[340px] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-xl">
          <div className="mb-2 flex items-center justify-between text-xs text-bolt-elements-textSecondary">
            <span>Sketch rectangles/text to guide UI generation</span>
            <div className="flex items-center gap-1">
              <button
                className="rounded bg-bolt-elements-background-depth-1 px-2 py-1 text-xs"
                onClick={() => {
                  const text = window.prompt('Text label');

                  if (!text?.trim()) {
                    return;
                  }

                  setElements((prev) => [
                    ...prev,
                    {
                      id: `${Date.now()}-${Math.random()}`,
                      type: 'text',
                      x: 18,
                      y: 18 + prev.filter((item) => item.type === 'text').length * 20,
                      text,
                    },
                  ]);
                }}
              >
                Add Text
              </button>
              <button
                className="rounded bg-bolt-elements-background-depth-1 px-2 py-1 text-xs"
                onClick={() => setElements([])}
              >
                Clear
              </button>
            </div>
          </div>

          <div
            className="relative h-[200px] w-full cursor-crosshair overflow-hidden rounded border border-bolt-elements-borderColor bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]"
            onMouseDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - rect.left;
              const y = event.clientY - rect.top;

              setDrawingStart({ x, y });
              setPreviewRect({ x, y, width: 0, height: 0 });
            }}
            onMouseMove={(event) => {
              if (!drawingStart) {
                return;
              }

              const rect = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - rect.left;
              const y = event.clientY - rect.top;

              setPreviewRect({
                x: Math.min(drawingStart.x, x),
                y: Math.min(drawingStart.y, y),
                width: Math.abs(drawingStart.x - x),
                height: Math.abs(drawingStart.y - y),
              });
            }}
            onMouseUp={() => {
              if (!previewRect || previewRect.width < 4 || previewRect.height < 4) {
                setDrawingStart(null);
                setPreviewRect(null);

                return;
              }

              setElements((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-${Math.random()}`,
                  type: 'rect',
                  x: previewRect.x,
                  y: previewRect.y,
                  width: previewRect.width,
                  height: previewRect.height,
                },
              ]);
              setDrawingStart(null);
              setPreviewRect(null);
            }}
            onMouseLeave={() => {
              setDrawingStart(null);
              setPreviewRect(null);
            }}
          >
            {elements.map((element) => {
              if (element.type === 'text') {
                return (
                  <div
                    key={element.id}
                    className="pointer-events-none absolute text-[11px] font-medium text-bolt-elements-textPrimary"
                    style={{ left: element.x, top: element.y }}
                  >
                    {element.text}
                  </div>
                );
              }

              return (
                <div
                  key={element.id}
                  className="pointer-events-none absolute border border-cyan-400/80 bg-cyan-400/20"
                  style={{
                    left: element.x,
                    top: element.y,
                    width: element.width,
                    height: element.height,
                  }}
                />
              );
            })}

            {previewRect && (
              <div
                className="pointer-events-none absolute border border-emerald-400 bg-emerald-400/20"
                style={{
                  left: previewRect.x,
                  top: previewRect.y,
                  width: previewRect.width,
                  height: previewRect.height,
                }}
              />
            )}
          </div>

          <details className="mt-2 text-[10px] text-bolt-elements-textTertiary">
            <summary className="cursor-pointer">Sketch JSON</summary>
            <pre className="mt-1 max-h-24 overflow-auto rounded bg-bolt-elements-background-depth-1 p-2">
              {sketchJson}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
