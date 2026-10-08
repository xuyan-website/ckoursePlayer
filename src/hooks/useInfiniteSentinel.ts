import { useState, useEffect, useRef } from "react";

export function useInfiniteSentinel(total: number, batchSize = 20, rootMargin = "400px") {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(batchSize, total));
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(Math.min(batchSize, total));
  }, [total, batchSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + batchSize, total));
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, total, batchSize, rootMargin]);

  return { visibleCount, sentinelRef };
}
