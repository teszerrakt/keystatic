import { Config } from '../../config';
import { isDraftsOnly } from './drafts';
import { HomePage } from './home-page';
import { PagesPage } from './pages-page';
import { ReviewPage } from './review-page';
import { menuSetup } from './menu-sections-data';
import { MenuSectionsPage } from './sections-page';

type Params = {
  plus?: 'publish' | 'pages' | 'menu-sections';
  collection?: string;
  kind?: string;
  singleton?: string;
};

// Pages the fork adds, or swaps in for Keystatic's dashboard and collection lists.
export function plusRoute(config: Config, params: Params) {
  if (params.plus === 'publish') return <ReviewPage />;
  if (params.plus === 'pages') return <PagesPage />;
  if (!isDraftsOnly(config)) return null;
  if (params.plus === 'menu-sections') return <MenuSectionsPage />;
  if (params.singleton && params.singleton === menuSetup(config)?.singleton) {
    return <MenuSectionsPage />;
  }
  if (!params.collection && !params.singleton) return <HomePage />;
  if (params.collection && !params.kind) return <PagesPage />;
  return null;
}
