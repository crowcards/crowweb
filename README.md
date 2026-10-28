# CROW Cards

Read this to get set up on CROW Cards and contribute to developing its features.

CROW Cards (crowcards.org) is a tool for communities to describe how they govern themselves. People fill in a structured form (a "card"); cards can be published, browsed in a Library, and forked as a starting point. A collaboration between Princeton HCI and Bonfire Networks.

- Live: crowcards.org (Firebase, from `main`)
  - Staging: staging.crowcards.org (Firebase)
- Firebase project: `cos-princeton-hci-crow`
- The team's plan (what's done, in progress and to do, and tasks you can claim): **`TODO.md`**.
- See `DESIGN.md` for the architecture, the card's data structure, and how the code is organized.
- Questions: ask Sohyeon (the team lead), or write to crowcards@princeton.edu.

## Getting set up

### Accounts and access
- **GitHub:** Get access to the repo `crowcards/crowweb` (ask a team admin), with an SSH key added to your GitHub account.
  - **PLEASE** make sure you work on a branch!!! Right now everything in staging works on the **beta** branch, *not* **main**.
- **The GCP project `cos-princeton-hci-crow`:** one Google Cloud Platform project, holding everything:
  - Firebase (hosting, the Firestore database, the server functions) and,
  - once it's set up, the VM for the team's language model (for the UX tasks in `DESIGN.md`).
  - Team lead (Sohyeon) adds your Google account once (Firebase console → Project settings → Users and permissions, or the Google Cloud console's IAM page; it's the same list). "Viewer" to look around (database, logs); "Editor" or higher to deploy. Working on the VM may need a Compute Engine role on top (e.g. to SSH in), granted when the VM exists.
- **Fonts:** the site's fonts (Argent Pixel CF, Helvetica LT Pro) load from an Adobe Fonts kit tied to the site's domains; Sohyeon owns the kit. If they don't show on your local copy, ask Sohyeon to add the domain you're using (e.g. `localhost`) to the kit.
- **Optional:** Claude Code, to work on the codebase with Claude from the terminal. It reads `CLAUDE.md` automatically when you start it in the repo, which loads `DESIGN.md` (the project's context and working rules). You should read `DESIGN.md` too: it contains the working style and our preferences for how we add + review code, so that we're not left with an ungodly and hard to debug codebase.

### Install (Windows: inside WSL; macOS: in Terminal, with Homebrew)
1. **Windows only:** WSL with Ubuntu (`wsl --install` in PowerShell, run as administrator), then do everything below in the Ubuntu terminal, with the project inside WSL's own files (e.g. `~/…`), not under `/mnt/c`.
2. **git:** `sudo apt install git` (macOS: `brew install git`); set `git config --global user.name` / `user.email`.
3. **Node.js 24**, via nvm (see nvm's README for the install line), then `nvm install 24`.
4. **The Firebase CLI:** `npm install -g firebase-tools`, then `firebase login`.
5. **Java 21** (the Firestore emulator needs it): `sudo apt install openjdk-21-jre-headless` (macOS: `brew install openjdk@21`).
6. **An editor:** e.g. VS Code (on Windows, with the WSL extension, opened from the Ubuntu terminal with `code .`).

### To run it locally
```
mkdir crow && cd crow                   # any folder works; we use crow/crowweb
git clone git@github.com:crowcards/crowweb.git
cd crowweb
git checkout beta                       # staging's code (a fresh clone may start on main)
git checkout -b your-feature-name       # your own branch, for your work
cd functions && npm install && cd ..
firebase use cos-princeton-hci-crow
firebase emulators:start
```
The site is at http://localhost:5000 (staging's version; the live site's is at http://localhost:5005, though locally both serve every file: only deploys leave files out, e.g. the workbench from the live site; the editor is `/make`; it uses the local server and database automatically: `js/api.js` switches to the emulator on localhost), and the emulator dashboard at http://localhost:4000 (where you can see the emulated backend, e.g. the cards in the database). Nothing done locally touches the live site or staging. Stop with Ctrl+C. Pages update on reload as you edit; you can do a hard reload with `Ctrl/Cmd + Shift + R`.

The local database starts empty each time. To keep your test cards between runs, start with `firebase emulators:start --import=emulator-data --export-on-exit` (`emulator-data/` is yours alone: it isn't committed).

### Deploying
- **One project, two sites, for now.** The live site (crowcards.org) and staging (staging.crowcards.org) are two hosting sites in the same Firebase project, and **share its server (the functions) and its database.** Cards made on staging are marked as staging cards, so they never mix into public lists. Until staging gets its own project:
  - **Staging:** `firebase deploy --only hosting:staging`, from an up-to-date `beta`. It deploys the site only.
  - **A release** (Sohyeon): merge `beta` into `main` with a pull request, then from `main`: `firebase deploy --only functions,firestore,hosting:live`.
  - **The server goes out only with a release,** so test server changes on the emulator. Staging's editor talks to the live server: an editor change that needs a server change works on staging only once that server change is released.
  - A guard (`scripts/deploy-guard.mjs`) runs before every deploy and stops anything but the staging site unless you're on `main`, with nothing uncommitted, matching GitHub. It's there for mistakes; deploy access stays with as few people as possible.
  - **Taking a site down for maintenance** (e.g. while a major release goes out): `node scripts/maintenance.mjs live` (try it first with `staging`) shows the "Back soon" page on every address but Privacy. It asks you to type yes. Bring the site back with a release, or Firebase console → Hosting → the site → release history → Rollback.
  - The deploy stamp (`version.json`) is made automatically: after any deploy, editor tabs that were already open are asked to reload, so old code can't save over new data.
- **The docs (docs.crowcards.org)** are a separate Firebase site, built from `docs-site/`: `cd docs-site && firebase deploy --only hosting` publishes them (the build runs first: it fills the tables in from the datasheets). To share a version before publishing, `cd docs-site && firebase hosting:channel:deploy review` gives a temporary link (7 days; add `--expires 30d` for longer); run it again to update the same link. Deploy the docs from the branch whose datasheets should be shown. `node docs-site/build.mjs` builds them locally into `docs-site/dist/`.
- **crowcards.org** is the live site, released from `main` (since 2026-10-28). Never commit to `main` directly: changes reach it only by a pull request from `beta`.
- **The workflow:**
  1. Work on your own branch, and test on the emulator.
  2. Commit and push your branch, then open a pull request into `beta`; get it reviewed, and merge it.
  3. Deploy to staging from an up-to-date `beta` (`git checkout beta && git pull`, then `firebase deploy --only hosting:staging`).

  Why: deploying from your own branch replaces staging for everyone. If you need to try something on staging first, check with the team.

### Developing / building

- **This web app has been built with the help of Claude Code.** To avoid creating a massively annoying codebase, we follow a few golden rules:
    - We build in small chunks, each validated before the next; if you ask Claude to propose a plan for a chunk, have it explain what and why. You should flag ambiguities and push back on unclear design decisions: propose first, build on agreement. This is true for creating new functionality and also building datasheets. Make sure you always have a good sense of what was edited and why.
    - You run the emulators, check functionality and visual outputs, deploy (see Deploying above) and commit yourself. Do not have the AI tool commit to our repo. 
    - We never create redundant or near-duplicate CSS/JS. Reuse and extend the shared pieces (see "Where things live" in `DESIGN.md`) instead. Styles are summarized in `style.html`. After each major phase, it is good to ask Claude to review the current codebase for this.
    - After each major phase, we have Claude update `DESIGN.md` (how things work) and `TODO.md` (the plan). We also edit these ourselves because sometimes the way Claude documents is extremely annoying.
    - Always disclose use of AI tools. You are ultimately responsible for the commits made. 
    - At present, the use of AI Agents is not allowed. 
    - To pick up a task, put your name in its **Who** column in `TODO.md`.
- **Never commit keys or credentials,** and never share a card's secret (e.g. in an issue or a chat message): anyone with it can edit that card.

### What's where
- **Pages** (`*.html` at the top level): `index`, `about`, `make` (the card editor), `docs`, `laws`, `library`, `scales` (the team's review of the governance scales), `style` (the style reference), `coming-soon`, `404`.
- **`js/`:** the site's code. `js/sections/` has one file per editor module (Basics, Infrastructure, …); `js/controls/` holds the shared form pieces they're built from (choice lists, type-ahead fields, pick lists, rows, …); the rest are shared helpers (saving, pop-ups, export, …).
- **`data/`:** the reference datasheets (platforms, values, rules, tools, laws, …) that the editor, the docs page and the laws page are built from.
- **`functions/`:** the server (creating, opening and saving cards).
- **`scripts/`:** small scripts run at deploy (e.g. the deploy stamp).
- **CSS:** `styles.css` (the whole site: colors, fonts, shared pieces), `make.css` (the editor), `docs.css` (the docs and scales pages).

### Editing the datasheets (`data/*.json`)
- Each item has an `id` (what a card stores) and a `label` (what people see). **Never change an `id`**: saved cards point to it. Labels and descriptions can be reworded freely.
- Keep the file valid JSON (a missing comma breaks the whole file; VS Code underlines mistakes).
- Afterwards, check the Docs page (its Reference tables are built from these files) and the part of the editor that uses the file.

### Troubleshooting
- **`firebase login` doesn't open a browser (WSL):** use `firebase login --no-localhost` and follow the link it prints.
- **The emulator won't start, mentioning Java:** install Java 21 (step 5), then open a new terminal.
- **Port 5000 is in use (macOS):** turn off AirPlay Receiver (System Settings → General → AirDrop & Handoff), which uses that port.
- **The functions won't load:** check `node -v` says 24 (`nvm use 24`), and that you ran `npm install` in `functions/`.
- **The fonts look wrong locally:** ask Sohyeon to add your domain to the Adobe Fonts kit (see above).
- **A page doesn't show your change:** hard reload (`Ctrl/Cmd + Shift + R`).
