# Fix bottom navigation pill glitching through intermediate tabs

## Problem

When tapping a non-adjacent tab (e.g. Home → Finance), the user sees:
1. The pill visibly "passes through" intermediate tabs
2. Intermediate route pages briefly flash on screen
3. Occasional lag before the final page settles

## Root cause

In `src/components/BottomNav.tsx` the pill's target position is derived from `useLocation().pathname` inside a `useLayoutEffect`. That means the pill only starts moving **after** TanStack Router commits the new route. Combined with:

- Route loaders that suspend (TanStack Query `ensureQueryData`) → the destination route's Suspense fallback or previous route stays mounted while the pill is still pointing at the old tab.
- A long 520ms spring (`cubic-bezier(0.34, 1.3, 0.4, 1)`) with overshoot → the lag becomes very visible.
- `<Link>` clicks during a slow nav can interleave with React's concurrent rendering, so intermediate route states paint for a frame.

The pill is reactive to route state rather than to the user's intent, which is why it feels like it "walks through" pages.

## Fix

Make the pill move **immediately on tap**, independent of when the route actually commits. Keep `pathname` only as a fallback / sync source.

### Changes (frontend-only, `src/components/BottomNav.tsx`)

1. Add `targetKey` state, initialized from `activeKey`.
2. On each tab `<Link>` / "Ещё" button, add `onPointerDown` (and `onClick`) that sets `targetKey` to that tab's key synchronously — pill animates from current to target right away.
3. Drive the indicator `useLayoutEffect` from `targetKey` instead of `activeKey`.
4. Add a second `useEffect` that syncs `targetKey ← activeKey` whenever `pathname` changes (covers back/forward nav and external navigation).
5. Shorten the spring slightly and reduce overshoot to feel snappier:
   - `transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1), width 320ms cubic-bezier(0.22, 1, 0.36, 1)`
6. Keep the existing resize listener, but key it off `targetKey`.

### Why this fixes the symptoms

- Pill movement is decoupled from route commit → no more "waiting for pathname, then jumping".
- Because pill goes straight to the tapped tab in one tween, there's no visual illusion of stopping at intermediate tabs.
- Any brief intermediate render of route content (from Suspense ordering) is still possible, but the *pill* no longer reinforces the perception, and the shorter, non-overshoot easing removes the lag feel.

## Out of scope

- No changes to routing, route loaders, design tokens, or any business logic.
- No changes to the "Ещё" sheet behavior or overdue badge.
- No backend / DB / auth changes.

## Files touched

- `src/components/BottomNav.tsx` (only)
