import { Config } from '../../config';
import { isDraftsOnly } from './drafts';
import { HomePage } from './home-page';
import { ImagesPage } from './images-page';
import { PagesPage } from './pages-page';
import { ReviewPage } from './review-page';
import { menuSetup } from './menu-sections-data';
import { MenuSectionsPage } from './sections-page';

export const KLAY_PAGES = [
  'publish',
  'pages',
  'menu-sections',
  'images',
] as const;
export type KlayPage = (typeof KLAY_PAGES)[number];

type Params = {
  klay?: KlayPage;
  collection?: string;
  kind?: string;
  singleton?: string;
};

// Pages the fork adds, or swaps in for Keystatic's dashboard and collection lists.
export function klayRoute(config: Config, params: Params) {
  if (params.klay === 'publish') return <ReviewPage />;
  if (params.klay === 'pages') return <PagesPage />;
  if (!isDraftsOnly(config)) return null;
  if (params.klay === 'menu-sections') return <MenuSectionsPage />;
  if (params.klay === 'images') return <ImagesPage />;
  if (params.singleton && params.singleton === menuSetup(config)?.singleton) {
    return <MenuSectionsPage />;
  }
  if (!params.collection && !params.singleton) return <HomePage />;
  if (params.collection && !params.kind) return <PagesPage />;
  return null;
}
