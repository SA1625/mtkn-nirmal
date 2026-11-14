ISLAMIC QUIZ PORTAL - QUESTION IMPORT UPDATE

WHAT CHANGED
- Question Bank edit now requests and verifies the updated database row, and displays database errors.
- Added PDF Import page at /admin/questions/import.
- Added Import PDF button in Question Bank.
- Added private Supabase Storage bucket + admin-only import tracking SQL.

IMPORTANT LIMITATION
This update uploads and securely queues the original PDF. It does NOT yet extract questions or generate MCQ distractors. That processing requires a server-side AI/PDF extraction function and the organisation's actual PDF so its layout can be tested. Uploaded questions are not published automatically.

ONE-TIME SUPABASE SETUP
1. Open Supabase Dashboard -> SQL Editor -> New query.
2. Open supabase/question_import_setup.sql from this ZIP, copy all SQL, paste and Run.
3. Deploy the website update.

DEPLOY
Extract this ZIP over your existing project folder (do not delete your .env file). Then in PowerShell, inside D:\islamic-quiz-portal run:
  npm install
  npm run build
  git add .
  git commit -m "Add PDF question import and fix question editing"
  git push

The existing .env is intentionally NOT included in this ZIP. Keep your local .env file unchanged and never upload it to GitHub.
