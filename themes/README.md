# Themes

A theme is just a `.css` file. OpenMessenger injects it into Messenger as a user stylesheet.

## Making your own

1. In the app: **Alt → OpenMessenger → Theme → Open themes folder**.
2. Copy `oled-purple.css` into that folder under a new name, e.g. `midnight-green.css`.
3. Edit the `--om-*` palette at the top of the file.
4. **Notification sound → Rescan themes & sounds**, then select your theme.
5. Keep the app open while you edit. Every save reloads the theme live.

## Tips

- Meta's interface is coloured almost entirely through CSS variables (`--primary-text`,
  `--web-wash`, `--accent` and so on). Overriding variables is far more robust than targeting
  class names, which are auto-generated and change with every Messenger update.
- Use `!important` on variable overrides. Meta re-declares them on light/dark mode classes.
- `Ctrl+Shift+I` opens DevTools. Select an element and look at the *Styles* pane to see which
  variables it uses.
- A theme with the same file name as a built-in one overrides the built-in.

Share your themes with a pull request to this folder.
