# 🧞 GENIE: AI Maintainability & Code Repair Command Center

Welcome to **GENIE**! 

GENIE is your ultimate AI-powered command center designed to help you build software fast while ensuring it remains maintainable, clean, and bug-free. It provides an autonomous repair layer, a desktop widget, a Chrome extension bridge, and powerful scanning tools to keep your codebase in top shape.

---

## 📖 Table of Contents
- [What is GENIE?](#what-is-genie)
- [Prerequisites](#prerequisites)
- [Installation Guide](#installation-guide)
- [Setup & Configuration](#setup--configuration)
- [How to Use GENIE on Your PC](#how-to-use-genie-on-your-pc)
- [Available Commands](#available-commands)

---

## 🤔 What is GENIE?
**"AI builds software fast. GENIE makes it maintainable."**

GENIE offers a suite of tools including:
- **Project Scanning:** Analyzes your project for maintainability issues.
- **Autonomous Repair:** AI-driven fixes for code issues and technical debt.
- **Desktop Widget:** A native floating widget for quick access to GENIE features.
- **Browser Extension:** Seamlessly integrates with Chrome for web-based development.
- **Wish Capsules:** Manage AI contexts and "wishes" across sessions.

---

## ⚙️ Prerequisites
Before installing GENIE, ensure you have the following installed on your PC:
1. **Node.js** (v20 or higher recommended) - [Download here](https://nodejs.org/)
2. **pnpm** (Package Manager) - Install it via npm:
   ```bash
   npm install -g pnpm
   ```

---

## 🚀 Installation Guide

Follow these steps to install and build GENIE on your local machine:

1. **Clone or Extract the Repository:**
   Open your terminal and navigate to the directory where you have the GENIE folder.

2. **Install Dependencies:**
   Run the following command in the root of the project to install all required packages:
   ```bash
   pnpm install
   ```

3. **Build the Project:**
   Compile the source code across all packages (CLI, core, desktop, web, etc.):
   ```bash
   pnpm run build
   ```

4. **Make the CLI globally accessible:**
   To use the `genie` command from anywhere on your PC, navigate to the CLI package and link it globally:
   ```bash
   cd packages/cli
   npm link
   ```
   *(Alternatively, you can use `pnpm link --global`)*

---

## 🛠️ Setup & Configuration

Once installed, you need to configure GENIE with your AI Provider (BYOK - Bring Your Own Key).

1. Open your terminal.
2. Run the interactive setup:
   ```bash
   genie setup
   ```
3. Follow the on-screen prompts to configure your AI provider (e.g., OpenAI, Anthropic, or OpenRouter) and securely save your API keys.

---

## 💻 How to Use GENIE on Your PC

GENIE is built to be extremely user-friendly. You can run it in two ways: **Interactive Mode** or **Direct Commands**.

### 1. Interactive Command Center
The easiest way for a normal user to operate GENIE is through the interactive menu. Simply open your terminal and type:
```bash
genie
```
This will launch the **GENIE Command Center**, presenting you with a simple menu to choose what you want to do:
- 🖥️ Start Desktop Widget
- 🌉 Start Extension Bridge
- 🌐 Setup Browser Extension
- 🔍 Scan Project for Issues
- 🔧 Run Autonomous Repair
- 💊 Manage Wish Capsules
- ⚙️ Setup BYOK & Provider

Use your arrow keys to select an option and hit **Enter**.

### 2. Using the Desktop Widget
If you prefer a visual interface rather than the terminal, you can launch the floating desktop app:
```bash
genie start --desktop
```
This gives you a persistent, native widget on your PC to quickly interact with the AI assistant.

---

## 📋 Available Commands (Advanced)

If you prefer using command-line arguments directly, here are the most common commands:

- `genie scan [path]` - Analyzes the specified project for issues. Use `--ai` to enable AI repair suggestions.
- `genie repair [path]` - Prepares and executes autonomous repairs on your code.
- `genie manual <path>` - Runs AI analysis to provide guidance for manual repairs.
- `genie start` - Launches the GENIE web dashboard.
- `genie bridge` - Runs the local Chrome extension bridge (Default port: 14747).
- `genie setup-browser` - Opens the setup flow for the Chrome extension.
- `genie capsule` - Manages Wish Capsules (AI contexts).
- `genie inject` - Prints the GENIE context for any AI session.

---

## 💡 Pro Tips for Everyday Use
- **Scan Before You Commit:** Run `genie scan` on your folder before pushing code to catch potential maintainability issues.
- **Lost? Just type `genie`:** Whenever you aren't sure what to do, just type `genie` in your terminal to see the interactive menu. 
- **Current Directory:** If a command asks for a path and you are already in the project folder, just press **Enter** (it defaults to `.`, which means the current folder).

Enjoy building better, cleaner software with **GENIE**! 🧞‍♂️
