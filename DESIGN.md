# Design system

## Direction

Plain Writing is a compact browser tool. It should feel modern and confident
without shouting over the page behind it. The panel uses a true white surface
and dark text for reading. One indigo to violet gradient carries the brand and
marks the main action. The layout is dense enough for repeated use but still
leaves room to read a rewritten post.

## Color

```css
--ink: #1c1c28;       /* body text */
--muted: #6b6b7b;     /* secondary text */
--line: #e7e7ee;      /* borders */
--bg: #ffffff;        /* surfaces */
--surface: #f7f7fb;   /* insets and quiet fills */
--brand-a: #6366f1;   /* gradient start, indigo */
--brand-b: #7c3aed;   /* gradient end, violet */
--accent: #f59e0b;    /* amber, used in the icon only */
--success: #1a8a4a;
--error: #d23f3f;
```

The brand gradient is `linear-gradient(135deg, #6366f1, #7c3aed)`. It is used on
the launcher, the brand mark, and the primary button. Everything else stays
neutral so the gradient keeps its meaning.

## Typography

Use the browser system sans family. Body text is 14px with a 1.5 line height.
Controls use 12px to 14px text. The panel title is 16px.

## Shape and spacing

Controls and inputs use a 10px radius. The panel uses a 16px radius with a soft
shadow. The launcher is a circle. The brand mark is a rounded square. Avoid
nested cards.

## Components

- One draggable page launcher with the pen-nib icon.
- One overlay panel with input, a segmented action control, an extra request
  field, the result, and links to settings.
- A segmented control picks the action: Rewrite, Shorten, or Clean up.
- Text areas keep a stable height and can be resized vertically.
- The primary button uses the brand gradient. While the model writes, it turns
  into a Stop button with a spinner.
- Status text appears right under the action that caused it.

## Motion

Use short transitions, around 120ms to 200ms, for hover, focus, and opening the
panel. The panel rises and fades in once. Remove all movement when the user
prefers reduced motion.

## Responsive behavior

The panel is about 404px wide on larger pages. On narrow windows it uses the
viewport width with a 12px inset. It must not cause the page to scroll
sideways.
