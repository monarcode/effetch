---
name: Effetch
description: Typed HTTP calls for Effect, set as a type specimen of one call.
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
---

# Design System: Effetch

## Overview

**Creative North Star: "The Type Specimen"**

The landing page is a type foundry's specimen sheet, printed on ink. Where a foundry sets one face at display size and shows it across its axes, Effetch sets one call's inferred signature, `Effect<value, errors, never>`, at display size and puts the call's real options beside it as controls. Every signature and path type on the page is a Twoslash result compiled from real code, never typed by hand: the paths section sets a route string the same way, literal segments at the hairline and its parameters at full weight, beside the names TypeScript reads from it and the error a wrong call gets. The options move the signature along the weight axis: a member that enters arrives at the hairline and thickens in place; a member that leaves thins to the hairline as its width closes.

One variable family, Recursive, carries everything. Its sans (MONO 0) sets the specimen and the prose; its mono (MONO 1) sets code, the small control labels, the compiled call and the path list. Hierarchy comes from weight and size on that one family, from paper against steel, and from hairline rules on a strict twelve-column grid. There are no cards, no cast shadows, no gradients and no rounded corners, apart from the slider's thumb. Lime appears only where something is live, is the success value, or is the primary action.

The system is dark only. The documentation pages keep Fumadocs' layout, retinted to ink with lime as their primary, until they get their own pass; this file describes the landing page's world and the tokens the docs retint shares.

**Key Characteristics:**

- One family, Recursive Variable, weights 300 to 1000, switched between sans and mono on its MONO axis.
- Weight carries the meaning: the value at 900 in lime, errors at 640, context at 420, punctuation at the 300 hairline.
- Flat ink ground; structure comes from 1px hairline rules and ruled lists in rule grey.
- Square everywhere except the slider's round thumb.
- Lime at its exact value only, never tinted, faded, blurred or glowing.
- Motion moves along the weight axis, one orchestrated remap per change, and snaps under reduced motion.

## Colors

A cool, near-neutral ink-and-paper palette with one acid accent, used at its exact value.

### Primary

- **Signal Lime** (lime): the success value in every signature, a switch that's on, the slider's thumb, the inset outline on a pressed preset or path, the focus ring, text selection, the brace-and-dot mark, and Get started, the page's one lime-filled action. It is the brand's colour and appears exactly as specified or not at all.

### Neutral

- **Ink** (ink): the page ground everywhere, and the knob of a switch that's on. The landing page has no second ground.
- **Paper** (paper): the page's type, at 15.3:1 on ink. Headings, the specimen's errors, lit code, a pressed preset's name.
- **Steel** (steel): secondary text, leads, labels, punctuation and brackets in the signature, the context type, closed members, a switch that's off. 5.4:1 on ink, so it still reads as text.
- **Skin** (skin): code text and a path's literal segments, at 10.5:1, sitting between paper and steel so code is legible without competing with the specimen.
- **Rule** (rule): every hairline, ruled row and border, and the slider's track. Never used as a text colour.

### Named Rules

**The Exact Lime Rule.** Lime is `#d5f70d` at full opacity or it is absent: no tints, no alpha, no blur, no glow, no gradient. Its tonal ramp is one value on purpose.

**The One Lime Fill Rule.** Get started is the only lime-filled action in view. A pressed preset and a pressed path take a 2px lime inset outline, never a lime fill. The switch track, the slider thumb and the mark are lime-filled indicators, not actions.

**The Steel Is Text Rule.** Secondary information is set in steel, not in a dimmed paper or an alpha white, so every grey on the page is one of four named neutrals.

## Typography

**Display Font:** Recursive Variable, MONO 0 (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Recursive Variable, MONO 0
**Label/Mono Font:** Recursive Variable, MONO 1, ligatures off

**Character:** A single variable family that is both the specimen and the instrument: its sans at display weights carries the signature, and the same family flipped to mono reads as the code that produced it.

### Hierarchy

- **Specimen** (300 to 900 by role, `clamp(60px, 5.6vw, 96px)` at 1024px and up, `clamp(40px, 6.1vw, 68px)` from 640px, `clamp(28px, 8.6vw, 52px)` on phones, line-height 0.98, letter-spacing -0.035em): the live signature in the first viewport. Later signatures use the same type at smaller clamps, from about 22px on phones to 52px on wide screens.
- **Display Closing** (900 with a 300 steel first line, `clamp(3rem, 8.2vw, 7.5rem)`, line-height 0.96): the closing line only, showing the axis the page has used, hairline then heaviest.
- **Headline** (600, 2.75rem from 640px, line-height 1.05, -0.025em, balanced): section headings, on a hairline, with a steel lead beside them in columns 8 to 12.
- **Headline Phone** (600, 2rem): the same section headings below 640px.
- **Title** (700, 2.25rem at 1024px and up, line-height 1.08, at most 22ch): the page's H1, beside the controls rather than above the specimen.
- **Title Tablet** (700, 2.5rem): the H1 from 640px to 1024px, where it sits above the controls and can run larger.
- **Title Phone** (700, 1.625rem): the H1 below 640px.
- **Names** (760 names with 300 steel quotes and bars, `clamp(22px, 2.4vw, 32px)`, line-height 1.15): the parameter-name union beside a path, under "params needs".
- **Title Small** (600, 19px): the wordmark beside the mark, and the Compare section's two column headings.
- **Body** (400, 17px, line-height 1.5 to 1.55, steel, 36 to 56ch): leads and descriptions, and the narrowing note from 640px.
- **Body Small** (400, 15px, line-height 1.5): nav and footer links, the preset names, the Compare rows' notes, the specifications' notes, and the phone size of the hero caption and the narrowing note.
- **Button** (600 for Get started, 400 for the caption, 16px): Get started, and the hero caption from 640px.
- **Code** (MONO 1, 400, 13 to 13.5px on a 1.8 line-height; 14px in the controls; 12px on phones): code samples, coloured by role: text in skin, keywords and punctuation in steel, strings in paper.
- **Label** (MONO 1, 400, 12px, line-height 1.4, letter-spacing 0.02em, steel, sentence case): legends over controls ("The call", "Instances"), the facts beside a path ("params needs", "Called right", "Called wrong").
- **Label Small** (MONO 1, 400, 11px, line-height 1.3, steel): a preset's second line, what it adds ("+ output").

### Named Rules

**The Weight Is Role Rule.** In a signature, weight says what a part is: value 900 in lime, errors 640 in paper, context 420 in steel, punctuation and brackets 300 in steel. A member leaving drops to 300 in steel. Don't use weight in a signature for emphasis of any other kind.

**The One Family Rule.** Every glyph on the landing page is Recursive. Sans and mono are the MONO axis at 0 and 1, never a second family.

**The Sans Sets, Mono Shows Rule.** MONO 0 sets the specimen and the prose; MONO 1 sets code, labels, the compiled call, the path list and the compiler's messages. Mono never sets a heading.

## Layout

A twelve-column grid inside a 90rem column, with a 16px outer margin on phones and 48px from 768px, and a 24px column gap. Sections open on a full-width hairline with the heading in columns 1 to 7 and its lead in columns 8 to 12, and are spaced 80px apart on phones and 96px from 640px.

The first viewport is two bands. The top band runs full width: the live signature, then under a hairline the caption in columns 1 to 7, which says what the last change did, and in columns 8 to 12 the compiled call and plugins in mono. The bottom band puts the call's options and the client's plugins, as switches set in code, with the four instances under them, in columns 1 to 7, and the H1, lead, install field and Get started in columns 8 to 12. On phones the order becomes the H1, Get started, the signature and its caption, the switches and instances, then the lead and install field.

The signature's box is held at the tallest combination by hidden sizers stacked in the same grid cell, so nothing below it moves when an option changes. Breakpoints are 640px, 768px and 1024px. The sections run hero, Compare, Paths, Narrowing, Specifications, Closing. In Paths, the path list takes columns 1 to 4 and the path specimen with its facts takes columns 5 to 12 from 1024px; each fact is a ruled row with an 8.5rem label column from 640px and stacked below 640px.

**The Wrapper Spacing Rule.** Specimen styles are unlayered, so they beat Tailwind utilities. Put margins and padding on a wrapper around a signature, never on the signature element itself.

## Elevation & Depth

The page is flat. There are no cast shadows, no blur and no tonal layering: every surface is ink. Structure comes from 1px hairlines in rule grey, ruled rows under the switches, the path list and the facts. The only `box-shadow` in the system is a 2px lime inset outline that marks a pressed preset or a pressed path, which reads as a stroke, not a shadow.

**The Hairline Not Shadow Rule.** Separate with a 1px rule line, never with a shadow, a card, a raised surface or a background panel.

## Shapes

Square corners throughout: buttons, the install field, switch tracks and knobs, presets, path options and the search button all have a 0 radius. The one exception is the narrowing slider's thumb, a 22px lime circle, which keeps the native form of a range thumb. Members of a signature are clipped at their trailing edge by a clip-path that extends half an em above, below and before them, so ascenders and descenders stay whole while the width closes.

## Components

### Buttons

- **Shape:** square (0 radius), 48px tall.
- **Primary (Get started):** lime fill, ink text, 16px at 600, 24px side padding, with a right arrow that slides 4px on hover and a 1px press on active. It appears in the first viewport and at the close, and is the only lime-filled action.
- **Hover / Focus:** a 2px lime outline offset 3px on keyboard focus, for every control on the page.
- **Secondary (Search):** a rule-grey 1px border, 44px tall, steel text that turns paper on hover with the border turning steel; a mono ⌘K hint from 640px.

### Inputs / Fields

- **Install field:** a 48px rule-bordered row, up to 25rem wide, with the command in mono paper behind a steel `$`, and a square copy button whose icon turns to a check for 1.6s and announces the copy.
- **Narrowing slider:** a 2px rule track, a 22px round lime thumb, and its three stops labelled in mono under it, the current one in paper.

### Navigation

- **Style:** a 64px bar (72px from 640px) over a hairline: the brace-and-dot mark and Effetch at 19px 600, a two-line mono descriptor behind a rule from 1024px, then Docs, Reference and GitHub at 15px in steel turning paper on hover, each with a 44px hit area, and the search button. Reference and GitHub hide below 640px.

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

## Do's and Don'ts

### Do:

- **Do** compile every signature and path type on the page from real code with Twoslash; the type shown must be the type TypeScript infers, and a wrong call must show the error the compiler gives.
- **Do** set signature parts by weight role: value 900 lime, errors 640 paper, context 420 steel, punctuation and brackets 300 steel.
- **Do** move members on the weight axis: width first, weight after 140ms, on `cubic-bezier(0.2, 0, 0, 1)`, and snap under reduced motion.
- **Do** hold a live signature's box at its tallest combination so nothing below it moves.
- **Do** mark a pressed or selected control with a 2px lime inset outline, and keyboard focus with a 2px lime outline offset 3px.
- **Do** separate with 1px rule-grey hairlines on a flat ink ground and keep every corner square, except the slider's thumb.
- **Do** put spacing on a wrapper around a signature, not on the signature itself.

### Don't:

- **Don't** tint, fade, blur, glow or gradient the lime; use `#d5f70d` exactly or not at all.
- **Don't** fill a second action with lime; Get started is the one lime fill in view.
- **Don't** add a light theme; the brand is dark only.
- **Don't** introduce a second typeface; sans and mono are Recursive's MONO axis.
- **Don't** add cards, cast shadows, gradients or rounded corners.
- **Don't** type a signature by hand or show a type the code doesn't produce.
- **Don't** use `<wbr>` to break a signature under a nowrap hold; it breaks anyway in Chrome. Use zero-width spaces.
- **Don't** replace the brace-and-dot mark; it is the logo.
