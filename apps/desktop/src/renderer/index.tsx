import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AgenticUXPrototype } from './AgenticUXPrototype';
import { DesktopChrome } from './DesktopChrome';
import { Phase04Layer } from './Phase04Layer';
import { QuickCapture } from './QuickCapture';
import { prototypeViewFromHash } from './agentic-ux-prototype-data';
import { applyAppPreferences, readAppPreferences } from './app-preferences';
import './styles/tokens.css';
import './styles/foundation.css';
import './styles.css';
import './styles/appearance.css';
import './styles/controls.css';
import './styles/agentic-ux-prototype.css';
import '../types';

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root is missing');
const initialDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
applyAppPreferences(document.documentElement, readAppPreferences(window.localStorage), { prefersDark: initialDark, prefersReducedMotion: initialReducedMotion });
const prototypeView = prototypeViewFromHash(window.location.hash);
createRoot(root).render(prototypeView
  ? <StrictMode><AgenticUXPrototype initialView={prototypeView} /></StrictMode>
  : <StrictMode><DesktopChrome><App /></DesktopChrome><QuickCapture /><Phase04Layer /></StrictMode>);
