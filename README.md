# React Example Project

This is a React project built with Vite.

## 1. Local Development

**Prerequisites:** Node.js (v20+ recommended)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key (see `.env.example`).
3. Start the development server:
   ```bash
   npm run dev
   ```

## 2. Deployment (GitHub Actions)

This project is configured to automatically deploy to GitHub Pages via GitHub Actions whenever changes are pushed to the `main` or `master` branch.

To enable this:
1. Go to your repository settings on GitHub.
2. Navigate to **Pages** in the left sidebar.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Push your code to trigger the workflow.

## 3. Git Configuration

The `.gitignore` has been properly configured to avoid committing:
- Dependencies (`node_modules/`)
- Build outputs (`dist/`, `build/`)
- Environment files (`.env*`, except `.env.example`)
- OS-specific files (`.DS_Store`)
- IDE/Editor files

View the full `.gitignore` file for details.
