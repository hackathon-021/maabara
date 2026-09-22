# Design System — המעברה (HaMa'abara) App

Reference design system reverse-engineered from two mobile app screenshots (Hebrew RTL UI, IDF "המעברה (HaMa'abara)" app). Colors were sampled directly from the source images' pixels.

## Language & Direction
- **Locale:** Hebrew
- **Direction:** RTL (right-to-left) — text is right-aligned, icons/actions that read "next/forward" sit on the left, back/exit actions sit top-left

## Color Palette

### Core brand
| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | `#5F42FF` | Primary buttons, active nav icon, plus/edit icon accents, focus borders |
| `--color-primary-active-bg` | `#D7D0FF` | Background chip behind the active bottom-nav icon |
| `--color-page-bg` | `#665FB3` | Outer app frame/background (the lavender-purple surrounding the phone card) |
| `--color-link` | `#005DF5` | Inline hyperlinks (e.g. support email) |

### Surfaces
| Token | Hex | Usage |
|---|---|---|
| `--color-surface` | `#FFFFFF` | Cards, header bar, bottom nav bar |
| `--color-border-subtle` | `#E5E5EA` (approx.) | Card outlines, dividers between sections |
| `--color-scrollbar-track` | `#8B8B8B` | Scrollbar thumb on scrollable panels |

### Illustration accents (used in empty-state / promo art only)
| Token | Hex | Usage |
|---|---|---|
| `--color-illustration-yellow` | `#EAFF82` | Box / envelope fill in illustrations |
| `--color-illustration-blue` | `#ADE6FA` | Clouds, envelope body |
| `--color-illustration-pink` | pastel pink (heart icon) | Small accent details inside illustrations |
| `--color-ink-outline` | near-black | Hand-drawn outline stroke on all illustration line art |

### Text
| Token | Hex | Usage |
|---|---|---|
| `--color-text-primary` | `#1A1A1A`–`#000000` range | Headings, card titles, body copy |
| `--color-text-secondary` | mid-gray | Helper/description text under titles |
| `--color-text-on-primary` | `#FFFFFF` | Text/icons on top of the purple primary button |

> Note: exact grays for secondary text and borders weren't sampled precisely (anti-aliased against white); treat the values above as close approximations and verify against source assets before shipping.

## Typography
- **Typeface:** A clean geometric/humanist sans-serif that supports Hebrew glyphs well (renders like Assistant, Rubik, Heebo, or Segoe UI Hebrew — any of these are safe substitutes).
- **Weights used:**
  - Bold/Semibold — screen titles ("הפרופיל שלי"), card headings ("הפטורים שלי", "בחני בטיחות בנשק"), empty-state title, big numeric value ("11111"), primary button label
  - Regular — subtitles, helper text, nav labels, links
- **Approximate scale:**
  - Screen title: ~18–20px, bold
  - Card heading: ~16–17px, bold
  - Body / helper text: ~14px, regular
  - Nav label: ~12px, regular
  - Numeric hero value ("11111"): ~18px, bold, tabular

## Layout & Spacing
- **App frame:** rounded outer container (~24px radius) sitting on the purple page background, simulating a phone screen preview.
- **Cards:** white rounded-rectangle panels (~16–20px radius), stacked vertically with ~12–16px gaps, ~16px internal padding.
- **Bottom navigation:** fixed white bar, 2 items shown (icon + label, centered), divided from content by a thin top border. Active item gets a rounded purple-tinted pill (`--color-primary-active-bg`) behind the icon, plus purple icon/label color; inactive item is gray/black outline icon with dark label.
- **Header bar:** white bar, screen title centered, a labeled icon action ("יציאה" / exit) anchored top-left (since RTL "exit/leave" sits opposite the reading start).

## Components

### Primary Button (pill)
- Shape: fully rounded (pill), purple fill `#5F42FF`, white bold text
- Content: label + leading icon (e.g. `+`) — icon sits on the reading-start side (left, since label reads RTL)
- Example: "פעולה חדשה +" (New Action)

### Expandable/Actionable List Card
- White rounded card, thin border
- Left-aligned (visually, since RTL = trailing edge) circular icon button in primary purple, outlined style (e.g. `+` in a circle, pencil-edit in a circle)
- Right-aligned bold heading text, with a lighter secondary line beneath it when present
- Examples: "הפטורים שלי" (My Exemptions) + "לא קיימים פטורים בתוקף"; "בחני בטיחות בנשק" (Weapon Safety Quiz)

### Stat/Value Row Card
- White card, edit (pencil) icon in a purple circle on the leading side
- Bold numeric value + gray label pair, right-aligned (e.g. "11111" + "בסיס")

### Empty State
- Centered flat-style illustration (outlined, two-tone: yellow fill + blue cloud accents) inside a white card
- Bold title line + regular subtitle line beneath, centered
- Primary pill CTA button below the text

### Promo / Callout Card
- Same white-card + illustration pattern as empty state, used inline within a scrollable list (e.g. feedback request card with envelope+heart illustration)
- Bold heading, regular body text, inline colored link for contact/action

### Bottom Navigation Bar
- 2–5 icon+label items, evenly spaced, centered per item
- Active state: icon+label in `--color-primary`, soft rounded highlight behind the icon
- Inactive state: icon+label in neutral gray/dark outline, no highlight

### Illustration Style
- Flat, outlined "line art" style with a hand-drawn/sketchy stroke feel
- Restrained palette per illustration: one dominant pastel fill (yellow or blue) + small accent (pink) + dark outline strokes
- Simple motifs: open box, envelope with heart, clouds — friendly/reassuring tone for empty and feedback states

## Iconography
- Outline-style icons (not filled), consistent stroke weight
- Circular icon buttons use a thin outlined circle matching `--color-primary`
- Bottom nav icons: simple line icons (person/profile, inbox/mail) that switch fill/color on active state

## Tone
Friendly, reassuring micro-copy for empty and feedback states ("זה לא רע... פשוט עדיין לא ביצעת פעולות" — "It's not bad... you just haven't taken any actions yet"), paired with soft illustrations rather than stark error/empty messaging.
