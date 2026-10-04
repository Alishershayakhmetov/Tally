// The app's entry. Expo Router's entry renders the app; the widget handler is
// registered beside it so Android can run it headless when a widget is tapped.
import 'expo-router/entry';

import { registerWidgetHandlers } from './src/widgets';

registerWidgetHandlers();
