import { useEffect, useRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { spacing } from '@/theme';

/**
 * A sideways-scrolling row for a mouse: a scrollbar to drag, and the wheel scrolls it
 * sideways (a wheel only turns up and down). At either end the wheel is left alone,
 * so the page behind scrolls on.
 */
export function HorizontalScroll({ contentContainerStyle, ...props }: ScrollViewProps) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    // react-native-web's ScrollView hands out the DOM element it scrolls.
    const node = (
      ref.current as unknown as { getScrollableNode?: () => HTMLElement } | null
    )?.getScrollableNode?.();
    if (!node) return;
    function onWheel(event: WheelEvent) {
      if (!node || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const next = Math.min(node.scrollWidth - node.clientWidth, Math.max(0, node.scrollLeft + event.deltaY));
      if (next === node.scrollLeft) return;
      node.scrollLeft = next;
      event.preventDefault();
    }
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator
      {...props}
      // Room for the scrollbar under the row.
      contentContainerStyle={[{ paddingBottom: spacing.sm }, contentContainerStyle]}
    />
  );
}
