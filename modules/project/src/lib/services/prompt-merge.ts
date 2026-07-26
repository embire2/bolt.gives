import type { SketchElement } from '~/components/chat/SketchCanvas';

export interface PromptMergeInput {
  content: string;
  selectedElement?: unknown | null;
  sketchElements?: SketchElement[];
}

export function mergePromptContext({ content, selectedElement, sketchElements }: PromptMergeInput): string {
  let merged = content;

  if (selectedElement) {
    const displayText =
      typeof (selectedElement as { displayText?: unknown }).displayText === 'string'
        ? String((selectedElement as { displayText?: unknown }).displayText)
        : '';

    const elementInfo = `<div class="__boltSelectedElement__" data-element='${JSON.stringify(
      selectedElement,
    )}'>${JSON.stringify(displayText)}</div>`;

    merged = `${merged}${elementInfo}`;
  }

  if (sketchElements && sketchElements.length > 0) {
    merged = `${merged}\n\n[Sketch JSON]\n${JSON.stringify({
      type: 'sketch-v1',
      elements: sketchElements,
    })}`;
  }

  return merged;
}
