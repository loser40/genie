# 🧞 GENIE — Complete Setup Guide for New Users

> **GENIE** — AI builds software fast. GENIE makes it maintainable.
> Scan your codebase, detect issues, repair code, and give any AI tool instant context of your project.

---

## ✅ Requirements

Before you begin, make sure you have the following installed on your PC:

| Requirement | Minimum Version | Download Link |
|---|---|---|
| **Node.js** | v18 or higher | https://nodejs.org |
| **Git** | Any version | https://git-scm.com |

To check if Node.js is already installed, open your terminal and run:
```bash
node --version
```
If you see a version number like `v20.x.x`, you are good to go!

---

## 🚀 Step-by-Step Installation

### Step 1 — Install PNPM (Package Manager)
GENIE uses PNPM to manage its internal packages. Install it globally with:
```bash
npm install -g pnpm
```

### Step 2 — Clone the GENIE Repository
Download the GENIE source code to your computer:
```bash
git clone https://github.com/loser40/genie.git
cd genie
```


### Step 3 — Install Dependencies
Install all required packages (this may take 1-2 minutes):
```bash
pnpm install
```

### Step 4 — Build GENIE
Compile the source code into a runnable application:
```bash
pnpm run build
```
You should see **"Tasks: 6 successful"** when the build is done.

### Step 5 — Install the Electron Desktop Engine
The desktop floating widget requires Electron. Run this **once** after the build:
```bash
node node_modules/electron/install.js
```

### Step 6 — Link the CLI Globally
This lets you type `genie` from ANY folder on your computer:
```bash
cd packages/cli
npm link
```

### Step 7 — Verify the Installation
Test that GENIE is working by running (you might need to open a new terminal):
```bash
genie --version
```
If it prints `1.0.0`, you are fully installed and ready! 🎉

---

## ⚙️ First-Time Setup — Connect Your AI

GENIE needs an AI provider (like OpenAI, Anthropic, or Google Gemini) to generate repair plans and code analysis. You need to **bring your own API key (BYOK)**.

Run the interactive setup wizard:
```bash
genie setup
```

It will ask you:
1. **Which AI provider?** — Choose from OpenAI, Anthropic, Gemini, OpenRouter, etc.
2. **What is your API key?** — Paste in your API key (it is stored securely on your local machine at `~/.genie/config.json`)
3. **Which model?** — Some recommended models:
   - OpenAI: `gpt-4o`
   - Anthropic: `claude-3-5-sonnet-20241022`
   - Gemini: `gemini-1.5-pro`
   - OpenRouter: `anthropic/claude-3-5-sonnet`

---

## 🖥️ GENIE Command Center

Once installed, open your terminal and type `genie` to open the interactive menu.

You will see this menu:

```
? GENIE Command Center
> 🚀 Start Desktop Widget   (genie start --desktop)
  🔍 Scan Project for Issues (genie scan)
  🛠️ Run Autonomous Repair   (genie repair)
  💊 Manage Wish Capsules    (genie capsule)
  ⚙️ Setup BYOK & Provider   (genie setup)
  ❌ Exit
```

Use ↑↓ arrow keys to navigate and press **Enter** to select.

---

## 📖 All Available Commands

You can also type commands directly without opening the menu:

### 🚀 Start the Desktop Floating Widget
```bash
genie start --desktop
```
Launches a beautiful floating AI companion widget on your desktop that you can chat with anytime.

### 🌐 Start the Web Dashboard
```bash
genie start
```
Launches the web dashboard in your browser at `http://127.0.0.1:4747` showing your project's interactive dependency graph.

### 🔍 Scan Your Project for Issues
```bash
genie scan .
```
Run this inside any project folder. It will:
- Count all your source files
- Detect circular dependencies
- Find duplicate / copy-pasted logic
- Calculate a **Health Score** from 0 to 100
- List all detected issues by severity

To also run AI-powered analysis:
```bash
genie scan . --ai
```

### 🛠️ Generate an AI Repair Plan
```bash
genie repair .
```
Uses your connected AI to create a step-by-step plan to fix all the issues found during the scan.

### 💊 Create a Wish Capsule
```bash
genie capsule create .
```
Compresses your entire project's architecture into a single small `.capsule.json` file. Use this to give any AI (ChatGPT, Claude, Cursor) instant knowledge of your codebase.

To view your existing capsule:
```bash
genie capsule show
```

### 📋 Inject Context into ChatGPT / Claude
```bash
genie inject
```
Prints a compact summary of your project that you can copy-paste into any AI chat session, so it instantly understands your codebase before writing code.

### ⚙️ Reconfigure Your AI Provider
```bash
genie setup --reset
```
Use this if you want to switch AI providers or update your API key.

### ❓ Get Help
```bash
genie --help
genie scan --help
genie capsule --help
```

---

## 🗂️ Where Does GENIE Store Data?

| Location | What is stored |
|---|---|
| `~/.genie/config.json` | Your AI provider and API key (secure, local only) |
| `<your-project>/.genie/*.capsule.json` | The Wish Capsule for that project |

---

## ❓ Troubleshooting

### Error: `genie` command not found
You need to re-link the CLI:
```bash
cd packages/cli && npm link
```

### Error: `Electron binary not found`
Run this command once from the root of the GENIE folder:
```bash
node node_modules/electron/install.js
```

### Error: `EADDRINUSE: address already in use :4747`
Another GENIE server is already running. Either close it or use a different port:
```bash
genie start --port 5050
```

### Error: `AI analysis unavailable` or `404` from your AI provider
Your API key or model name is incorrect. Reset your setup:
```bash
genie setup --reset
```
Make sure you use a valid model name for your provider (e.g., `gpt-4o` for OpenAI).

---

## 💡 Quick Start Cheat Sheet

```bash
# 1. Install everything (run once)
pnpm install
pnpm run build
node node_modules/electron/install.js
cd packages/cli && npm link

# 2. Connect your AI (run once)
genie setup

# 3. Start GENIE every time
genie                          # Opens the interactive menu
genie start                    # Web Dashboard at http://127.0.0.1:4747
genie start --desktop          # Floating Desktop Widget
genie scan .                   # Scan your current project
genie inject                   # Get context to paste into ChatGPT/Claude
```

---

*Made with ❤️ by the GENIE Team*
