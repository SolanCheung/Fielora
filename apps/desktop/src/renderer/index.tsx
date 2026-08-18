import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DesktopChrome } from './DesktopChrome';
import { Phase04Layer } from './Phase04Layer';
import { QuickCapture } from './QuickCapture';
import './styles.css';
import '../types';

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root is missing');
createRoot(root).render(<StrictMode><DesktopChrome><App /></DesktopChrome><QuickCapture /><Phase04Layer /></StrictMode>);
