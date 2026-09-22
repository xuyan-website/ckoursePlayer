import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from "react";

export function useDetachableWindow(width = 480) {
  const [detached, setDetached] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!detached) return;
    const el = containerRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    setPos({
      x: Math.max(0, (window.innerWidth - width) / 2),
      y: Math.max(0, (window.innerHeight - h) / 2),
    });
  }, [detached, width]);

  const handleDetach = () => {
    if (detached) {
      setDetached(false);
      return;
    }
    setPos({
      x: Math.max(0, (window.innerWidth - width) / 2),
      y: Math.max(0, (window.innerHeight - 320) / 2),
    });
    setDetached(true);
  };

  const startDrag = (e: ReactMouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width ?? width;
    const h = rect?.height ?? 320;
    const origX = pos.x;
    const origY = pos.y;
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: MouseEvent) => {
      const nx = origX + (ev.clientX - startX);
      const ny = origY + (ev.clientY - startY);
      const maxX = Math.max(0, window.innerWidth - w);
      const maxY = Math.max(0, window.innerHeight - h);
      setPos({
        x: Math.min(Math.max(nx, 0), maxX),
        y: Math.min(Math.max(ny, 0), maxY),
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return { detached, pos, containerRef, handleDetach, startDrag, setDetached };
}
