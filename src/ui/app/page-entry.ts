// The only module that loads the app stylesheet. The router imports it on every route but #spike.
import "./app.css";
import { mountApp as mountAppPage } from "./views/app-page";
import { mountSpeedPage as mountSpeed } from "./views/speed-page";

export function mountApp(root: HTMLElement): void {
  document.title = "Hexorcist";
  mountAppPage(root);
}

export function mountSpeedPage(root: HTMLElement): void {
  document.title = "Hexorcist speed check";
  mountSpeed(root);
}