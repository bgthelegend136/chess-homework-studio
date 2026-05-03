# Opening Coverage Stats Redesign

**Date:** 2026-05-03  
**File:** `app/(coach)/openings/[id]/LineCoverageExplorer.tsx`  
**Scope:** Frontend only — no DB or API changes required

---

## Problem

The current 6-bucket stat grid (Lines / Trained / Mastered / Weak / Untrained / Needs Master) is discouraging and misleading:

- A line with 10 trained positions and 1 weak position shows as "Weak" — hiding real progress
- A line is only "Mastered" when every single position is mastered — so "0 mastered" even after significant training
- "Trained" and "Needs Master" are redundant once you have a progress percentage
- Coaches see "30 weak, 0 mastered" and get no sense of forward momentum

## Goal

Replace the 6-card grid with a **progress-oriented header + 4 action-oriented buckets** that show where you are and what to work on next.

---

## Design

### 1. Progress Header Card

A single full-width card replaces the 6-bucket grid.

**Left side — two headline stats:**
- `X% positions mastered` — `masteredPositionCount / uniquePositions.length * 100`
- `X% lines touched` — lines where ≥1 position has been seen / total lines

The header card itself is clickable and resets the active filter to `'all'` (showing all lines). It gets a blue ring when `activeFilter === 'all'`, matching the existing selected-state style on the bucket cards.

**Right side — dual stacked progress bar:**
- Full-width bar with two colored fills:
  - Blue segment = % of positions trained (seen ≥1 time)
  - Green segment = % of positions mastered (subset of blue, rendered on top)
- Labels below: `"X trained · Y mastered"` with counts

### 2. Four Compact Stat Buckets

Below the header, 4 smaller cards replace the 6. Each is a clickable filter button.

| Bucket | Definition | Filter |
|--------|-----------|--------|
| **Weak** | Lines with ≥1 position at `mastery_level === 'weak'` | `'weak'` |
| **Untrained** | Lines with 0 positions seen (`times_seen === 0` for all) | `'untrained'` |
| **In Progress** | Lines with ≥1 seen, no weak positions, not fully mastered | `'inProgress'` |
| **Mastered** | Lines where ALL trainable positions are mastered | `'mastered'` |

Removed: `'trained'`, `'notMastered'` filter options.

### 3. Line Status Logic Changes

**`lineStatus` function — new priority order:**

1. If 0 positions seen → `'untrained'`
2. If any position is `'weak'` → `'weak'`
3. If all positions are `'mastered'` → `'mastered'`
4. Otherwise → `'in_progress'`

**Type changes:**
- `LineStatus`: `'trained'` removed, `'in_progress'` added
- `LineFilter`: `'trained'` and `'notMastered'` removed, `'inProgress'` added

**Individual line card badges** update accordingly: show `'in progress'` label instead of `'trained'`.

### 4. Position-Level Mastery Threshold

No change. `mastery_level === 'mastered'` is set in `actions.ts` when `correctCount >= 4 && currentStreak >= 3`. This threshold is correct and unchanged.

---

## Files Changed

| File | Change |
|------|--------|
| `app/(coach)/openings/[id]/LineCoverageExplorer.tsx` | Replace stat grid with progress header + 4 buckets; update `lineStatus`, `LineStatus` type, `LineFilter` type, filter logic, and line card status badges |

---

## Out of Scope

- Position-level mastery threshold (`actions.ts`) — unchanged
- Database schema — unchanged
- Any other page or component
