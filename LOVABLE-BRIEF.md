# Build the SKO marketing calendar: what gets posted where, on which day

**What we want:** one app the whole marketing team opens to see what content goes out, on which channel and account, on which day, and to pull the actual files to post them. Paid campaigns sit underneath as context. Creators get paid weekly from it. New project on Lovable Cloud, separate from the storefront.

**Reference build (click through it, nothing saves):** https://jack-more.github.io/sko-calendar/?demo=1
The same build is in use by the team at https://jack-more.github.io/sko-calendar/ until this one replaces it.
Source: https://github.com/jack-more/sko-calendar (`index.html`, `app.css`, `app.js`). Rebuild it properly in React on Lovable Cloud; don't port the vanilla JS. Where this brief and the reference differ, the brief wins (the reference still has a single form with a status selector; section 4 replaces it).

## 1. Design system (fixed)

- White studio. Ground `#FFFFFF`, a light wash `#F5F7FC` for table heads and hover. Navy `#173384` for type, buttons and hairline structure. Frost `#88A9E3` for rules. Ink `#020B77` for emphasis. Pigment `#0130C0` is the one pop and it's reserved for LIVE. Paper `#EFEEEC` for quiet fills.
- Type: Syncopate 700, uppercase, for page and section titles only. Inter for everything else. JetBrains Mono only for clock times.
- Logo in the header: https://raw.githubusercontent.com/jack-more/sko-calendar/main/img/lockup-navy.png · favicon: https://raw.githubusercontent.com/jack-more/sko-calendar/main/img/mark.png
- Radius 2px. No shadows except on the modal and drawer. No gradients, no illustrations, no emoji.

## 2. Access and data (Lovable Cloud)

- **No login, no password.** First visit asks "Your name" once and remembers it on that device (a "Forget me" link lets someone change it). The name is stamped on everything they add or edit. Anyone with the link can use every tab.
- **Realtime:** everyone sees a change within seconds of it being saved. Stamp every row with `created_by` / `updated_by` (the member's name) and timestamps. Show "Last edited by X, time" in editors.
- **Files:** a private storage bucket `content`. Uploads go straight from the browser to storage, resumable, with a progress bar; set the bucket limit to at least 1 GB per file (videos). Downloads use signed URLs. Any member can download any file.
- **Tables:**
  - `entries`: id, type (`post` | `live` | `email` | `promo` | `other`), title, date, time, channels text[] (TikTok, Instagram, YouTube, Facebook, X, Email, SMS, Site, Other), account (e.g. @skocompound), owner, stage (`draft` | `ready` | `posted`), link, notes (caption), live jsonb (see LIVE below).
  - `entry_files`: id, entry_id, storage_path, name, size, mime, uploaded_by, created_at. Deleting an entry deletes its files.
  - `campaigns`: id, platform (TikTok, Meta, Google, OpenAI, Taboola, Snapchat, Reddit, X, Other), name, ad_account, objective, start, end, budget_type (`daily` | `lifetime`), budget (current), status (`live` | `paused` | `ended`), destination_url, code, owner, notes.
  - `campaign_events`: id, campaign_id, date, kind (`launch` | `budget` | `pause` | `resume` | `end`), amount, from_amount, note, by. A launch event is written when a campaign is created; changing the budget writes a `budget` event; changing status writes the matching event.
  - `creators`, `creator_videos`, `payout_weeks`, `payout_lines`: see section 6.

## 3. Calendar (home)

- Month grid, Sunday first, today outlined in navy. Prev / Today / Next. Filter chips are **channels** plus a "Paid lines" toggle.
- **The calendar is for content.** A day shows content chips only, sorted by time. A chip is two lines: first line = status dot, where it posts as short codes (`TT · IG · YT`), time, a file count; second line = the title. LIVE chips are Pigment with white text and read `LIVE`.
- **Paid is a byline, never a card.** At the foot of the day a campaign launched or changed, one quiet line: `▲ TikTok live · $500/day · <name>` or `TikTok $500→$800/day`. Dashed rule above it. Clicking it opens the campaign.
- Click a day: a right-hand drawer lists that day's posts, then its paid lines, and two buttons: **+ Draft or raw file** and **+ Ready to go live**. The header has the same two buttons.
- Chip by stage: draft = dashed outline, muted; ready = solid, navy left bar; posted = a green check. LIVE keeps its Pigment fill.
- **Under the month: "Currently running paid."** Summary line: `N running · $X/day in daily budgets · N launched in <month>`. Table: platform, campaign (+ ad account, objective), launched (date, "Day 12 of 30"), current budget, last change (from → to, date, why), goes to (URL + code), owner, status select, actions `Change budget` / `Edit`. A collapsed "Scheduled, paused and ended" list below it.
- Phones: the grid shows dots per post and a thin navy bar for paid; tapping a day opens the drawer.

## 4. Adding to a day: two forms

**Draft or raw file** (stage `draft`): for footage, rough cuts and ideas that aren't ready.
Title, target date, where it will post (optional), owner, **raw files** (upload several), "What it still needs" notes. Nothing else is required. Button on an open draft: **Mark ready**, which switches it to the ready form below with everything carried over.

**Ready to go live** (stage `ready`): the thing that gets posted.
Title, date, **time**, **where it posts** (multi-select channel chips, at least one), **account** (suggest @skocompound, Ethan, Andersen, Hanna, Dennis), owner, **final file** (at least one), **caption** (hook, caption, hashtags, CTA), link. All bold fields are required to save. Raw files from the draft stay attached under "Raw files". Button: **Mark posted**, which asks for the live post link and sets stage `posted`.

Both forms: type selector (Content, LIVE, Email & SMS, Promo / drop, Other), file rows show name, size, uploader, Download, Remove; Save / Cancel / Delete; cancelling a new entry deletes files uploaded into it.

**LIVE entries** replace channels with: account (SKO company account, Ethan, Andersen, Other creator), length (30 min to 4 hr), hosts, live code. Then a **run of show**: one block per 30 minutes with its clock times (from the start time), a focus select (Best sellers · Restock and new · Bundles and pairs · Receipts and questions, rotating by default), feature, second feature, orders (a number logged after the block), notes, and a checklist of the eight beats below with each beat's clock time. Show "N orders logged" across blocks.

## 5. Library and LIVE playbook

- **Library tab:** every entry, newest first. Search (title, caption, account), channel filter, account filter, stage filter (Draft · Ready · Posted), "Has files". Columns: date, where, account, content (title + caption line), stage, files (each a download button, final and raw labelled), owner. Row click opens the editor.
- **LIVE playbook tab:** static page, copy verbatim from the reference build's "LIVE playbook" tab: the eight beats with minute ranges (Open and reset 0–2, Feature 2–8, Receipts 8–12, The deal 12–15, Reset for new people 15–17, Second feature 17–23, Can't answer that 23–27, Close the block 27–30), the rotation for longer lives, who does what, Say on air / Never say, and the note that loyalty perks aren't live.

## 6. Creator payouts

Pays UGC creators weekly on the conversions TikTok attributes to their videos.

- Week selector, Monday to Sunday, default = last full week.
- **Import TikTok report** (CSV or XLSX): a custom report for that week with `Video material ID`, `Ad name` (and video name if available) and `Conversions` (or `Purchases`). Find the header row and those columns by name; skip Total rows; strip thousands separators; keep rows with conversions > 0.
- **Matching, in order:** (1) the video is assigned to a creator in `creator_videos`; (2) exactly one creator's name tag appears in the video or ad name (case-insensitive). If two creators' tags match (an ad like "DENNIS 3 + HANNA 3"), or none do, the row goes to **Unassigned**, where someone picks the creator or "Not a paid creator"; the choice is saved to `creator_videos` for every future week.
- **Never counted:** an exclusion list of tags. Seed: `ETHAN`, `SINGOD`.
- **Table per week:** creator, conversions (with "adjusted from N" if overridden), rate, payout, number of videos, status, actions `Adjust` (override the count with a reason) and `Mark paid`. Totals row. Payout = conversions × rate + weekly flat.
- **Mark paid freezes the line** (conversions, rate, flat, amount, who, when). Later rate changes or re-imports never move a paid line. Undo asks for confirmation.
- Creators list: name, TikTok handle, name tags, per-conversion rate, weekly flat, notes, assigned videos. Seed: Hanna (tag HANNA), Dennis (tag DENNIS), rates empty. More get added.
- Past weeks list: week, conversions, payout, "N unpaid" / "All paid"; click to open.
- Under the table, one line: "Counts are TikTok-attributed purchases under the ad account's attribution settings."

## 7. Done when

- Two people editing at once see each other's changes without refreshing.
- A 300 MB video uploads with a progress bar and another member can download it.
- Opening the link on a new device asks for a name and nothing else.
- Importing the same week twice replaces the unpaid lines and leaves paid lines untouched.
