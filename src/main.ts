import './styles.css';
import { parseConfig } from './config';

const config = parseConfig();
if (config) {
  void import('./form-app').then(({ startFormApp }) => startFormApp(config));
} else {
  void import('./dashboard').then(({ startDashboard }) => startDashboard());
}
