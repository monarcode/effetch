---
name: Effetch
description: Typed HTTP calls for Effect, set as a type specimen of one call and its reference volume.
colors:
  lime: "#d5f70d"
  ink: "#16171d"
  paper: "#ecedf1"
  steel: "#8a8d99"
  skin: "#c4c6ce"
  rule: "#2a2c36"
typography:
  specimen:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(60px, 5.6vw, 96px)"
    fontWeight: 300
    lineHeight: 0.98
    letterSpacing: "-0.035em"
    fontVariation: "'MONO' 0"
  display-closing:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3rem, 8.2vw, 7.5rem)"
    fontWeight: 900
    lineHeight: 0.96
    letterSpacing: "-0.03em"
    fontVariation: "'MONO' 0"
  path:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(30px, 4.2vw, 60px)"
    fontWeight: 300
    lineHeight: 1.02
    letterSpacing: "-0.035em"
    fontVariation: "'MONO' 0"
  headline:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.025em"
    fontVariation: "'MONO' 0"
  headline-phone:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.025em"
    fontVariation: "'MONO' 0"
  title:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
    fontVariation: "'MONO' 0"
  title-phone:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
    fontVariation: "'MONO' 0"
  title-tablet:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
    fontVariation: "'MONO' 0"
  names:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(22px, 2.4vw, 32px)"
    fontWeight: 760
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontVariation: "'MONO' 0"
  title-small:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.3
    fontVariation: "'MONO' 0"
  body:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
    fontVariation: "'MONO' 0"
  body-small:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "'MONO' 0"
  button:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
    fontVariation: "'MONO' 0"
  code:
    fontFamily: "Recursive Variable, ui-monospace, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.8
    fontFeature: "'liga' 0, 'calt' 0"
    fontVariation: "'MONO' 1"
  label:
    fontFamily: "Recursive Variable, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.02em"
    fontFeature: "'liga' 0, 'calt' 0"
    fontVariation: "'MONO' 1"
  label-small:
    fontFamily: "Recursive Variable, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.3
    fontFeature: "'liga' 0, 'calt' 0"
    fontVariation: "'MONO' 1"
  display-404:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.03em"
    fontVariation: "'MONO' 0"
  display-404-phone:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.03em"
    fontVariation: "'MONO' 0"
  headline-docs:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontVariation: "'MONO' 0"
  subhead-docs:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.012em"
    fontVariation: "'MONO' 0"
  body-reading:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.75
    fontVariation: "'MONO' 0"
  body-reading-phone:
    fontFamily: "Recursive Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
    fontVariation: "'MONO' 0"
rounded:
  none: "0px"
  thumb: "999px"
spacing:
  margin-phone: "16px"
  margin-wide: "48px"
  column-gap: "24px"
  section: "96px"
  section-phone: "80px"
  column: "90rem"
  measure: "68ch"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 24px"
    height: "48px"
  install-field:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.code}"
    rounded: "{rounded.none}"
    height: "48px"
  switch-on:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    size: "28px 16px"
  switch-off:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.steel}"
    rounded: "{rounded.none}"
    size: "28px 16px"
  preset:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.steel}"
    rounded: "{rounded.none}"
    padding: "6px 8px"
    height: "52px"
  preset-pressed:
    textColor: "{colors.paper}"
  path-option:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.steel}"
    typography: "{typography.code}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
    height: "44px"
  path-option-pressed:
    textColor: "{colors.paper}"
  path-specimen:
    textColor: "{colors.paper}"
    typography: "{typography.path}"
  range-thumb:
    backgroundColor: "{colors.lime}"
    rounded: "{rounded.thumb}"
    size: "22px"
  nav-link:
    textColor: "{colors.steel}"
    height: "44px"
  docs-sidebar-item:
    textColor: "{colors.steel}"
    typography: "{typography.body-small}"
  docs-sidebar-item-current:
    textColor: "{colors.paper}"
  docs-toc-link:
    textColor: "{colors.steel}"
  docs-toc-link-current:
    textColor: "{colors.paper}"
  docs-action:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.steel}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  docs-action-hover:
    textColor: "{colors.paper}"
  docs-prose-link:
    textColor: "{colors.paper}"
  docs-inline-code:
    textColor: "{colors.paper}"
    typography: "{typography.code}"
    rounded: "{rounded.none}"
    padding: "0.08em 0.36em"
  docs-code-block:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.skin}"
    typography: "{typography.code}"
    rounded: "{rounded.none}"
  docs-callout:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.skin}"
    rounded: "{rounded.none}"
    padding: "16px 18px"
  docs-tab-current:
    textColor: "{colors.paper}"
  docs-pager-item:
    textColor: "{colors.paper}"
    padding: "16px 0 20px"
  docs-search-dialog:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
---

# Design System: Effetch

## Overview

**Creative North Star: "The Type Specimen"**

The landing page is a type foundry's specimen sheet, printed on ink. Where a foundry sets one face at display size and shows it across its axes, Effetch sets one call's inferred signature, `Effect<value, errors, never>`, at display size and puts the call's real options beside it as controls. Every signature and path type on the page is a Twoslash result compiled from real code, never typed by hand: the paths section sets a route string the same way, literal segments at the hairline and its parameters at full weight, beside the names TypeScript reads from it and the error a wrong call gets. The options move the signature along the weight axis: a member that enters arrives at the hairline and thickens in place; a member that leaves thins to the hairline as its width closes.

The docs are the specimen's reference volume, printed on the same sheet. Fumadocs' notebook layout keeps the structure (sidebar, page, contents rail, search), and the site paints it in the specimen's tokens: the landing page's masthead runs over it, every surface is ink, every line is a rule hairline, every corner is square, and code is set in the same greys by role as the landing page's code, with Twoslash hovers on every example. The 404 page sits in the landing page's world.

One variable family, Recursive, carries everything on both. Its sans (MONO 0) sets the specimen and the prose; its mono (MONO 1) sets code, labels, the compiled call and the path list. Hierarchy comes from weight and size on that one family, from paper against steel, and from hairline rules. There are no cards, no cast shadows, no gradients, no blur and no rounded corners, apart from two small circles: the slider's thumb and the sidebar's current-page dot. Lime appears only where something is live or current, is the success value, or is the primary action. The system is dark only.

**Key Characteristics:**

- One family, Recursive Variable, weights 300 to 1000, switched between sans and mono on its MONO axis, on the landing page and in every docs `<code>`.
- Weight carries the meaning: the value at 900 in lime, errors at 640, context at 420, punctuation at the 300 hairline.
- Flat ink ground; structure comes from 1px hairline rules and ruled rows in rule grey.
- Square everywhere except the slider's thumb and the sidebar's current-page dot.
- Lime at its exact value only, never tinted, faded, blurred or glowing.
- Motion moves along the weight axis on the landing page, one orchestrated remap per change; the docs move only colour, borders and underline thickness. Everything snaps under reduced motion.

## Colors

A cool, near-neutral ink-and-paper palette with one acid accent, used at its exact value.

### Primary

- **Signal Lime** (lime): on the landing page, the success value in every signature, a switch that's on, the slider's thumb, the inset outline on a pressed preset or path, and Get started, the page's one lime-filled action. On both: the focus ring, text selection, the caret and the brace-and-dot mark. In the docs: the current page's dot in the sidebar, the contents rail's thumb and the phone contents row's progress arc, the 2px rule under the current tab, the 2px inset rule on the selected search result, the underline on search matches, and the 1px underline on a link in the reading column. On the 404 page, Read the docs is the one lime fill. It is the brand's colour and appears exactly as specified or not at all.

### Neutral

- **Ink** (ink): the ground everywhere, landing and docs, including the sidebar, popovers, the search dialog, code blocks and the phone drawer; and the knob of a switch that's on. There is no second ground. The one derived value is the scrim behind the phone drawer and the search dialog: ink at 86% opacity, with no blur.
- **Paper** (paper): the type, at 15.3:1 on ink. Headings, the specimen's errors, lit code, a pressed preset's name; in the docs, the current sidebar page, the current contents entry, links, inline code, strings and declared names in code, and a callout's title.
- **Steel** (steel): secondary text, leads, labels, punctuation and brackets in the signature, the context type, closed members, a switch that's off; in the docs, sidebar and contents entries at rest, the page lead, table heads, keywords, punctuation and comments in code, the callout icon, and a warning callout's border. 5.4:1 on ink, so it still reads as text.
- **Skin** (skin): code text and a path's literal segments, at 10.5:1, between paper and steel; in the docs it is also the body of the reading column, callout bodies and Twoslash popups, so long prose reads a step below its headings.
- **Rule** (rule): every hairline, ruled row and border, the slider's track, inline code's box, the code block's frame. Never used as a text colour.

### Named Rules

**The Exact Lime Rule.** Lime is `#d5f70d` at full opacity or it is absent: no tints, no alpha, no blur, no glow, no gradient. Its tonal ramp is one value on purpose. Where Fumadocs mixes its primary with transparency, the docs override it with the exact token.

**The One Lime Fill Rule.** One lime-filled action in view at most: Get started on the landing page, Read the docs on the 404 page, none in the docs. A pressed preset, a pressed path and the selected search result take a 2px lime inset rule, never a lime fill. The switch track, the slider thumb, the sidebar dot, the contents thumb and the mark are lime indicators, not actions. A link in the reading column is paper text on a 1px lime underline, 2px on hover: the docs' one use of lime on text you can follow.

**The Steel Is Text Rule.** Secondary information is set in steel, not in a dimmed paper or an alpha white, so every grey on the site is one of the named neutrals. The docs' Fumadocs tokens (muted, card, popover, secondary, accent) are set to ink, paper and steel exactly.

## Typography

**Display Font:** Recursive Variable, MONO 0 (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Recursive Variable, MONO 0
**Label/Mono Font:** Recursive Variable, MONO 1, ligatures and contextual alternates off

**Character:** A single variable family that is both the specimen and the instrument: its sans at display weights carries the signature, and the same family flipped to mono reads as the code that produced it. In the docs, `--font-sans` and `--font-mono` both name Recursive, and the mono variable sets MONO 1 with `liga` and `calt` off, so every `<code>`, `<pre>`, `<kbd>` and `<samp>` is Recursive mono.

### Hierarchy

- **Specimen** (300 to 900 by role, `clamp(60px, 5.6vw, 96px)` at 1024px and up, `clamp(40px, 6.1vw, 68px)` from 640px, `clamp(28px, 8.6vw, 52px)` on phones, line-height 0.98, letter-spacing -0.035em): the live signature in the first viewport. Later signatures use the same type at smaller clamps, from about 22px on phones to 52px on wide screens.
- **Display Closing** (900 with a 300 steel first line, `clamp(3rem, 8.2vw, 7.5rem)`, line-height 0.96): the landing page's closing line only, showing the axis the page has used, hairline then heaviest.
- **Display 404** (600 with a 300 steel first line, 3.5rem from 640px, 2.5rem below, line-height 1.02, -0.03em, at most 18ch): the 404 heading, "This path has" over "no page.", the closing line's pattern at a smaller size.
- **Headline** (600, 2.75rem from 640px, 2rem below, line-height 1.05, -0.025em, balanced): landing section headings, on a hairline, with a steel lead beside them in columns 8 to 12.
- **Title** (700, 2.25rem, line-height 1.08, -0.02em, balanced): the landing H1 from 1024px (2.5rem from 640px to 1024px, 1.625rem on phones), and every docs page's title (2.25rem from 640px, 1.625rem below).
- **Headline Docs** (600, 1.625rem, line-height 1.15, -0.02em, balanced): a docs h2, on a hairline with 22px above the text, 56px above the rule.
- **Subhead Docs** (600, 1.25rem, line-height 1.25, -0.012em): a docs h3. An h4 is 600 at 1.0625rem.
- **Names** (760 names with 300 steel quotes and bars, `clamp(22px, 2.4vw, 32px)`, line-height 1.15): the parameter-name union beside a path, under "params needs".
- **Title Small** (600, 19px): the wordmark beside the mark, and the Compare section's two column headings. A docs pager title is the same voice at 17px.
- **Body** (400, 17px, line-height 1.5 to 1.55, steel, 36 to 56ch): landing leads and descriptions, the docs page lead under the title (at most 56ch), and the 404 lead.
- **Body Reading** (400, 17px from 1024px, 16px below, line-height 1.75, skin): the docs reading column. Prose is capped at 68ch; code blocks, tables and type tables take the column's full width.
- **Body Small** (400, 15px, line-height 1.5): nav and footer links, the preset names, the Compare rows' notes, the specifications' notes; in the docs, sidebar entries (line-height 1.35), table cells, callout bodies and pager descriptions. Contents entries are 14px.
- **Button** (600 for Get started, 400 for the caption, 16px): Get started and Read the docs, and the hero caption from 640px.
- **Code** (MONO 1, 400, 13 to 13.5px on a 1.75 to 1.8 line-height; 14px in the controls; 12px on landing phones, 12.5px in docs blocks below 640px): code samples, coloured by role: text in skin, keywords and punctuation in steel, strings in paper. Docs blocks add comments to steel and numbers and declared names to paper. Inline code sits at 0.86em of its line.
- **Label** (MONO 1, 400, 12px, line-height 1.4, letter-spacing 0.02em, steel, sentence case): legends over controls ("The call", "Instances"), the facts beside a path; in the docs, the masthead descriptor, "On this page", the trail over a nested page's title, table heads, a code block's title bar and the pager's "Previous" and "Next".
- **Label Small** (MONO 1, 400, 11px, line-height 1.3, steel): a preset's second line, what it adds ("+ output").

### Named Rules

**The Weight Is Role Rule.** Weight says what a thing is, never decoration. In a signature: value 900 in lime, errors 640 in paper, context 420 in steel, punctuation and brackets 300 in steel; a member leaving drops to 300 in steel. In the docs the same idea holds at reading size: the current sidebar page steps to 600, headings are 600, titles 700, links 500, prose 400.

**The One Family Rule.** Every glyph on the site is Recursive. Sans and mono are the MONO axis at 0 and 1, never a second family; Fumadocs' sans and mono variables both point at it.

**The Sans Sets, Mono Shows Rule.** MONO 0 sets the specimen, headings and prose; MONO 1 sets code, labels, the compiled call, the path list and the compiler's messages. Mono never sets a heading. In the docs' contents rail the label is mono and the entries are sans.

## Layout

On the landing page, a twelve-column grid inside a 90rem column, with a 16px outer margin on phones and 48px from 768px, and a 24px column gap. Sections open on a full-width hairline with the heading in columns 1 to 7 and its lead in columns 8 to 12, and are spaced 80px apart on phones and 96px from 640px.

The first viewport is two bands. The top band runs full width: the live signature, then under a hairline the caption in columns 1 to 7, which says what the last change did, and in columns 8 to 12 the compiled call and plugins in mono. The bottom band puts the call's options and the client's plugins, as switches set in code, with the four instances under them, in columns 1 to 7, and the H1, lead, install field and Get started in columns 8 to 12. On phones the order becomes the H1, Get started, the signature and its caption, the switches and instances, then the lead and install field.

The signature's box is held at the tallest combination by hidden sizers stacked in the same grid cell, so nothing below it moves when an option changes. Breakpoints are 640px, 768px and 1024px. The sections run hero, Compare, Paths, Narrowing, Specifications, Closing. In Paths, the path list takes columns 1 to 4 and the path specimen with its facts takes columns 5 to 12 from 1024px; each fact is a ruled row with an 8.5rem label column from 640px and stacked below 640px.

The docs use Fumadocs' notebook layout in top-nav mode. The landing page's masthead runs full width over the sidebar and the page, at the same 16px then 48px inset from 768px, so the mark and Search stay put between the two. Under it, from 768px, the sidebar sits on the left behind a rule hairline; below 768px it becomes a drawer opened from the masthead. The page opens with its head (the trail on nested pages, title, lead, the Copy Markdown and Open buttons) closed by a hairline, then the reading column, then previous and next. The contents rail sits on the right at wide widths; narrower, it becomes a contents row under the masthead.

The 404 page uses the landing column and masthead, with the heading 64px under the masthead (96px from 640px), the lead 24px under it, and its two links 40px under that.

**The Wrapper Spacing Rule.** Specimen styles and the docs paint layer are unlayered, so they beat Tailwind and Fumadocs utilities. Put margins and padding on a wrapper around a signature, never on the signature element itself; and the docs layer sets colour, borders, type and inner spacing only, never display, position, size or transforms, which drive the sidebar's collapse, the drawer and the grid.

## Elevation & Depth

The site is flat. There are no cast shadows, no blur and no tonal layering: every surface is ink, including the docs' popovers, Twoslash popups, the search dialog and the phone drawer, each of which takes a 1px rule border and no shadow. Behind a dialog or the drawer, the scrim is ink at 86% with no backdrop blur. The only `box-shadow` in the system is a 2px lime inset rule that marks a pressed preset, a pressed path or the selected search result, which reads as a stroke, not a shadow.

**The Hairline Not Shadow Rule.** Separate with a 1px rule line, never with a shadow, a card, a raised surface or a background panel. In the docs that covers h2s, the page head's close, the sidebar's edge, table rows, code blocks, callouts and the pager.

## Shapes

Square corners throughout: buttons, the install field, switch tracks and knobs, presets, path options, the search button, and, in the docs, code blocks, inline code, callouts, popups, menus, the search dialog and the version menu all have a 0 radius. Fumadocs' radius scale is set to 0 at every step. Two small circles are the exceptions: the narrowing slider's thumb, a 22px lime circle that keeps the native form of a range thumb, and the sidebar's 6px lime current-page dot, the mark's dot. Members of a signature are clipped at their trailing edge by a clip-path that extends half an em above, below and before them, so ascenders and descenders stay whole while the width closes.

## Components

### Buttons

- **Shape:** square (0 radius), 48px tall.
- **Primary (Get started, Read the docs):** lime fill, ink text, 16px at 600, 24px side padding, with a right arrow that slides 4px on hover and a 1px press on active. Get started appears in the first viewport and at the close; Read the docs on the 404 page. Each is the only lime-filled action in its view.
- **Hover / Focus:** a 2px lime outline offset 3px on keyboard focus, for every control on the site; inside a scrolling code block the ring sits 2px inside.
- **Secondary (Search):** a rule-grey 1px border, 44px tall, steel text that turns paper on hover with the border turning steel; a mono ⌘K hint from 640px.
- **Docs actions (Copy Markdown, Open):** the search button's style at 36px tall: a rule border, 12px side padding, 13px steel text, turning paper with a steel border on hover or while Open's menu is open.
- **Text link (Home on the 404 page):** 15px steel on a rule-grey underline, paper text and a steel underline on hover.

### Inputs / Fields

- **Install field:** a 48px rule-bordered row, up to 25rem wide, with the command in mono paper behind a steel `$`, and a square copy button whose icon turns to a check for 1.6s and announces the copy.
- **Narrowing slider:** a 2px rule track, a 22px round lime thumb, and its three stops labelled in mono under it, the current one in paper.

### Navigation

- **Masthead:** a 64px bar (72px from 640px) over a hairline: the brace-and-dot mark and Effetch at 19px 600, a two-line mono descriptor behind a rule from 1024px ("A specimen of one call" on the landing page, "Documentation" in the docs), then Docs, Reference and GitHub at 15px in steel turning paper on hover, each with a 44px hit area, and the search button. In the docs the current section, Docs or Reference, is paper, and on phones a menu button opens the sidebar.
- **Docs sidebar:** entries at 15px in steel, paper on hover, never a fill. The current page is paper at 600 with a 6px lime dot in the margin 11px to its left; inside a folder, whose box clips the margin, the dot sits on the folder's guide line. The version menu at the top is a 44px ruled row in paper at 14px, its border turning steel on hover.
- **Phone drawer:** ink, a rule hairline on its open edge, no shadow, over the 86% ink scrim.
- **Contents rail:** the label "On this page" in mono at 12px steel; entries at 14px in sans, steel, paper on hover; the current entry in paper with the lime thumb beside the list. On narrower screens a contents row under the masthead: ink, a rule border, steel text, and a progress ring with a rule-grey track and a lime arc.
- **Previous and next:** two ruled rows at the page's foot, side by side from 768px with next aligned to the end: a mono "Previous" or "Next" label, the page title in paper at 17px 600, and its full description in steel at 15px. The top rule turns steel on hover.
- **Search dialog:** ink, a rule border, no shadow, no blur. The field is paper with a steel placeholder and no focus ring (the caret marks it). The selected result takes the 2px lime inset rule in paper; type-table results are flat rows like the text results, their property names in paper; matches are paper on a lime underline.

### Option Switches

- **Style:** a square 28 by 16px track set at the start of its own line of code, on a ruled row 44px tall, indented two columns into the call it's part of.
- **State:** on, the track and its border are lime, the knob slides 12px and turns ink, and the code is paper at 500. Off, the track is a steel outline and the code drops to the hairline, 300 in steel. A switch the path requires sits fixed, rule-filled, its code in skin.

### Instances (presets)

- **Style:** four two-line presets on one ruled row under the label "Instances": the name at 15px, and what it adds in 11px mono steel beneath.
- **State:** pressed, a 2px lime inset outline with the name in paper at 700. Never a lime fill.

### Path Options

- **Style:** a ruled mono list of four paths under the label "Paths", 14px in steel, each row at least 44px tall with 8 by 12px padding. A path breaks only after a slash.
- **Parameter count:** right-aligned beside each path, set as a label (12px mono, steel): "none", "1 param", "2 params" or "3 params", counted from the compiled names union rather than written by hand.
- **State:** hover turns a path paper; the pressed path takes a 2px lime inset outline in paper, as a pressed preset does. Never a lime fill.

### The Path Specimen

- **Style:** the chosen path set as a specimen, `clamp(30px, 4.2vw, 60px)` on a 1.02 line-height: literal segments at 300 in skin, slashes and colons as 300 steel punctuation, and parameter names rising to 860 in paper through `--spec-k`. A line breaks only before a slash.
- **Entrance:** each new path sets in segment by segment on the same keyframe as the signature, 900ms, 90ms apart; nothing moves under reduced motion.
- **Facts:** a ruled list beside it. "params needs" sets the parameter-name union at `clamp(22px, 2.4vw, 32px)`, names at 760 in paper with quotes and bars as steel punctuation. "Called right" shows a compiled call. "Called wrong" shows the call in steel with a 1px steel wavy underline where TypeScript puts the error, then the compiler's message in 13px mono paper, prefixed by its code (TS2741 and so on) in steel. The message breaks only after a `.`, `(` or `/`, as code does, never mid-word.
- **Code:** both calls wrap at every width, each continuation hanging two columns past its indent.

### The Signature (signature component)

- **Members leave and enter.** Each member is an inline grid whose single track interpolates between `minmax(0, 0fr)` and `minmax(0, 1fr)` over 640ms, clipped at its edge; the text inside keeps its own max-content width. Leaving, the weight drops to 300 in steel over 640ms. Entering, the width opens first and the weight follows after 140ms, over 760ms. Easing is `cubic-bezier(0.2, 0, 0, 1)`.
- **Repaint:** 620ms after each change, the signature toggles between two grounds a step apart so the whole box repaints and no sliver of a bolder glyph is left behind.
- **Entrance:** on first paint, a CSS keyframe on the registered property `--spec-k` takes each group's weight from the hairline to its own, staggered 110ms apart over 1100ms, with no script.
- **Tour:** once the specimen is 40% in view, it steps through the instances once, 2.8s apart, and rests where it started. Any touch stops it for good; reduced motion turns it off.
- **Breaks:** union bars lead their member and never part from it. Below 640px a line may also break after `Effect<` and before a type argument, through zero-width spaces that a nowrap hold disables from 640px; a phone continuation hangs past its bar.
- **Reduced motion:** every member and control snaps between states.

### Docs Page Head

- **Style:** on nested pages, the trail in 12px mono steel, links turning paper on hover; the title at the Title size in paper; the lead in steel at 17px, at most 56ch; then the Copy Markdown and Open buttons. 14px apart, closed by a rule hairline 24px under the buttons.
- **Older release:** on a page from an older line, a warning callout sits flush above the head and links to the same page in the current line.

### Reading Column

- **Prose:** skin at 16px (17px from 1024px) on a 1.75 line-height, at most 68ch; bold is paper at 600; list markers steel.
- **Headings:** an h2 opens on a rule hairline, as a landing section does; an h3 sits 36px under the text above it. Heading anchors carry no underline.
- **Links:** paper at 500 on a 1px lime underline 4px below the text, thickening to 2px over 120ms on hover; nothing fades. The same in callouts.
- **Inline code:** mono paper in a square 1px rule box, no fill, padded 0.08em by 0.36em, at 0.86em; inside a link it takes the link's colour. A type table's property names drop the box.
- **Tables:** no outer box, ruled rows, 15px text on a 1.6 line-height; heads in 12px mono steel at 400, bottom-aligned; the first column flush to the text edge.
- **Tabs:** steel, paper on hover; the current tab paper over a 2px lime rule.
- **Accordions:** ruled rows, the question in paper at 500, the chevron in steel.

### Code Blocks

- **Style:** ink inside a 1px rule border, no shadow, 13.5px mono on a 1.75 line-height (12.5px below 640px). The whole program shows, with no inner height cap. A title bar, when present, is a 12px mono steel label over a hairline. The copy button is steel, paper on hover, never filled.
- **Colours (the "effetch-ink" theme):** greys by role, not a syntax palette. Identifiers in skin; keywords, operators, punctuation and comments in steel; strings, numbers and the names a block declares in paper. Every role is at least 5.4:1 on ink.
- **Type hovers:** a name with a type shows a rule-grey dotted line when the block is hovered, steel under the name itself. Its popup is ink, a 1px rule border, square, no shadow: the type in 13px mono, its docs in 14px skin, tag names in steel. A compiler error is a 1px steel wavy underline with the message in paper in a rule box, as the landing page sets one.

### Callouts

- **Style:** a full 1px rule border, no fill, no coloured side bar, 16 by 18px padding, at most 68ch. An 18px line icon in steel and a label in paper at 15px 600 ("Note", "Warning", "Error", "Done", "Tip", or the given title), then the body in skin at 15px on a 1.65 line-height, indented under the label.
- **Warning and error:** step up a tone, not a hue: a steel border and a paper icon.

## Do's and Don'ts

### Do:

- **Do** compile every signature, path type and docs example from real code with Twoslash; the type shown must be the type TypeScript infers, and a wrong call must show the error the compiler gives.
- **Do** set signature parts by weight role: value 900 lime, errors 640 paper, context 420 steel, punctuation and brackets 300 steel.
- **Do** move members on the weight axis: width first, weight after 140ms, on `cubic-bezier(0.2, 0, 0, 1)`, and snap under reduced motion.
- **Do** hold a live signature's box at its tallest combination so nothing below it moves.
- **Do** mark a pressed or selected control with a 2px lime inset rule, and keyboard focus with a 2px lime outline offset 3px.
- **Do** separate with 1px rule-grey hairlines on a flat ink ground and keep every corner square, except the slider's thumb and the sidebar's dot.
- **Do** put spacing on a wrapper around a signature, not on the signature itself.
- **Do** set every docs surface to ink exactly, popovers and dialogs included, and every docs line to rule grey.
- **Do** colour code by role in the four greys: skin identifiers; steel keywords, punctuation and comments; paper strings, numbers and declared names.
- **Do** keep prose at 68ch and let code blocks and tables take the column.

### Don't:

- **Don't** tint, fade, blur, glow or gradient the lime; use `#d5f70d` exactly or not at all.
- **Don't** fill a second action with lime; one lime fill in view at most.
- **Don't** add a light theme; the brand is dark only.
- **Don't** introduce a second typeface; sans and mono are Recursive's MONO axis.
- **Don't** add cards, cast shadows, gradients, backdrop blur or rounded corners.
- **Don't** type a signature by hand or show a type the code doesn't produce.
- **Don't** use `<wbr>` to break a signature under a nowrap hold; it breaks anyway in Chrome. Use zero-width spaces.
- **Don't** replace the brace-and-dot mark; it is the logo.
- **Don't** tell callout kinds apart by hue or a side bar; use the icon, the label and a step from rule to steel.
- **Don't** cap a code block's height; a reader copies what they can see.
