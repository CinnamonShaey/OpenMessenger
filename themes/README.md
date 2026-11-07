# Themes

A theme is a `.css` file that OpenMessenger injects into Messenger. Pick themes and your accent
color in **Settings** (`Ctrl+,`, the tray menu, or right-click the taskbar icon → Settings).

## How the built-in themes work

```
_base.css          maps Messenger's CSS variables onto a small --om-* palette (shared)
_meta-light.css    Messenger's own light-mode values, used by light themes
oled.css           a palette: @extends _base.css, then sets --om-bg, --om-text, ...
light.css          @extends _meta-light.css and _base.css, then sets a light palette
```

Files starting with `_` are building blocks and don't appear in the theme list.

The **accent color** isn't part of a theme. OpenMessenger generates it from the color you pick in
Settings, so every theme works with every accent.

## Making your own

1. Settings → **Open themes folder** (that's `data\themes`).
2. Create `my-theme.css`:

   ```css
   /*
    * @name My Theme
    * @description One line shown on the theme card.
    * @mode dark
    * @swatches #101014 #1c1c22 #f0f0f0
    * @accent #ff6b9d
    * @extends _base.css
    */

   :root, .__fb-light-mode, .__fb-dark-mode,
   .__fb-light-mode:root, .__fb-dark-mode:root {
     --om-bg: #101014;          /* main background */
     --om-surface: #15151a;     /* panels */
     --om-raised: #1c1c22;      /* inputs, popovers, other people's bubbles */
     --om-border: #2a2a33;
     --om-text: #f0f0f0;
     --om-text-dim: #a0a0ad;
     --om-placeholder: #70707c;
   }
   ```

   | Tag | Meaning |
   | --- | --- |
   | `@name`, `@description` | Shown on the theme card |
   | `@mode` | `dark` or `light`. Tunes how the accent is shaded for contrast. Light themes should also `@extends _meta-light.css` first |
   | `@swatches` | Background, raised and text colors for the card preview |
   | `@accent` | Suggested accent (Settings → "Use theme's suggestion") |
   | `@extends` | Files included before this one. Repeatable, applied in order |

3. Reopen Settings and click your theme. While it's selected, **saving the file updates the app
   instantly**.

You can also add any extra CSS below the palette, for example to hide something you don't want.

## Tips

- Override Messenger's **CSS variables**, not its class names. Class names are auto-generated
  and change with every Messenger update. Variables are far more stable.
- Use `!important` when overriding Meta variables directly. Meta re-declares them on its
  light/dark mode classes.
- `Ctrl+Shift+I` opens DevTools. Select an element and look at the *Styles* pane to see which
  variables it uses.
- A file in `data\themes` with the same name as a built-in theme replaces the built-in one.

Share your themes with a pull request to this folder.
