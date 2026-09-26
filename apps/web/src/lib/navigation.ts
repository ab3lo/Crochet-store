import { CATEGORY_META } from '@crochet/shared';

interface NavLink {
  href: string;
  label: string;
  blurb?: string;
}

const customCategory = CATEGORY_META.find((category) => category.id === 'custom')!;

const categoryLinks: NavLink[] = CATEGORY_META.map((category) => ({
  href: category.href,
  label: category.title,
  blurb: category.blurb,
}));

/** Compact links for the inline desktop navigation. */
export const DESKTOP_SHOP_LINKS: NavLink[] = [
  ...CATEGORY_META.filter((category) => category.id !== 'custom').map((category) => ({
    href: category.href,
    label: category.title,
  })),
  { href: customCategory.href, label: 'Custom' },
];

/** Full category labels and descriptions for the mobile sheet. */
export const MOBILE_SHOP_LINKS: NavLink[] = [
  { href: '/', label: 'Everything' },
  ...categoryLinks,
];

export const SITE_INFORMATION_LINKS: NavLink[] = [
  { href: '/about', label: 'How it is made' },
  { href: customCategory.href, label: 'Custom orders' },
  { href: '/shipping', label: 'Collection & delivery' },
];

/** Custom orders already has its own category entry in the mobile shop list. */
export const MOBILE_INFORMATION_LINKS: NavLink[] = SITE_INFORMATION_LINKS.filter(
  (link) => link.href !== customCategory.href,
);

export const FOOTER_SHOP_LINKS = categoryLinks;

/** Match a route without mistaking sibling paths for nested children. */
export function isActivePath(path: string, href: string): boolean {
  const current = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  return href === '/'
    ? current === '/'
    : current === href || current.startsWith(`${href}/`);
}
