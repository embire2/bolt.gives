import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const glowElement = glowRef.current;

    if (!glowElement) {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(pointer: fine)');

    if (!mediaQuery.matches) {
      glowElement.style.opacity = '0';
      return undefined;
    }

    let rafId = 0;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;

    const render = () => {
      const glowDiameter = glowElement.offsetWidth || 480;
      const centeredX = targetX - glowDiameter / 2;
      const centeredY = targetY - glowDiameter / 2;
      glowElement.style.transform = `translate3d(${centeredX}px, ${centeredY}px, 0)`;
      rafId = 0;
    };

    const scheduleRender = () => {
      if (rafId) {
        return;
      }

      rafId = window.requestAnimationFrame(render);
    };

    const handleMove = (event: MouseEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      glowElement.style.opacity = '1';
      scheduleRender();
    };

    const handleMouseLeave = () => {
      glowElement.style.opacity = '0';
    };

    const handleMouseEnter = () => {
      glowElement.style.opacity = '1';
      scheduleRender();
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mouseenter', handleMouseEnter);
    window.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseenter', handleMouseEnter);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [hostElement]);

  useEffect(() => {
    const container = document.createElement('div');
    container.className = 'bolt-cursor-glow-wrapper';
    document.body.appendChild(container);
    setHostElement(container);

    return () => {
      document.body.removeChild(container);
    };
  }, []);

  if (!hostElement) {
    return null;
  }

  return createPortal(<div ref={glowRef} aria-hidden className="bolt-cursor-glow" />, hostElement);
}
