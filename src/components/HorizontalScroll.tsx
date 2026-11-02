import { ScrollView, type ScrollViewProps } from 'react-native';

/**
 * A sideways-scrolling row. On a phone it is a plain ScrollView (a finger swipes it).
 * HorizontalScroll.web.tsx is the Windows app's: with a mouse there is no swipe, so
 * it shows a scrollbar and answers the wheel.
 */
export function HorizontalScroll(props: ScrollViewProps) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} {...props} />;
}
