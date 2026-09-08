# Project Fluid V2

A browser-based student command center built with HTML, CSS and vanilla JavaScript.

## Files

- `index.html` — main website and V2 feature sections
- `style.css` — visual design, responsive layout and animations
- `script.js` — calculators, timer, countdown, quizzes, planner, notes, flashcards and progress
- `about.html` — About page
- `README.md` — project notes

## V2 features

- GPA Calculator
- Grade Calculator
- Study Timer
- Exam Countdown
- Quiz Center with 6 subjects
- 10-question quizzes
- Easy / Medium / Hard difficulty targets
- Instant quiz feedback
- Quiz review
- Best score
- Quiz streak
- Study Planner
- Local task saving
- Quick Notes
- Flashcards
- Progress dashboard
- Dark/light mode
- Responsive mobile layout
- Reduced-motion support

## How to run

Open `index.html` in a browser.

For the best local development experience, use a simple local server such as VS Code Live Server.

## GitHub Pages

Upload the files to your GitHub repository and make sure GitHub Pages is configured to deploy from the branch/folder containing `index.html`.

## Storage

V2 uses the browser's `localStorage` for tasks, notes, flashcards, theme, best quiz score and streak. No backend or account system is required yet.

## Next stage

The next major upgrade can add user accounts, cloud synchronization, richer notification scheduling, larger question banks and eventually premium features.


## V3
Student dashboard, XP/levels, achievements, quiz history, study progress, reminders, daily focus summary, and enhanced persistence. V3 remains client-side and GitHub Pages compatible.


## V4 Cloud Accounts

V4 adds Supabase authentication and cloud profile synchronization. The frontend uses the Supabase publishable key only. Never add a secret/service-role key to the browser code.

### V4 setup
1. Create the Supabase project.
2. Run the V4 SQL schema supplied with the project setup.
3. Replace the V3 frontend files with the V4 files.
4. Enable Email authentication in Supabase Authentication settings.
5. Test sign-up, email confirmation, login, logout and cloud sync.

Premium subscription payments are intentionally handled separately from the browser so payment status cannot be forged by editing JavaScript.
