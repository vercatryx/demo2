/**
 * Portal v2 smoke checklist — run manually against demo clients (demof / demob) after enabling
 * portal_v2_enabled in Global Settings.
 *
 * - [ ] Home loads with Start Shopping + featured carousel
 * - [ ] Departments list vendors (food) or categories (boxes)
 * - [ ] Section landing → product grid with inline +/−
 * - [ ] Search jumps to item in grid
 * - [ ] Cart shows thumbnails; sort by vendor/section works
 * - [ ] Autosave + discard + weekly limit block still work
 * - [ ] Box category quota block on +
 * - [ ] Mobile bottom nav + split rail
 */

export const PORTAL_V2_QA_CHECKLIST = [
    'Home appears as first sidebar entry with welcome + featured sections',
    'Departments list vendors (food) or categories (boxes)',
    'Section landing → product grid with inline +/-',
    'Search jumps to item in grid',
    'Cart shows thumbnails; sort toggle works',
    'Autosave + discard + weekly limit block',
    'Box category quota block on +',
    'Mobile bottom nav + split rail',
] as const;
