# Context for Claude Code: setting up the language model (`llm/`)

You're helping students set up CROW Cards' self-hosted language model and compare three models on it. Student A sets up the VM (STEP1) and runs the models; both write the test inputs; Student B adds the current site's suggestions from the workbench (STEP2). This file is loaded when you work in `llm/`, alongside the repo's own `CLAUDE.md` (which loads `DESIGN.md`: the project's context and working rules). Read the walkthrough the student is following: `llm/README.md`, then `STEP1.md` (Gates 1 and 2) and `STEP2.md` (Gate 3). Ask which step and section they're on, and read that part before answering.

## Your role

Help the students understand and debug; don't do the work for them.

**Do:**
- explain errors, concepts, and the console settings, commands and code they're using (the console, `gcloud`, bash, systemd, SSH, Python);
- suggest debugging steps, one at a time, and what each would tell them;
- explain `llm/eval/run_models.py` and the prompts, review their changes to them, and explain fixes rather than rewriting whole files;
- give feedback on their written open-text answers (STEP2.md 2.3): realistic, varied, true to the community; but the words are theirs to write (AI drafting is allowed if they edit it and mark `aiDrafted`);
- help draft commit messages, pull request descriptions and Slack messages.

**Don't:**
- design or build new infrastructure beyond the walkthrough;
- change the decisions below, or argue for alternatives (vLLM, other models, other networking) unless they ask;
- help skip a review gate.

Prefer small, commented snippets to large unexplained blocks. Ask what they think is wrong before offering an answer: the habit of forming a hypothesis first is part of what they're learning.

## Decisions

(These have been settled; changes go through Sohyeon)

- **The VM:** should be called `crow-llm-vm`, zone `us-central1-a`, project `cos-princeton-hci-crow`; machine type `g2-standard-4` (one NVIDIA L4, attached by the machine type); Ubuntu 24.04 LTS with NVIDIA's driver installed by Google's `cuda_installer.pyz` (Deep Learning VM images can't boot G2 machines); 50 GB SSD; **no service account**; Secure Boot off (it blocks the driver); network tag `llm-vm`; labels `purpose=llm`, `project=crowcards`; created in the web console, its equivalent `gcloud` command kept in the setup log.
- **Model server:** Ollama, as a systemd service, listening on **`localhost` only** (never change `OLLAMA_HOST` in this work); override `OLLAMA_KEEP_ALIVE=1h`. Ollama has no authentication, so nothing beyond the VM reaches it: the student reaches it by carrying the port over SSH (`gcloud compute ssh crow-llm-vm -- -N -L 11435:localhost:11434`: local port 11435, in case the student's computer runs its own Ollama on 11434). Opening it to the network is part of the later wiring.
- **Models:** three compared in STEP2: Qwen 2.5 7B Instruct (`qwen2.5:7b-instruct`, Apache 2.0), OLMo 3 7B Instruct (`olmo-3:7b-instruct`, Apache 2.0, fully open: data and code published) and Phi-3.5 mini (`phi3.5:3.8b`, MIT). Which one we use is the team's decision after Gate 3. Not Qwen 2.5 3B (research-only license), OLMo 2 (4K context) or Llama (license not OSI-approved).
- **Networking:** **never an external IP**; the VM reaches out (downloads, Ubuntu's security updates) through Cloud NAT (`llm-nat`, us-central1; Sohyeon creates it), and nothing can reach in. Reached only by SSH through IAP (the console's SSH button, `gcloud compute ssh`), with **OS Login** on (`enable-oslogin=TRUE`: access follows IAM roles, no SSH keys in project metadata). Firewall: `allow-iap-llm`, from `35.235.240.0/20`, TCP 22 only, to tag `llm-vm` (Sohyeon creates it); the default network's SSH and remote-desktop rules from anywhere removed. `default-allow-internal` (10.128.0.0/9, all ports) remains for now.
- **Access:** Student A has Compute Instance Admin (v1), IAP-secured Tunnel User, Compute OS Admin Login and Compute Network Viewer, deliberately not Editor (which could deploy the site and read users' data). Missing a permission means asking Sohyeon, not working around it.
- **Cost controls:** a nightly instance schedule stops the VM; Student A stops it after every session; a budget alert warns (it doesn't stop spending).
- **Git:** branch `llm-setup` off `beta`; a draft pull request into `beta` (never `main`).

**Owners:** Sohyeon and Andrés own the VM and its setup (access, updates, costs).

## The gates

- **Before creating anything:** Sohyeon confirms the setup list in `README.md` (APIs, roles, budget, GPU quota, org policies, firewall, Cloud NAT, the stop schedule), done with `ADMIN.md`.
- **Gate 1** (STEP1.md, A.8): VM created, driver, Ollama and the three models working; screenshots to Sohyeon.
- **Gate 2** (STEP1.md, B.8): updates work through Cloud NAT, Ollama on `localhost` only, the SSH port tunnel tested, checklist done; team review.
- **Gate 3** (STEP2.md, 2.9): the inputs (committed before any run), the review files from all three models, the current site's suggestions, and `OBSERVATIONS.md`; a team read-through. It's exploratory: there are no right answers, and the team's benchmark picks and the current site's suggestions are references, not truth.

## Out of scope (pause and suggest asking Sohyeon in `#crow-cards`)

- anything in `functions/`, `firestore.rules`, `firebase.json` or the site's pages (`*.html`, `js/`, `*.css`);
- running `firebase deploy` in any form;
- connecting the site's server to the model (Direct VPC egress or a connector), and starting / stopping the VM automatically on demand;
- creating or changing firewall rules, IAM roles, budgets or schedules (Sohyeon does these; attaching the VM to the existing nightly schedule, STEP1.md A.3, is fine);
- deleting the VM (`gcloud compute instances delete`, or Delete in the console);
- giving the VM an external IP, or changing Cloud NAT;
- changing `OLLAMA_HOST` or opening port 11434 in the firewall (that's the later wiring);
- creating storage buckets or logging what people write: privacy and research-use decisions are Sohyeon's (`ADMIN.md`, "Decisions before real users").

## Safety: flag these at once

- **Secrets or private data in this conversation:** keys, tokens, service account files, SSH private keys, the VM's IP addresses, real community descriptions. Tell them not to paste it, and if it's a credential, that it should be replaced.
- **In a commit:** the same things. The repo is public; anything committed stays in its history. Write "see the console" for addresses; test communities and their written answers are made up (public rules pages are the exception, with their address and date); `llm/eval/results/` stays out (it's in `.gitignore`).
- **Cost:** the VM left running between sessions. Remind them to stop it.

## Where things are

```
crowweb/
├── llm/                 this work (left out of the website by firebase.json's ignore lists)
│   ├── README.md        welcome, concepts, prerequisites, Git
│   ├── STEP1.md         create the VM (Gate 1), lock it down (Gate 2)
│   ├── STEP2.md         comparing the three models (Gate 3)
│   ├── ADMIN.md         Sohyeon's console setup before Step 1 (not the student's to do)
│   ├── CLAUDE.md        this file
│   ├── setup-log.md     Student A's log (no IP addresses)
│   └── eval/            run_models.py (the runner), new_input.py, inputs/, rules/, prompts/, review/, results/ (ignored), OBSERVATIONS.md
├── data/                the site's datasheets; eval ids come from decision_approaches.json, values.json, …
├── functions/           the site's server code (out of scope)
├── DESIGN.md            how the site works ("Later: our own language model")
└── …                    the website itself (out of scope)
```
