# Pharmalogic — OTC Medication Advisor

## Overview
Pharmalogic is a web-based application that helps users make safe over-the-counter (OTC) medicine choices.  
It guides patients through structured questions based on the **WWHAM framework** and provides recommendations while checking for contraindications, drug interactions, and red-flag symptoms.  

The app aims to:  
- Reduce unsafe self-medication attempts.  
- Improve patient comprehension of OTC guidance.  
- Support pharmacies by filtering safe options before counter requests.  

---

## Project Structure

```
TechChallenge/
├── public/                    # Frontend assets (served statically)
│   ├── *.html                # HTML pages (index, check, results, contact…)
│   ├── css/                  # Stylesheets for layout/chat/results
│   ├── data/                 # Condition configuration & OTC dataset
│   └── js/
│       ├── app.js            # Shared UI helpers
│       ├── modules/          # Reusable modules
│       │   ├── engine.js     # Medication recommendation engine
│       │   ├── state-manager.js # Session persistence
│       │   ├── nlu.js        # Heuristic natural language layer
│       │   └── result-helpers.js # Results page utilities
│       └── pages/            # Page-specific controllers
│           ├── check.js      # Structured WWHAM flow
│           ├── chat.js       # Conversational intake
│           └── results.js    # Rich results layout
├── server/                   # Optional Express proxy for LLM summarisation
│   ├── index.js
│   └── package.json
├── package.json              # Frontend tooling (lint/format)
├── dev-server.js             # Convenience static server (optional)
└── README.md
```

**Note**: This project has two `node_modules/` directories by design:
- **Root level**: Frontend development tools (ESLint, Prettier)  
- **Server level**: Backend runtime dependencies (Express, node-fetch)

This separation allows the server to be deployed independently if needed.

---

## Quick Start

### Frontend Development
1. Serve the public directory using any HTTP server:
   ```bash
   # Using Python
   cd public && python -m http.server 8080
   
   # Using Node.js
   npx http-server public -p 8080
   
   # Using Live Server extension in VS Code
   Right-click public/index.html → "Open with Live Server"
   ```

2. Open http://localhost:8080 in your browser

### Backend Server (Optional)
The backend server provides LLM integration for enhanced chat experiences:

1. Navigate to server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy .env.example to .env and add your OpenAI API key (optional):
   ```bash
   cp .env.example .env
   # Edit .env and add: OPENAI_API_KEY=your-key-here
   ```

4. Start the server:
   ```bash
   npm start
   ```

---

## Key Features
- **Symptom Checker**: Users input symptoms via categories or natural language
- **WWHAM Intake**: Structured Q&A: Who, What, How long, Action taken, Medication  
- **Safety Screening**: Checks for contraindications, interactions, and red flags
- **Clear Guidance**: Provides evidence-based OTC recommendations
- **Responsive Design**: Works on desktop and mobile devices
- **Accessibility**: WCAG compliant with proper ARIA labels

---

## Development

### Linting and Formatting
```bash
npm run lint          # Check for code issues
npm run lint:fix      # Auto-fix issues
npm run format        # Format code with Prettier
npm test              # Run Vitest unit/integration suites
```

### File Organization
- **public/**: Static site (HTML, CSS, JS modules, datasets)
- **server/**: Optional Express proxy that turns engine output into an LLM-friendly prompt
- **package.json**: Frontend lint/format tooling configuration
- **dev-server.js**: Lightweight Node static server for local demos

---

## Browser Compatibility
- Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- ES2022 features used (modern JavaScript)
- No build step required for basic functionality


---

## Roadmap
- **Short term**: Broaden condition coverage and enrich red-flag pathways using real-world pharmacy feedback.
- **Medium term**: Add secure user accounts so multiple checks can be stored and revisited across devices.
- **Long term**: Swap the heuristic chat assistant for a production-safe LLM flow once governance and monitoring are in place.

---

## Known limitations
- The contact page is a demo-only form. Submissions are not sent to a backend service; the button simply acknowledges the click for accessibility testing.
- The `/api/llm` proxy is optional. If no API key is configured the chat flow falls back to the built-in rule-based summary.

---

## Team Roles
- **Arun** 
- **Iren**
- **Tawsiq**
- **Jamie**
- **Gurindeep**

---

## Technology Stack (proposed)
- **Frontend**: React (or plain HTML/CSS/JS for MVP).  
- **Backend**: Python (Flask/FastAPI) or Node.js.  
- **Database**: SQLite/Postgres (for user and history).  
- **External Data**: BNF (British National Formulary), DrugBank, NHS APIs.  

---

## Development Tooling
ESLint (flat config) + Prettier included.

Install dependencies:
```
npm install
```

Lint check:
```
npm run lint
```

Auto-fix:
```
npm run lint:fix
```

Check formatting:
```
npm run check:format
```

Format all:
```
npm run format
```

Config files:
```
package.json
eslint.config.js
.prettierrc.json
```

Scope: targets `src/main/frontend/**/*.js`; extend later for backend.


