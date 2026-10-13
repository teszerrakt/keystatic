import { Config } from '../../config';
import { hasDrafts } from './drafts';
import { HomePage } from './home-page';
import { ImagesPage } from './images-page';
import { PagesPage } from './pages-page';
import { ReviewPage } from './review-page';
import { menuSetup } from './menu-sections-data';
import { MenuSectionsPage } from './sections-page';

export const PLUS_PAGES = [
  'publish',
  'pages',
  'menu-sections',
  'images',
] as const;
export type PlusPage = (typeof PLUS_PAGES)[number];

type Params = {
  plus?: PlusPage;
  collection?: string;
  kind?: string;
  singleton?: string;
};

// Pages the fork adds, or swaps in for Keystatic's dashboard and collection lists.
export function plusRoute(config: Config, params: Params) {
  if (params.plus === 'publish') return <ReviewPage />;
  if (params.plus === 'pages') return <PagesPage />;
  if (!hasDrafts(config)) return null;
  if (params.plus === 'menu-sections') return <MenuSectionsPage />;
  if (params.plus === 'images') return <ImagesPage />;
  if (params.singleton && params.singleton === menuSetup(config)?.singleton) {
    return <MenuSectionsPage />;
  }
  if (!params.collection && !params.singleton) return <HomePage />;
  if (params.collection && !params.kind) return <PagesPage />;
  return null;
}
