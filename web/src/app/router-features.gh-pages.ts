import { RouterFeatures, withHashLocation } from '@angular/router';

/** GitHub Pages can't rewrite deep links to index.html, so routes live in the URL hash. */
export const routerFeatures: RouterFeatures[] = [withHashLocation()];
