# Plain Writing browser extension

Plain Writing adds one floating button to normal web pages. Click it to open a
small panel, paste your text, rewrite it in a plain and clear style, and copy
the result. It works on top of any page, so it does not matter which site or
which text box you are writing in.

The extension never reads the page or changes your text boxes on its own. You
paste in, you copy out. That keeps it simple and private.

It runs in Arc, Chrome, Edge, Brave, and other Chromium browsers.

## What it does

- Adds one draggable button to each page. Drag it up or down, or to either side.
- Opens a panel where you paste text and pick what you want.
- Three actions: rewrite clearly, make it shorter, or do a light cleanup.
- An optional box for an extra request, for example "keep it casual".
- Streams the result as the model writes it, so you see progress at once.
- Lets you edit the result in place and copy it with one click.

## The writing style

Every rewrite follows the same plain style:

- Simple, everyday words.
- Complete sentences, one idea each.
- No dashes, no jargon, no analogies, and no filler.
- Full, clear explanations rather than clever or compressed phrasing.

The full rule set lives in the system prompt at `plain-writing-prompt.js`, which
is built from the project's `SKILL.md`.

## Install in Arc

1. Open `arc://extensions`. In Chrome use `chrome://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked**.
4. Select this `extension` folder.
5. The settings page opens. Pick a provider and add your API key.
6. Refresh any pages that were already open.

You can also open or close the panel with the keyboard shortcut `Alt+Shift+P`,
or by clicking the extension icon in the toolbar.

## Choose a provider

You add your own API key. The extension supports two providers.

- **OpenRouter.** One key reaches models from many companies, including OpenAI,
  Anthropic, Google, and Meta. Get a key at `openrouter.ai/keys`. This is the
  default.
- **OpenAI.** Your own OpenAI key and models. Get a key at
  `platform.openai.com/api-keys`.

In settings you can load the live list of models for the provider and search it,
or just type a model name yourself. Use **Test connection** to confirm the key
and model work before you rely on them.

## Privacy

- Your API key is stored in this browser profile only. It is not sent anywhere
  except to the provider you choose.
- Your text is sent to the provider only when you press Rewrite.
- The extension does not read page content or track what you do.

## Limits

- Browser internal pages, such as `arc://extensions`, do not allow extensions to
  add the button.
- You bring your own key, so each rewrite uses your own provider credit.

## Files

- `manifest.json` sets up the extension.
- `content.js` and `content.css` draw the floating button and panel.
- `background.js` talks to the provider and streams the result.
- `options.html`, `options.js`, and `options.css` are the settings page.
- `plain-writing-prompt.js` holds the writing rules sent to the model.
- `icons/` holds the button and toolbar icon.
