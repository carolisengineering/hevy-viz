---
name: Training Log
description: A lifter's full Hevy history kept like the notebook in a gym bag, hand-lettered in ballpoint on graph paper.
colors:
  ink: "#0e4f86"
  ink-soft: "#4a6f96"
  ink-line: "#5f86ae"
  accent: "#d81b60"
  select: "#ffc21a"
  paper: "#fcf9f2"
  grid: "#dce3ee"
  ink-dark: "#cfe2f7"
  ink-soft-dark: "#9db7d6"
  ink-line-dark: "#7f9bbe"
  accent-dark: "#ff5c93"
  paper-dark: "#121a26"
  grid-dark: "#1f2a3a"
typography:
  display:
    fontFamily: "Sue Ellen Francisco, Patrick Hand SC, cursive"
    fontSize: "54px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "Sue Ellen Francisco, Patrick Hand SC, cursive"
    fontSize: "42px"
    fontWeight: 400
    lineHeight: 1
  title:
    fontFamily: "Sue Ellen Francisco, Patrick Hand SC, cursive"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1
  figure:
    fontFamily: "Sue Ellen Francisco, Patrick Hand SC, cursive"
    fontSize: "46px"
    fontWeight: 400
    lineHeight: 1
  body-lg:
    fontFamily: "Patrick Hand SC, Segoe Print, cursive"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.15
    fontFeature: "tnum"
  body:
    fontFamily: "Patrick Hand SC, Segoe Print, cursive"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.3
    fontFeature: "tnum"
  control:
    fontFamily: "Patrick Hand SC, Segoe Print, cursive"
    fontSize: "18px"
    fontWeight: 400
    fontFeature: "tnum"
  label:
    fontFamily: "Patrick Hand SC, Segoe Print, cursive"
    fontSize: "17px"
    fontWeight: 400
    fontFeature: "tnum"
  caption:
    fontFamily: "Patrick Hand SC, Segoe Print, cursive"
    fontSize: "16px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  bar: "2px"
  label: "3px"
  control: "4px"
  box: "6px"
spacing:
  hair: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  page-phone: "20px"
  grid-cell: "24px"
  gutter: "36px"
  margin-inset: "136px"
components:
  box:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.box}"
    padding: "12px 16px"
  segmented:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "5px 12px"
  segmented-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "5px 12px"
  search-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "2px 10px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "4px 14px"
  button-link:
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    padding: "4px"
  tab:
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    padding: "0 2px 8px"
  tab-active:
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    padding: "0 2px 8px"
  cassette-label:
    textColor: "{colors.accent}"
    typography: "{typography.control}"
    rounded: "{rounded.label}"
    padding: "2px 10px"
  tooltip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.box}"
    padding: "6px 10px"
---

# Design System: Training Log

## Overview

**Creative North Star: "The Training Notebook"**

The training history is kept like the notebook in a lifter's gym bag: ivory graph paper, a raspberry margin rule, and everything written in one cerulean ballpoint. It's a working tool, not a showcase. Rows are dense and ruled. Headings and headline numbers are lettered by hand in traced capitals. Everything read in rows is set in a small-caps hand with tabular figures. The page reads as one sheet: sections are written straight onto the paper under a ruled line, and only a few self-contained figures (consistency, balance, the progress chart) get a box drawn around them.

Every mark is drawn rather than rendered: boxes are 2px ballpoint outlines with slightly rounded corners, bars are filled with a diagonal scribble, PRs get a hand-drawn star and a triple stripe, and the chart line draws itself in once like a pen stroke. Nothing floats. There are no shadows, gradients, or glass, and the only depth is ink over paper. The main lifts read as a cassette j-card tracklist: Side A lower, Side B upper, and a bonus side for full body and core, with track numbers that carry each lift's rank by sessions in the selected range.

Dark mode is the same notebook under a desk lamp, with deep blue-black paper, light cerulean ink, and brighter raspberry. The roles stay the same, and both themes meet the contrast floors. The header's theme control picks Auto (follow the system), Light or Dark, remembered per browser; a forced choice sets `data-theme` on the root, and `index.html` applies it before the page first draws.

**Key Characteristics:**
- One ink for text, lines, and fills, with a second (raspberry) pen for PRs, dates, flags, and the margin rule.
- Graph-paper ground (24px grid) on every surface; it is the world's own material, not decoration to strip.
- Two hands: traced display caps for headings and headline figures, a small-caps data hand for everything else.
- Ballpoint boxes, scribble fills, SVG stars and stripes; no Unicode glyph icons.
- One authored motion: the chart line's pen draw-in.

## Colors

One cerulean ink does almost everything on ivory graph paper. A raspberry pen marks what deserves attention, and sunflower appears only as a highlighter.

### Primary
- **Cerulean Ink** (light `ink`, dark `ink-dark`): all body text, headings, rules, box outlines, chart lines, sparklines, scribble fills, and the filled state of a chosen option. Measured 8.05:1 on light paper and 13.2:1 on dark paper.

### Secondary
- **Raspberry Pen** (light `accent`, dark `accent-dark`): PR stars and stripes, margin notes, log dates, the active-tab underline, the session-count label, light muscle groups, struck-through regressions, the chart crosshair, the text caret, the focus outline, and the margin rule. Measured 4.70:1 on light paper and 6.0:1 on dark, so it can carry small text.

### Tertiary
- **Sunflower Highlighter** (`select`, the same value in both themes): text selection (at 45% opacity), the focus outline inside a segmented control, and the keyboard focus ring on chart points. Nothing else.

### Neutral
- **Faded Ink** (light `ink-soft`, dark `ink-soft-dark`): secondary text such as summaries beside headings, captions, axis labels, units, column headers, and placeholders. Measured 4.99:1 on light paper and 8.47:1 on dark.
- **Line Ink** (light `ink-line`, dark `ink-line-dark`): lines only. Used for dividers between segmented options, the dashed bridge across a layoff, rest-day dots (at 45% opacity), tab hover underlines, and the scrollbar thumb. At 3.63:1 on light paper it never carries text.
- **Ivory Paper** (light `paper`, dark `paper-dark`): the page ground, control and tooltip fills, and the 80% wash inside boxes that softens the grid behind them.
- **Graph Grid** (light `grid`, dark `grid-dark`): the 24px graph-paper lines, the thin rules between table rows, and the chart's value grid.

### Named Rules
**The Ink Does Everything Rule.** Text, lines, and fills are cerulean ink. Raspberry marks something specific (a PR, a date, a flag, a regression, the current place), and sunflower only highlights. A new element that wants its own color is wrong.

**The No Gray Rule.** Secondary text is faded ink, never a neutral gray. Line ink is for strokes only, because it fails the 4.5:1 floor for text.

## Typography

**Display Font:** Sue Ellen Francisco (with Patrick Hand SC, cursive), self-hosted via @fontsource
**Body Font:** Patrick Hand SC (with Segoe Print, cursive), self-hosted via @fontsource, tabular numerals throughout

**Character:** A quick marker hand traced over in capitals for headings and headline numbers, paired with a neat small-caps print hand for data. It reads as written, not typeset.

### Hierarchy
- **Display** (400, 54px, 40px on phones, line-height 1): the "Training Log" wordmark only.
- **Headline** (400, 42px, line-height 1): section headings written on the page. View titles go slightly larger (46px), and the Balance view's "Every muscle" heading uses 34px.
- **Title** (400, 32px, line-height 1): box headings and the secondary figures on an exercise's ledger line.
- **Figure** (400, 46px, 36px on phones, line-height 1): headline numbers in the display hand, such as the tracklist's estimated 1RM. Larger one-offs follow the same treatment: the consistency pair at 66px (52px on phones) and an exercise's best-ever figure at 50px (42px on phones).
- **Body large** (400, 22px, line-height 1.15): tabs and tracklist lift names. Lists use 21px for exercise names and log titles.
- **Body** (400, 20px, line-height 1.3): the page default and table cells.
- **Control** (400, 18px): segmented options, the search field, link buttons, and the session label.
- **Label** (400, 17px): box-head notes, figure captions, and small notes.
- **Caption** (400, 16px): axis ticks, sub-lines under row names, ledger labels, and units. Units beside a display figure are written at 0.55em in the data hand.

### Named Rules
**The Traced Caps Rule.** The display hand is always uppercase at weight 400, traced with a stroke of 0.036em in the current color so it reads as ballpoint pressed twice. The data hand never gets the stroke, and units inside a display figure drop back to the data hand.

**The Two Hands Rule.** The display hand is for headings and headline figures only. Anything read in rows or columns is in the data hand with tabular numerals, so figures line up.

## Layout

A single sheet of graph paper. The page sits on a 24px grid. From 900px wide, a fixed raspberry margin rule (2px, 80% opacity) runs down the page 112px from the left edge. Content and header start right of it at a 136px inset, with 36px on the right, and PR margin notes sit in the margin column left of the rule, rotated -5°. Below 900px the margin rule and margin notes disappear (the star still marks the PR), and the page uses 20px side padding. Content is capped at 1600px.

The header is a grid that changes shape across four widths. From 1600px it's one line: wordmark, tabs, controls, label. From 1240px to 1599px, the wordmark, controls, and label share the top row and the tabs sit on the rule below. From 700px to 1239px, the controls get their own row above the tabs. Below 700px it goes wordmark and label, then tabs on an edge-to-edge rule, then controls with a full-width search. The header's 3px ink rule closes it on wider screens, and the active tab's underline sits on that rule.

The Overview becomes two columns from 1360px: the tracklist and latest entries on the left, and the consistency and balance boxes in a side column of clamp(380px, 30vw, 440px). Below that everything stacks. On phones the tracklist keeps rank, name (with the best set beneath), change, and estimated 1RM, and drops the sparkline and best-set columns. The Balance view caps at 920px.

The rhythm is small and dense: 4 to 12px inside rows and heads, 16 to 20px between boxes, and 36px gutters between major blocks. Tracklist rows are 50px tall on wide screens. Empty ranges and table views keep the chart's 340px height so switching ranges doesn't make the page jump.

**The Margin Rule.** From 900px the raspberry rule is fixed at 112px and nothing but margin notes crosses to its left. Below 900px the margin disappears completely rather than shrinking.

## Elevation & Depth

Flat paper. There are no box shadows anywhere. Depth comes from ink over paper: 2px ink outlines draw a box, and an 80% paper wash inside the box quiets the grid behind its contents. Tooltips are the same ballpoint box laid over the chart, with no lift. Hover is shown with a 10% ink wash on controls or an underline on links, never by raising anything.

**The Flat Paper Rule.** Nothing casts a shadow or floats. If an element needs separating, draw a line or a box around it in ink.

## Shapes

Hand-drawn geometry: corners that are only slightly rounded, as if drawn with a pen. Boxes and tooltips use 6px corners, controls (segmented groups, search, outline buttons) use 4px, the cassette label uses 3px, and bars use 2px. All outlines are 2px ink, except the cassette label's 2px raspberry. Rules come in three weights: 3px for the header, 2px under section and box heads and table headers, and 1px grid-color hairlines between rows. Bars are filled with a diagonal scribble (6px pattern rotated 32°, 3.6px strokes over a 20% ink tint) and outlined in 1.5px ink. Light muscle groups get a raspberry scribble with no tint.

Marks are SVG, drawn in the current color: a slightly irregular five-point star (shared by the tracklist, log, and chart PR markers), a triple stripe of three 3px rounded strokes, a magnifier, and a back arrow. Strokes use round caps and joins.

## Components

### Buttons
Words written in ink, not chips.
- **Shape:** gently rounded (4px) when outlined, none when a link.
- **Outline ("Show all"):** a 2px ink outline on paper at 18px with 4px 14px padding. Hover adds a 10% ink wash.
- **Link button ("Show table", "Show all time"):** no border or fill, underlined 3px below the text, 4px padding.
- **Focus:** the global dashed 2px raspberry outline, offset 3px.

### Segmented controls
One ballpoint box holding a radio group (date range, kg/lb, theme).
- **Style:** 2px ink outline, 4px corners, options separated by 1px line ink, 18px data hand, 5px 12px padding.
- **Icon options:** the theme control draws each option as an 18px ink icon (a half-shaded circle for Auto, a sun, a moon) with 5px 9px padding. The option's name stays readable to screen readers and shows as a tooltip.
- **State:** the chosen option fills solid ink with paper text. Hover adds a 10% ink wash. Keyboard focus is a sunflower outline inset 4px, which is the only place sunflower meets a control. Arrow keys move the choice, as in any radio group.

### Search field
- **Style:** a 2px ink outline with 4px corners, a drawn magnifier, and an 18px input with a faded-ink placeholder. It's 170px wide in the header and full width on phones.
- **Focus:** the outline goes on the whole field: dashed 2px raspberry, offset 3px.

### Navigation
- **Style:** three tabs (Overview, Exercises, Balance) as links in the 22px data hand, 26px apart, each with a 4px bottom border that sits on the header rule.
- **States:** the active tab (`aria-current`) gets a raspberry underline, and hover gets a line-ink underline.
- **Mobile:** 21px tabs, 22px apart, on an edge-to-edge 3px ink rule.

### Boxes
- **Corner Style:** 6px.
- **Background:** an 80% paper wash over the grid.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 2px ink.
- **Internal Padding:** 12px 16px.
- **Head:** a title in the display hand at 32px with a faded note at the right, ruled underneath in 2px ink.

### Section heads
A heading written straight on the page: the headline display hand on the left, a faded summary to the right on the same baseline (wrapping beneath on narrow screens), and a 2px ink rule underneath. The summary is never placed above the heading.

### Tracklist (signature)
The main lifts as a cassette j-card: sides labeled "Side A — Lower", "Side B — Upper", and "Bonus tracks", rows numbered 01, 02, and so on by session rank, then the name (with a PR star kept on the same line as the last word), best set, change, a 130 by 30 ballpoint sparkline, and the estimated 1RM in the figure hand with a raspberry stripe for PR rows. A fall is struck through in raspberry. Rows are ruled with 1px grid lines.

### Cassette label
The session count in a raspberry outline (2px, 3px corners): the count in the display hand at 30px, "sessions" in the data hand, a "Sample data" tag after a 1px raspberry divider, and the triple stripe.

### Progress chart (signature)
- **Line:** 2.4px ink with round joins and caps. A layoff is bridged with a faint 1.5px dashed line-ink stroke (3 5) instead of a joined line.
- **PRs:** raspberry stars on the line.
- **Axes:** 16px faded-ink ticks over 1px grid lines. The current value is lettered at the line's end in 22px display caps.
- **Interaction:** a dashed raspberry crosshair, a ballpoint tooltip box with the value in 26px traced caps, and a sunflower ring on the keyboard-focused point.
- **Motion:** the line draws itself in like a pen (pathLength plus stroke-dashoffset, 900ms, cubic-bezier(0.16, 1, 0.3, 1)), once per data change, never on resize, and not at all under prefers-reduced-motion.

### Scribble bars
Working sets per week per muscle group: the name, a scribble-filled bar against the busiest group, and the value. Groups under half the median are written in raspberry with a raspberry scribble, and screen readers hear "(light)".

### Consistency dot grid
A year of days as dots in an SVG that scales through its viewBox. Dot area grows with working sets. This month's dots are raspberry, and rest days are tiny line-ink dots at 45% so gaps read as empty days.

### Ledger line
An exercise's figures read across one ruled line: the best ever leads at 50px, then the other figures in title-size caps with captions beneath, and a 1px grid rule under the whole line.

## Do's and Don'ts

### Do:
- **Do** write every text and line in cerulean ink, and reach for raspberry only to mark a PR, a date, a flag, a regression, or the current place.
- **Do** use faded ink (`ink-soft`) for secondary text, and keep line ink for strokes.
- **Do** draw containers as 2px ink outlines with 4 to 6px corners on an 80% paper wash, and keep the graph-paper grid visible on every view.
- **Do** set headings and headline figures in uppercase traced display caps (stroke 0.036em), and everything in rows in the data hand with tabular numerals.
- **Do** draw marks (stars, stripes, icons, sparklines) as inline SVG in `currentColor`, and hide decorative ones from screen readers.
- **Do** keep gaps and regressions visible: dashed bridges across layoffs, raspberry strike-through for falls, faint dots for rest days, and empty ranges that hold the chart's height.
- **Do** check contrast in both themes: 4.5:1 for body and small text, 3:1 for large display text.

### Don't:
- **Don't** add shadows, gradients, glass, or any lift. The paper is flat.
- **Don't** add motion beyond the chart's pen draw-in, and never replay it on resize.
- **Don't** use gray text or set text in line ink.
- **Don't** use sunflower for anything except selection and focus highlights.
- **Don't** use thick colored left borders on rows.
- **Don't** build card grids or hero-metric templates. Sections are written on the page, and boxes are kept for self-contained figures.
- **Don't** put eyebrow labels above headings. Summaries sit beside or after the heading, and track numbers appear only because they carry rank.
- **Don't** use Unicode glyphs or icon fonts as icons.
- **Don't** load web fonts from a CDN. Both hands are self-hosted.
